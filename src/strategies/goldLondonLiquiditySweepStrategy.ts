import { pivotHigh, pivotLow } from "../indicators/pivots";
import { inSessionWindow } from "../indicators/session";
import { OHLC } from "../indicators/utils";
import { Signal, Strategy, TradeTarget } from "../types";

export interface GoldLondonLiquiditySweepOptions {
  // Session windows, UTC, "HHMM-HHMM" (matches Pine's session-string format).
  asiaSession?: string;
  preLondonSession?: string;
  londonEntrySession?: string;
  pivotLookback?: number;
  rewardRiskRatio?: number;
}

// Ported from the "Gold London Liquidity Sweep" Pine strategy (a London
// liquidity-sweep/BOS setup originally built for gold, works on any 24h
// market): track the Asia session's high/low, wait for the pre-London
// window to sweep exactly one side of that range (a liquidity grab), then
// arm a directional bias for the London entry window and trade the first
// break-of-structure in that direction. One trade per day.
export function createGoldLondonLiquiditySweepStrategy(
  options: GoldLondonLiquiditySweepOptions = {},
): Strategy {
  const {
    asiaSession = "0000-0500",
    preLondonSession = "0500-0700",
    londonEntrySession = "0700-0800",
    pivotLookback = 3,
    rewardRiskRatio = 2,
  } = options;

  let computedTargets: (TradeTarget | null)[] = [];

  return {
    name: "Gold London Liquidity Sweep",

    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const signals: Signal[] = new Array(n).fill("HOLD");
      computedTargets = new Array(n).fill(null);
      if (n < pivotLookback * 2 + 2) return signals;

      const ph = pivotHigh(
        candles.map((c) => c.high),
        pivotLookback,
        pivotLookback,
      );
      const pl = pivotLow(
        candles.map((c) => c.low),
        pivotLookback,
        pivotLookback,
      );

      let asiaHigh: number | null = null;
      let asiaLow: number | null = null;
      let sweptHigh = false;
      let sweptLow = false;
      let dayBias: 1 | -1 | 0 = 0;
      let armed = false;

      let lastPivotHigh: number | null = null;
      let lastPivotLow: number | null = null;

      let wasInAsia = false;
      let wasInPreLondon = false;
      let wasInLondonEntry = false;

      for (let t = 0; t < n; t++) {
        const candle = candles[t];
        const time = candle.openTime;

        const inAsia = inSessionWindow(time, asiaSession);
        const inPreLondon = inSessionWindow(time, preLondonSession);
        const inLondonEntry = inSessionWindow(time, londonEntrySession);

        if (inAsia && !wasInAsia) {
          asiaHigh = candle.high;
          asiaLow = candle.low;
        } else if (inAsia) {
          asiaHigh = asiaHigh === null ? candle.high : Math.max(asiaHigh, candle.high);
          asiaLow = asiaLow === null ? candle.low : Math.min(asiaLow, candle.low);
        }

        if (inPreLondon && !wasInPreLondon) {
          sweptHigh = false;
          sweptLow = false;
        }
        if (inPreLondon && asiaHigh !== null && asiaLow !== null) {
          if (candle.high > asiaHigh) sweptHigh = true;
          if (candle.low < asiaLow) sweptLow = true;
        }

        if (inLondonEntry && !wasInLondonEntry) {
          dayBias = 0;
          armed = false;
          if (sweptLow && !sweptHigh) {
            dayBias = 1;
            armed = true;
          } else if (sweptHigh && !sweptLow) {
            dayBias = -1;
            armed = true;
          }
        }

        if (ph[t] !== null) lastPivotHigh = ph[t];
        if (pl[t] !== null) lastPivotLow = pl[t];

        const prevClose = t > 0 ? candles[t - 1].close : NaN;

        const longSignal =
          armed &&
          dayBias === 1 &&
          inLondonEntry &&
          lastPivotHigh !== null &&
          candle.close > lastPivotHigh &&
          prevClose <= lastPivotHigh;
        const shortSignal =
          armed &&
          dayBias === -1 &&
          inLondonEntry &&
          lastPivotLow !== null &&
          candle.close < lastPivotLow &&
          prevClose >= lastPivotLow;

        if (longSignal || shortSignal) armed = false;

        if (longSignal && lastPivotLow !== null) {
          const risk = candle.close - lastPivotLow;
          if (risk > 0) {
            signals[t] = "BUY";
            computedTargets[t] = { stopLoss: lastPivotLow, takeProfit: candle.close + risk * rewardRiskRatio };
          }
        } else if (shortSignal && lastPivotHigh !== null) {
          const risk = lastPivotHigh - candle.close;
          if (risk > 0) {
            signals[t] = "SELL";
            computedTargets[t] = { stopLoss: lastPivotHigh, takeProfit: candle.close - risk * rewardRiskRatio };
          }
        }

        wasInAsia = inAsia;
        wasInPreLondon = inPreLondon;
        wasInLondonEntry = inLondonEntry;
      }

      return signals;
    },

    getTradeTargets(): (TradeTarget | null)[] {
      return computedTargets;
    },
  };
}
