import { OHLC } from "./utils";

const DAY_MS = 24 * 60 * 60 * 1000;

// Session-anchored VWAP (typical price weighted by volume), resetting at
// each UTC day boundary — matches TradingView's default "Session" anchor
// with the upper/lower bands turned off (just the basis line).
export function vwap(candles: OHLC[], anchorMs: number = DAY_MS): number[] {
  const n = candles.length;
  const result: number[] = new Array(n).fill(NaN);

  let session = -1;
  let cumPV = 0;
  let cumVolume = 0;

  for (let i = 0; i < n; i++) {
    const candle = candles[i];
    const candleSession = Math.floor(candle.openTime / anchorMs);

    if (candleSession !== session) {
      session = candleSession;
      cumPV = 0;
      cumVolume = 0;
    }

    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumPV += typicalPrice * candle.volume;
    cumVolume += candle.volume;

    result[i] = cumVolume > 0 ? cumPV / cumVolume : typicalPrice;
  }

  return result;
}
