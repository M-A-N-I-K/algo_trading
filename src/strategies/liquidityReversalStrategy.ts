import { OHLC } from "../indicators/utils";
import { atr } from "../indicators/atr";
import { Signal, Strategy, TradeTarget } from "../types";

export interface LiquidityReversalOptions {
  // Bars on each side of a fractal swing point.
  swingLookback?: number;
  atrPeriod?: number;
  // "equal": only two swing lows (highs) within equalTolAtr ATRs of each
  // other are liquidity. "swing": every swing low (high) is.
  liquidity?: "equal" | "swing";
  equalTolAtr?: number;
  // How far back (bars) the two equal lows may be apart.
  poolLookback?: number;
  // How far back from the sweep low to look for the last down candle.
  obSearchBars?: number;
  // Stop sits this many ATRs beyond the sweep's extreme.
  stopBufferAtr?: number;
  // The target is the nearest untouched swing on the other side that pays
  // at least this R:R; no such swing, no trade.
  minRr?: number;
  // How far back (bars) target swings may be.
  targetLookback?: number;
  // A setup is dropped if it doesn't progress within this many bars
  // (sweep -> break, and break -> entry).
  maxSetupBars?: number;
}

export interface Swing {
  price: number;
  idx: number;
}

interface Hit {
  t: number;
  stop: number;
  target: number;
}

// A setup that has swept liquidity and shifted structure: the demand zone
// runs from the sweep low up to zoneTop. Emitted on bar `at` (the candle
// that closed through the break-of-structure level).
export interface BrokenSetup {
  at: number;
  lowIdx: number;
  low: number;
  zoneTop: number;
}

type ScanConfig = Required<LiquidityReversalOptions>;

// The long-side state machine, one bar at a time. step(t) only reads
// candles[0..t], so a caller can feed bars as they close (the multi-
// timeframe strategy steps the 1h series alongside its 5m one).
export function createLongScanner(candles: OHLC[], atrValues: number[], cfg: ScanConfig, onBroken?: (s: BrokenSetup) => void) {
  const { swingLookback: k, liquidity, equalTolAtr, poolLookback, obSearchBars, stopBufferAtr, minRr, targetLookback, maxSetupBars } = cfg;
  const highs: Swing[] = [];
  const lows: Swing[] = [];
  const pools: { level: number; createdAt: number; swept: boolean }[] = [];
  const hits: Hit[] = [];

  type Setup =
    | { phase: "swept"; at: number; lowIdx: number; low: number }
    | { phase: "broken"; at: number; lowIdx: number; low: number; zoneTop: number; touched: boolean };
  let setup: Setup | null = null;

  const isSwing = (r: number, kind: "high" | "low") => {
    for (let j = r - k; j <= r + k; j++) {
      if (j === r) continue;
      if (kind === "high" ? candles[j].high >= candles[r].high : candles[j].low <= candles[r].low) return false;
    }
    return true;
  };
  const lowestBetween = (a: number, b: number) => {
    let m = Infinity;
    for (let j = a + 1; j < b; j++) m = Math.min(m, candles[j].low);
    return m;
  };
  const highestAfter = (a: number, t: number) => {
    let m = -Infinity;
    for (let j = a + 1; j <= t; j++) m = Math.max(m, candles[j].high);
    return m;
  };

  function step(t: number) {
    const c = candles[t];
    const r = t - k;
    if (r >= k) {
      if (isSwing(r, "high")) highs.push({ price: candles[r].high, idx: r });
      if (isSwing(r, "low")) {
        const s = { price: candles[r].low, idx: r };
        if (liquidity === "swing") {
          pools.push({ level: s.price, createdAt: t, swept: false });
        } else {
          const tol = equalTolAtr * atrValues[t];
          for (let i = lows.length - 1; i >= 0 && lows[i].idx >= r - poolLookback; i--) {
            const o = lows[i];
            const level = Math.min(o.price, s.price);
            // Equal, and nothing between them traded below the pair.
            if (Number.isFinite(tol) && Math.abs(o.price - s.price) <= tol && lowestBetween(o.idx, r) >= level) {
              pools.push({ level, createdAt: t, swept: false });
              break;
            }
          }
        }
        lows.push(s);
      }
    }

    // Progress or drop an existing setup.
    if (setup) {
      if (setup.phase === "swept") {
        if (c.low < setup.low) setup = { ...setup, low: c.low, lowIdx: t };
        const lowIdx = setup.lowIdx;
        let bos: Swing | undefined;
        for (let i = highs.length - 1; i >= 0; i--) {
          if (highs[i].idx < lowIdx) {
            bos = highs[i];
            break;
          }
        }
        if (bos && c.close > bos.price) {
          // Demand: the last down candle at or just before the sweep low.
          let zoneTop = candles[lowIdx].high;
          for (let j = lowIdx; j >= Math.max(0, lowIdx - obSearchBars); j--) {
            if (candles[j].close < candles[j].open) {
              zoneTop = candles[j].open;
              break;
            }
          }
          setup = { phase: "broken", at: t, lowIdx, low: setup.low, zoneTop, touched: false };
          onBroken?.({ at: t, lowIdx, low: setup.low, zoneTop });
        } else if (t - setup.at > maxSetupBars) {
          setup = null;
        }
      } else if (t > setup.at) {
        if (c.close < setup.low || t - setup.at > maxSetupBars) {
          setup = null;
        } else {
          if (c.low <= setup.zoneTop) setup.touched = true;
          if (setup.touched && c.close > setup.zoneTop) {
            const entry = c.close;
            const buffer = stopBufferAtr > 0 ? stopBufferAtr * atrValues[t] : 0;
            const stop = setup.low - (Number.isFinite(buffer) ? buffer : 0);
            const risk = entry - stop;
            let target = Infinity;
            for (const h of highs) {
              if (h.idx < t - targetLookback || h.price >= target) continue;
              if (risk > 0 && h.price - entry >= minRr * risk && highestAfter(h.idx, t) < h.price) target = h.price;
            }
            if (Number.isFinite(target)) hits.push({ t, stop, target });
            setup = null;
          }
        }
      }
    }

    // Liquidity sweeps. A fresh sweep starts a setup unless one has
    // already broken structure.
    for (const pool of pools) {
      if (pool.swept || pool.createdAt >= t || c.low >= pool.level) continue;
      pool.swept = true;
      if (!setup) setup = { phase: "swept", at: t, lowIdx: t, low: c.low };
      else if (setup.phase === "swept") setup.at = t;
    }
  }

  return { step, hits, highs, highestAfter };
}

export const LIQUIDITY_REVERSAL_DEFAULTS: ScanConfig = {
  swingLookback: 3,
  atrPeriod: 14,
  liquidity: "equal",
  equalTolAtr: 0.1,
  poolLookback: 100,
  obSearchBars: 10,
  stopBufferAtr: 0.1,
  minRr: 2,
  targetLookback: 200,
  maxSetupBars: 48,
};

// Price negated: a downtrend read upside down is an uptrend.
export const flipCandles = (candles: OHLC[]): OHLC[] =>
  candles.map((c) => ({ ...c, open: -c.open, high: -c.low, low: -c.high, close: -c.close }));

// Liquidity reversal: sweep -> change of structure -> enter from the zone.
//
// Liquidity is a pair of equal swing lows (or, optionally, any swing low):
// stop losses and sell stops sit under it. When a candle trades below it
// (the sweep), track the lowest low from there. Once a candle CLOSES above
// the last swing high that formed before that low, structure has shifted
// up. The demand zone is the last down candle at or just before the sweep
// low, from its open down to the low. Buy when price comes back into it and
// a candle closes back above it. Stop under the sweep low; target the
// nearest swing high above that price hasn't traded through yet, and only
// if it pays minRr. Shorts are the mirror image (equal highs, supply).
//
// The long logic runs on the candles as-is, the short logic on the candles
// negated (a downtrend read upside down is an uptrend).
export function createLiquidityReversalStrategy(options: LiquidityReversalOptions = {}): Strategy {
  const cfg: ScanConfig = { ...LIQUIDITY_REVERSAL_DEFAULTS, ...options };

  let computedTargets: (TradeTarget | null)[] = [];

  function scanLongs(candles: OHLC[], atrValues: number[]): Hit[] {
    const scanner = createLongScanner(candles, atrValues, cfg);
    for (let t = 0; t < candles.length; t++) scanner.step(t);
    return scanner.hits;
  }

  return {
    name: "Liquidity Reversal (Sweep + Shift)",

    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const signals: Signal[] = new Array(n).fill("HOLD");
      computedTargets = new Array(n).fill(null);
      if (n === 0) return signals;

      const atrValues = atr(candles, cfg.atrPeriod);
      const flipped = flipCandles(candles);

      for (const h of scanLongs(candles, atrValues)) {
        signals[h.t] = "BUY";
        computedTargets[h.t] = { stopLoss: h.stop, takeProfit: h.target };
      }
      for (const h of scanLongs(flipped, atrValues)) {
        if (signals[h.t] !== "HOLD") {
          // Both directions on one bar: ambiguous, skip it.
          signals[h.t] = "HOLD";
          computedTargets[h.t] = null;
          continue;
        }
        signals[h.t] = "SELL";
        computedTargets[h.t] = { stopLoss: -h.stop, takeProfit: -h.target };
      }
      return signals;
    },

    getTradeTargets(): (TradeTarget | null)[] {
      return computedTargets;
    },
  };
}
