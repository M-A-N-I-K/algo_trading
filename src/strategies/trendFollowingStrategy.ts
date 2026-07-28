import { ema } from "../indicators/ema";
import { adx } from "../indicators/adx";
import { OHLC } from "../indicators/utils";
import { Signal, Strategy } from "../types";

export interface TrendFollowingOptions {
  fastEmaPeriod?: number;
  slowEmaPeriod?: number;
  adxPeriod?: number;
  adxTrendThreshold?: number;
}

// Classic dual-EMA trend-following strategy, filtered by ADX so it only
// trades when a real trend is present (avoids whipsawing on EMA crosses
// during flat/choppy markets):
//   BUY  when fast EMA > slow EMA (uptrend) and ADX > threshold (trending).
//   SELL when fast EMA < slow EMA (downtrend) and ADX > threshold.
//   HOLD (keep current position) whenever ADX is below the threshold,
//        i.e. the market isn't trending strongly enough to trust the
//        crossover.
export function createTrendFollowingStrategy(
  options: TrendFollowingOptions = {},
): Strategy {
  const {
    fastEmaPeriod = 20,
    slowEmaPeriod = 50,
    adxPeriod = 14,
    adxTrendThreshold = 20,
  } = options;

  return {
    name: "Dual EMA Trend Following + ADX Filter",
    generateSignals(candles: OHLC[]): Signal[] {
      const closes = candles.map((candle) => candle.close);

      const fastEma = ema(closes, fastEmaPeriod);
      const slowEma = ema(closes, slowEmaPeriod);
      const { adx: adxValues } = adx(candles, adxPeriod);

      return closes.map((_, i): Signal => {
        if (isNaN(fastEma[i]) || isNaN(slowEma[i]) || isNaN(adxValues[i])) {
          return "HOLD";
        }

        if (adxValues[i] <= adxTrendThreshold) return "HOLD";

        if (fastEma[i] > slowEma[i]) return "BUY";
        if (fastEma[i] < slowEma[i]) return "SELL";
        return "HOLD";
      });
    },
  };
}
