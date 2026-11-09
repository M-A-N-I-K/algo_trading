import { OHLC } from "../indicators/utils";
import { atr } from "../indicators/atr";
import { vwap } from "../indicators/vwap";
import { Signal, Strategy, TradeTarget } from "../types";
import { flipOhlc } from "./topDownStrategy";

// VWAP day trading: VWAP as dynamic support/resistance, and as a magnet.
//
// VWAP is the session VWAP (resets at 00:00 UTC; the NSE session sits inside
// one UTC day). Two setups, both "in favour of VWAP":
//
// 1. Breakout retest (VWAP as dynamic support):
//    - Breakout: a candle closes above VWAP after the previous one closed at
//      or below it. Never buy the breakout candle itself.
//    - Retest: within `retestBars`, a later candle's low touches VWAP and it
//      closes back above it. Any close below VWAP first cancels the breakout.
//    - Buy at that close. Stop under the retest candle's low, target 2R.
//
// 2. Liquidity sweep:
//    - Liquidity: a confirmed swing low (`swingLookback` bars a side) from
//      the last `levelLookback` bars that no candle has closed below since.
//    - Sweep: a candle trades below it and closes back above it.
//    - Close above VWAP (with VWAP): buy, stop under the sweep low, target 2R.
//    - Close below VWAP (far from VWAP): VWAP is the target. Buy only if it
//      is at least `minRr` × risk away.
//
// Stops sit `stopBufferAtr` ATRs beyond the candle's extreme, and at least
// `minStopAtr` ATRs from entry. No signals in the first `sessionWarmupBars`
// of a session, while VWAP is only a candle or two old, and at most
// `maxTradesPerSession` signals per direction per session (the video trades
// "once or twice daily"). Shorts are the mirror.

export type VwapSetup = "retest" | "sweep";

export interface VwapOptions {
  setups?: VwapSetup[];
  retestBars?: number;
  swingLookback?: number;
  levelLookback?: number;
  atrPeriod?: number;
  stopBufferAtr?: number;
  minStopAtr?: number;
  rr?: number; // target for trades on the right side of VWAP
  minRr?: number; // smallest R:R when VWAP itself is the target
  sessionWarmupBars?: number;
  maxTradesPerSession?: number; // per direction
  // Only signal on candles opening inside this window (minutes after 00:00
  // UTC, start inclusive, end exclusive). Unset: any time.
  entryWindowUtc?: [number, number];
}

export const VWAP_DEFAULTS = {
  setups: ["retest", "sweep"] as VwapSetup[],
  retestBars: 12,
  swingLookback: 3,
  levelLookback: 48,
  atrPeriod: 14,
  stopBufferAtr: 0.1,
  minStopAtr: 0.5,
  rr: 2,
  minRr: 2,
  sessionWarmupBars: 3,
  maxTradesPerSession: 2,
  entryWindowUtc: undefined as [number, number] | undefined,
};

type Cfg = typeof VWAP_DEFAULTS;

interface Hit {
  t: number;
  stop: number;
  target: number;
  setup: VwapSetup;
}

const DAY = 86_400_000;

function scanLongs(c: OHLC[], cfg: Cfg): Hit[] {
  const n = c.length;
  const hits: Hit[] = [];
  const vw = vwap(c);
  const a = atr(c, cfg.atrPeriod);
  const k = cfg.swingLookback;
  const useRetest = cfg.setups.includes("retest");
  const useSweep = cfg.setups.includes("sweep");

  let session = -1;
  let barInSession = 0;
  let taken = 0; // signals this session
  let breakout = -1; // index of the breakout candle awaiting a retest
  let levels: { price: number; idx: number }[] = []; // unswept swing lows

  for (let t = 0; t < n; t++) {
    const bar = c[t];
    const s = Math.floor(bar.openTime / DAY);
    if (s !== session) {
      session = s;
      barInSession = 0;
      taken = 0;
      breakout = -1; // a new VWAP: old breakouts don't count
    } else barInSession++;

    // A swing low at t - k is confirmed once bar t has closed.
    const r = t - k;
    if (r >= k) {
      let swing = true;
      for (let j = r - k; j <= r + k; j++) if (j !== r && c[j].low <= c[r].low) swing = false;
      if (swing) levels.push({ price: c[r].low, idx: r });
    }

    const atrNow = a[t];
    const ready = barInSession >= cfg.sessionWarmupBars && Number.isFinite(atrNow) && atrNow > 0 && t >= cfg.atrPeriod;
    const minute = Math.floor((bar.openTime % DAY) / 60_000);
    const inWindow = !cfg.entryWindowUtc || (minute >= cfg.entryWindowUtc[0] && minute < cfg.entryWindowUtc[1]);
    const canSignal = ready && inWindow && taken < cfg.maxTradesPerSession;
    const entry = bar.close;
    const stopFrom = (low: number) => Math.min(low - cfg.stopBufferAtr * atrNow, entry - cfg.minStopAtr * atrNow);

    let hit: Hit | null = null;

    // Setup 1: breakout, then retest.
    if (useRetest) {
      const above = bar.close > vw[t];
      if (breakout >= 0) {
        if (!above || t - breakout > cfg.retestBars) breakout = -1;
        else if (t > breakout && bar.low <= vw[t]) {
          breakout = -1;
          if (canSignal) {
            const stop = stopFrom(bar.low);
            hit = { t, stop, target: entry + cfg.rr * (entry - stop), setup: "retest" };
          }
        }
      }
      if (!hit && breakout < 0 && above && barInSession > 0 && c[t - 1].close <= vw[t - 1]) breakout = t;
    }

    // Setup 2: liquidity sweep of a swing low.
    const swept = levels.filter((l) => t - l.idx <= cfg.levelLookback && bar.low < l.price && bar.close > l.price);
    if (useSweep && !hit && swept.length && canSignal) {
      const stop = stopFrom(bar.low);
      const risk = entry - stop;
      if (entry > vw[t]) hit = { t, stop, target: entry + cfg.rr * risk, setup: "sweep" };
      else if (vw[t] - entry >= cfg.minRr * risk) hit = { t, stop, target: vw[t], setup: "sweep" };
    }
    // A level is used up once traded through, and forgotten once too old.
    levels = levels.filter((l) => t - l.idx <= cfg.levelLookback && bar.low >= l.price);

    if (hit) {
      hits.push(hit);
      taken++;
    }
  }
  return hits;
}

export function createVwapStrategy(options: VwapOptions = {}): Strategy {
  const cfg: Cfg = { ...VWAP_DEFAULTS, ...Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined)) };
  let computed: (TradeTarget | null)[] = [];
  let setups: (VwapSetup | null)[] = [];

  const strategy: Strategy & { setupAt(t: number): VwapSetup | null } = {
    name: "VWAP Retest + Liquidity Sweep",

    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const signals: Signal[] = new Array(n).fill("HOLD");
      computed = new Array(n).fill(null);
      setups = new Array(n).fill(null);
      for (const h of scanLongs(candles, cfg)) {
        signals[h.t] = "BUY";
        computed[h.t] = { stopLoss: h.stop, takeProfit: h.target };
        setups[h.t] = h.setup;
      }
      for (const h of scanLongs(flipOhlc(candles), cfg)) {
        if (signals[h.t] !== "HOLD") {
          signals[h.t] = "HOLD";
          computed[h.t] = null;
          setups[h.t] = null;
          continue;
        }
        signals[h.t] = "SELL";
        computed[h.t] = { stopLoss: -h.stop, takeProfit: -h.target };
        setups[h.t] = h.setup;
      }
      return signals;
    },

    getTradeTargets(): (TradeTarget | null)[] {
      return computed;
    },

    // Which setup fired on bar t (for analysis scripts).
    setupAt(t: number) {
      return setups[t] ?? null;
    },
  };
  return strategy;
}
