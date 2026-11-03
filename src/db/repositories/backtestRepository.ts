import { prisma } from "@/db/client";
import { Prisma } from "@prisma/client";
import type {
  BacktestConfiguration,
  BacktestStore,
  StoredBacktestResult,
} from "@/domain/backtesting/runStrategyBacktest";
import type { StoredBacktestMetrics } from "@/domain/backtesting/metrics";
import type { ExitType, Leg, Side } from "@/domain/backtesting/types";

// Strategy Builder backtests: one `backtests` row per run (configuration +
// full metrics) and one `backtest_trades` row per round trip, untruncated.

const json = (v: unknown) => v as Prisma.InputJsonValue;
// Decimal columns reject NaN/Infinity and values past their precision.
const finite = (n: number | null | undefined, max: number): number | null =>
  n === null || n === undefined || !Number.isFinite(n) ? null : Math.max(-max, Math.min(max, n));

export const prismaBacktestStore: BacktestStore = {
  async start({ userId, strategyId, strategyVersionId, configuration }) {
    const row = await prisma.backtest.create({
      data: { userId, strategyId, strategyVersionId, configuration: json(configuration), status: "RUNNING", startedAt: new Date() },
    });
    return row.id;
  },

  async complete(id, result: StoredBacktestResult) {
    const trades = result.roundTrips.map((rt) => ({
      backtestId: id,
      side: rt.side,
      entryTime: new Date(rt.entryTime),
      entryPrice: rt.entryPrice,
      exitTime: new Date(rt.exitTime),
      exitPrice: rt.exitPrice,
      quantity: rt.quantity,
      fees: rt.fees,
      slippage: rt.slippage,
      pnl: rt.netPnl,
      rMultiple: finite(rt.rMultiple, 999_999),
      mae: finite(rt.mae, 1e13),
      mfe: finite(rt.mfe, 1e13),
      exitType: rt.exitType,
      legs: json(rt.legs),
    }));

    await prisma.$transaction([
      prisma.backtestTrade.createMany({ data: trades }),
      prisma.backtest.update({
        where: { id },
        // Configuration is rewritten: the run fills in what it actually loaded.
        data: { status: "COMPLETED", configuration: json(result.configuration), metrics: json(result.metrics), completedAt: new Date() },
      }),
    ]);
  },

  async fail(id, error) {
    await prisma.backtest.update({ where: { id }, data: { status: "FAILED", error, completedAt: new Date() } });
  },
};

export interface BacktestSummary {
  id: string;
  strategyId: string;
  version: number;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  configuration: BacktestConfiguration;
  metrics: StoredBacktestMetrics | null;
  error: string | null;
  createdAt: string;
}

export interface BacktestRoundTripRow {
  side: Side;
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  quantity: number;
  fees: number;
  slippage: number;
  netPnl: number;
  rMultiple: number | null;
  mae: number | null;
  mfe: number | null;
  exitType: ExitType | null;
  legs: Leg[];
}

export interface BacktestDetail extends BacktestSummary {
  strategyName: string;
  equityCurve: { time: number; equity: number }[];
  drawdownCurve: { time: number; drawdownPercent: number }[];
  roundTrips: BacktestRoundTripRow[];
}

type Row = Prisma.BacktestGetPayload<{ include: { strategyVersion: { select: { version: true } } } }>;

function summary(row: Row): BacktestSummary {
  const metrics = row.metrics as unknown as StoredBacktestResult["metrics"] | null;
  return {
    id: row.id,
    strategyId: row.strategyId,
    version: row.strategyVersion.version,
    status: row.status,
    configuration: row.configuration as unknown as BacktestConfiguration,
    metrics: metrics?.metrics ?? null,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listBacktestsForStrategy(strategyId: string, userId: string, limit = 100): Promise<BacktestSummary[]> {
  const rows = await prisma.backtest.findMany({
    where: { strategyId, userId },
    include: { strategyVersion: { select: { version: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(summary);
}

export async function getBacktest(id: string, userId: string): Promise<BacktestDetail | null> {
  const row = await prisma.backtest.findFirst({
    where: { id, userId },
    include: {
      strategyVersion: { select: { version: true } },
      strategy: { select: { name: true } },
      trades: { orderBy: { entryTime: "asc" } },
    },
  });
  if (!row) return null;
  const metrics = row.metrics as unknown as StoredBacktestResult["metrics"] | null;
  return {
    ...summary(row),
    strategyName: row.strategy.name,
    equityCurve: metrics?.equityCurve ?? [],
    drawdownCurve: metrics?.drawdownCurve ?? [],
    roundTrips: row.trades.map((t) => ({
      side: t.side as Side,
      entryTime: t.entryTime.getTime(),
      entryPrice: t.entryPrice.toNumber(),
      exitTime: t.exitTime.getTime(),
      exitPrice: t.exitPrice.toNumber(),
      quantity: t.quantity.toNumber(),
      fees: t.fees.toNumber(),
      slippage: t.slippage.toNumber(),
      netPnl: t.pnl.toNumber(),
      rMultiple: t.rMultiple?.toNumber() ?? null,
      mae: t.mae?.toNumber() ?? null,
      mfe: t.mfe?.toNumber() ?? null,
      exitType: (t.exitType as ExitType | null) ?? null,
      legs: (t.legs as unknown as Leg[] | null) ?? [],
    })),
  };
}

export async function deleteBacktest(id: string, userId: string): Promise<boolean> {
  const result = await prisma.backtest.deleteMany({ where: { id, userId } });
  return result.count > 0;
}
