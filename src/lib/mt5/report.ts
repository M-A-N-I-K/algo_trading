// Parser for MetaTrader 5's "Trade History Report" (Toolbox → History →
// right-click → Report → HTML). The file is UTF-16 HTML with four tables run
// together: Positions, Orders, Deals and Open Positions, then a summary.
//
// MT5 prints times in the broker's server time. FundingPips' server runs on
// Athens time (UTC+2, UTC+3 in summer), the same clock the prop firm's daily
// loss limit resets on, so times are converted from that zone to UTC.

export const SERVER_TIME_ZONE = "Europe/Athens";

export interface Mt5Position {
  positionId: string;
  symbol: string;
  side: "LONG" | "SHORT";
  volume: number; // lots
  status: "OPEN" | "CLOSED";
  openTime: Date;
  openPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  closeTime: Date | null;
  closePrice: number | null;
  commission: number; // $, negative = paid
  swap: number;
  profit: number | null; // price P&L, or floating P&L for open positions
  netPnl: number | null;
  exitReason: "stop" | "target" | "manual" | null;
}

export interface Mt5Report {
  login: string;
  server: string;
  currency: string;
  accountType: string; // "demo" or "real"
  name: string | null;
  generatedAt: Date | null;
  balance: number | null;
  equity: number | null;
  positions: Mt5Position[];
}

/** MT5 writes the report as UTF-16 LE with a BOM; fall back to UTF-8. */
export function decodeReport(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  // UTF-16 without a BOM: every other byte of ASCII text is zero.
  if (bytes.length >= 4 && bytes[1] === 0 && bytes[3] === 0) return new TextDecoder("utf-16le").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
}

const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
const text = (cell: string) =>
  cell
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim();

function rows(html: string): string[][] {
  const out: string[][] = [];
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => text(c[1]));
    if (cells.some((c) => c !== "")) out.push(cells);
  }
  return out;
}

/** "5 000.00" → 5000; "" → null. */
export function num(s: string | undefined): number | null {
  if (s === undefined) return null;
  const t = s.replace(/[\s\u00a0]/g, "");
  if (t === "" || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Wall-clock time in `timeZone` → the UTC instant. */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, timeZone: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const offsetAt = (t: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(t));
    const v = (type: string) => Number(parts.find((p) => p.type === type)!.value);
    return Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second")) - t;
  };
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t); // second pass settles DST edges
  return new Date(t);
}

/** "2026.11.04 21:17:29" in server time → UTC. */
export function parseServerTime(s: string, timeZone = SERVER_TIME_ZONE): Date | null {
  const m = s.match(/^(\d{4})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return zonedToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] ?? 0), timeZone);
}

const isTime = (s: string | undefined) => !!s && /^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}/.test(s);
const side = (t: string): "LONG" | "SHORT" | null => (t === "buy" ? "LONG" : t === "sell" ? "SHORT" : null);
const reasonOf = (comment: string | undefined): Mt5Position["exitReason"] =>
  comment?.startsWith("[sl") ? "stop" : comment?.startsWith("[tp") ? "target" : "manual";

export function parseMt5Report(html: string, timeZone = SERVER_TIME_ZONE): Mt5Report {
  const all = rows(html);
  const field = (label: string) => all.find((r) => r[0] === label)?.slice(1).find((c) => c !== "");

  const account = field("Account:") ?? "";
  const am = account.match(/^(\d+)\s*\(([^)]*)\)/);
  if (!am) throw new Error("This doesn't look like an MT5 Trade History Report: no 'Account:' line.");
  const [currency = "", server = "", accountType = ""] = am[2].split(",").map((x) => x.trim());

  // Split the rows into the report's sections by their one-cell headings.
  const sections = new Map<string, string[][]>();
  let current = "";
  for (const r of all) {
    const nonEmpty = r.filter((c) => c !== "");
    if (nonEmpty.length === 1 && ["Positions", "Orders", "Deals", "Open Positions", "Working Orders", "Results"].includes(nonEmpty[0])) {
      current = nonEmpty[0];
      sections.set(current, []);
      continue;
    }
    if (current) sections.get(current)!.push(r);
  }

  // Deals: commission of each opening order, and the comment on each close.
  const openCommission = new Map<string, number>(); // order id → commission
  const closeComment = new Map<string, string>(); // "time|symbol|volume" → comment
  for (const r of sections.get("Deals") ?? []) {
    if (!isTime(r[0]) || !r[2]) continue;
    const [time, , symbol, , direction, volume, , order, , commission, , , , , comment] = r;
    if (direction === "in") openCommission.set(order, num(commission) ?? 0);
    if (direction === "out") closeComment.set(`${time}|${symbol}|${num(volume)}`, comment ?? "");
  }

  const positions: Mt5Position[] = [];
  for (const raw of sections.get("Positions") ?? []) {
    if (!isTime(raw[0])) continue;
    // MT5 leaves an empty cell after Type (a colspan in the heading).
    const r = raw[4] === "" ? [...raw.slice(0, 4), ...raw.slice(5)] : raw;
    const [openT, id, symbol, type, volume, openPrice, sl, tp, closeT, closePrice, commission, swap, profit] = r;
    const s = side(type);
    const openTime = parseServerTime(openT, timeZone);
    if (!s || !openTime) continue;
    const c = num(commission) ?? 0;
    const sw = num(swap) ?? 0;
    const p = num(profit);
    positions.push({
      positionId: id,
      symbol,
      side: s,
      volume: num(volume) ?? 0,
      status: "CLOSED",
      openTime,
      openPrice: num(openPrice) ?? 0,
      stopLoss: num(sl),
      takeProfit: num(tp),
      closeTime: parseServerTime(closeT, timeZone),
      closePrice: num(closePrice),
      commission: c,
      swap: sw,
      profit: p,
      netPnl: p === null ? null : Math.round((p + c + sw) * 100) / 100,
      exitReason: reasonOf(closeComment.get(`${closeT}|${symbol}|${num(volume)}`)),
    });
  }

  for (const r of sections.get("Open Positions") ?? []) {
    if (!isTime(r[0])) continue;
    const [openT, id, symbol, type, volume, openPrice, sl, tp, , swap, profit] = r;
    const s = side(type);
    const openTime = parseServerTime(openT, timeZone);
    if (!s || !openTime) continue;
    const c = openCommission.get(id) ?? 0;
    const sw = num(swap) ?? 0;
    const p = num(profit);
    positions.push({
      positionId: id,
      symbol,
      side: s,
      volume: num(volume) ?? 0,
      status: "OPEN",
      openTime,
      openPrice: num(openPrice) ?? 0,
      stopLoss: num(sl),
      takeProfit: num(tp),
      closeTime: null,
      closePrice: null,
      commission: c,
      swap: sw,
      profit: p,
      netPnl: p === null ? null : Math.round((p + c + sw) * 100) / 100,
      exitReason: null,
    });
  }

  const nameRow = field("Name:");
  const dateRow = field("Date:");
  return {
    login: am[1],
    server,
    currency,
    accountType,
    name: nameRow ?? null,
    generatedAt: dateRow ? parseServerTime(dateRow, timeZone) : null,
    balance: num(field("Balance:")),
    equity: num(field("Equity:")),
    positions,
  };
}
