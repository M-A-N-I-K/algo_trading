import { OHLC } from "./utils";

// Average True Range (Wilder's smoothing). Result is aligned with
// `candles` — entries before index `period` are NaN.
export function atr(candles: OHLC[], period = 14): number[] {
  const result: number[] = new Array(candles.length).fill(NaN);
  if (candles.length <= period) return result;

  const trueRanges = candles.map((candle, i) => {
    if (i === 0) return candle.high - candle.low;
    const prevClose = candles[i - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - prevClose),
      Math.abs(candle.low - prevClose),
    );
  });

  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trueRanges[i];
  let avg = sum / period;
  result[period] = avg;

  for (let i = period + 1; i < candles.length; i++) {
    avg = (avg * (period - 1) + trueRanges[i]) / period;
    result[i] = avg;
  }

  return result;
}
