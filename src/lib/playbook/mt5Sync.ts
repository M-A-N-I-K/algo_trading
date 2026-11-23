import type { Mt5Position } from "@/lib/mt5/report";
import { lotUnits, marketForSymbol } from "./config";
import { usdPerUnitMove } from "./rules";

// How MT5 positions land in the Playbook journal. Pure: sync.ts reads the
// files and the database, this decides what each position becomes.
//
// A position already synced is updated. One that matches a trade you logged
// by hand (same account, market and side, opened within a few minutes) is
// linked to it, keeping your setup, checks and notes. One that matches a
// trade linked from the Trades page is skipped, since it's already counted.
// Anything else is created.

export const MATCH_WINDOW_MS = 3 * 60_000;

export interface LoggedTrade {
  id: string;
  symbol: string; // app symbol: XAUUSDT, NAS100…
  side: "LONG" | "SHORT";
  entryTime: number;
  lots: number | null;
  mt5Login: string | null;
  mt5PositionId: string | null;
}

export interface LinkedJournalTrade {
  symbol: string; // as typed on the Trades page
  side: "LONG" | "SHORT";
  exitTime: number;
  lots: number;
}

export type SyncStep =
  | { kind: "update"; tradeId: string; position: Mt5Position; symbol: string }
  | { kind: "link"; tradeId: string; position: Mt5Position; symbol: string }
  | { kind: "create"; position: Mt5Position; symbol: string }
  | { kind: "skip"; position: Mt5Position; why: "unknown-market" | "on-trades-page" };

const sameLots = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-6;

/** What to do with each of one login's positions, given the account's trades. Oldest first. */
export function planSync(login: string, positions: readonly Mt5Position[], trades: readonly LoggedTrade[], journal: readonly LinkedJournalTrade[]): SyncStep[] {
  const synced = new Map(trades.filter((t) => t.mt5Login === login && t.mt5PositionId).map((t) => [t.mt5PositionId!, t]));
  const free = trades.filter((t) => !t.mt5PositionId);
  const claimed = new Set<string>();
  const usedJournal = new Set<number>();
  const steps: SyncStep[] = [];

  for (const p of [...positions].sort((a, b) => a.openTime.getTime() - b.openTime.getTime())) {
    const market = marketForSymbol(p.symbol);
    const done = synced.get(p.positionId);
    if (done) {
      steps.push({ kind: "update", tradeId: done.id, position: p, symbol: market?.symbol ?? done.symbol });
      continue;
    }
    if (!market) {
      steps.push({ kind: "skip", position: p, why: "unknown-market" });
      continue;
    }
    const open = p.openTime.getTime();
    // The closest hand-logged trade; a lots mismatch counts as 10 minutes off.
    let best: LoggedTrade | null = null;
    let bestScore = Infinity;
    for (const t of free) {
      if (claimed.has(t.id) || t.symbol !== market.symbol || t.side !== p.side) continue;
      const off = Math.abs(t.entryTime - open);
      if (off > MATCH_WINDOW_MS) continue;
      const score = off + (sameLots(t.lots, p.volume) ? 0 : 10 * 60_000);
      if (score < bestScore) {
        best = t;
        bestScore = score;
      }
    }
    if (best) {
      claimed.add(best.id);
      steps.push({ kind: "link", tradeId: best.id, position: p, symbol: market.symbol });
      continue;
    }
    // Trades-page trades only know their close, to the minute.
    const close = p.closeTime?.getTime();
    const j = close === undefined ? -1 : journal.findIndex((x, i) => !usedJournal.has(i) && marketForSymbol(x.symbol)?.symbol === market.symbol && x.side === p.side && sameLots(x.lots, p.volume) && Math.abs(x.exitTime - close) <= MATCH_WINDOW_MS);
    if (j >= 0) {
      usedJournal.add(j);
      steps.push({ kind: "skip", position: p, why: "on-trades-page" });
      continue;
    }
    steps.push({ kind: "create", position: p, symbol: market.symbol });
  }
  return steps;
}

export interface TradeSnapshot {
  entryPrice: number;
  stopLoss: number;
  takeProfit: number | null;
  riskAmount: number;
  exitReason: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The PlaybookTrade fields a position sets. The platform is the truth for
 * fills, size, P&L and costs. The stop is the first one known (yours when you
 * logged it, else the one MT5 had at entry) so risk and R stay measured from
 * the original stop after it's trailed. Your exit reason is kept if you set one.
 */
export function syncedFields(p: Mt5Position, symbol: string, existing?: TradeSnapshot) {
  const lots = p.volume;
  const quantity = lots * lotUnits(symbol);
  const hadStop = existing && existing.stopLoss !== existing.entryPrice;
  const stopLoss = hadStop ? existing.stopLoss : (p.stopLoss ?? p.openPrice);
  const perUnit = Math.abs(p.openPrice - stopLoss) * usdPerUnitMove(symbol, stopLoss);
  const riskAmount = Number.isFinite(perUnit) ? round2(perUnit * quantity) : (existing?.riskAmount ?? 0);
  const base = {
    entryTime: p.openTime,
    entryPrice: p.openPrice,
    stopLoss,
    takeProfit: p.takeProfit ?? existing?.takeProfit ?? null,
    lots,
    quantity,
    riskAmount,
  };
  if (p.status === "OPEN") return { ...base, status: "OPEN", floatingPnl: p.netPnl };
  const pnl = p.netPnl ?? 0;
  const platformReason = p.exitReason === "stop" && riskAmount > 0 && Math.abs(pnl) < 0.1 * riskAmount ? "breakeven" : (p.exitReason ?? "manual");
  return {
    ...base,
    status: "CLOSED",
    floatingPnl: null,
    exitTime: p.closeTime,
    exitPrice: p.closePrice,
    pnl,
    commission: p.commission,
    swap: p.swap,
    rMultiple: riskAmount > 0 ? pnl / riskAmount : null,
    exitReason: existing?.exitReason ?? platformReason,
  };
}
