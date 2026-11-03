import { OHLC, parseCandlesticks } from "../indicators/utils";
import { BacktestResult, ExecutionSettings, fromCodedStrategy, simulate } from "../domain/backtesting";
import { createCodedStrategy, HIGHER_TIMEFRAME } from "../strategies/registry";
import { Strategy } from "../types/strategy";
import type { BacktestRunResult } from "../db/repositories/backtestRunRepository";
import { sampleEvenly, toStoredMetrics } from "../domain/backtesting/metrics";
import { fetchCandlestickHistory, intervalToMs } from "./fetchHistory";

// Options in the units the API route and CLI scripts have always used:
// fractions, not percentages (positionSizePercent 1 = 100% of equity,
// maxRiskPercent 0.02 = 2%).
export interface CodedBacktestOptions {
  initialBalance?: number;
  positionSizePercent?: number;
  maxRiskPercent?: number;
  minRiskRewardRatio?: number;
  feeRate?: number;
  slippagePercent?: number;
}

export function toExecutionSettings(options: CodedBacktestOptions): ExecutionSettings {
  return {
    initialCapital: options.initialBalance,
    feeRate: options.feeRate,
    slippagePercent: options.slippagePercent,
    sizing: { type: "EQUITY_PERCENT", percent: (options.positionSizePercent ?? 1) * 100 },
    minRiskReward: options.minRiskRewardRatio,
    guardrails: options.maxRiskPercent !== undefined ? { maxRiskPerTradePercent: options.maxRiskPercent * 100 } : undefined,
  };
}

export function runCodedBacktest(candles: OHLC[], strategy: Strategy, options: CodedBacktestOptions = {}): BacktestResult {
  return simulate(candles, fromCodedStrategy(strategy), toExecutionSettings(options));
}

export interface LoadedCodedStrategy {
  strategy: Strategy;
  candles: OHLC[];
  interval: string; // the execution interval actually used
}

// Fetches the execution candles (plus the higher-timeframe series, for
// strategies that need one) from Binance and builds the strategy.
// Returns null for an unknown key or when Binance returns no candles.
export async function loadCodedStrategy(key: string, symbol: string, interval: string, limit: number): Promise<LoadedCodedStrategy | null> {
  const htf = HIGHER_TIMEFRAME[key];
  const runInterval = htf?.executionInterval ?? interval;

  let htfCandles: OHLC[] | undefined;
  if (htf) {
    const perHtfBar = intervalToMs(htf.interval) / intervalToMs(runInterval);
    const raw = await fetchCandlestickHistory(symbol, htf.interval, Math.ceil(limit / perHtfBar) + 50);
    if (raw.length > 0) htfCandles = parseCandlesticks(raw);
  }

  const strategy = createCodedStrategy(key, htfCandles);
  if (!strategy) return null;

  const raw = await fetchCandlestickHistory(symbol, runInterval, limit);
  if (raw.length === 0) return null;

  return { strategy, candles: parseCandlesticks(raw), interval: runInterval };
}

const DISPLAY_TRADES = 100;
const DISPLAY_EQUITY_POINTS = 500;

const timestamp = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);

// The per-symbol shape POST /api/backtest returns and saves. Metrics cover
// the whole run; only the trade list and equity curve are trimmed for display.
export function toRunResult(symbol: string, result: BacktestResult): BacktestRunResult {
  const m = result.metrics;
  return {
    symbol,
    strategyName: result.strategyName,
    totalTrades: m.count,
    winRate: (m.winRate ?? 0) * 100,
    finalBalance: m.finalEquity,
    totalReturnPercent: m.totalReturnPercent,
    maxDrawdownPercent: m.maxDrawdownPercent,
    trades: result.roundTrips.slice(-DISPLAY_TRADES).map((rt) => ({
      side: rt.side,
      entryTime: timestamp(rt.entryTime),
      entryPrice: rt.entryPrice,
      exitTime: timestamp(rt.exitTime),
      exitPrice: rt.exitPrice,
      quantity: rt.quantity,
      pnl: rt.netPnl,
      pnlPercent: (rt.netPnl / (rt.entryPrice * rt.quantity)) * 100,
      fees: rt.fees,
      rMultiple: rt.rMultiple,
      exitType: rt.exitType,
      legs: rt.legs.length,
    })),
    equityCurve: sampleEvenly(result.equityCurve.map((p) => p.equity), DISPLAY_EQUITY_POINTS),
    metrics: toStoredMetrics(m),
  };
}
