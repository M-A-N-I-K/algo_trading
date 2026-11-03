import { OHLC } from "@/indicators/utils";
import { JournalTrade, summarize } from "@/lib/journal/metrics";
import { BacktestMetrics, EquityPoint, RoundTrip } from "./types";

const DAY_MS = 86_400_000;

// Round trips map onto JournalTrade so a backtest's win rate, profit factor,
// expectancy and R mean exactly what they mean in the live journal.
export function toJournalTrade(rt: RoundTrip, i: number): JournalTrade {
  return {
    id: String(i),
    time: new Date(rt.exitTime),
    openedAt: new Date(rt.entryTime),
    pnl: rt.netPnl,
    grossPnl: rt.grossPnl,
    fees: rt.fees,
    funding: rt.funding,
    symbol: "",
    side: rt.side,
    exitType: rt.exitType,
    initialRiskAmount: rt.initialRisk,
    quantity: rt.quantity,
    entryPrice: rt.entryPrice,
  };
}

export function computeMetrics(input: {
  candles: readonly OHLC[];
  roundTrips: RoundTrip[];
  equityCurve: EquityPoint[];
  initialCapital: number;
  exposedBars: number;
}): BacktestMetrics {
  const { candles, roundTrips, equityCurve, initialCapital, exposedBars } = input;
  const finalEquity = equityCurve.length ? equityCurve[equityCurve.length - 1].equity : initialCapital;

  let peak = initialCapital;
  let maxDrawdownPercent = 0;
  for (const { equity } of equityCurve) {
    peak = Math.max(peak, equity);
    if (peak > 0) maxDrawdownPercent = Math.max(maxDrawdownPercent, ((peak - equity) / peak) * 100);
  }

  return {
    ...summarize(roundTrips.map(toJournalTrade)),
    initialCapital,
    finalEquity,
    netPnl: finalEquity - initialCapital,
    totalFees: roundTrips.reduce((s, rt) => s + rt.fees, 0),
    totalReturnPercent: ((finalEquity - initialCapital) / initialCapital) * 100,
    maxDrawdownPercent,
    exposurePercent: candles.length ? (exposedBars / candles.length) * 100 : 0,
    testPeriodDays: candles.length > 1 ? (candles[candles.length - 1].closeTime - candles[0].openTime) / DAY_MS : 0,
    endOfDataExits: roundTrips.filter((rt) => rt.exitType === "end-of-data").length,
  };
}

// Full-run metrics, computed by the simulation before anything is trimmed
// for display. JSON-safe: an infinite profit factor (no losing round trips)
// is stored as null with profitFactorInfinite = true.
export interface StoredBacktestMetrics {
  count: number;
  wins: number;
  losses: number;
  winRate: number | null; // 0..1
  profitFactor: number | null;
  profitFactorInfinite: boolean;
  expectancy: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  avgR: number | null;
  longestLosingStreak: number;
  initialCapital: number;
  finalEquity: number;
  netPnl: number;
  totalFees: number;
  totalReturnPercent: number;
  maxDrawdownPercent: number;
  exposurePercent: number;
  testPeriodDays: number;
  endOfDataExits: number;
}

export function toStoredMetrics(m: BacktestMetrics): StoredBacktestMetrics {
  return {
    count: m.count,
    wins: m.wins,
    losses: m.losses,
    winRate: m.winRate,
    profitFactor: m.profitFactor === Infinity ? null : m.profitFactor,
    profitFactorInfinite: m.profitFactor === Infinity,
    expectancy: m.expectancy,
    avgWin: m.avgWin,
    avgLoss: m.avgLoss,
    avgR: m.avgR,
    longestLosingStreak: m.longestLosingStreak,
    initialCapital: m.initialCapital,
    finalEquity: m.finalEquity,
    netPnl: m.netPnl,
    totalFees: m.totalFees,
    totalReturnPercent: m.totalReturnPercent,
    maxDrawdownPercent: m.maxDrawdownPercent,
    exposurePercent: m.exposurePercent,
    testPeriodDays: m.testPeriodDays,
    endOfDataExits: m.endOfDataExits,
  };
}


// Evenly samples a series for display, always keeping the first and last points.
export function sampleEvenly<T>(values: T[], maxPoints: number): T[] {
  if (values.length <= maxPoints) return values;
  const step = (values.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => values[Math.round(i * step)]);
}
