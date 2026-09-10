import { OHLC } from "./utils";

// Chaikin Money Flow: sum of (close-location-value * volume) over `period`,
// divided by summed volume. Result is aligned with `candles` — entries
// before the window fills are NaN.
export function cmf(candles: OHLC[], period = 20): number[] {
  const n = candles.length;
  const result: number[] = new Array(n).fill(NaN);
  if (n < period) return result;

  const moneyFlowVolume = candles.map((candle) => {
    const range = candle.high - candle.low;
    if (range === 0) return 0;
    return (((candle.close - candle.low) - (candle.high - candle.close)) / range) * candle.volume;
  });

  let mfvSum = 0;
  let volSum = 0;
  for (let i = 0; i < n; i++) {
    mfvSum += moneyFlowVolume[i];
    volSum += candles[i].volume;

    if (i >= period) {
      mfvSum -= moneyFlowVolume[i - period];
      volSum -= candles[i - period].volume;
    }

    if (i >= period - 1) {
      result[i] = volSum === 0 ? 0 : mfvSum / volSum;
    }
  }

  return result;
}
