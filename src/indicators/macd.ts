import { ema } from "./ema";

export interface MACDResult {
  macdLine: number[];
  signalLine: number[];
  histogram: number[];
}

// Moving Average Convergence Divergence. All three arrays are aligned with
// `values`; entries are NaN until enough data has accumulated.
export function macd(
  values: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MACDResult {
  const fastEma = ema(values, fastPeriod);
  const slowEma = ema(values, slowPeriod);

  const macdLine = values.map((_, i) =>
    isNaN(fastEma[i]) || isNaN(slowEma[i]) ? NaN : fastEma[i] - slowEma[i],
  );

  const signalStartIndex = macdLine.findIndex((value) => !isNaN(value));
  const macdValues = macdLine.slice(signalStartIndex);
  const signalEma = ema(macdValues, signalPeriod);

  const signalLine: number[] = new Array(values.length).fill(NaN);
  signalEma.forEach((value, i) => {
    signalLine[signalStartIndex + i] = value;
  });

  const histogram = values.map((_, i) =>
    isNaN(macdLine[i]) || isNaN(signalLine[i])
      ? NaN
      : macdLine[i] - signalLine[i],
  );

  return { macdLine, signalLine, histogram };
}
