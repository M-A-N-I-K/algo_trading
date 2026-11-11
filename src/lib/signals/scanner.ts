import type { OHLC } from "@/indicators/utils";
import { parseCandlesticks } from "@/indicators/utils";
import { fetchCandlestickHistory, intervalToMs } from "@/backtest/fetchHistory";
import { getCandleSticks } from "@/tools/getCandlesticks";
import { CODED_STRATEGIES, createCodedStrategy, HIGHER_TIMEFRAME } from "@/strategies/registry";
import { withFixedTarget } from "@/strategies/fixedTarget";
import { scanStrategy, type SignalRow } from "./scan";
import { locationGrade } from "@/lib/plan/weeklyPlan";
import { activeSetupById, PLAYBOOK_SETUP_IDS } from "@/lib/playbook/config";
import { feedLive, feedSupports, readFeedCandles } from "@/lib/mt5/feed";
import { isMt5OnlyMarket } from "@/lib/markets/yahoo";

// Server-side signal scanner for the Signals page. Only strategies that
// pass QUALIFY_RULE (src/lib/signals/scan.ts) on a market send signals. Every request refreshes
// the candles that have closed since the last one (one small Binance call
// per series), then rescans only the strategies whose candles changed.
// While the MT5 terminal's PB_BarFeed expert is running (src/lib/mt5/feed.ts)
// candles come from the broker's own feed instead, read from local files.
// Everything lives in memory: the first request after the server starts
// downloads the full history (about 30 seconds), later ones are quick.

export const SIGNAL_SYMBOLS = [
  "XAUUSDT",
  "XAGUSDT",
  "BTCUSDT",
  "ETHUSDT",
  "XRPUSDT",
  "SOLUSDT",
  "AVAXUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "SUIUSDT",
  "NEARUSDT",
  "AAVEUSDT",
  // Currency pairs, from Yahoo Finance (src/lib/markets/yahoo.ts).
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "AUDUSD",
  "USDCAD",
  "USDCHF",
  "NZDUSD",
  // Index futures (Nasdaq 100, S&P 500), also from Yahoo Finance.
  "NAS100",
  "SPX500",
  // Only from the MT5 terminal's feed (src/lib/mt5/feed.ts); skipped while it isn't running.
  "FTSE100",
  "UKOIL",
  "EURJPY",
  "GBPAUD",
] as const;
export const SIGNAL_HISTORY_DAYS = Number(process.env.SIGNAL_HISTORY_DAYS) || 730;

const DAY_MS = 24 * 60 * 60_000;

// Every strategy is tried on each of these timeframes and judged on each one
// separately, so it only sends signals on the timeframe(s) where it has
// actually made money. Strategies with a forced execution interval only run
// on that one; those reading a higher timeframe only run below it.
export const SIGNAL_INTERVALS = ["15m", "1h", "4h"] as const;

// Execution timeframes too fine to scan live: two years of 1m candles is
// about a million per market, over 10,000 Binance requests across the
// markets, which trips Binance's rate limit (6,000 weight a minute) and
// fills memory. Strategies that trade on these are backtest-only.
export const UNSCANNED_INTERVALS: ReadonlySet<string> = new Set(["1m"]);

export function scanTargets(): { strategyKey: string; interval: string }[] {
  const out: { strategyKey: string; interval: string }[] = [];
  for (const strategyKey of Object.keys(CODED_STRATEGIES)) {
    const htf = HIGHER_TIMEFRAME[strategyKey];
    if (htf?.executionInterval && UNSCANNED_INTERVALS.has(htf.executionInterval)) continue;
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
  // Where each cached series came from: "mt5" (the terminal's feed) or "web" (Binance/Yahoo).
  source?: Map<string, CandleSource>;
  inFlight: Promise<SignalScan> | null;
  // Series downloads in progress, so the plan and the scan share one.
  loading?: Map<string, Promise<OHLC[]>>;
}

// On globalThis so dev-mode module reloads don't throw the history away.
const g = globalThis as typeof globalThis & { __signalScanner?: CacheState };
const state: CacheState = (g.__signalScanner ??= { series: new Map(), rows: new Map(), inFlight: null });

export type CandleSource = "mt5" | "web";

const closedOnly = (candles: OHLC[], now: number) => candles.filter((c) => c.closeTime < now);

function refreshSeries(symbol: string, interval: string, now: number): Promise<OHLC[]> {
  const key = `${symbol}:${interval}`;
  const loading = (state.loading ??= new Map());
  let p = loading.get(key);
  if (!p) {
    p = fetchSeries(symbol, interval, now).finally(() => loading.delete(key));
    loading.set(key, p);
  }
  return p;
}

// The cached closed candles for each symbol on one interval, topped up with
// any that have closed since. Shared with the weekly plan.
export async function loadSeries(interval: string, now = Date.now()): Promise<{ series: Map<string, OHLC[]>; errors: string[] }> {
  const series = new Map<string, OHLC[]>();
  const errors: string[] = [];
  await Promise.all(
    SIGNAL_SYMBOLS.map(async (symbol) => {
      try {
        series.set(symbol, await refreshSeries(symbol, interval, now));
      } catch (e) {
        errors.push(`${symbol} ${interval}: ${e instanceof Error ? e.message : String(e)}`);
        series.set(symbol, state.series.get(`${symbol}:${interval}`) ?? []);
      }
    }),
  );
  return { series, errors };
}

async function fetchSeries(symbol: string, interval: string, now: number): Promise<OHLC[]> {
  const key = `${symbol}:${interval}`;
  const step = intervalToMs(interval);
  const bars = Math.ceil((SIGNAL_HISTORY_DAYS * DAY_MS) / step);
  const sources = (state.source ??= new Map());
  let cached = state.series.get(key);
  let last = cached?.[cached.length - 1];
  // Nothing new has closed yet.
  const upToDate = (c: OHLC | undefined) => !!c && c.closeTime + step >= now;

  // The broker's feed, when the terminal is writing it and carries this market.
  if (feedSupports(interval) && (await feedLive(now))) {
    if (sources.get(key) === "mt5" && upToDate(last)) return cached!;
    const feed = await readFeedCandles(symbol, interval);
    if (feed?.length) {
      let next = closedOnly(feed, now);
      if (next.length > bars) next = next.slice(next.length - bars);
      if (next.length) {
        state.series.set(key, next);
        sources.set(key, "mt5");
        return next;
      }
    }
  }

  // No web source for this market: nothing to scan until the feed is back.
  if (isMt5OnlyMarket(symbol)) {
    state.series.delete(key);
    sources.delete(key);
    return [];
  }

  // Binance/Yahoo. Their prices differ from the broker's (Yahoo's NAS100 is
  // the future, not the CFD), so candles from the feed are never topped up
  // from them: start again.
  if (sources.get(key) === "mt5") {
    cached = undefined;
    last = undefined;
  }
  if (upToDate(last)) return cached!;

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
  if (next.length) {
    state.series.set(key, next);
    sources.set(key, "web");
  }
  return next.length ? next : (cached ?? []);
}

/** Where each market's hourly candles came from in the latest load. */
export function candleSources(symbols: readonly string[] = SIGNAL_SYMBOLS): Record<string, CandleSource> {
  const out: Record<string, CandleSource> = {};
  for (const s of symbols) {
    const src = state.source?.get(`${s}:1h`);
    if (src) out[s] = src;
  }
  return out;
}

// --- scan ------------------------------------------------------------------------

export interface SignalScan {
  asOf: number;
  symbols: readonly string[];
  historyDays: number;
  rows: SignalRow[];
  // The playbook's setups with their latest signal whether or not they pass
  // QUALIFY_RULE: they were picked at prop-firm costs, not CoinDCX's.
  playbook: SignalRow[];
  // Per market: "mt5" when its candles came from the terminal's feed.
  sources: Record<string, CandleSource>;
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

  intervals.add("1h"); // for grading signals
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
  const playbook: SignalRow[] = [];
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
        state.rows.set(id, { stamp: row?.qualified || PLAYBOOK_SETUP_IDS.has(id) ? candleStamp : dayStamp, row });
      }
      // Signals only ever leave the server for qualified strategies, each
      // graded by where it sits in the previous week's range.
      if (row) rows.push(row.qualified ? withGrade(row, series.get(`${symbol}:1h`) ?? []) : { ...row, signal: null });
      if (!PLAYBOOK_SETUP_IDS.has(id)) continue;
      // A playbook setup with its own target is scanned again with it; the
      // Signals page keeps judging the strategy at its default.
      const rr = activeSetupById(id)?.rr;
      let pbRow = row;
      if (rr !== undefined) {
        const pbId = `${id}@${rr}R`;
        const pbMemo = state.rows.get(pbId);
        pbRow = pbMemo && pbMemo.stamp === candleStamp ? pbMemo.row : undefined;
        if (pbRow === undefined) {
          try {
            const base = createCodedStrategy(strategyKey, htfCandles);
            pbRow = base ? scanStrategy({ strategyKey, symbol, interval, candles, htfCandles, now, strategy: withFixedTarget(base, rr) }) : null;
          } catch (e) {
            errors.push(`${pbId}: ${e instanceof Error ? e.message : String(e)}`);
            pbRow = null;
          }
          state.rows.set(pbId, { stamp: candleStamp, row: pbRow });
        }
      }
      if (pbRow) playbook.push(withGrade(pbRow, series.get(`${symbol}:1h`) ?? []));
    }
  }

  return { asOf: now, symbols: SIGNAL_SYMBOLS, historyDays: SIGNAL_HISTORY_DAYS, rows, playbook, sources: candleSources(), errors };
}

function withGrade(row: SignalRow, h1: OHLC[]): SignalRow {
  const s = row.signal;
  if (!s) return row;
  return { ...row, signal: { ...s, grade: locationGrade(row.symbol, s.side, s.entry, s.signalTime, h1) } };
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
