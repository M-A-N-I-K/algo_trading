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

export interface TestPeriodStats {
  // Calendar span from the first trade's entry to the last trade's exit —
  // answers "how much time did it take to produce this return".
  testPeriodDays: number | null;
}

export type BacktestRunMetrics = Omit<BacktestRunResult, "trades" | "equityCurve"> & TestPeriodStats;

export interface BacktestRunAnalyticsRow extends BacktestRunSummary {
  results: BacktestRunMetrics[];
}

// `entryTime`/`exitTime` are persisted as "YYYY-MM-DD HH:mm:ss" (see
// POST /api/backtest) — the space instead of "T" parses fine in most engines
// but isn't spec-guaranteed, so normalize before handing to Date().
function parseBacktestTimestamp(s: string): number {
  return new Date(s.includes("T") ? s : s.replace(" ", "T")).getTime();
}

function testPeriodStats(trades: unknown[]): TestPeriodStats {
  let earliestEntry = Infinity;
  let latestExit = -Infinity;

  for (const t of trades) {
    const trade = t as { entryTime?: string; exitTime?: string };
    if (!trade.entryTime || !trade.exitTime) continue;
    const entryMs = parseBacktestTimestamp(trade.entryTime);
    const exitMs = parseBacktestTimestamp(trade.exitTime);
    if (Number.isFinite(entryMs)) earliestEntry = Math.min(earliestEntry, entryMs);
    if (Number.isFinite(exitMs)) latestExit = Math.max(latestExit, exitMs);
  }

  return { testPeriodDays: latestExit > earliestEntry ? (latestExit - earliestEntry) / 86_400_000 : null };
}

// Same rows as listBacktestRunsForUser, but also includes each symbol's
// performance metrics (win rate, return %, drawdown, test period, ...) for
// the Insights dashboard's cross-run comparison table — while still
// stripping `trades` and `equityCurve` (the bulk of the JSON blob, and the
// only reason we read them at all is to derive the test period below) so
// the payload stays light even across a large run history.
export async function listBacktestRunsWithMetricsForUser(userId: string, limit = 200): Promise<BacktestRunAnalyticsRow[]> {
  const rows = await prisma.backtestRun.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((row) => {
    const fullResults = row.results as unknown as BacktestRunResult[];
    const results: BacktestRunMetrics[] = fullResults.map(({ trades, equityCurve, ...metrics }) => ({
      ...metrics,
      ...testPeriodStats(trades),
    }));
    return { ...summaryFromRow(row), results };
  });
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
