// Pivot high/low detection matching Pine's ta.pivothigh/ta.pivotlow: a bar
// at index i is a pivot if its value is strictly greater (high) / less (low)
// than every other value within `left` bars before and `right` bars after
// it. Like Pine, the pivot is only knowable once the `right` bars after it
// have printed, so the result is reported at index `i + right` (the bar
// where it's confirmed), not at `i` itself — this keeps callers lookahead-free.
export function pivotHigh(values: number[], left: number, right: number): (number | null)[] {
  const n = values.length;
  const result: (number | null)[] = new Array(n).fill(null);

  for (let i = left; i < n - right; i++) {
    const candidate = values[i];
    let isPivot = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (values[j] >= candidate) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) result[i + right] = candidate;
  }

  return result;
}

export function pivotLow(values: number[], left: number, right: number): (number | null)[] {
  const n = values.length;
  const result: (number | null)[] = new Array(n).fill(null);

  for (let i = left; i < n - right; i++) {
    const candidate = values[i];
    let isPivot = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (values[j] <= candidate) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) result[i + right] = candidate;
  }

  return result;
}
