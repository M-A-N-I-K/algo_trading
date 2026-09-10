import { ema } from "../indicators/ema";
import { rsi } from "../indicators/rsi";
import { OHLC } from "../indicators/utils";
import { Signal, Strategy, TradeTarget } from "../types";

export interface TrendRsiEngulfingScalpOptions {
  emaLength?: number;
  rsiLength?: number;
  rsiMidline?: number;
  // Stop distance, expressed as a multiple of the signal candle's range.
  stopRangeMultiple?: number;
  rewardRiskRatio?: number;
}

// Ported from the "Trend + RSI + Engulfing Scalp" Pine strategy: long-only,
// trades a bullish engulfing candle when price is above a long EMA trend
// filter and RSI is above its midline. Stop is a multiple of the signal
// candle's range; target is a fixed R-multiple of that stop.
export function createTrendRsiEngulfingScalpStrategy(options: TrendRsiEngulfingScalpOptions = {}): Strategy {
  const { emaLength = 200, rsiLength = 14, rsiMidline = 50, stopRangeMultiple = 2, rewardRiskRatio = 2 } = options;

  let computedTargets: (TradeTarget | null)[] = [];

  return {
    name: "Trend + RSI + Engulfing Scalp",

    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const signals: Signal[] = new Array(n).fill("HOLD");
      computedTargets = new Array(n).fill(null);
      if (n < emaLength + 2) return signals;

      const closes = candles.map((c) => c.close);
      const emaLine = ema(closes, emaLength);
      const rsiLine = rsi(closes, rsiLength);

      for (let t = 1; t < n; t++) {
        if (isNaN(emaLine[t]) || isNaN(rsiLine[t])) continue;

        const candle = candles[t];
        const prev = candles[t - 1];

        const bullishEngulfing =
          prev.close < prev.open &&
          candle.close > candle.open &&
          candle.open <= prev.close &&
          candle.close > prev.open;

        const trendOk = candle.close > emaLine[t];
        const momentumOk = rsiLine[t] > rsiMidline;

        if (trendOk && momentumOk && bullishEngulfing) {
          const candleRange = candle.high - candle.low;
          const stopDist = candleRange * stopRangeMultiple;
          if (stopDist > 0) {
            signals[t] = "BUY";
            computedTargets[t] = {
              stopLoss: candle.close - stopDist,
              takeProfit: candle.close + stopDist * rewardRiskRatio,
            };
          }
        }
      }

      return signals;
    },

    getTradeTargets(): (TradeTarget | null)[] {
      return computedTargets;
    },
  };
}
