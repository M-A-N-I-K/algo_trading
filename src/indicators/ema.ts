import { sma } from "./sma";

// Exponential Moving Average, seeded with the SMA of the first `period`
// values. Result is aligned with `values` — entries before index
// `period - 1` are NaN.
export function ema(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return result;

  const multiplier = 2 / (period + 1);
  result[period - 1] = sma(values, period)[period - 1];

  for (let i = period; i < values.length; i++) {
    result[i] = (values[i] - result[i - 1]) * multiplier + result[i - 1];
  }

  return result;
}
