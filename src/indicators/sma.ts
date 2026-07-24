// Simple Moving Average. Result is aligned with `values` — entries before
// the window fills, or while a NaN (e.g. another indicator's warm-up
// period) is inside the window, are NaN.
export function sma(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  let sum = 0;
  let nanCount = 0;

  for (let i = 0; i < values.length; i++) {
    if (isNaN(values[i])) nanCount++;
    else sum += values[i];

    if (i >= period) {
      if (isNaN(values[i - period])) nanCount--;
      else sum -= values[i - period];
    }

    if (i >= period - 1 && nanCount === 0) result[i] = sum / period;
  }

  return result;
}
