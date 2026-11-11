import axios from "axios";
import type { Candlestick } from "@/types/candlestick";

// Markets Binance doesn't list, from Yahoo Finance's free chart API: the
// major currency pairs and the two big US stock indices. Candles come back
// in Binance's kline shape so the backtester, the Signals scanner and the
// weekly plan use them unchanged.
//
// Limits of the source:
// - 1h candles go back 730 days; 5m–30m only 60 days. So strategies on
//   15m and 5m can't build the 270 days the Signals page needs to judge them.
// - Forex has no central volume, so its volume is 0 (no strategy here reads it).
// - Forex prices are Yahoo's indicative mid quotes, not a broker's bid/ask.
// - The indices are the CME futures (NQ=F, ES=F), which trade ~23 hours a
//   day like index CFDs; the cash indices only have the 6.5-hour US session.
//   Yahoo's continuous contract isn't back-adjusted, so each quarterly roll
//   leaves a small price jump.

export type YahooKind = "forex" | "index";

export const YAHOO_MARKETS: Record<string, { yahoo: string; kind: YahooKind; label: string }> = {
  EURUSD: { yahoo: "EURUSD=X", kind: "forex", label: "EUR/USD" },
  GBPUSD: { yahoo: "GBPUSD=X", kind: "forex", label: "GBP/USD" },
  USDJPY: { yahoo: "JPY=X", kind: "forex", label: "USD/JPY" },
  AUDUSD: { yahoo: "AUDUSD=X", kind: "forex", label: "AUD/USD" },
  USDCAD: { yahoo: "CAD=X", kind: "forex", label: "USD/CAD" },
  USDCHF: { yahoo: "CHF=X", kind: "forex", label: "USD/CHF" },
  NZDUSD: { yahoo: "NZDUSD=X", kind: "forex", label: "NZD/USD" },
  NAS100: { yahoo: "NQ=F", kind: "index", label: "Nasdaq 100" },
  SPX500: { yahoo: "ES=F", kind: "index", label: "S&P 500" },
};

// Markets only the MT5 terminal's feed carries (src/lib/mt5/feed.ts): no free
// web source has the broker's FTSE 100 or Brent CFD, so they're scanned only
// while the PB_BarFeed expert runs. Named as the platform names them.
export type Mt5Kind = YahooKind | "commodity";
export const MT5_ONLY_MARKETS: Record<string, { kind: Mt5Kind; label: string }> = {
  EURJPY: { kind: "forex", label: "EUR/JPY" },
  GBPAUD: { kind: "forex", label: "GBP/AUD" },
  FTSE100: { kind: "index", label: "FTSE 100" },
  UKOIL: { kind: "commodity", label: "Brent oil" },
};

const kindOf = (symbol: string): Mt5Kind | undefined => {
  const s = symbol.toUpperCase();
  return YAHOO_MARKETS[s]?.kind ?? MT5_ONLY_MARKETS[s]?.kind;
};
export const isYahooMarket = (symbol: string) => symbol.toUpperCase() in YAHOO_MARKETS;
export const isMt5OnlyMarket = (symbol: string) => symbol.toUpperCase() in MT5_ONLY_MARKETS;
export const isForex = (symbol: string) => kindOf(symbol) === "forex";
export const isIndex = (symbol: string) => kindOf(symbol) === "index";

// Crypto and metals trade on Binance (and CoinDCX); the rest come from Yahoo
// or the MT5 feed.
export type AssetClass = "crypto" | Mt5Kind;
export const assetClass = (symbol: string): AssetClass => kindOf(symbol) ?? "crypto";

// "EURUSD" → "EUR/USD", "NAS100" → "Nasdaq 100"; crypto and metals drop the USDT ("XAUUSDT" → "XAU").
export const marketLabel = (symbol: string) =>
  YAHOO_MARKETS[symbol.toUpperCase()]?.label ?? MT5_ONLY_MARKETS[symbol.toUpperCase()]?.label ?? symbol.replace(/USDT$/, "");

// Price decimals: forex quotes to the pipette (JPY pairs 3, others 5),
// indices to 2; everything else by size.
export function priceDecimals(price: number, symbol?: string): number {
  if (symbol && isIndex(symbol)) return 2;
  if (symbol && isForex(symbol)) return symbol.toUpperCase().endsWith("JPY") ? 3 : 5;
  const a = Math.abs(price);
  return a >= 100 ? 2 : a >= 1 ? 3 : a >= 0.1 ? 4 : 5;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Yahoo's own interval for each one we serve, and how far back it reaches.
// 4h is built from 1h.
const SOURCE: Record<string, { yahoo: string; ms: number; maxDays: number }> = {
  "5m": { yahoo: "5m", ms: 5 * 60_000, maxDays: 59 },
  "15m": { yahoo: "15m", ms: 15 * 60_000, maxDays: 59 },
  "30m": { yahoo: "30m", ms: 30 * 60_000, maxDays: 59 },
  "1h": { yahoo: "60m", ms: HOUR, maxDays: 729 },
  "1d": { yahoo: "1d", ms: DAY, maxDays: 365 * 20 },
  "1w": { yahoo: "1wk", ms: 7 * DAY, maxDays: 365 * 20 },
};

export function yahooIntervalSupported(interval: string) {
  return interval === "4h" || interval in SOURCE;
}

interface YahooChart {
  chart: {
    result?: {
      timestamp?: number[];
      indicators: { quote: { open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume?: (number | null)[] }[] };
    }[];
    error?: { description?: string } | null;
  };
}

const kline = (openTime: number, ms: number, o: number, h: number, l: number, c: number, v = 0): Candlestick => [
  openTime, String(o), String(h), String(l), String(c), String(v), openTime + ms - 1, "0", 0, "0", "0", "0",
];

async function fetchYahoo(symbol: string, interval: string, startMs: number, endMs: number): Promise<Candlestick[]> {
  const src = SOURCE[interval];
  const now = Date.now();
  // Yahoo rejects intraday requests that start past its limit.
  const start = Math.max(startMs, now - src.maxDays * DAY);
  const { data } = await axios.get<YahooChart>(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(YAHOO_MARKETS[symbol].yahoo)}`, {
    params: { interval: src.yahoo, period1: Math.floor(start / 1000), period2: Math.ceil(Math.min(endMs, now) / 1000) },
    headers: { "User-Agent": "Mozilla/5.0 (algo-trading backtester)" },
    timeout: 20_000,
  });
  const r = data.chart.result?.[0];
  if (!r?.timestamp) {
    if (data.chart.error) throw new Error(data.chart.error.description ?? "Yahoo chart error");
    return [];
  }
  const q = r.indicators.quote[0];
  const out: Candlestick[] = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const [o, h, l, c] = [q.open[i], q.high[i], q.low[i], q.close[i]];
    if (o === null || h === null || l === null || c === null) continue;
    // Bars are stamped at their open; snap to the interval grid (daily and weekly bars carry the session offset).
    const t = interval === "1d" || interval === "1w" ? r.timestamp[i] * 1000 : Math.floor((r.timestamp[i] * 1000) / src.ms) * src.ms;
    if (out.length && out[out.length - 1][0] === t) continue;
    out.push(kline(t, src.ms, o, h, l, c, q.volume?.[i] ?? 0));
  }
  return out;
}

// 4h candles on the UTC 00/04/08… grid, built from 1h.
function toFourHour(hourly: Candlestick[]): Candlestick[] {
  const ms = 4 * HOUR;
  const out: Candlestick[] = [];
  for (const k of hourly) {
    const t = Math.floor(k[0] / ms) * ms;
    const last = out[out.length - 1];
    if (!last || last[0] !== t) {
      out.push(kline(t, ms, Number(k[1]), Number(k[2]), Number(k[3]), Number(k[4]), Number(k[5])));
    } else {
      last[2] = String(Math.max(Number(last[2]), Number(k[2])));
      last[3] = String(Math.min(Number(last[3]), Number(k[3])));
      last[4] = k[4];
      last[5] = String(Number(last[5]) + Number(k[5]));
    }
  }
  return out;
}

// Candles for a Yahoo market whose open time is in [startMs, endMs]. The
// candle still forming is included, as Binance does; callers drop it.
export async function fetchYahooCandles(symbol: string, interval: string, startMs: number, endMs = Date.now()): Promise<Candlestick[]> {
  const sym = symbol.toUpperCase();
  if (!isYahooMarket(sym)) throw new Error(`${symbol} is not a supported currency pair or index`);
  if (!yahooIntervalSupported(interval)) throw new Error(`Interval ${interval} isn't available for currency pairs and indices`);
  const candles = interval === "4h" ? toFourHour(await fetchYahoo(sym, "1h", startMs, endMs)) : await fetchYahoo(sym, interval, startMs, endMs);
  return candles.filter((k) => k[0] >= startMs && k[0] <= endMs);
}
