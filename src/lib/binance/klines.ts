import axios from "axios";
import type { Kline, KlineFetcher } from "@/domain/market-data/historicalCandles";
import type { Candlestick } from "@/types/candlestick";

const BASE_API = () => process.env.BASE_API || "https://api.binance.com";
const FUTURES_API = () => process.env.BINANCE_FUTURES_API || "https://fapi.binance.com";

// Both markets return klines in the same array shape. Throws on HTTP failure
// so a backtest fails loudly instead of running on a partial range.
function klineFetcher(url: () => string): KlineFetcher {
  return {
    async fetch(symbol, interval, startMs, endMs, limit) {
      const { data } = await axios.get<Candlestick[]>(url(), {
        params: { symbol, interval, startTime: startMs, endTime: endMs, limit },
        timeout: 20_000,
      });
      return data.map(
        (k): Kline => ({
          openTime: k[0],
          open: Number(k[1]),
          high: Number(k[2]),
          low: Number(k[3]),
          close: Number(k[4]),
          volume: Number(k[5]),
          closeTime: k[6],
        }),
      );
    },
  };
}

// Binance spot klines (/api/v3/klines).
export const binanceSpotKlines = klineFetcher(() => `${BASE_API()}/api/v3/klines`);
// Binance USDⓈ-M futures klines (/fapi/v1/klines), for markets spot doesn't
// list, such as gold (XAUUSDT).
export const binanceFuturesKlines = klineFetcher(() => `${FUTURES_API()}/fapi/v1/klines`);

export interface BinanceSymbolFilters {
  tickSize: number;
  stepSize: number;
}

type ExchangeInfo = { symbols: { symbol: string; filters: { filterType: string; tickSize?: string; stepSize?: string }[] }[] };

// Tick size and lot step for spot symbols, from /api/v3/exchangeInfo.
export async function fetchSymbolFilters(symbols: string[]): Promise<Record<string, BinanceSymbolFilters>> {
  const { data } = await axios.get<ExchangeInfo>(`${BASE_API()}/api/v3/exchangeInfo`, {
    params: { symbols: JSON.stringify(symbols) },
    timeout: 20_000,
  });
  return toFilters(data, symbols);
}

// Tick size and lot step for USDⓈ-M futures symbols, from /fapi/v1/exchangeInfo
// (which lists every symbol; there's no filter parameter).
export async function fetchFuturesSymbolFilters(symbols: string[]): Promise<Record<string, BinanceSymbolFilters>> {
  const { data } = await axios.get<ExchangeInfo>(`${FUTURES_API()}/fapi/v1/exchangeInfo`, { timeout: 20_000 });
  return toFilters(data, symbols);
}

function toFilters(data: ExchangeInfo, symbols: string[]): Record<string, BinanceSymbolFilters> {
  const wanted = new Set(symbols);
  const out: Record<string, BinanceSymbolFilters> = {};
  for (const s of data.symbols) {
    if (!wanted.has(s.symbol)) continue;
    const price = s.filters.find((f) => f.filterType === "PRICE_FILTER");
    const lot = s.filters.find((f) => f.filterType === "LOT_SIZE");
    out[s.symbol] = { tickSize: Number(price?.tickSize ?? 0), stepSize: Number(lot?.stepSize ?? 0) };
  }
  return out;
}
