import axios from "axios";
import { Candlestick } from "../types";

const SPOT_API = () => process.env.BASE_API || "https://api.binance.com";
const FUTURES_API = () => process.env.BINANCE_FUTURES_API || "https://fapi.binance.com";
const INVALID_SYMBOL = -1121;

// Symbols Binance spot rejected, fetched from USDⓈ-M futures from then on.
const futuresOnly = new Set<string>();

// Klines for `symbol` from Binance spot, or from USDⓈ-M futures when spot
// doesn't list it (e.g. gold, XAUUSDT). Both return the same array shape.
// Returns undefined on failure, after logging why.
export async function getCandleSticks(symbol: string, interval: string, startTime?: string, endTime?: string, limit = 10) {
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
