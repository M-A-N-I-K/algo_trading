import { OHLC } from "./utils";

export interface ADXResult {
  plusDI: number[];
  minusDI: number[];
  adx: number[];
}

// Average Directional Index (Wilder's method) — measures trend strength,
// not direction. +DI/-DI indicate directional bias; ADX above ~20-25 is
// commonly read as "trending", below as "range-bound/choppy". All three
// arrays are aligned with `candles`.
export function adx(candles: OHLC[], period = 14): ADXResult {
  const length = candles.length;
  const plusDI: number[] = new Array(length).fill(NaN);
  const minusDI: number[] = new Array(length).fill(NaN);
  const adxResult: number[] = new Array(length).fill(NaN);

  if (length <= period * 2) return { plusDI, minusDI, adx: adxResult };

  const trueRanges: number[] = new Array(length).fill(0);
  const plusDM: number[] = new Array(length).fill(0);
  const minusDM: number[] = new Array(length).fill(0);

  for (let i = 1; i < length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;

    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;

    trueRanges[i] = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    );
  }

  let smoothedTR = 0;
  let smoothedPlusDM = 0;
  let smoothedMinusDM = 0;
  for (let i = 1; i <= period; i++) {
    smoothedTR += trueRanges[i];
    smoothedPlusDM += plusDM[i];
    smoothedMinusDM += minusDM[i];
  }

  const dx: number[] = new Array(length).fill(NaN);

  const setDI = (i: number) => {
    plusDI[i] = smoothedTR === 0 ? 0 : (100 * smoothedPlusDM) / smoothedTR;
    minusDI[i] = smoothedTR === 0 ? 0 : (100 * smoothedMinusDM) / smoothedTR;
    const diSum = plusDI[i] + minusDI[i];
    dx[i] = diSum === 0 ? 0 : (100 * Math.abs(plusDI[i] - minusDI[i])) / diSum;
  };

  setDI(period);

  for (let i = period + 1; i < length; i++) {
    smoothedTR = smoothedTR - smoothedTR / period + trueRanges[i];
    smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + plusDM[i];
    smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + minusDM[i];
    setDI(i);
  }

  // ADX = Wilder-smoothed average of DX, seeded with a simple average of
  // the first `period` DX values.
  let dxSum = 0;
  for (let i = period; i < period * 2; i++) dxSum += dx[i];
  adxResult[period * 2 - 1] = dxSum / period;

  for (let i = period * 2; i < length; i++) {
    adxResult[i] = (adxResult[i - 1] * (period - 1) + dx[i]) / period;
  }

  return { plusDI, minusDI, adx: adxResult };
}
