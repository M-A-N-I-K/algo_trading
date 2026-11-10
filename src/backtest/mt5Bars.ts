import type { OHLC } from "../indicators/utils";
import { decodeReport, SERVER_TIME_ZONE, zonedToUtc } from "../lib/mt5/report";
import { intervalToMs } from "./fetchHistory";

// Bars exported from MT5 (View → Symbols → Bars → Export Bars): tab- or
// comma-separated, a header like
//   <DATE> <TIME> <OPEN> <HIGH> <LOW> <CLOSE> <TICKVOL> <VOL> <SPREAD>
// and times in the broker's server clock. Lets the backtester run on the
// exact feed the prop firm prices from, with more history than Yahoo keeps.

// Server wall-clock "2026.05.05" + "13:05[:00]" → UTC ms. The zone offset is
// looked up once per server hour, not per bar (Intl is slow).
function serverToUtc(timeZone: string) {
  const offsets = new Map<string, number>();
  return (date: string, time: string): number | null => {
    const d = date.match(/^(\d{4})[.\-/](\d{2})[.\-/](\d{2})$/);
    const t = time.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!d || !t) return null;
    const [y, mo, da, h, mi, s] = [+d[1], +d[2], +d[3], +t[1], +t[2], +(t[3] ?? 0)];
    const key = `${date} ${h}`;
    let off = offsets.get(key);
    if (off === undefined) {
      off = Date.UTC(y, mo - 1, da, h) - zonedToUtc(y, mo, da, h, 0, 0, timeZone).getTime();
      offsets.set(key, off);
    }
    return Date.UTC(y, mo - 1, da, h, mi, s) - off;
  };
}

/** Parse an MT5 bar export into UTC candles, oldest first. */
export function parseMt5Bars(input: string | Uint8Array, timeZone = SERVER_TIME_ZONE): { bars: OHLC[]; barMs: number } {
  const text = typeof input === "string" ? input : decodeReport(input);
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new Error("The bar export is empty.");

  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const head = lines[0].split(sep).map((h) => h.trim().replace(/[<>]/g, "").toUpperCase());
  const col = (name: string) => head.indexOf(name);
  const [iDate, iTime, iO, iH, iL, iC, iTick, iVol] = ["DATE", "TIME", "OPEN", "HIGH", "LOW", "CLOSE", "TICKVOL", "VOL"].map(col);
  if ([iDate, iTime, iO, iH, iL, iC].some((i) => i < 0)) {
    throw new Error(`Not an MT5 bar export: expected <DATE> <TIME> <OPEN> <HIGH> <LOW> <CLOSE> columns, got ${lines[0]}`);
  }

  const toUtc = serverToUtc(timeZone);
  const rows: OHLC[] = [];
  for (const line of lines.slice(1)) {
    const c = line.split(sep);
    const t = toUtc(c[iDate]?.trim(), c[iTime]?.trim());
    if (t === null) continue;
    // CFDs report no real volume (VOL 0); tick volume is the usual stand-in.
    const vol = iVol >= 0 ? Number(c[iVol]) : 0;
    rows.push({
      openTime: t,
      open: Number(c[iO]),
      high: Number(c[iH]),
      low: Number(c[iL]),
      close: Number(c[iC]),
      volume: vol > 0 ? vol : iTick >= 0 ? Number(c[iTick]) || 0 : 0,
      closeTime: 0,
    });
  }
  rows.sort((a, b) => a.openTime - b.openTime);

  // Bar length: the most common gap between consecutive bars.
  const gaps = new Map<number, number>();
  for (let i = 1; i < Math.min(rows.length, 2000); i++) {
    const g = rows[i].openTime - rows[i - 1].openTime;
    if (g > 0) gaps.set(g, (gaps.get(g) ?? 0) + 1);
  }
  const barMs = [...gaps.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 60_000;

  const bars = rows.filter((r, i) => i === 0 || r.openTime !== rows[i - 1].openTime);
  for (const b of bars) b.closeTime = b.openTime + barMs - 1;
  return { bars, barMs };
}

/** Combine bars into `interval` candles on the UTC grid (4h at 00/04/08…, 1d at 00:00 UTC). */
export function resampleBars(bars: OHLC[], interval: string): OHLC[] {
  const ms = intervalToMs(interval);
  const out: OHLC[] = [];
  for (const b of bars) {
    const t = Math.floor(b.openTime / ms) * ms;
    const last = out[out.length - 1];
    if (!last || last.openTime !== t) {
      out.push({ openTime: t, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume, closeTime: t + ms - 1 });
    } else {
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume += b.volume;
    }
  }
  return out;
}
