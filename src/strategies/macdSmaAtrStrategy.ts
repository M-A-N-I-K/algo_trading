import { sma } from "../indicators/sma";
import { macd } from "../indicators/macd";
import { atr } from "../indicators/atr";
import { OHLC } from "../indicators/utils";
import { Signal, Strategy } from "../types";

export interface MacdSmaAtrOptions {
  trendSmaPeriod?: number;
  macdFastPeriod?: number;
  macdSlowPeriod?: number;
  macdSignalPeriod?: number;
  atrPeriod?: number;
  atrSmaPeriod?: number;
}

// Trend (SMA) + momentum (MACD histogram crossover) + volatility (ATR)
// confirmation strategy:
//   BUY  when price is above the trend SMA (uptrend), the MACD histogram
//        just crossed from negative to positive (bullish momentum shift),
//        and ATR is above its own moving average (volatility expanding,
//        i.e. the market isn't flat/choppy).
//   SELL when price is below the trend SMA (downtrend), the MACD histogram
//        just crossed from positive to negative, and ATR is expanding.
export function createMacdSmaAtrStrategy(
  options: MacdSmaAtrOptions = {},
): Strategy {
  const {
    trendSmaPeriod = 50,
    macdFastPeriod = 12,
    macdSlowPeriod = 26,
    macdSignalPeriod = 9,
    atrPeriod = 14,
    atrSmaPeriod = 20,
  } = options;

  return {
    name: "MACD Crossover + SMA Trend + ATR Volatility",
    generateSignals(candles: OHLC[]): Signal[] {
      const closes = candles.map((candle) => candle.close);

      const trendSma = sma(closes, trendSmaPeriod);
      const { histogram } = macd(
        closes,
        macdFastPeriod,
        macdSlowPeriod,
        macdSignalPeriod,
      );
      const atrValues = atr(candles, atrPeriod);
      const atrSma = sma(atrValues, atrSmaPeriod);

      return closes.map((close, i): Signal => {
        if (i === 0) return "HOLD";

        if (
          isNaN(trendSma[i]) ||
          isNaN(histogram[i]) ||
          isNaN(histogram[i - 1]) ||
          isNaN(atrValues[i]) ||
          isNaN(atrSma[i])
        ) {
          return "HOLD";
        }

        const isUptrend = close > trendSma[i];
        const isDowntrend = close < trendSma[i];
        const isVolatilityExpanding = atrValues[i] > atrSma[i];

        const bullishCrossover = histogram[i - 1] <= 0 && histogram[i] > 0;
        const bearishCrossover = histogram[i - 1] >= 0 && histogram[i] < 0;

        if (isUptrend && bullishCrossover && isVolatilityExpanding) {
          return "BUY";
        }

        if (isDowntrend && bearishCrossover && isVolatilityExpanding) {
          return "SELL";
        }

        return "HOLD";
      });
    },
  };
}
