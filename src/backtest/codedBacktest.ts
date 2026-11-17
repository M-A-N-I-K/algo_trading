import { OHLC, parseCandlesticks } from "../indicators/utils";
import { BacktestResult, ExecutionSettings, fromCodedStrategy, simulate } from "../domain/backtesting";
import { CODED_STRATEGIES, createCodedStrategy, HIGHER_TIMEFRAME } from "../strategies/registry";
import { Strategy } from "../types/strategy";
import type { BacktestRunResult } from "../db/repositories/backtestRunRepository";
import { sampleEvenly, toStoredMetrics } from "../domain/backtesting/metrics";
import { fetchCandlestickHistory, intervalToMs } from "./fetchHistory";
import { feedSupports, readFeedCandles } from "../lib/mt5/feed";
import { isYahooMarket } from "../lib/markets/yahoo";

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
  // Notional cap as a multiple of equity (default 1, no leverage). A
  // positionSizePercent above 1 needs this raised to take effect.
  maxLeverage?: number;
}

export function toExecutionSettings(options: CodedBacktestOptions): ExecutionSettings {
  return {
    initialCapital: options.initialBalance,
    feeRate: options.feeRate,
    slippagePercent: options.slippagePercent,
    sizing: { type: "EQUITY_PERCENT", percent: (options.positionSizePercent ?? 1) * 100 },
    minRiskReward: options.minRiskRewardRatio,
    maxLeverage: options.maxLeverage,
    guardrails: options.maxRiskPercent !== undefined ? { maxRiskPerTradePercent: options.maxRiskPercent * 100 } : undefined,
  };
}

export function runCodedBacktest(candles: OHLC[], strategy: Strategy, options: CodedBacktestOptions = {}): BacktestResult {
  return simulate(candles, fromCodedStrategy(strategy), toExecutionSettings(options));
}

// Where a run's candles came from: the MT5 terminal's bar files (the prop
// firm's own prices, written by mt5/PB_BarFeed.mq5), else Binance or Yahoo.
export type CandleSource = "MT5" | "Binance" | "Yahoo";

export interface CandleSourceInfo {
  source: CandleSource;
  requested: number; // candles asked for
  candles: number; // candles actually used (fewer when the source has less history)
  from: number; // first candle's open time, UTC ms
  to: number;
}

export interface LoadedCodedStrategy {
  strategy: Strategy;
  candles: OHLC[];
  interval: string; // the execution interval actually used
  data: CandleSourceInfo;
}

// The terminal's closed bars for this market and interval, or null when the
// feed doesn't carry them. The files are history, so a stopped terminal
// (stale heartbeat) still counts: the run just ends at the last bar written.
async function mt5Candles(symbol: string, interval: string, now: number): Promise<OHLC[] | null> {
  if (!feedSupports(interval)) return null;
  const bars = (await readFeedCandles(symbol, interval))?.filter((b) => b.closeTime < now);
  return bars?.length ? bars : null;
}

// Builds the strategy and loads its candles. With `preferMt5`, the MT5 bar
// files are used whenever they carry the execution interval (and the
// higher timeframe, for strategies that need one), so a run never mixes the
// broker's prices with Binance's or Yahoo's. Otherwise, or when they don't,
// the candles come from Binance (Yahoo for currency pairs and indices).
// Returns null for an unknown key or when no source has candles.
export async function loadCodedStrategy(
  key: string,
  symbol: string,
  interval: string,
  limit: number,
  options: { preferMt5?: boolean; now?: number } = {},
): Promise<LoadedCodedStrategy | null> {
  if (!CODED_STRATEGIES[key]) return null;
  const htf = HIGHER_TIMEFRAME[key];
  const runInterval = htf?.executionInterval ?? interval;
  const now = options.now ?? Date.now();

  let source: CandleSource | null = null;
  let candles: OHLC[] = [];
  let htfCandles: OHLC[] | undefined;

  if (options.preferMt5) {
    const exec = await mt5Candles(symbol, runInterval, now);
    const higher = htf ? await mt5Candles(symbol, htf.interval, now) : null;
    if (exec && (!htf || higher)) {
      source = "MT5";
      candles = exec.slice(-limit);
      htfCandles = higher ?? undefined;
    }
  }

  if (!source) {
    if (htf) {
      const perHtfBar = intervalToMs(htf.interval) / intervalToMs(runInterval);
      const raw = await fetchCandlestickHistory(symbol, htf.interval, Math.ceil(limit / perHtfBar) + 50);
      if (raw.length > 0) htfCandles = parseCandlesticks(raw);
    }
    const raw = await fetchCandlestickHistory(symbol, runInterval, limit);
    if (raw.length === 0) return null;
    source = isYahooMarket(symbol) ? "Yahoo" : "Binance";
    candles = parseCandlesticks(raw);
  }

  const strategy = createCodedStrategy(key, htfCandles);
  if (!strategy) return null;
  return {
    strategy,
    candles,
    interval: runInterval,
    data: { source, requested: limit, candles: candles.length, from: candles[0].openTime, to: candles[candles.length - 1].openTime },
  };
}

const DISPLAY_TRADES = 100;
const DISPLAY_EQUITY_POINTS = 500;

const timestamp = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);

// The per-symbol shape POST /api/backtest returns and saves. Metrics cover
// the whole run; only the trade list and equity curve are trimmed for display.
export function toRunResult(symbol: string, result: BacktestResult, data?: CandleSourceInfo): BacktestRunResult {
  const m = result.metrics;
  return {
    symbol,
    ...(data ? { data } : {}),
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
