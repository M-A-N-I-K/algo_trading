import type { OHLC } from "@/indicators/utils";
import { parseCandlesticks } from "@/indicators/utils";
import { fetchCandlestickHistory, intervalToMs } from "@/backtest/fetchHistory";
import { getCandleSticks } from "@/tools/getCandlesticks";
import { CODED_STRATEGIES, HIGHER_TIMEFRAME } from "@/strategies/registry";
import { scanStrategy, type SignalRow } from "./scan";

// Server-side signal scanner for the Signals page. Only strategies that
// pass QUALIFY_RULE (src/lib/signals/scan.ts) on a market send signals. Every request refreshes
// the candles that have closed since the last one (one small Binance call
// per series), then rescans only the strategies whose candles changed.
// Everything lives in memory: the first request after the server starts
// downloads the full history (about 30 seconds), later ones are quick.

export const SIGNAL_SYMBOLS = ["XAUUSDT", "XAGUSDT", "BTCUSDT", "ETHUSDT"] as const;
export const SIGNAL_HISTORY_DAYS = Number(process.env.SIGNAL_HISTORY_DAYS) || 730;

const DAY_MS = 24 * 60 * 60_000;

// Every strategy is tried on each of these timeframes and judged on each one
// separately, so it only sends signals on the timeframe(s) where it has
// actually made money. Strategies with a forced execution interval only run
// on that one; those reading a higher timeframe only run below it.
export const SIGNAL_INTERVALS = ["15m", "1h", "4h"] as const;

export function scanTargets(): { strategyKey: string; interval: string }[] {
  const out: { strategyKey: string; interval: string }[] = [];
  for (const strategyKey of Object.keys(CODED_STRATEGIES)) {
    const htf = HIGHER_TIMEFRAME[strategyKey];
    const intervals = htf?.executionInterval
      ? [htf.executionInterval]
      : SIGNAL_INTERVALS.filter((i) => !htf || intervalToMs(i) < intervalToMs(htf.interval));
    for (const interval of intervals) out.push({ strategyKey, interval });
  }
  return out;
}

// --- candle cache -------------------------------------------------------------

interface CacheState {
  series: Map<string, OHLC[]>;
  rows: Map<string, { stamp: string; row: SignalRow | null }>;
  inFlight: Promise<SignalScan> | null;
}

// On globalThis so dev-mode module reloads don't throw the history away.
const g = globalThis as typeof globalThis & { __signalScanner?: CacheState };
const state: CacheState = (g.__signalScanner ??= { series: new Map(), rows: new Map(), inFlight: null });

const closedOnly = (candles: OHLC[], now: number) => candles.filter((c) => c.closeTime < now);

async function refreshSeries(symbol: string, interval: string, now: number): Promise<OHLC[]> {
  const key = `${symbol}:${interval}`;
  const step = intervalToMs(interval);
  const bars = Math.ceil((SIGNAL_HISTORY_DAYS * DAY_MS) / step);
  const cached = state.series.get(key);
  const last = cached?.[cached.length - 1];

  // Nothing new has closed yet.
  if (last && last.closeTime + step >= now) return cached!;

  let next: OHLC[];
  const missing = last ? Math.ceil((now - last.closeTime) / step) : Infinity;
  if (!cached || missing > 900) {
    next = closedOnly(parseCandlesticks(await fetchCandlestickHistory(symbol, interval, bars + 1)), now);
  } else {
    const raw = await getCandleSticks(symbol, interval, String(last!.openTime + 1), undefined, 1000);
    // A failed call keeps the old candles; the next request tries again.
    if (!raw) return cached;
    const fresh = closedOnly(parseCandlesticks(raw), now).filter((c) => c.openTime > last!.openTime);
    next = [...cached, ...fresh];
  }
  if (next.length > bars) next = next.slice(next.length - bars);
  if (next.length) state.series.set(key, next);
  return next.length ? next : (cached ?? []);
}

// --- scan ------------------------------------------------------------------------

export interface SignalScan {
  asOf: number;
  symbols: readonly string[];
  historyDays: number;
  rows: SignalRow[];
  errors: string[];
}

async function scan(): Promise<SignalScan> {
  const now = Date.now();
  const targets = scanTargets();
  const intervals = new Set<string>();
  for (const t of targets) {
    intervals.add(t.interval);
    const htf = HIGHER_TIMEFRAME[t.strategyKey]?.interval;
    if (htf) intervals.add(htf);
  }

  const errors: string[] = [];
  const series = new Map<string, OHLC[]>();
  await Promise.all(
    SIGNAL_SYMBOLS.flatMap((symbol) =>
      [...intervals].map(async (interval) => {
        try {
          series.set(`${symbol}:${interval}`, await refreshSeries(symbol, interval, now));
        } catch (e) {
          errors.push(`${symbol} ${interval}: ${e instanceof Error ? e.message : String(e)}`);
          series.set(`${symbol}:${interval}`, state.series.get(`${symbol}:${interval}`) ?? []);
        }
      }),
    ),
  );

  const rows: SignalRow[] = [];
  for (const symbol of SIGNAL_SYMBOLS) {
    for (const { strategyKey, interval } of targets) {
      const candles = series.get(`${symbol}:${interval}`) ?? [];
      const htfInterval = HIGHER_TIMEFRAME[strategyKey]?.interval;
      const htfCandles = htfInterval ? series.get(`${symbol}:${htfInterval}`) : undefined;
      if (!candles.length || (htfInterval && !htfCandles?.length)) continue;

      // A qualified strategy is rescanned whenever a candle it reads closes
      // (and hourly, so closed trades age off the board). One that doesn't
      // qualify sends no signals, so it's only re-judged once a day.
      const id = `${strategyKey}:${symbol}:${interval}`;
      const candleStamp = `${candles[candles.length - 1].openTime}:${htfCandles?.[htfCandles.length - 1].openTime ?? ""}:${Math.floor(now / 3_600_000)}`;
      const dayStamp = `day:${Math.floor(now / DAY_MS)}`;
      const memo = state.rows.get(id);
      let row = memo && (memo.stamp === candleStamp || memo.stamp === dayStamp) ? memo.row : undefined;
      if (row === undefined) {
        try {
          row = scanStrategy({ strategyKey, symbol, interval, candles, htfCandles, now });
        } catch (e) {
          errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
          row = null;
        }
        state.rows.set(id, { stamp: row?.qualified ? candleStamp : dayStamp, row });
      }
      // Signals only ever leave the server for qualified strategies.
      if (row) rows.push(row.qualified ? row : { ...row, signal: null });
    }
  }

  return { asOf: now, symbols: SIGNAL_SYMBOLS, historyDays: SIGNAL_HISTORY_DAYS, rows, errors };
}

// Concurrent requests (two tabs, a slow first load) share one scan.
export function runSignalScan(): Promise<SignalScan> {
  if (!state.inFlight) {
    state.inFlight = scan().finally(() => {
      state.inFlight = null;
    });
  }
  return state.inFlight;
}
