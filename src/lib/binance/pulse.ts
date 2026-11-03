import axios from "axios";
import { computePulse, MarketPulse, PulseKline } from "@/domain/market-pulse/pulse";
import { PulseMarket } from "@/domain/market-pulse/markets";

const FUTURES_API = () => process.env.BINANCE_FUTURES_API || "https://fapi.binance.com";
const PULSE_TTL_MS = 10_000;

type RawKline = [number, string, string, string, string, string, number, string, number, string, string, string];

async function klines(symbol: string, interval: string, limit: number): Promise<PulseKline[]> {
  const { data } = await axios.get<RawKline[]>(`${FUTURES_API()}/fapi/v1/klines`, { params: { symbol, interval, limit }, timeout: 10_000 });
  return data.map((k) => ({
    openTime: k[0],
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
    closeTime: k[6],
    takerBuyVolume: Number(k[9]),
  }));
}

const pulseCache = new Map<string, { at: number; value: Promise<MarketPulse> }>();

// Live pulse for one market from Binance USDⓈ-M futures, cached for 10s so
// many open tabs make one set of requests.
export function loadPulse(market: PulseMarket): Promise<MarketPulse> {
  const hit = pulseCache.get(market.symbol);
  if (hit && Date.now() - hit.at < PULSE_TTL_MS) return hit.value;

  const value = (async () => {
    const [ticker, minute, quarterHour, daily] = await Promise.all([
      axios
        .get<{ lastPrice: string; highPrice: string; lowPrice: string }>(`${FUTURES_API()}/fapi/v1/ticker/24hr`, { params: { symbol: market.symbol }, timeout: 10_000 })
        .then((r) => r.data),
      klines(market.symbol, "1m", 62),
      klines(market.symbol, "15m", 97),
      klines(market.symbol, "1d", 15),
    ]);
    return computePulse({
      market,
      now: Date.now(),
      ticker: { last: Number(ticker.lastPrice), high: Number(ticker.highPrice), low: Number(ticker.lowPrice) },
      minute,
      quarterHour,
      daily,
    });
  })();
  pulseCache.set(market.symbol, { at: Date.now(), value });
  value.catch(() => pulseCache.delete(market.symbol));
  return value;
}
