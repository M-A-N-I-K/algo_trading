import axios from "axios";
import { Candlestick } from "../types";
import { fetchYahooCandles, isYahooMarket } from "../lib/markets/yahoo";

const SPOT_API = () => process.env.BASE_API || "https://api.binance.com";
const FUTURES_API = () => process.env.BINANCE_FUTURES_API || "https://fapi.binance.com";
const INVALID_SYMBOL = -1121;

// Symbols Binance spot rejected, fetched from USDⓈ-M futures from then on.
const futuresOnly = new Set<string>();

// Klines for `symbol` from Binance spot, or from USDⓈ-M futures when spot
// doesn't list it (e.g. gold, XAUUSDT). Both return the same array shape.
// Returns undefined on failure, after logging why.
export async function getCandleSticks(symbol: string, interval: string, startTime?: string, endTime?: string, limit = 10) {
  if (isYahooMarket(symbol)) return yahooKlines(symbol, interval, startTime, endTime, limit);
  const params = { symbol, interval, startTime, endTime, limit };
  const futures = () => axios.get<Candlestick[]>(`${FUTURES_API()}/fapi/v1/klines`, { params }).then((r) => r.data);

  try {
    if (futuresOnly.has(symbol)) return await futures();
    try {
      return (await axios.get<Candlestick[]>(`${SPOT_API()}/api/v3/klines`, { params })).data;
    } catch (error) {
      if (!axios.isAxiosError(error) || error.response?.data?.code !== INVALID_SYMBOL) throw error;
      futuresOnly.add(symbol);
      return await futures();
    }
  } catch (error) {
    const detail = axios.isAxiosError(error) ? (error.response?.data?.msg ?? error.message) : String(error);
    console.error(`Binance klines for ${symbol} ${interval} failed: ${detail}`);
    return undefined;
  }
}

// Currency pairs and indices come from Yahoo Finance (see src/lib/markets/yahoo.ts), in
// the same shape: the first `limit` candles from startTime, or the last
// `limit` when there's no startTime.
async function yahooKlines(symbol: string, interval: string, startTime?: string, endTime?: string, limit = 10) {
  try {
    const end = endTime ? Number(endTime) : Date.now();
    if (startTime) return (await fetchYahooCandles(symbol, interval, Number(startTime), end)).slice(0, limit);
    // No start: look back far enough to cover `limit` candles across weekends.
    const lookback = limit * intervalMs(interval) * 1.6 + 4 * 86_400_000;
    return (await fetchYahooCandles(symbol, interval, end - lookback, end)).slice(-limit);
  } catch (error) {
    const detail = axios.isAxiosError(error) ? (error.response?.data?.chart?.error?.description ?? error.message) : String(error);
    console.error(`Yahoo candles for ${symbol} ${interval} failed: ${detail}`);
    return undefined;
  }
}

const intervalMs = (interval: string) =>
  ({ "5m": 300_000, "15m": 900_000, "30m": 1_800_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000, "1w": 604_800_000 })[interval] ?? 3_600_000;
