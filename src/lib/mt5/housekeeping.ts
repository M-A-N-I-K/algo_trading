import { lstat, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";

// Keeps the MT5 terminal the app reads from from slowly filling the disk.
// Once a day it deletes, inside that terminal's folder only:
//
//   - daily logs (YYYYMMDD.log) older than MT5_KEEP_LOG_DAYS (30): MT5 never
//     deletes them itself;
//   - 1-minute price history and tick files from years before the last
//     MT5_KEEP_HISTORY_YEARS (7, this year included). The feed needs about 3
//     years (PB_BarFeed's H1 and M15 bars) and the Strategy Tester runs in
//     mt5/README.md go back to 2020; anything older was downloaded once and
//     isn't used. MT5 downloads a year again if a test asks for it. 0 keeps
//     everything.
//
// Only regular files whose names match those patterns are touched; folders
// and links are left alone.

const DAY = 86_400_000;
const RUN_EVERY_MS = DAY;

export interface KeepPolicy {
  logDays: number;
  historyYears: number;
}

const intEnv = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v.trim() !== "" && Number.isInteger(n) && n >= 0 ? n : fallback;
};
export const keepPolicy = (): KeepPolicy => ({
  logDays: Math.max(1, intEnv(process.env.MT5_KEEP_LOG_DAYS, 30)),
  historyYears: intEnv(process.env.MT5_KEEP_HISTORY_YEARS, 7),
});

/** The terminal folder, when the feed is the standard MQL5/Files/PlaybookFeed inside it. */
export function terminalRoot(feedDir: string): string | null {
  const parts = feedDir.replace(/[\\/]+$/, "").split(/[\\/]/);
  const n = parts.length;
  if (n < 4 || parts[n - 1] !== "PlaybookFeed" || parts[n - 2] !== "Files" || parts[n - 3] !== "MQL5") return null;
  return parts.slice(0, n - 3).join(sep) || sep;
}

/** A daily log, YYYYMMDD.log, from before the cutoff. */
export function isOldLog(name: string, now: number, keepDays: number): boolean {
  const m = /^(\d{4})(\d{2})(\d{2})\.log$/.exec(name);
  if (!m) return false;
  const day = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Number.isFinite(day) && day < now - keepDays * DAY;
}

/** Price history (YYYY.hcc) or ticks (YYYYMM.tkc) from a year before the last `keepYears`. */
export function isOldHistory(name: string, now: number, keepYears: number): boolean {
  if (keepYears <= 0) return false;
  const m = /^(\d{4})\.hcc$/.exec(name) ?? /^(\d{4})\d{2}\.tkc$/.exec(name);
  if (!m) return false;
  return +m[1] <= new Date(now).getUTCFullYear() - keepYears;
}

const list = (dir: string) => readdir(dir).catch(() => [] as string[]);

async function prune(dir: string, old: (name: string) => boolean): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  for (const name of await list(dir)) {
    if (!old(name)) continue;
    const path = join(dir, name);
    try {
      const s = await lstat(path);
      if (!s.isFile()) continue;
      await unlink(path);
      files++;
      bytes += s.size;
    } catch {
      // In use or already gone: next time.
    }
  }
  return { files, bytes };
}

/** Deletes the terminal's old logs and history now. Returns what it freed. */
export async function cleanTerminal(root: string, now = Date.now(), policy = keepPolicy()): Promise<{ files: number; bytes: number }> {
  const logDirs = [join(root, "MQL5", "Logs"), join(root, "logs"), join(root, "Tester", "logs")];
  for (const agent of await list(join(root, "Tester"))) if (agent.startsWith("Agent-")) logDirs.push(join(root, "Tester", agent, "logs"));

  const historyDirs: string[] = [];
  for (const bases of [join(root, "bases"), join(root, "Tester", "bases")]) {
    for (const server of await list(bases)) {
      for (const kind of ["history", "ticks"]) {
        for (const symbol of await list(join(bases, server, kind))) historyDirs.push(join(bases, server, kind, symbol));
      }
    }
  }

  const total = { files: 0, bytes: 0 };
  const add = (r: { files: number; bytes: number }) => {
    total.files += r.files;
    total.bytes += r.bytes;
  };
  for (const d of logDirs) add(await prune(d, (n) => isOldLog(n, now, policy.logDays)));
  for (const d of historyDirs) add(await prune(d, (n) => isOldHistory(n, now, policy.historyYears)));
  return total;
}

type G = typeof globalThis & { __mt5Housekeeping?: { at: number } };
const g = globalThis as G;

/**
 * cleanTerminal at most once a day, remembered across restarts in a small
 * marker file next to the feed. Never throws; meant to be fired and forgotten.
 */
export async function housekeepMt5(feedDir: string, now = Date.now()): Promise<void> {
  const state = (g.__mt5Housekeeping ??= { at: 0 });
  if (now - state.at < RUN_EVERY_MS) return;
  state.at = now;
  try {
    const root = terminalRoot(feedDir);
    if (!root) return;
    const marker = join(feedDir, ".housekeeping");
    const last = Number(await readFile(marker, "utf8").catch(() => "0"));
    if (Number.isFinite(last) && now - last < RUN_EVERY_MS) return;
    await lstat(dirname(marker));
    const freed = await cleanTerminal(root, now);
    await writeFile(marker, String(now));
    if (freed.files) console.info(`MT5 housekeeping: deleted ${freed.files} old log and history files, ${(freed.bytes / 1e6).toFixed(0)} MB.`);
  } catch (e) {
    console.error("MT5 housekeeping failed:", e);
  }
}
