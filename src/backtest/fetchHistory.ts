import { getCandleSticks } from "../tools/getCandlesticks";
import { Candlestick } from "../types";

const MAX_LIMIT_PER_REQUEST = 1000;

const INTERVAL_MS: Record<string, number> = {
  "1m": 60_000,
  "3m": 3 * 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "2h": 2 * 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "6h": 6 * 60 * 60_000,
  "8h": 8 * 60 * 60_000,
  "12h": 12 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
  "3d": 3 * 24 * 60 * 60_000,
  "1w": 7 * 24 * 60 * 60_000,
};

export function intervalToMs(interval: string): number {
  const ms = INTERVAL_MS[interval];
  if (!ms) throw new Error(`Unknown interval: ${interval}`);
  return ms;
}

// Binance's klines endpoint caps a single request at 1000 candles. This
// pages through it (walking `startTime` forward using each batch's close
// time) until `totalCandles` have been collected.
export async function fetchCandlestickHistory(
  symbol: string,
  interval: string,
  totalCandles: number,
): Promise<Candlestick[]> {
  const allCandles: Candlestick[] = [];
  let cursor = Date.now() - totalCandles * intervalToMs(interval);

  while (allCandles.length < totalCandles) {
    const remaining = totalCandles - allCandles.length;
    const limit = Math.min(MAX_LIMIT_PER_REQUEST, remaining);

    const batch = await getCandleSticks(
      symbol,
      interval,
      cursor.toString(),
      undefined,
      limit,
    );
    if (!batch || batch.length === 0) break;

    allCandles.push(...batch);

    const lastCloseTime = batch[batch.length - 1][6];
    cursor = lastCloseTime + 1;

    if (batch.length < limit) break; // no more data available from Binance
  }

  return allCandles;
}
