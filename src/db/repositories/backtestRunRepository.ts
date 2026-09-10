import { prisma } from "@/db/client";
import { Prisma, BacktestRun as PrismaBacktestRun } from "@prisma/client";

// The exact per-symbol result shape returned by POST /api/backtest — stored
// verbatim in `results` so history playback needs no recomputation.
export interface BacktestRunResult {
  symbol: string;
  strategyName: string;
  totalTrades: number;
  winRate: number;
  finalBalance: number;
  totalReturnPercent: number;
  maxDrawdownPercent: number;
  trades: unknown[];
  equityCurve: number[];
}

export interface BacktestRunSummary {
  id: string;
  userId: string;
  strategyKey: string;
  strategyName: string;
  symbols: string;
  interval: string;
  candleLimit: number;
  initialBalance: number;
  minRiskRewardRatio: number | null;
  createdAt: string;
}

export interface BacktestRunRecord extends BacktestRunSummary {
  results: BacktestRunResult[];
}

function summaryFromRow(row: Omit<PrismaBacktestRun, "results">): BacktestRunSummary {
  return {
    id: row.id,
    userId: row.userId,
    strategyKey: row.strategyKey,
    strategyName: row.strategyName,
    symbols: row.symbols,
    interval: row.interval,
    candleLimit: row.candleLimit,
    initialBalance: row.initialBalance.toNumber(),
    minRiskRewardRatio: row.minRiskRewardRatio ? row.minRiskRewardRatio.toNumber() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface CreateBacktestRunInput {
  userId: string;
  strategyKey: string;
  strategyName: string;
  symbols: string;
  interval: string;
  candleLimit: number;
  initialBalance: number;
  minRiskRewardRatio?: number;
  results: BacktestRunResult[];
}

export async function createBacktestRun(input: CreateBacktestRunInput): Promise<BacktestRunSummary> {
  const row = await prisma.backtestRun.create({
    data: {
      userId: input.userId,
      strategyKey: input.strategyKey,
      strategyName: input.strategyName,
      symbols: input.symbols,
      interval: input.interval,
      candleLimit: input.candleLimit,
      initialBalance: input.initialBalance,
      minRiskRewardRatio: input.minRiskRewardRatio,
      results: input.results as unknown as Prisma.InputJsonValue,
    },
  });
  return summaryFromRow(row);
}

// Lightweight listing — deliberately excludes the `results` JSON blob
// (which can hold up to 100 trades + 500 equity points per symbol) so the
// history panel stays fast to load.
export async function listBacktestRunsForUser(userId: string, limit = 50): Promise<BacktestRunSummary[]> {
  const rows = await prisma.backtestRun.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      userId: true,
      strategyKey: true,
      strategyName: true,
      symbols: true,
      interval: true,
      candleLimit: true,
      initialBalance: true,
      minRiskRewardRatio: true,
      createdAt: true,
    },
  });
  return rows.map(summaryFromRow);
}

export async function getBacktestRun(id: string, userId: string): Promise<BacktestRunRecord | null> {
  const row = await prisma.backtestRun.findFirst({ where: { id, userId } });
  if (!row) return null;
  return { ...summaryFromRow(row), results: row.results as unknown as BacktestRunResult[] };
}

export async function deleteBacktestRun(id: string, userId: string): Promise<boolean> {
  const result = await prisma.backtestRun.deleteMany({ where: { id, userId } });
  return result.count > 0;
}
