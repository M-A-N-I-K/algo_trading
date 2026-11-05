import { OHLC } from "../indicators/utils";
import { atr } from "../indicators/atr";
import { Signal, Strategy, TradeTarget } from "../types";

export interface LiquiditySweepOptions {
  // Bars on each side of a fractal swing point.
  swingLookback?: number;
  atrPeriod?: number;
  // Two swing lows (highs) count as equal when they're within this many ATRs.
  equalTolAtr?: number;
  // Stop sits this many ATRs beyond the zone's far edge.
  stopBufferAtr?: number;
  // Skip trades whose target is under this R:R.
  minRr?: number;
}

// Structure is tracked in "signed" prices so one code path serves both
// directions: for trend d = 1 prices are as-is; for d = -1 they're negated,
// so a downtrend reads as an uptrend (highs become lows).
type Dir = 1 | -1;
const fav = (c: OHLC, d: Dir) => (d === 1 ? c.high : -c.low);
const adv = (c: OHLC, d: Dir) => (d === 1 ? c.low : -c.high);
const sc = (c: OHLC, d: Dir) => d * c.close;

interface Swing {
  price: number; // actual price
  idx: number;
}

interface Pool {
  level: number; // signed: the lower of the equal lows
  createdAt: number; // bar index it was confirmed on
  swept: boolean;
}

// Liquidity + market structure (equal highs/lows sweep into supply/demand).
//
// Trend by structure: a close beyond the latest impulse swing is a break of
// structure; the most adverse point between that swing and the break is the
// protected level, and only a close beyond it ends the trend. The candle at
// the protected level is the last candle before the impulse: the demand
// (supply) zone, from its low to its high.
//
// In an uptrend, two swing lows inside the leg within equalTolAtr ATRs of
// each other are equal lows: a pool of stop losses and sell stops. Once
// price sweeps below them and trades into the demand zone, buy when a candle
// closes back above the zone. Stop under the zone, target the leg's high,
// skip under minRr. One trade per leg. Downtrends are the mirror (equal
// highs, supply).
export function createLiquiditySweepStrategy(options: LiquiditySweepOptions = {}): Strategy {
  const { swingLookback = 3, atrPeriod = 14, equalTolAtr = 0.1, stopBufferAtr = 0.1, minRr = 2 } = options;

  let computedTargets: (TradeTarget | null)[] = [];

  return {
    name: "Liquidity Sweep (Equal Highs/Lows)",

    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const k = swingLookback;
      const signals: Signal[] = new Array(n).fill("HOLD");
      computedTargets = new Array(n).fill(null);
      if (n === 0) return signals;

      const atrValues = atr(candles, atrPeriod);
      const highs: Swing[] = [];
      const lows: Swing[] = [];

      let d: Dir | 0 = 0;
      let protectedIdx = -1;
      let protectedPrice = 0; // signed
      let bos: { price: number; idx: number } | null = null; // signed
      let extreme = -Infinity; // signed: the leg's high, the target
      let zoneTop = 0; // signed
      let pools: Pool[] = [];
      let poolSwings: Swing[] = []; // adverse swings in the leg (actual)
      let swept = false;
      let touched = false;
      let done = false;

      const isSwing = (r: number, kind: "high" | "low") => {
        for (let j = r - k; j <= r + k; j++) {
          if (j === r) continue;
          if (kind === "high" ? candles[j].high >= candles[r].high : candles[j].low <= candles[r].low) return false;
        }
        return true;
      };

      // A new adverse swing inside the leg: pair it with earlier ones.
      const addPoolSwing = (s: Swing, dir: Dir, t: number) => {
        const tol = equalTolAtr * atrValues[t];
        for (const other of poolSwings) {
          if (Number.isFinite(tol) && Math.abs(other.price - s.price) <= tol) {
            pools.push({ level: Math.min(dir * other.price, dir * s.price), createdAt: t, swept: false });
          }
        }
        poolSwings.push(s);
      };

      // Start a leg in direction dir: protected level is the most adverse
      // point in (from, t].
      const startLeg = (dir: Dir, from: number, t: number) => {
        d = dir;
        let p = from + 1;
        for (let j = p; j <= t; j++) if (adv(candles[j], dir) < adv(candles[p], dir)) p = j;
        protectedIdx = p;
        protectedPrice = adv(candles[p], dir);
        zoneTop = fav(candles[p], dir);
        bos = null;
        extreme = -Infinity;
        for (let j = p; j <= t; j++) extreme = Math.max(extreme, fav(candles[j], dir));
        pools = [];
        poolSwings = [];
        swept = touched = done = false;
        const adverse = dir === 1 ? lows : highs;
        for (const s of adverse) if (s.idx > from && s.idx !== p && dir * s.price > protectedPrice) addPoolSwing(s, dir, t);
      };

      for (let t = 0; t < n; t++) {
        const c = candles[t];
        const r = t - k;
        let newHigh: Swing | null = null;
        let newLow: Swing | null = null;
        if (r >= k) {
          if (isSwing(r, "high")) highs.push((newHigh = { price: candles[r].high, idx: r }));
          if (isSwing(r, "low")) lows.push((newLow = { price: candles[r].low, idx: r }));
        }

        if (d === 0) {
          const h = highs[highs.length - 1];
          const l = lows[lows.length - 1];
          if (h && c.close > h.price) startLeg(1, h.idx, t);
          else if (l && c.close < l.price) startLeg(-1, l.idx, t);
          continue;
        }

        // Structure updates from swings confirmed on this bar.
        const favSwing = d === 1 ? newHigh : newLow;
        const advSwing = d === 1 ? newLow : newHigh;
        if (favSwing && favSwing.idx > protectedIdx && (!bos || d * favSwing.price > bos.price)) {
          bos = { price: d * favSwing.price, idx: favSwing.idx };
        }
        if (advSwing && advSwing.idx > protectedIdx && d * advSwing.price > protectedPrice) addPoolSwing(advSwing, d, t);

        if (sc(c, d) < protectedPrice) {
          startLeg(d === 1 ? -1 : 1, protectedIdx - 1, t); // trend change
          continue;
        }
        if (bos && sc(c, d) > bos.price) {
          startLeg(d, bos.idx, t); // break of structure: new leg
          continue;
        }
        extreme = Math.max(extreme, fav(c, d));
        if (done) continue;

        // Liquidity: price sweeps a pool of equal lows (highs).
        for (const pool of pools) {
          if (!pool.swept && pool.createdAt < t && adv(c, d) < pool.level) {
            pool.swept = true;
            swept = true;
          }
        }
        if (!swept) continue;

        // Entry: into the demand (supply) zone, then a close back out of it.
        if (adv(c, d) <= zoneTop) touched = true;
        if (!touched || sc(c, d) <= zoneTop) continue;

        done = true; // one trade per leg
        const buffer = stopBufferAtr > 0 ? stopBufferAtr * atrValues[t] : 0;
        const entry = sc(c, d);
        const stop = protectedPrice - buffer;
        const risk = entry - stop;
        const rr = (extreme - entry) / risk;
        if (Number.isFinite(stop) && risk > 0 && rr >= minRr) {
          signals[t] = d === 1 ? "BUY" : "SELL";
          computedTargets[t] = { stopLoss: d * stop, takeProfit: d * extreme };
        }
      }

      return signals;
    },

    getTradeTargets(): (TradeTarget | null)[] {
      return computedTargets;
    },
  };
}
