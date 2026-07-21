import { sma } from "./sma";

export interface BollingerBandsResult {
  upper: number[];
  middle: number[];
  lower: number[];
}

// Bollinger Bands: SMA middle band plus/minus `stdDevMultiplier` standard
// deviations. All three arrays are aligned with `values`.
export function bollingerBands(
  values: number[],
  period = 20,
  stdDevMultiplier = 2,
): BollingerBandsResult {
  const middle = sma(values, period);
  const upper: number[] = new Array(values.length).fill(NaN);
  const lower: number[] = new Array(values.length).fill(NaN);

  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const mean = middle[i];
    const variance =
      slice.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);

    upper[i] = mean + stdDevMultiplier * stdDev;
    lower[i] = mean - stdDevMultiplier * stdDev;
  }

  return { upper, middle, lower };
}
