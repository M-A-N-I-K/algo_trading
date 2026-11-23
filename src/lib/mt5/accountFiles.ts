import { num, parseServerTime, SERVER_TIME_ZONE, type Mt5Position } from "./report";

// The live trade export written by the PB_BarFeed expert (mt5/PB_BarFeed.mq5)
// for each account the terminal logs into, in PlaybookFeed/accounts/:
//
//   <LOGIN>.txt            "key\tvalue" lines: login, server, balance, equity, utc…
//   <LOGIN>_deals.csv      every deal in the account's history
//   <LOGIN>_positions.csv  the positions open now
//
// Times are the broker's server time, converted to UTC here the same way as
// the HTML report. This file only parses; reading the folder and writing the
// database live in sync.ts.

export interface Mt5AccountInfo {
  login: string;
  server: string;
  company: string;
  name: string;
  currency: string;
  mode: string; // demo, real or contest
  balance: number | null;
  equity: number | null;
  /** UTC ms the expert last wrote the account, by the terminal's clock. */
  writtenAt: number | null;
}

export interface Mt5Deal {
  ticket: string;
  positionId: string;
  time: Date;
  type: "buy" | "sell" | "balance" | "credit" | "commission" | "other";
  entry: "in" | "out" | "inout" | "out_by" | "";
  symbol: string;
  volume: number;
  price: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  commission: number;
  swap: number;
  fee: number;
  profit: number;
  reason: string; // sl, tp, so, client, mobile, web, expert
}

export interface Mt5OpenPosition {
  positionId: string;
  symbol: string;
  side: "LONG" | "SHORT";
  openTime: Date;
  volume: number;
  openPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  swap: number;
  profit: number; // floating, before commission
  currentPrice: number | null;
}

const LOGIN = /^\d{1,20}$/;
export const isLogin = (s: string) => LOGIN.test(s);

export function parseAccountInfo(text: string): Mt5AccountInfo | null {
  const kv = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const tab = line.indexOf("\t");
    if (tab > 0) kv.set(line.slice(0, tab).trim(), line.slice(tab + 1).trim());
  }
  const login = kv.get("login") ?? "";
  if (!isLogin(login)) return null;
  const utc = Number(kv.get("utc"));
  return {
    login,
    server: kv.get("server") ?? "",
    company: kv.get("company") ?? "",
    name: kv.get("name") ?? "",
    currency: kv.get("currency") ?? "",
    mode: kv.get("mode") ?? "",
    balance: num(kv.get("balance")),
    equity: num(kv.get("equity")),
    writtenAt: Number.isFinite(utc) && utc > 0 ? utc * 1000 : null,
  };
}

/** Rows of a tab-separated file with a header line, as header → cell maps. */
function table(text: string): Map<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lines.length) return [];
  const head = lines[0].split("\t").map((h) => h.trim().toUpperCase());
  return lines.slice(1).map((l) => {
    const cells = l.split("\t");
    return new Map(head.map((h, i) => [h, (cells[i] ?? "").trim()]));
  });
}

const DEAL_TYPES = new Set(["buy", "sell", "balance", "credit", "commission"]);
const ENTRIES = new Set(["in", "out", "inout", "out_by"]);

export function parseDeals(text: string, timeZone = SERVER_TIME_ZONE): Mt5Deal[] {
  const out: Mt5Deal[] = [];
  for (const r of table(text)) {
    const time = parseServerTime(r.get("TIME") ?? "", timeZone);
    const ticket = r.get("TICKET") ?? "";
    if (!time || !ticket) continue;
    const type = r.get("TYPE") ?? "";
    const entry = r.get("ENTRY") ?? "";
    out.push({
      ticket,
      positionId: r.get("POSITION") ?? "",
      time,
      type: DEAL_TYPES.has(type) ? (type as Mt5Deal["type"]) : "other",
      entry: ENTRIES.has(entry) ? (entry as Mt5Deal["entry"]) : "",
      symbol: r.get("SYMBOL") ?? "",
      volume: num(r.get("VOLUME")) ?? 0,
      price: num(r.get("PRICE")),
      stopLoss: num(r.get("SL")),
      takeProfit: num(r.get("TP")),
      commission: num(r.get("COMMISSION")) ?? 0,
      swap: num(r.get("SWAP")) ?? 0,
      fee: num(r.get("FEE")) ?? 0,
      profit: num(r.get("PROFIT")) ?? 0,
      reason: r.get("REASON") ?? "",
    });
  }
  return out;
}

export function parseOpenPositions(text: string, timeZone = SERVER_TIME_ZONE): Mt5OpenPosition[] {
  const out: Mt5OpenPosition[] = [];
  for (const r of table(text)) {
    const openTime = parseServerTime(r.get("TIME") ?? "", timeZone);
    const openPrice = num(r.get("PRICE"));
    const positionId = r.get("POSITION") ?? "";
    if (!openTime || openPrice === null || !positionId) continue;
    out.push({
      positionId,
      symbol: r.get("SYMBOL") ?? "",
      side: r.get("TYPE") === "sell" ? "SHORT" : "LONG",
      openTime,
      volume: num(r.get("VOLUME")) ?? 0,
      openPrice,
      stopLoss: num(r.get("SL")),
      takeProfit: num(r.get("TP")),
      swap: num(r.get("SWAP")) ?? 0,
      profit: num(r.get("PROFIT")) ?? 0,
      currentPrice: num(r.get("CURRENT")),
    });
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const vwap = (deals: Mt5Deal[]) => {
  const vol = deals.reduce((a, d) => a + d.volume, 0);
  return vol > 0 ? deals.reduce((a, d) => a + (d.price ?? 0) * d.volume, 0) / vol : (deals[0]?.price ?? null);
};
const exitReasonOf = (reason: string | undefined): Mt5Position["exitReason"] => (reason === "sl" || reason === "so" ? "stop" : reason === "tp" ? "target" : "manual");

/**
 * Positions from the deal history, in the HTML report's shape: one per
 * position ticket, priced at the volume-weighted fills, with every deal's
 * commission, fee and swap. A position still in `open` is OPEN (its stop,
 * target and floating P&L taken from there); otherwise it's CLOSED once its
 * closing deals add up to its volume. Balance and credit deals are skipped.
 */
export function positionsFromDeals(deals: Mt5Deal[], open: Mt5OpenPosition[]): Mt5Position[] {
  const byId = new Map<string, Mt5Deal[]>();
  for (const d of deals) {
    if ((d.type !== "buy" && d.type !== "sell") || !d.positionId || d.positionId === "0") continue;
    byId.set(d.positionId, [...(byId.get(d.positionId) ?? []), d]);
  }
  const openById = new Map(open.map((p) => [p.positionId, p]));
  const out: Mt5Position[] = [];

  for (const [positionId, list] of byId) {
    list.sort((a, b) => a.time.getTime() - b.time.getTime());
    const ins = list.filter((d) => d.entry === "in");
    if (!ins.length) continue; // opened before the history starts
    const outs = list.filter((d) => d.entry === "out" || d.entry === "out_by");
    const side = ins[0].type === "buy" ? "LONG" : "SHORT";
    const volume = ins.reduce((a, d) => a + d.volume, 0);
    const closedVolume = outs.reduce((a, d) => a + d.volume, 0);
    const live = openById.get(positionId);
    const costs = list.reduce((a, d) => a + d.commission + d.fee, 0);
    const swapClosed = list.reduce((a, d) => a + d.swap, 0);
    const realised = outs.reduce((a, d) => a + d.profit, 0);
    const lastOut = outs[outs.length - 1];
    const closed = !live && outs.length > 0 && closedVolume >= volume - 1e-9;
    // The stop and target placed with the order; else the ones on the closing deal.
    const firstStop = ins.find((d) => d.stopLoss !== null)?.stopLoss ?? null;
    const firstTarget = ins.find((d) => d.takeProfit !== null)?.takeProfit ?? null;

    if (live || !closed) {
      const swap = live ? live.swap : swapClosed;
      const profit = (live?.profit ?? 0) + realised;
      out.push({
        positionId,
        symbol: ins[0].symbol,
        side,
        volume: round2(volume),
        status: "OPEN",
        openTime: ins[0].time,
        openPrice: vwap(ins) ?? live?.openPrice ?? 0,
        stopLoss: live ? live.stopLoss : firstStop,
        takeProfit: live ? live.takeProfit : firstTarget,
        closeTime: null,
        closePrice: null,
        commission: round2(costs),
        swap: round2(swap),
        profit: round2(profit),
        netPnl: round2(profit + costs + swap),
        exitReason: null,
      });
      continue;
    }
    out.push({
      positionId,
      symbol: ins[0].symbol,
      side,
      volume: round2(volume),
      status: "CLOSED",
      openTime: ins[0].time,
      openPrice: vwap(ins) ?? 0,
      stopLoss: firstStop ?? lastOut.stopLoss,
      takeProfit: firstTarget ?? lastOut.takeProfit,
      closeTime: lastOut.time,
      closePrice: vwap(outs),
      commission: round2(costs),
      swap: round2(swapClosed),
      profit: round2(realised),
      netPnl: round2(realised + costs + swapClosed),
      exitReason: exitReasonOf(lastOut.reason),
    });
  }
  // Open positions whose opening deal is outside the exported history.
  for (const p of open) {
    if (byId.has(p.positionId)) continue;
    out.push({
      positionId: p.positionId,
      symbol: p.symbol,
      side: p.side,
      volume: p.volume,
      status: "OPEN",
      openTime: p.openTime,
      openPrice: p.openPrice,
      stopLoss: p.stopLoss,
      takeProfit: p.takeProfit,
      closeTime: null,
      closePrice: null,
      commission: 0,
      swap: p.swap,
      profit: p.profit,
      netPnl: round2(p.profit + p.swap),
      exitReason: null,
    });
  }
  return out.sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
}

/** The first deposit: the account's starting size, used to suggest which prop account a login is. */
export function firstDeposit(deals: Mt5Deal[]): number | null {
  const d = deals.filter((x) => x.type === "balance" && x.profit > 0).sort((a, b) => a.time.getTime() - b.time.getTime())[0];
  return d ? d.profit : null;
}
