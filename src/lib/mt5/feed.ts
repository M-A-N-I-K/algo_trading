import { open, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { OHLC } from "@/indicators/utils";
import { parseMt5Bars, resampleBars } from "@/backtest/mt5Bars";
import { platformSymbol } from "@/lib/costs/broker";
import { parseServerTime } from "./report";
import { parseSpecs, registerSpecs, type SymbolSpec } from "./specs";
import { housekeepMt5 } from "./housekeeping";

// Live candles from the MT5 terminal on this machine. The PB_BarFeed expert
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

// A running terminal that has lost its connection keeps beating but writes
// old bars. BTC trades all week, so while connected the newest bar in the
// folder is minutes old; older than this and the prices are stale.
export const PRICES_STALE_MS = 30 * 60_000;

// App interval → the MT5 file it comes from, and whether to resample it.
// 4h is built from H1 on the UTC grid, exactly as the backtests were.
const SOURCES: Record<string, { tf: string; resample?: string }> = {
  "5m": { tf: "M5" },
  "15m": { tf: "M15" },
  "1h": { tf: "H1" },
  "4h": { tf: "H1", resample: "4h" },
};

export const feedSupports = (interval: string) => interval in SOURCES;

// MT5 symbol names: letters, digits and a few separators, never a path.
const SAFE_SYMBOL = /^[A-Z0-9][A-Z0-9._-]{1,19}$/;

export const feedFile = (symbol: string, interval: string, dir = MT5_FEED_DIR): string | null => {
  const src = SOURCES[interval];
  const name = platformSymbol(symbol);
  if (!src || !SAFE_SYMBOL.test(name) || name.includes("..")) return null;
  const file = join(dir, `${name}_${src.tf}.csv`);
  // Second guard: the file must sit directly in the feed folder.
  return dirname(resolve(file)) === resolve(dir) ? file : null;
};

/** Is the PB_BarFeed expert running (heartbeat written in the last two minutes)? */
export async function feedLive(now = Date.now(), dir = MT5_FEED_DIR): Promise<boolean> {
  // Once a day, trim the terminal's old logs and history (housekeeping.ts).
  if (dir === MT5_FEED_DIR && !process.env.VITEST) void housekeepMt5(dir, now);
  try {
    const s = await stat(join(dir, "heartbeat.txt"));
    return now - s.mtimeMs < FEED_STALE_MS;
  } catch {
    return false;
  }
}

export interface FeedStatus {
  live: boolean; // heartbeat written in the last FEED_STALE_MS
  lastBeat: number | null; // UTC ms of the last heartbeat, null if there's never been one
  serverTime: string | null; // the terminal's server clock at that beat, as MT5 writes it
  markets: number | null; // symbols the expert is writing
  newestBar: number | null; // UTC ms the newest M5 bar in the folder opened
  pricesFresh: boolean; // live, and that bar is under PRICES_STALE_MS old
}

// Open time (UTC ms) of the last bar in a bar file, read from its tail.
async function lastBarTime(file: string): Promise<number | null> {
  const fh = await open(file, "r");
  try {
    const { size } = await fh.stat();
    const len = Math.min(size, 512);
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, size - len);
    const lines = buf.toString("utf8").trim().split(/\r?\n/);
    const [date, time] = (lines[lines.length - 1] ?? "").split("\t");
    return parseServerTime(`${date?.trim()} ${time?.trim()}`)?.getTime() ?? null;
  } finally {
    await fh.close();
  }
}

async function newestBarTime(dir: string): Promise<number | null> {
  let names: string[];
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith("_M5.csv"));
  } catch {
    return null;
  }
  const times = await Promise.all(names.map((n) => lastBarTime(join(dir, n)).catch(() => null)));
  const valid = times.filter((t): t is number => t !== null);
  return valid.length ? Math.max(...valid) : null;
}

/**
 * What the PB_BarFeed expert last reported, and whether its prices are
 * current. heartbeat.txt holds "<UTC seconds>\t<server time>\t<symbols
 * written>"; the file's modified time stands in when the line can't be read.
 */
export async function feedStatus(now = Date.now(), dir = MT5_FEED_DIR): Promise<FeedStatus> {
  const file = join(dir, "heartbeat.txt");
  let mtimeMs: number;
  let text = "";
  try {
    mtimeMs = (await stat(file)).mtimeMs;
    text = await readFile(file, "utf8");
  } catch {
    return { live: false, lastBeat: null, serverTime: null, markets: null, newestBar: null, pricesFresh: false };
  }
  const [utc, serverTime, markets] = text.trim().split("\t");
  const fromLine = Number(utc) * 1000;
  // The line's clock is the terminal's; trust it unless it's garbled or in the future.
  const lastBeat = Number.isFinite(fromLine) && fromLine > 0 && fromLine <= now + 60_000 ? fromLine : mtimeMs;
  const n = Number(markets);
  const live = now - mtimeMs < FEED_STALE_MS;
  const newestBar = await newestBarTime(dir);
  return {
    live,
    lastBeat,
    serverTime: serverTime?.trim() || null,
    markets: Number.isInteger(n) && n >= 0 ? n : null,
    newestBar,
    pricesFresh: live && newestBar !== null && now - newestBar < PRICES_STALE_MS,
  };
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

/**
 * The terminal's contract specs (symbols.csv), registered for sizing
 * (src/lib/mt5/specs.ts) and returned for the browser. Empty when the feed
 * isn't running; a stale file still holds valid lot sizes, but its tick
 * values follow exchange rates, so it's ignored once the heartbeat stops.
 */
export async function loadFeedSpecs(now = Date.now(), dir = MT5_FEED_DIR): Promise<Record<string, SymbolSpec>> {
  if (!(await feedLive(now, dir))) return {};
  try {
    const specs = parseSpecs(await readFile(join(dir, "symbols.csv"), "utf8"));
    registerSpecs(specs);
    return specs;
  } catch {
    return {};
  }
}
