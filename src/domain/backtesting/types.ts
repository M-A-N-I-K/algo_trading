import { Candle } from "@/domain/market-data/types";
import { StrategyDefinition } from "@/domain/strategies/types";

export interface BacktestRunConfiguration {
  instrumentId: string;
  timeframe: string;
  from: string; // ISO date
  to: string; // ISO date
  initialCapital: number;
}

export interface BacktestTrade {
  side: "LONG" | "SHORT";
  entryTime: string;
  entryPrice: number;
  exitTime: string;
  exitPrice: number;
  quantity: number;
  fees: number;
  slippage: number;
  pnl: number;
  rMultiple: number | null;
  mae: number | null; // Maximum Adverse Excursion
  mfe: number | null; // Maximum Favorable Excursion
}

export interface BacktestMetrics {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  totalReturnPercent: number;
  maxDrawdownPercent: number;
}

export interface BacktestResult {
  trades: BacktestTrade[];
  equityCurve: number[];
  drawdownCurve: number[];
  metrics: BacktestMetrics;
}

export type BacktestStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

// Foundation-only interface for P0. No implementation runs a strategy
// configuration against real candle data yet — see engine.ts for the
// explicit not-implemented placeholder. This exists so the DB schema
// (Backtest/BacktestTrade), API routes, and UI can be built against a
// stable contract before the real engine lands in a later phase.
export interface BacktestEngine {
  run(strategy: StrategyDefinition, marketData: Candle[], configuration: BacktestRunConfiguration): Promise<BacktestResult>;
}
