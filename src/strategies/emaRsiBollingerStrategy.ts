import { ema } from "../indicators/ema";
import { rsi } from "../indicators/rsi";
import { bollingerBands } from "../indicators/bollingerBands";
import { OHLC } from "../indicators/utils";
import { Signal, Strategy } from "../types";

export interface EmaRsiBollingerOptions {
  fastEmaPeriod?: number;
  slowEmaPeriod?: number;
  rsiPeriod?: number;
  bollingerPeriod?: number;
  bollingerStdDev?: number;
}

// Trend (EMA crossover) + momentum (RSI) + volatility (Bollinger Bands)
// confirmation strategy:
//   BUY  when fast EMA > slow EMA (uptrend), RSI is bullish but not
//        overbought (50-70), and price hasn't already broken above the
//        upper band.
//   SELL when fast EMA < slow EMA (downtrend), RSI is bearish but not
//        oversold (30-50), and price hasn't already broken below the
//        lower band.
export function createEmaRsiBollingerStrategy(
  options: EmaRsiBollingerOptions = {},
): Strategy {
  const {
    fastEmaPeriod = 12,
    slowEmaPeriod = 26,
    rsiPeriod = 14,
    bollingerPeriod = 20,
    bollingerStdDev = 2,
  } = options;

  return {
    name: "EMA Crossover + RSI + Bollinger Bands",
    generateSignals(candles: OHLC[]): Signal[] {
      const closes = candles.map((candle) => candle.close);

      const fastEma = ema(closes, fastEmaPeriod);
      const slowEma = ema(closes, slowEmaPeriod);
      const rsiValues = rsi(closes, rsiPeriod);
      const { upper, lower } = bollingerBands(
        closes,
        bollingerPeriod,
        bollingerStdDev,
      );

      return closes.map((close, i): Signal => {
        if (
          isNaN(fastEma[i]) ||
          isNaN(slowEma[i]) ||
          isNaN(rsiValues[i]) ||
          isNaN(upper[i]) ||
          isNaN(lower[i])
        ) {
          return "HOLD";
        }

        const isUptrend = fastEma[i] > slowEma[i];
        const isDowntrend = fastEma[i] < slowEma[i];

        if (
          isUptrend &&
          rsiValues[i] > 50 &&
          rsiValues[i] < 70 &&
          close <= upper[i]
        ) {
          return "BUY";
        }

        if (
          isDowntrend &&
          rsiValues[i] < 50 &&
          rsiValues[i] > 30 &&
          close >= lower[i]
        ) {
          return "SELL";
        }

        return "HOLD";
      });
    },
  };
}
