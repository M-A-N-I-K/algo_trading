import { inflateRawSync } from "node:zlib";

// MT5 Strategy Tester reports, saved from the tester's Results tab as Excel
// (.xlsx). The sheet holds the settings, the summary, then "Orders" and
// "Deals" tables. Only what the Tester reports page needs is read: the
// settings and every closed position, built from the deal pairs.

export interface TesterMeta {
  expert: string;
  symbol: string;
  period: string; // as the report prints it, e.g. "H1 (2020.01.01 - 2026.11.11)"
  inputs: Record<string, string>;
  deposit: number;
  leverage: string;
  historyQuality: string;
  modelling?: string;
}

export interface TesterTrade {
  open: string; // server time "YYYY-MM-DD HH:MM:SS"
  close: string;
  side: "LONG" | "SHORT";
  lots: number;
  entry: number;
  exit: number;
  pnl: number; // profit + commission + swap, $
  balanceBefore: number; // closed balance before the trade opened, $
  exitReason: "sl" | "tp" | "end" | "other";
  stop: number | null; // the stop the order was sent with
  target: number | null;
  // Result in R: the P&L, costs included, over what the stop would have
  // lost at this size. Independent of lot rounding, unlike pnl.
  r: number;
}

export interface TesterReport {
  meta: TesterMeta;
  trades: TesterTrade[];
}

/* ---------- xlsx: just enough of zip and SpreadsheetML ---------- */

function unzip(buf: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  // End of central directory: signature 0x06054b50, searched from the end.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not an .xlsx file (no zip directory)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Broken zip directory");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataAt, dataAt + size);
    files.set(name, method === 8 ? inflateRawSync(raw) : Buffer.from(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const unescapeXml = (s: string) =>
  s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) =>
    e === "lt" ? "<" : e === "gt" ? ">" : e === "amp" ? "&" : e === "quot" ? '"' : e === "apos" ? "'" : String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)),
  );
// MT5 writes the sheet's XML in UTF-16 (with a byte-order mark).
function xmlText(b: Buffer | undefined): string | undefined {
  if (!b) return undefined;
  if (b[0] === 0xff && b[1] === 0xfe) return b.toString("utf16le", 2);
  if (b[0] === 0xfe && b[1] === 0xff) return Buffer.from(b.subarray(2)).swap16().toString("utf16le");
  return b.toString("utf8");
}
const textOf = (xml: string) => unescapeXml([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));
const colIndex = (ref: string) => [...ref.replace(/\d+/g, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** The first worksheet as rows of cell text. */
export function readXlsxRows(buf: Buffer): string[][] {
  const files = unzip(buf);
  const shared = xmlText(files.get("xl/sharedStrings.xml"));
  const strings = shared ? [...shared.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : [];
  const sheetName = [...files.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  if (!sheetName) throw new Error("No worksheet in the .xlsx file");
  const sheet = xmlText(files.get(sheetName))!;
  const rows: string[][] = [];
  for (const rm of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], body = cm[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      const val = type === "s" && v !== undefined ? (strings[Number(v)] ?? "") : type === "inlineStr" ? textOf(body) : v !== undefined ? unescapeXml(v) : "";
      const at = ref ? colIndex(ref) : row.length;
      while (row.length < at) row.push("");
      row[at] = val;
    }
    rows.push(row);
  }
  return rows;
}

/* ---------- report rows -> settings and trades ---------- */

const serverTime = (s: string) => s.replace(/^(\d{4})\.(\d{2})\.(\d{2})/, "$1-$2-$3");
const num = (s: string | undefined) => {
  const n = Number(String(s ?? "").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function parseTesterRows(rows: string[][]): TesterReport {
  const label = (name: string) => {
    for (const r of rows) {
      const i = r.findIndex((c) => c === name);
      if (i >= 0) return r.slice(i + 1).find((c) => c !== "") ?? "";
    }
    return "";
  };
  const expert = label("Expert:");
  if (!expert) throw new Error("Not a Strategy Tester report (no Expert: line)");
  const inputs: Record<string, string> = {};
  for (const r of rows) for (const c of r) {
    const m = /^(Inp\w+)=(.*)$/.exec(c);
    if (m) inputs[m[1]] = m[2];
  }
  const meta: TesterMeta = {
    expert,
    symbol: label("Symbol:"),
    period: label("Period:"),
    inputs,
    deposit: num(label("Initial Deposit:")),
    leverage: label("Leverage:"),
    historyQuality: label("History Quality:"),
  };

  const di = rows.findIndex((r) => r[0] === "Deals");
  if (di < 0) throw new Error("The report has no Deals table");
  const head = rows[di + 1];
  const col = (n: string) => {
    const i = head.indexOf(n);
    if (i < 0) throw new Error(`Deals table has no ${n} column`);
    return i;
  };
  const C = { time: col("Time"), type: col("Type"), dir: col("Direction"), vol: col("Volume"), price: col("Price"), com: col("Commission"), swap: col("Swap"), profit: col("Profit"), bal: col("Balance"), comment: col("Comment") };

  // Orders table: the stop and target each order was sent with.
  const oi = rows.findIndex((r) => r[0] === "Orders");
  const stops = new Map<string, { sl: number | null; tp: number | null }>();
  if (oi >= 0) {
    const oh = rows[oi + 1];
    const [ot, osl, otp] = [oh.indexOf("Order"), oh.indexOf("S / L"), oh.indexOf("T / P")];
    for (const r of rows.slice(oi + 2, di)) {
      if (!r[ot]) continue;
      const sl = num(r[osl]), tp = num(r[otp]);
      stops.set(r[ot], { sl: sl > 0 ? sl : null, tp: tp > 0 ? tp : null });
    }
  }
  const orderCol = head.indexOf("Order");

  const trades: TesterTrade[] = [];
  let open: { row: string[]; costs: number; before: number } | null = null;
  let balance = meta.deposit;
  for (const r of rows.slice(di + 2)) {
    if (!/^\d{4}\.\d{2}\.\d{2}/.test(r[C.time] ?? "")) continue;
    const dir = r[C.dir];
    const money = num(r[C.profit]) + num(r[C.com]) + num(r[C.swap]);
    if (r[C.type] === "balance") { balance = num(r[C.bal]); continue; }
    if (dir === "in") {
      open = { row: r, costs: money, before: balance };
    } else if ((dir === "out" || dir === "out by") && open) {
      const comment = r[C.comment] ?? "";
      const side = open.row[C.type] === "buy" ? 1 : -1;
      const entry = num(open.row[C.price]), exit = num(r[C.price]);
      const pnl = Math.round((open.costs + money) * 100) / 100;
      const o = orderCol >= 0 ? stops.get(open.row[orderCol]) : undefined;
      const stop = o?.sl ?? null;
      // $ per 1.0 of price at this size, from the closing deal's profit.
      const perPoint = exit !== entry ? Math.abs(num(r[C.profit]) / (exit - entry)) : 0;
      const riskUsd = stop !== null && perPoint > 0 ? Math.abs(entry - stop) * perPoint : 0;
      trades.push({
        open: serverTime(open.row[C.time]),
        close: serverTime(r[C.time]),
        side: side > 0 ? "LONG" : "SHORT",
        lots: num(open.row[C.vol]),
        entry,
        exit,
        pnl,
        balanceBefore: open.before,
        exitReason: comment.startsWith("sl") ? "sl" : comment.startsWith("tp") ? "tp" : comment.startsWith("end of test") ? "end" : "other",
        stop,
        target: o?.tp ?? null,
        // Without a stop or a price move, fall back to the balance at 1% risk.
        r: Math.round((riskUsd > 0 ? pnl / riskUsd : pnl / (0.01 * open.before)) * 1000) / 1000,
      });
      open = null;
    }
    balance = num(r[C.bal]) || balance;
  }
  return { meta, trades };
}

export const parseTesterReport = (buf: Buffer) => parseTesterRows(readXlsxRows(buf));
