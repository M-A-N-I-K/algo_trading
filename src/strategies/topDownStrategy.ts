import { OHLC } from "../indicators/utils";
import { atr } from "../indicators/atr";
import { Signal, Strategy, TradeTarget } from "../types";

// Top-down day trading: weekly and daily bias, an hourly "daily trading
// range", a 5m break of structure to enter, half off at the range high and
// half left running to the weekly target.
//
// Weekend work (weekly and daily, built from the 1h candles):
// - Weekly: the last closed weekly candle shows who's in control. Bullish
//   when it closed green and above the previous week's high ("wiped out"
//   the week before); bearish is the mirror. Anything else: no bias, no trades.
// - Daily: structure. Up after a daily close above the last daily swing
//   high, down after a daily close below the last daily swing low.
// - Both must agree. Trades are only taken in that direction.
//
// Day-to-day (1h and 5m):
// - Daily trading range: the latest 1h leg, from the last 1h swing low up to
//   the highest high since. It must be at least `minRangeAtr` 1h ATRs tall.
// - Wait for price to pull back into the lower half (discount) of the range.
//   A 5m close under the range low kills it.
// - Entry: a 5m candle closes above the last 5m swing high that formed
//   between the range high and the pullback low (the 5m turns bullish).
// - Stop: under the pullback low, minus 0.1 × 1h ATR, and at least
//   `minStopAtr` 1h ATRs from entry.
// - Target 1: the range high, which must pay at least `minRr`.
// - Runner: `runnerPortion` of the position stays open for the weekly
//   target, the nearest weekly swing high above the range high that price
//   hasn't traded through. No such high: the whole position exits at target 1.
// One trade per range. Shorts are the mirror image.

export interface TopDownOptions {
  htfCandles?: OHLC[]; // 1h
  weeklyBias?: boolean; // require the weekly candle (default true)
  dailyBias?: boolean; // require daily structure (default true)
  swingLookback1h?: number;
  swingLookback5m?: number;
  minRangeAtr?: number;
  discount?: number; // how deep into the range counts as discount: 0.5 = lower half
  minRr?: number;
  runnerPortion?: number; // 0 = no runner
  weeklyLookback?: number; // weeks searched for the weekly target
  minStopAtr?: number; // the stop is at least this many 1h ATRs from entry
}

export const TOP_DOWN_DEFAULTS = {
  weeklyBias: true,
  dailyBias: true,
  swingLookback1h: 3,
  swingLookback5m: 3,
  minRangeAtr: 3,
  discount: 0.5,
  minRr: 3,
  runnerPortion: 0.5,
  weeklyLookback: 26,
  stopBufferAtr: 0.1,
  minStopAtr: 0.5,
};

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const MONDAY = 4 * DAY; // 1 Jan 1970 was a Thursday

function aggregate(candles: OHLC[], startOf: (t: number) => number, length: number): OHLC[] {
  const out: OHLC[] = [];
  let cur: OHLC | null = null;
  for (const c of candles) {
    const t = startOf(c.openTime);
    if (!cur || cur.openTime !== t) {
      if (cur) out.push(cur);
      cur = { openTime: t, closeTime: t + length - 1, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
    } else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume += c.volume;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export const flipOhlc = (candles: OHLC[]): OHLC[] => candles.map((c) => ({ ...c, open: -c.open, high: -c.low, low: -c.high, close: -c.close }));

const isSwingHigh = (c: OHLC[], r: number, k: number) => {
  for (let j = r - k; j <= r + k; j++) if (j !== r && c[j].high >= c[r].high) return false;
  return true;
};
const isSwingLow = (c: OHLC[], r: number, k: number) => {
  for (let j = r - k; j <= r + k; j++) if (j !== r && c[j].low <= c[r].low) return false;
  return true;
};

interface Hit {
  t: number;
  stop: number;
  target1: number;
  runner: number | null;
}

type Cfg = typeof TOP_DOWN_DEFAULTS;

// Bullish weekly bias for each closed week: green and closed above the prior week's high.
export function weeklyBull(weeks: OHLC[]): boolean[] {
  return weeks.map((w, i) => i > 0 && w.close > w.open && w.close > weeks[i - 1].high);
}

// Daily structure after each closed day: true = up, false = down, null = not yet known.
export function dailyStructure(days: OHLC[]): (boolean | null)[] {
  const out: (boolean | null)[] = [];
  let state: boolean | null = null;
  let lastHigh = NaN;
  let lastLow = NaN;
  const k = 2;
  for (let i = 0; i < days.length; i++) {
    // A swing at i - k is confirmed once day i has closed.
    const r = i - k;
    if (r >= k) {
      if (isSwingHigh(days, r, k)) lastHigh = days[r].high;
      if (isSwingLow(days, r, k)) lastLow = days[r].low;
    }
    if (days[i].close > lastHigh) state = true;
    else if (days[i].close < lastLow) state = false;
    out.push(state);
  }
  return out;
}

function scanLongs(m5: OHLC[], h1: OHLC[], cfg: Cfg): Hit[] {
  const hits: Hit[] = [];
  if (h1.length < 21) return hits; // ATR and swings need ~20 hours
  const h1Atr = atr(h1, 14);
  const days = aggregate(h1, (t) => Math.floor(t / DAY) * DAY, DAY);
  const weeks = aggregate(h1, (t) => Math.floor((t - MONDAY) / WEEK) * WEEK + MONDAY, WEEK);
  const wBull = weeklyBull(weeks);
  const dUp = dailyStructure(days);
  const k1 = cfg.swingLookback1h;
  const k5 = cfg.swingLookback5m;

  let nextH = 0;
  let nextD = 0;
  let nextW = 0;
  let bias = false;
  let swingLowIdx = -1; // last confirmed 1h swing low
  let range: { key: number; low: number; high: number; highTime: number } | null = null;
  const usedRanges = new Set<number>();
  let touched = false;
  let pullback: { price: number; idx: number } | null = null;
  const m5Highs: { price: number; idx: number }[] = [];

  const weeklyTarget = (above: number, lastW: number): number | null => {
    let best: number | null = null;
    for (let i = Math.max(1, lastW - cfg.weeklyLookback); i < lastW; i++) {
      const w = weeks[i];
      if (w.high <= weeks[i - 1].high || w.high <= weeks[i + 1].high) continue; // weekly swing high
      if (w.high <= above) continue;
      let taken = false;
      for (let j = i + 1; j <= lastW; j++) if (weeks[j].high >= w.high) taken = true;
      if (!taken && (best === null || w.high < best)) best = w.high;
    }
    return best;
  };

  for (let t = 0; t < m5.length; t++) {
    const c = m5[t];
    let h1Closed = false;
    while (nextH < h1.length && h1[nextH].closeTime <= c.closeTime) {
      const j = nextH;
      const r = j - k1;
      if (r >= k1 && isSwingLow(h1, r, k1)) swingLowIdx = r;
      nextH++;
      h1Closed = true;
    }
    while (nextD < days.length && days[nextD].closeTime <= c.closeTime) nextD++;
    while (nextW < weeks.length && weeks[nextW].closeTime <= c.closeTime) nextW++;
    const lastH = nextH - 1;
    const lastD = nextD - 1;
    const lastW = nextW - 1;

    if (h1Closed) {
      bias = (!cfg.weeklyBias || (lastW >= 1 && wBull[lastW])) && (!cfg.dailyBias || (lastD >= 0 && dUp[lastD] === true));
      // The daily trading range: last 1h swing low up to the highest high since.
      if (swingLowIdx >= 0 && !usedRanges.has(h1[swingLowIdx].openTime)) {
        let hi = -Infinity;
        let hiIdx = swingLowIdx;
        for (let i = swingLowIdx; i <= lastH; i++) if (h1[i].high > hi) [hi, hiIdx] = [h1[i].high, i];
        const low = h1[swingLowIdx].low;
        const key = h1[swingLowIdx].openTime;
        if (hi - low >= cfg.minRangeAtr * h1Atr[lastH]) {
          if (!range || range.key !== key || range.high !== hi) {
            // A new leg high resets the wait for a pullback.
            if (!range || range.key !== key) {
              touched = false;
              pullback = null;
            } else if (hi > range.high) {
              touched = false;
              pullback = null;
            }
            range = { key, low, high: hi, highTime: h1[hiIdx].openTime };
          }
        } else if (range && range.key !== key) {
          range = null;
        }
      }
    }

    const r5 = t - k5;
    if (r5 >= k5 && isSwingHigh(m5, r5, k5)) m5Highs.push({ price: m5[r5].high, idx: r5 });

    if (!range || !bias || lastH < 20) continue;
    if (c.close < range.low) {
      usedRanges.add(range.key);
      range = null;
      continue;
    }
    const zoneTop = range.low + cfg.discount * (range.high - range.low);
    if (!touched && c.low <= zoneTop && c.openTime > range.highTime) touched = true;
    if (!touched) continue;
    if (!pullback || c.low < pullback.price) pullback = { price: c.low, idx: t };
    if (t === pullback.idx) continue;

    // The structural point: the last 5m swing high between the range high and the pullback low.
    let bos: { price: number; idx: number } | undefined;
    for (let i = m5Highs.length - 1; i >= 0; i--) {
      const h = m5Highs[i];
      if (h.idx >= pullback.idx) continue;
      if (m5[h.idx].openTime >= range.highTime) bos = h;
      break;
    }
    if (!bos || c.close <= bos.price) continue;

    const entry = c.close;
    // Under the pullback low, but never closer than minStopAtr: a stop a few
    // ticks away loses more to fees than to price.
    const stop = Math.min(pullback.price - cfg.stopBufferAtr * h1Atr[lastH], entry - cfg.minStopAtr * h1Atr[lastH]);
    const risk = entry - stop;
    usedRanges.add(range.key);
    const r = range;
    range = null;
    touched = false;
    pullback = null;
    if (!(risk > 0) || r.high - entry < cfg.minRr * risk) continue;
    const runner = cfg.runnerPortion > 0 && lastW >= 1 ? weeklyTarget(r.high, lastW) : null;
    hits.push({ t, stop, target1: r.high, runner });
  }
  return hits;
}

export function createTopDownStrategy(options: TopDownOptions = {}): Strategy {
  const { htfCandles = [], ...rest } = options;
  const cfg: Cfg = { ...TOP_DOWN_DEFAULTS, ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) };
  let computed: (TradeTarget | null)[] = [];

  const toTarget = (h: Hit, sign: 1 | -1): TradeTarget => {
    const p = (x: number) => x * sign;
    if (h.runner === null) return { stopLoss: p(h.stop), takeProfit: p(h.target1) };
    return {
      stopLoss: p(h.stop),
      takeProfit: p(h.runner),
      partialExits: [{ price: p(h.target1), portion: 1 - cfg.runnerPortion }],
    };
  };

  return {
    name: "Top-Down Day Trade (Weekly Bias + 1h Range + 5m Entry)",

    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const signals: Signal[] = new Array(n).fill("HOLD");
      computed = new Array(n).fill(null);
      if (!n || !htfCandles.length) return signals;
      for (const h of scanLongs(candles, htfCandles, cfg)) {
        signals[h.t] = "BUY";
        computed[h.t] = toTarget(h, 1);
      }
      for (const h of scanLongs(flipOhlc(candles), flipOhlc(htfCandles), cfg)) {
        if (signals[h.t] !== "HOLD") {
          signals[h.t] = "HOLD";
          computed[h.t] = null;
          continue;
        }
        signals[h.t] = "SELL";
        computed[h.t] = toTarget(h, -1);
      }
      return signals;
    },

    getTradeTargets(): (TradeTarget | null)[] {
      return computed;
    },
  };
}
