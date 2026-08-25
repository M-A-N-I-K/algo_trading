import { vwap } from "../indicators/vwap";
import { OHLC } from "../indicators/utils";
import { Signal, Strategy, TradeTarget } from "../types";

export interface VwapStrategyOptions {
  // How many candles back to measure VWAP's slope over, to decide whether
  // the session is trending (tradeable) or flat (skip, per the video's
  // "avoid flat vwap days" rule).
  slopeLookback?: number;
  // Minimum |% change| of VWAP over `slopeLookback` candles required to
  // call the session "trending" rather than flat.
  minVwapSlopePercent?: number;
  // Minimum ratio of rejection-wick length to candle body size required to
  // count as a "candle failure" at the VWAP line.
  wickBodyRatio?: number;
  // Max candles to wait after a failure candle for price to break its
  // high/low (the entry trigger) before the setup is invalidated.
  triggerWindow?: number;
  // Take-profit expressed as a multiple of the stop-loss risk.
  rewardRiskRatio?: number;
}

interface PendingSetup {
  trigger: number;
  stop: number;
  expiresAt: number;
}

// Implements the "one indicator" VWAP price-action strategy: trade only in
// the direction VWAP is trending (avoid flat sessions), watch for a candle
// that wicks into/through VWAP but fails to close through it (a "candle
// failure" — long wick = rejection), then enter on a break of that candle's
// high/low. This single rule captures all three setups from the video:
// bounce off VWAP, reject at VWAP, and break-and-retest of VWAP.
export function createVwapStrategy(options: VwapStrategyOptions = {}): Strategy {
  const {
    slopeLookback = 12,
    minVwapSlopePercent = 0.05,
    wickBodyRatio = 1.0,
    triggerWindow = 6,
    rewardRiskRatio = 2,
  } = options;

  let computedTargets: (TradeTarget | null)[] = [];

  return {
    name: "VWAP Candle Failure (Bounce / Reject / Break & Retest)",

    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const signals: Signal[] = new Array(n).fill("HOLD");
      computedTargets = new Array(n).fill(null);

      if (n < slopeLookback + 5) return signals;

      const vwapLine = vwap(candles);

      let pendingLong: PendingSetup | null = null;
      let pendingShort: PendingSetup | null = null;

      for (let t = slopeLookback; t < n; t++) {
        const candle = candles[t];
        if (isNaN(vwapLine[t])) continue;

        // 1. Check pending setups for a breakout confirmation first.
        if (pendingLong) {
          if (candle.high > pendingLong.trigger) {
            const entry = candle.close;
            const stop = pendingLong.stop;
            if (entry > stop) {
              signals[t] = "BUY";
              const risk = entry - stop;
              computedTargets[t] = { stopLoss: stop, takeProfit: entry + rewardRiskRatio * risk };
            }
            pendingLong = null;
          } else if (t >= pendingLong.expiresAt) {
            pendingLong = null;
          }
        }

        if (pendingShort) {
          if (candle.low < pendingShort.trigger) {
            const entry = candle.close;
            const stop = pendingShort.stop;
            if (entry < stop) {
              signals[t] = "SELL";
              const risk = stop - entry;
              computedTargets[t] = { stopLoss: stop, takeProfit: entry - rewardRiskRatio * risk };
            }
            pendingShort = null;
          } else if (t >= pendingShort.expiresAt) {
            pendingShort = null;
          }
        }

        // 2. Flat-session filter: skip setup detection when VWAP has no slope.
        const slopeStart = vwapLine[t - slopeLookback];
        if (isNaN(slopeStart) || slopeStart === 0) continue;
        const slopePercent = ((vwapLine[t] - slopeStart) / slopeStart) * 100;
        const isTrendingUp = slopePercent >= minVwapSlopePercent;
        const isTrendingDown = slopePercent <= -minVwapSlopePercent;

        const body = Math.abs(candle.close - candle.open);
        const upperWick = candle.high - Math.max(candle.open, candle.close);
        const lowerWick = Math.min(candle.open, candle.close) - candle.low;
        const wickFloor = wickBodyRatio * Math.max(body, 1e-9);

        // 3. Bullish candle failure: wicks to/through VWAP, closes back
        // above it, with a long lower wick showing buy-side rejection.
        if (
          isTrendingUp &&
          candle.low <= vwapLine[t] &&
          candle.close > vwapLine[t] &&
          lowerWick >= wickFloor
        ) {
          pendingLong = { trigger: candle.high, stop: candle.low, expiresAt: t + triggerWindow };
          pendingShort = null;
        }

        // 4. Bearish candle failure: wicks to/through VWAP, closes back
        // below it, with a long upper wick showing sell-side rejection.
        if (
          isTrendingDown &&
          candle.high >= vwapLine[t] &&
          candle.close < vwapLine[t] &&
          upperWick >= wickFloor
        ) {
          pendingShort = { trigger: candle.low, stop: candle.high, expiresAt: t + triggerWindow };
          pendingLong = null;
        }
      }

      return signals;
    },

    getTradeTargets(): (TradeTarget | null)[] {
      return computedTargets;
    },
  };
}
