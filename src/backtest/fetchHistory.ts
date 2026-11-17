import { getCandleSticks } from "../tools/getCandlesticks";
import { Candlestick } from "../types";
import { fetchYahooCandles, isYahooMarket } from "../lib/markets/yahoo";

const MAX_LIMIT_PER_REQUEST = 1000;

/** Most candles one fetch (and one UI backtest) will load. */
export const MAX_HISTORY_CANDLES = 100_000;

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

// Pages fetched at once. 100 pages (100,000 candles) took ~32 s one after
// another; Binance's weight limits allow far more than this.
const PAGE_CONCURRENCY = 10;

const fetchPage = async (symbol: string, interval: string, start: number, limit: number) =>
  (await getCandleSticks(symbol, interval, start.toString(), undefined, limit)) ??
  (await getCandleSticks(symbol, interval, start.toString(), undefined, limit)); // one retry

// Binance's klines endpoint caps a single request at 1000 candles, so the
// span is split into fixed 1000-candle pages fetched in parallel. Each page
// keeps only candles opening before the next page starts, so pages that
// begin before the market listed (Binance answers them from the listing
// onwards) don't duplicate bars. A page that fails twice drops it and every
// older page: the result is always a gap-free run up to now.
export async function fetchCandlestickHistory(
  symbol: string,
  interval: string,
  requested: number,
): Promise<Candlestick[]> {
  const totalCandles = Number.isFinite(requested) ? Math.min(Math.max(Math.floor(requested), 0), MAX_HISTORY_CANDLES) : 0;
  if (isYahooMarket(symbol)) {
    // One request covers the whole span. Forex and index futures shut from
    // Friday night to Sunday night, so look back ~1.45× as far to get `totalCandles` bars.
    const span = totalCandles * intervalToMs(interval) * 1.45 + 4 * 24 * 60 * 60_000;
    return (await fetchYahooCandles(symbol, interval, Date.now() - span)).slice(-totalCandles);
  }

  const step = intervalToMs(interval);
  const start = Date.now() - totalCandles * step;
  const pages: { start: number; end: number; limit: number }[] = [];
  for (let done = 0; done < totalCandles; done += MAX_LIMIT_PER_REQUEST) {
    const limit = Math.min(MAX_LIMIT_PER_REQUEST, totalCandles - done);
    pages.push({ start: start + done * step, end: start + (done + limit) * step, limit });
  }

  const results: (Candlestick[] | undefined)[] = new Array(pages.length);
  for (let i = 0; i < pages.length; i += PAGE_CONCURRENCY) {
    const chunk = pages.slice(i, i + PAGE_CONCURRENCY);
    const got = await Promise.all(chunk.map((p) => fetchPage(symbol, interval, p.start, p.limit)));
    got.forEach((batch, j) => (results[i + j] = batch));
  }

  const lastFailed = results.findLastIndex((r) => r === undefined);
  const allCandles: Candlestick[] = [];
  for (let i = lastFailed + 1; i < pages.length; i++) {
    const isLast = i === pages.length - 1;
    for (const c of results[i]!) {
      if (!isLast && Number(c[0]) >= pages[i].end) break;
      if (allCandles.length && Number(c[0]) <= Number(allCandles[allCandles.length - 1][0])) continue;
      allCandles.push(c);
    }
  }
  return allCandles;
}
