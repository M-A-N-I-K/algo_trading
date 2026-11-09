import { prisma } from "@/lib/db";
import { analyseCommission, COST_SOURCE, type CommissionFinding } from "@/lib/costs/fundingpips";
import type { Mt5Position, Mt5Report } from "./report";

// Database side of MT5 imports: upsert a parsed report's positions by
// (user, login, position ticket), so re-importing a newer report updates
// positions that have since closed instead of duplicating them.

export async function importReport(userId: string, report: Mt5Report) {
  let created = 0;
  let updated = 0;
  for (const p of report.positions) {
    const data = {
      server: report.server,
      symbol: p.symbol,
      side: p.side,
      volume: p.volume,
      status: p.status,
      openTime: p.openTime,
      openPrice: p.openPrice,
      stopLoss: p.stopLoss,
      takeProfit: p.takeProfit,
      closeTime: p.closeTime,
      closePrice: p.closePrice,
      commission: p.commission,
      swap: p.swap,
      profit: p.profit,
      netPnl: p.netPnl,
      exitReason: p.exitReason,
    };
    const key = { userId_login_positionId: { userId, login: report.login, positionId: p.positionId } };
    const existing = await prisma.mt5Trade.findUnique({ where: key, select: { id: true } });
    await prisma.mt5Trade.upsert({ where: key, create: { userId, login: report.login, positionId: p.positionId, ...data }, update: data });
    if (existing) updated++;
    else created++;
  }
  return { created, updated, positions: report.positions.length };
}

export interface Mt5Summary {
  trades: Mt5Position[];
  closed: number;
  open: number;
  wins: number;
  netPnl: number; // closed, after commission and swap
  profit: number;
  commission: number;
  swap: number;
  commissionFindings: CommissionFinding[];
  costSource: string;
}

export async function mt5Summary(userId: string): Promise<Mt5Summary> {
  const rows = await prisma.mt5Trade.findMany({ where: { userId }, orderBy: { openTime: "desc" } });
  const trades: Mt5Position[] = rows.map((r) => ({
    positionId: r.positionId,
    symbol: r.symbol,
    side: r.side === "SHORT" ? "SHORT" : "LONG",
    volume: r.volume,
    status: r.status === "OPEN" ? "OPEN" : "CLOSED",
    openTime: r.openTime,
    openPrice: r.openPrice,
    stopLoss: r.stopLoss,
    takeProfit: r.takeProfit,
    closeTime: r.closeTime,
    closePrice: r.closePrice,
    commission: r.commission,
    swap: r.swap,
    profit: r.profit,
    netPnl: r.netPnl,
    exitReason: r.exitReason === "stop" || r.exitReason === "target" || r.exitReason === "manual" ? r.exitReason : null,
  }));
  const closed = trades.filter((t) => t.status === "CLOSED");
  const sum = (k: "profit" | "commission" | "swap" | "netPnl") => Math.round(closed.reduce((a, t) => a + (t[k] ?? 0), 0) * 100) / 100;
  return {
    trades,
    closed: closed.length,
    open: trades.length - closed.length,
    wins: closed.filter((t) => (t.netPnl ?? 0) > 0).length,
    netPnl: sum("netPnl"),
    profit: sum("profit"),
    commission: sum("commission"),
    swap: sum("swap"),
    commissionFindings: analyseCommission(trades),
    costSource: COST_SOURCE,
  };
}
