import { OHLC } from "../indicators/utils";
import { atr } from "../indicators/atr";
import { Signal, Strategy, TradeTarget } from "../types";
import { createLongScanner, flipCandles, LIQUIDITY_REVERSAL_DEFAULTS, type LiquidityReversalOptions, type Swing } from "./liquidityReversalStrategy";

export interface LiquidityReversalMtfOptions {
  // The 1h series the setup is found on.
  htfCandles?: OHLC[];
  // Bars on each side of a 5m swing point.
  ltfSwingLookback?: number;
  // The target is the nearest untouched 1h swing high that pays at least
  // this R:R; none, no trade.
  minRr?: number;
  // A 1h zone stays live for this many 1h bars after the shift.
  zoneBars?: number;
  // Overrides for the 1h Liquidity Reversal rules (tests use small values).
  htfOptions?: LiquidityReversalOptions;
}

interface Zone {
  low: number; // the 1h sweep low
  top: number; // the 1h zone top
  stop: number; // the 1h stop: sweep low minus the buffer
  htfAt: number; // 1h bar that shifted structure
  armIdx: number; // first 5m bar after that 1h bar closed
  touchLow: Swing | null; // lowest 5m low since price entered the zone
}

interface Hit {
  t: number;
  stop: number;
  target: number;
}

// Liquidity Reversal, multi-timeframe: find the setup on 1h, time the entry on 5m.
//
// On the 1h chart: equal lows get swept and a candle closes above the last
// swing high before the sweep low (exactly the Liquidity Reversal rules).
// That marks the 1h demand zone, from the sweep low up to the open of the
// last down candle before it. Then, on the 5m chart: wait for price to pull
// back into the zone, track the lowest low of that pullback, and buy when a
// 5m candle closes above the last 5m swing high that formed between the 1h
// shift and that low (a small structure shift inside the big zone).
//
// The stop stays where the 1h strategy puts it, under the 1h sweep low: in
// testing, a tight stop under the 5m low was hit by noise far too often.
// The 5m break is a filter (enter only once buyers have shown up in the
// zone), not a way to shrink the stop. The target is the nearest 1h swing
// high above that price hasn't traded through yet, if it pays at least
// minRr. One trade per zone; the zone dies if a 5m candle closes under the
// 1h sweep low, or after zoneBars 1h bars. Shorts are the mirror image.
export function createLiquidityReversalMtfStrategy(options: LiquidityReversalMtfOptions = {}): Strategy {
  const { htfCandles = [], ltfSwingLookback = 3, minRr = 2, zoneBars = 24, htfOptions } = options;
  const cfg = { ...LIQUIDITY_REVERSAL_DEFAULTS, ...htfOptions };

  let computedTargets: (TradeTarget | null)[] = [];

  function scanLongs(ltf: OHLC[], htf: OHLC[], htfAtr: number[]): Hit[] {
    const hits: Hit[] = [];
    const k = ltfSwingLookback;
    const ltfHighs: Swing[] = [];
    let zone: Zone | null = null;
    let pending: { htfAt: number; low: number; top: number } | null = null;
    const htfScan = createLongScanner(htf, htfAtr, cfg, (s) => {
      pending = { htfAt: s.at, low: s.low, top: s.zoneTop };
    });
    let nextHtf = 0;
    // Highest 5m high since the last closed 1h bar, so a target isn't one
    // price has already reached inside the current hour.
    let highSinceHtf = -Infinity;

    const isLtfSwingHigh = (r: number) => {
      for (let j = r - k; j <= r + k; j++) if (j !== r && ltf[j].high >= ltf[r].high) return false;
      return true;
    };

    for (let t = 0; t < ltf.length; t++) {
      const c = ltf[t];

      // Step every 1h bar that has closed by the end of this bar.
      while (nextHtf < htf.length && htf[nextHtf].closeTime <= c.closeTime) {
        htfScan.step(nextHtf);
        highSinceHtf = -Infinity;
        if (zone && (htf[nextHtf].close < zone.low || nextHtf - zone.htfAt > zoneBars)) zone = null;
        nextHtf++;
      }
      if (pending) {
        // A fresh 1h shift replaces any older zone. It's live from the next bar.
        const p: { htfAt: number; low: number; top: number } = pending;
        const buffer = cfg.stopBufferAtr * htfAtr[p.htfAt];
        zone = { low: p.low, top: p.top, stop: p.low - (Number.isFinite(buffer) ? buffer : 0), htfAt: p.htfAt, armIdx: t + 1, touchLow: null };
        pending = null;
      }
      highSinceHtf = Math.max(highSinceHtf, c.high);

      const r = t - k;
      if (r >= k && isLtfSwingHigh(r)) ltfHighs.push({ price: ltf[r].high, idx: r });

      if (!zone || t < zone.armIdx) continue;
      if (c.close < zone.low) {
        zone = null;
        continue;
      }
      if (c.low <= zone.top && (!zone.touchLow || c.low < zone.touchLow.price)) zone.touchLow = { price: c.low, idx: t };
      const low = zone.touchLow;
      if (!low || t === low.idx) continue;

      // The last 5m swing high between the 1h shift and the pullback low.
      let bos: Swing | undefined;
      for (let i = ltfHighs.length - 1; i >= 0; i--) {
        const h = ltfHighs[i];
        if (h.idx >= low.idx) continue;
        if (h.idx >= zone.armIdx) bos = h;
        break;
      }
      if (!bos || c.close <= bos.price) continue;

      const entry = c.close;
      const risk = entry - zone.stop;
      let target = Infinity;
      const lastHtf = nextHtf - 1;
      for (const h of htfScan.highs) {
        if (h.idx < lastHtf - cfg.targetLookback || h.price >= target) continue;
        if (risk > 0 && h.price - entry >= minRr * risk && htfScan.highestAfter(h.idx, lastHtf) < h.price && highSinceHtf < h.price) target = h.price;
      }
      if (Number.isFinite(target)) hits.push({ t, stop: zone.stop, target });
      // One trade per zone, taken or not.
      zone = null;
    }
    return hits;
  }

  return {
    name: "Liquidity Reversal MTF (1h Setup + 5m Entry)",

    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const signals: Signal[] = new Array(n).fill("HOLD");
      computedTargets = new Array(n).fill(null);
      if (n === 0 || htfCandles.length === 0) return signals;

      const htfAtr = atr(htfCandles, cfg.atrPeriod);
      for (const h of scanLongs(candles, htfCandles, htfAtr)) {
        signals[h.t] = "BUY";
        computedTargets[h.t] = { stopLoss: h.stop, takeProfit: h.target };
      }
      for (const h of scanLongs(flipCandles(candles), flipCandles(htfCandles), htfAtr)) {
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
