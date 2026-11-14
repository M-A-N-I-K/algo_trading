import type { PlaybookTrade, Trade as TradeRow } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { ChecklistItem, Trade } from "@/components/trading-journal/DashboardContext";

// A funding account's closed trades in the dashboard's trade shape, so the
// dashboard can show one prop account on its own instead of mixing it with
// CoinDCX. Two sources: trades logged in the Playbook, and journal trades
// linked to the account on the Trades page.

const PLAYBOOK_PREFIX = "playbook:";
export const isPlaybookRow = (id: string) => id.startsWith(PLAYBOOK_PREFIX);

/** A closed Playbook trade as a dashboard trade. Commission (negative) becomes fees, swap becomes funding. */
export function playbookToDashboardTrade(t: PlaybookTrade): Trade | null {
  if (t.status !== "CLOSED" || t.pnl === null || !t.exitTime) return null;
  const fees = t.commission !== null ? -t.commission : null;
  const funding = t.swap;
  return {
    id: `${PLAYBOOK_PREFIX}${t.id}`,
    time: t.exitTime.toISOString(),
    openedAt: t.entryTime.toISOString(),
    balanceBefore: 0,
    balanceAfter: 0,
    pnl: t.pnl,
    currency: "USD",
    symbol: t.symbol,
    exchange: "PLAYBOOK",
    side: t.side === "SHORT" ? "SHORT" : "LONG",
    quantity: t.quantity,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice ?? t.entryPrice,
    strategy: t.setupId,
    notes: t.notes,
    stopLoss: t.stopLoss,
    initialRiskAmount: t.riskAmount > 0 ? t.riskAmount : null,
    fees,
    funding,
    grossPnl: t.pnl + (fees ?? 0) - (funding ?? 0),
    exitType: t.exitReason === "target" || t.exitReason === "stop" ? "tpsl" : "manual",
    tags: [],
    checklist: null,
    playbookAccountId: t.accountId,
  };
}

function journalToDashboardTrade(t: TradeRow): Trade {
  return {
    ...t,
    time: t.time.toISOString(),
    openedAt: t.openedAt?.toISOString() ?? null,
    balanceBefore: t.balanceBefore ?? 0,
    balanceAfter: t.balanceAfter ?? 0,
    side: t.side === "SHORT" ? "SHORT" : "LONG",
    exitType: t.exitType === "manual" || t.exitType === "tpsl" || t.exitType === "liquidation" ? t.exitType : null,
    checklist: Array.isArray(t.checklist) ? (t.checklist as unknown as ChecklistItem[]) : null,
  } as Trade;
}

/** Every closed trade on one funding account, oldest first. */
export async function accountDashboardTrades(userId: string, accountId: string): Promise<Trade[]> {
  const [rows, linked] = await Promise.all([
    prisma.playbookTrade.findMany({ where: { userId, accountId, status: "CLOSED" } }),
    prisma.trade.findMany({ where: { userId, playbookAccountId: accountId } }),
  ]);
  return [...rows.map(playbookToDashboardTrade).filter((t): t is Trade => t !== null), ...linked.map(journalToDashboardTrade)]
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}
