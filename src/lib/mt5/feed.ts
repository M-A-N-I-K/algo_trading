import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OHLC } from "@/indicators/utils";
import { parseMt5Bars, resampleBars } from "@/backtest/mt5Bars";
import { platformSymbol } from "@/lib/costs/fundingpips";

// Live candles from the MT5 terminal on this machine. The PB_BarFeed service
// (mt5/PB_BarFeed.mq5) writes each symbol's closed bars to
// MQL5/Files/PlaybookFeed/<SYMBOL>_<TF>.csv and touches heartbeat.txt every
// few seconds. While the heartbeat is fresh the scanner reads these instead of
// Yahoo/Binance, so signals use the broker's own prices (NDX100 CFD, not the
// Nasdaq future; XAUUSD, not Binance's gold token).

export const MT5_FEED_DIR =
  process.env.MT5_FEED_DIR ||
  join(homedir(), "Library/Application Support/net.metaquotes.wine.metatrader5/drive_c/Program Files/MetaTrader 5/MQL5/Files/PlaybookFeed");

// The service checks every 10 s; two minutes without a heartbeat means MT5
// (or the service) has stopped, so fall back to the web feeds.
export const FEED_STALE_MS = 2 * 60_000;

// App interval → the MT5 file it comes from, and whether to resample it.
// 4h is built from H1 on the UTC grid, exactly as the backtests were.
const SOURCES: Record<string, { tf: string; resample?: string }> = {
  "5m": { tf: "M5" },
  "15m": { tf: "M15" },
  "1h": { tf: "H1" },
  "4h": { tf: "H1", resample: "4h" },
};

export const feedSupports = (interval: string) => interval in SOURCES;

export const feedFile = (symbol: string, interval: string, dir = MT5_FEED_DIR): string | null => {
  const src = SOURCES[interval];
  return src ? join(dir, `${platformSymbol(symbol)}_${src.tf}.csv`) : null;
};

/** Is the PB_BarFeed service running (heartbeat written in the last two minutes)? */
export async function feedLive(now = Date.now(), dir = MT5_FEED_DIR): Promise<boolean> {
  try {
    const s = await stat(join(dir, "heartbeat.txt"));
    return now - s.mtimeMs < FEED_STALE_MS;
  } catch {
    return false;
  }
}

// Parsed files, re-read only when the service rewrites them.
const g = globalThis as typeof globalThis & { __mt5Feed?: Map<string, { mtimeMs: number; bars: OHLC[] }> };
const cache = (g.__mt5Feed ??= new Map());

/**
 * The feed's candles for one market and interval, oldest first (UTC), or null
 * when the feed doesn't carry it (no file for that symbol, or an interval it
 * doesn't write). Doesn't check the heartbeat: call feedLive first.
 */
export async function readFeedCandles(symbol: string, interval: string, dir = MT5_FEED_DIR): Promise<OHLC[] | null> {
  const file = feedFile(symbol, interval, dir);
  if (!file) return null;
  let mtimeMs: number;
  try {
    mtimeMs = (await stat(file)).mtimeMs;
  } catch {
    return null;
  }
  let hit = cache.get(file);
  if (!hit || hit.mtimeMs !== mtimeMs) {
    const { bars } = parseMt5Bars(await readFile(file));
    hit = { mtimeMs, bars };
    cache.set(file, hit);
  }
  const resample = SOURCES[interval].resample;
  // Copies, so callers can't edit the cached bars.
  return resample ? resampleBars(hit.bars, resample) : hit.bars.map((b) => ({ ...b }));
}
