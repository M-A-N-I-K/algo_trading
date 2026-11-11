import { OHLC } from "../indicators/utils";
import { atr } from "../indicators/atr";
import { ema } from "../indicators/ema";
import { Signal, Strategy, TradeTarget } from "../types";
import { flipCandles } from "./liquidityReversalStrategy";

// "S/R + sweep + trend-line break" (a gold-scalping YouTube method, tested on
// MT5 bars since 2020; it held up on NAS100 1h, not on gold 5m).
//
// Long side (shorts are the same logic on the candles turned upside down):
//  1. Level: two swing lows (levelSwing candles each side) within
//     equalTolAtr × ATR of each other, at most 100 candles apart, with
//     nothing between them trading below the lower one. Support = the lower.
//  2. Sweep: a later candle's low trades below the level (within 300 candles
//     of the level forming). It must close back above the level within
//     sweepCandles candles, or the setup is dropped.
//  3. Trend line: the minor down-move into the sweep, drawn through the last
//     two falling swing highs (trendlineSwing candles each side) at or before
//     the sweep candle (within 80 candles of it), extended to now.
//  4. Entry: within 48 candles of the reclaim, a green candle closes above
//     that line, with a body of at least bigBodyAtr × ATR, and (with the
//     trend filter) closes above the 200 EMA. A new low that closes back at
//     or below the level kills the setup; a new low that holds moves the stop.
//     Stop = the lowest low since the sweep − 0.1 × ATR. Target = rr × risk
//     (or, with target "level", the nearest untouched swing high paying at
//     least 1.5R; none = no trade).
// One trade per level.
export interface SrSweepTrendlineOptions {
  emaPeriod?: number;
  trendFilter?: boolean;
  levelSwing?: number;
  equalTolAtr?: number;
  sweepCandles?: number;
  trendlineSwing?: number;
  bigBodyAtr?: number; // 0 = any green candle
  target?: "rr" | "level";
  rr?: number;
}

export const SR_SWEEP_TRENDLINE_DEFAULTS: Required<SrSweepTrendlineOptions> = {
  emaPeriod: 200,
  trendFilter: true,
  levelSwing: 3,
  equalTolAtr: 0.25,
  sweepCandles: 3,
  trendlineSwing: 3,
  bigBodyAtr: 1,
  target: "rr",
  rr: 3,
};

const ATR_PERIOD = 14;
const POOL_LOOKBACK = 100; // candles between the two equal lows
const LEVEL_LIFE = 300; // a level can be swept up to this many candles after it forms
const MAX_LEVELS = 20;
const SETUP_LIFE = 48; // candles from the reclaim to the trend-line break
const LINE_LOOKBACK = 80; // trend-line swings this close to the sweep
const STOP_BUFFER_ATR = 0.1;
const TARGET_LOOKBACK = 300;
const MIN_LEVEL_RR = 1.5;

interface Hit {
  t: number;
  stop: number;
  target: number;
}

interface Swing {
  p: number;
  i: number;
}

interface Level {
  level: number;
  at: number;
  dead: boolean;
}

interface Setup {
  lvl: Level;
  ext: number; // lowest low since the sweep
  sweepIdx: number;
  below: number; // closes below the level so far (phase 1)
  phase: 1 | 2; // 1 = swept, waiting for a close back above; 2 = reclaimed, waiting for the line break
  at: number;
}

export function scanSrSweepTrendlineLongs(c: OHLC[], cfg: Required<SrSweepTrendlineOptions>): Hit[] {
  const n = c.length;
  const out: Hit[] = [];
  const A = atr(c, ATR_PERIOD);
  const E = ema(c.map((x) => x.close), cfg.emaPeriod);
  const lows: Swing[] = [];
  const highs: Swing[] = [];
  const lineHighs: Swing[] = [];
  let levels: Level[] = [];
  let st: Setup | null = null;

  const isSwing = (r: number, k: number, high: boolean) => {
    for (let j = r - k; j <= r + k; j++) {
      if (j === r) continue;
      if (high ? c[j].high >= c[r].high : c[j].low <= c[r].low) return false;
    }
    return true;
  };

  const levelTarget = (entry: number, risk: number, t: number) => {
    let best = Infinity;
    for (let q = highs.length - 1; q >= 0; q--) {
      const h = highs[q];
      if (h.i < t - TARGET_LOOKBACK) break;
      if (h.p - entry < MIN_LEVEL_RR * risk || h.p >= best) continue;
      let hi = -Infinity;
      for (let j = h.i + 1; j <= t; j++) hi = Math.max(hi, c[j].high);
      if (hi < h.p) best = h.p;
    }
    return Number.isFinite(best) ? best : null;
  };

  for (let t = 0; t < n; t++) {
    const b = c[t];
    const a = A[t];

    // Swings confirmed on this candle.
    const confirm = (k: number, arr: Swing[], high: boolean, makeLevels: boolean) => {
      const r = t - k;
      if (r < k || !isSwing(r, k, high)) return;
      const sw = { p: high ? c[r].high : c[r].low, i: r };
      if (makeLevels && Number.isFinite(a)) {
        for (let q = arr.length - 1; q >= 0 && arr[q].i >= r - POOL_LOOKBACK; q--) {
          const x = arr[q];
          const lv = Math.min(x.p, sw.p);
          let lo = Infinity;
          for (let j = x.i + 1; j < r; j++) lo = Math.min(lo, c[j].low);
          if (Math.abs(x.p - sw.p) <= cfg.equalTolAtr * a && lo >= lv) {
            levels.push({ level: lv, at: t, dead: false });
            break;
          }
        }
      }
      arr.push(sw);
      if (arr.length > 400) arr.shift();
    };
    confirm(cfg.levelSwing, lows, false, true);
    confirm(cfg.levelSwing, highs, true, false);
    confirm(cfg.trendlineSwing, lineHighs, true, false);
    if (levels.length > MAX_LEVELS) levels = levels.slice(-MAX_LEVELS);
    if (!Number.isFinite(a) || !Number.isFinite(E[t])) continue;

    if (st) {
      if (st.phase === 1) {
        st.ext = Math.min(st.ext, b.low);
        if (b.close > st.lvl.level) {
          st.phase = 2;
          st.at = t;
        } else if (++st.below >= cfg.sweepCandles) st = null;
      } else {
        if (b.low < st.ext) {
          if (b.close <= st.lvl.level) st = null;
          else st.ext = b.low;
        }
        if (st && t - st.at > SETUP_LIFE) st = null;
        if (st) {
          const sweepIdx = st.sweepIdx;
          const hs = lineHighs.filter((h) => h.i <= sweepIdx && h.i >= sweepIdx - LINE_LOOKBACK);
          let line: number | null = null;
          if (hs.length >= 2) {
            const h2 = hs[hs.length - 1];
            const h1 = hs[hs.length - 2];
            if (h1.p > h2.p) line = h2.p + ((h2.p - h1.p) / (h2.i - h1.i)) * (t - h2.i);
          }
          const big = Math.abs(b.close - b.open) >= cfg.bigBodyAtr * a;
          const trendOk = !cfg.trendFilter || b.close > E[t];
          if (line !== null && b.close > line && b.close > b.open && big && trendOk) {
            const stop = st.ext - STOP_BUFFER_ATR * a;
            const risk = b.close - stop;
            const target = risk > 0 ? (cfg.target === "rr" ? b.close + cfg.rr * risk : levelTarget(b.close, risk, t)) : null;
            if (target !== null) out.push({ t, stop, target });
            st.lvl.dead = true;
            st = null;
          }
        }
      }
    }

    // A sweep of a live level starts a setup (one at a time).
    if (!st) {
      for (const L of levels) {
        if (L.dead || L.at >= t || t - L.at > LEVEL_LIFE) continue;
        if (b.low < L.level) {
          L.dead = true;
          if (b.close > L.level) st = { lvl: L, ext: b.low, sweepIdx: t, below: 0, phase: 2, at: t };
          else if (cfg.sweepCandles > 1) st = { lvl: L, ext: b.low, sweepIdx: t, below: 1, phase: 1, at: t };
          break;
        }
      }
    }
  }
  return out;
}

export function createSrSweepTrendlineStrategy(options: SrSweepTrendlineOptions = {}): Strategy {
  const cfg = { ...SR_SWEEP_TRENDLINE_DEFAULTS, ...options };
  let computedTargets: (TradeTarget | null)[] = [];

  return {
    name: "S/R Sweep + Trend-Line Break",

    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const signals: Signal[] = new Array(n).fill("HOLD");
      computedTargets = new Array(n).fill(null);
      if (n === 0) return signals;

      for (const h of scanSrSweepTrendlineLongs(candles, cfg)) {
        signals[h.t] = "BUY";
        computedTargets[h.t] = { stopLoss: h.stop, takeProfit: h.target };
      }
      for (const h of scanSrSweepTrendlineLongs(flipCandles(candles), cfg)) {
        if (signals[h.t] !== "HOLD") {
          // Both directions on one candle: ambiguous, skip it.
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
