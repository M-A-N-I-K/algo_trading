import { StrategyVersionRecord, validateStrategyDefinition } from "@/domain/strategies";
import { StrategyDefinition } from "@/domain/strategies/definition";
import { candlesToOhlc } from "@/domain/strategies/marketAdapter";
import { CandleDataSource, dataSourceFor, HistoricalCandleSource, TIMEFRAME_MS } from "@/domain/market-data/historicalCandles";
import { Instrument, Timeframe } from "@/domain/market-data/types";
import { simulate } from "./simulate";
import { fromStrategyDefinition } from "./sources/strategyDefinition";
import { sampleEvenly, StoredBacktestMetrics, toStoredMetrics } from "./metrics";
import { BacktestConfigError, RoundTrip } from "./types";

// Runs a backtest of one saved Strategy Builder version and stores it.
//
// Requests that can't run (missing version, invalid definition, bad range)
// throw BacktestRequestError before anything is stored. Once a backtest is
// started it is always stored: COMPLETED with every round trip, or FAILED
// with the reason.

export const MAX_BACKTEST_CANDLES = 100_000;
const MIN_WARMUP_BARS = 100;
const CURVE_POINTS = 1000;

export interface BacktestRunSettings {
  initialCapital: number;
  feeRate: number;
  slippagePercent: number;
  maxLeverage: number;
  minRiskReward?: number;
}

export const DEFAULT_RUN_SETTINGS: BacktestRunSettings = {
  initialCapital: 10_000,
  feeRate: 0.0004,
  slippagePercent: 0.0002,
  maxLeverage: 1,
};

export interface BacktestRunRequest {
  userId: string;
  strategyId: string;
  version: number;
  range: { from: Date; to: Date };
  execution?: Partial<BacktestRunSettings>;
}

export interface BacktestConfiguration {
  range: { from: string; to: string };
  execution: BacktestRunSettings;
  market: { symbol: string; exchange: string; instrumentId: string; timeframe: Timeframe };
  dataSource: CandleDataSource;
  isDemo: boolean;
  candleCount: number; // candles inside the range
  warmupBars: number;
}

export interface StoredBacktestResult {
  configuration: BacktestConfiguration; // as finally resolved by the run
  metrics: { metrics: StoredBacktestMetrics; equityCurve: { time: number; equity: number }[]; drawdownCurve: { time: number; drawdownPercent: number }[] };
  roundTrips: RoundTrip[];
}

export interface StoredBacktest {
  id: string;
  userId: string;
  strategyId: string;
  strategyVersionId: string;
  configuration: BacktestConfiguration;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  metrics: StoredBacktestResult["metrics"] | null;
  roundTrips: RoundTrip[];
  error: string | null;
}

export interface BacktestStore {
  start(input: { userId: string; strategyId: string; strategyVersionId: string; configuration: BacktestConfiguration }): Promise<string>;
  complete(id: string, result: StoredBacktestResult): Promise<void>;
  fail(id: string, error: string): Promise<void>;
}

export interface RunStrategyBacktestDeps {
  versions: { getStrategyVersion(strategyId: string, version: number, userId: string): Promise<StrategyVersionRecord | null> };
  instruments: { getInstrumentById(id: string): Promise<Instrument | null> };
  candles: HistoricalCandleSource;
  store: BacktestStore;
}

export type BacktestRequestErrorCode = "NOT_FOUND" | "INVALID_STRATEGY" | "INVALID_RANGE" | "RANGE_TOO_LARGE";

export class BacktestRequestError extends Error {
  constructor(
    readonly code: BacktestRequestErrorCode,
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = "BacktestRequestError";
  }
}

export async function runStrategyBacktest(
  request: BacktestRunRequest,
  deps: RunStrategyBacktestDeps,
): Promise<{ backtestId: string; status: "COMPLETED" | "FAILED"; error?: string }> {
  const { from, to } = request.range;
  if (!(from instanceof Date) || !(to instanceof Date) || isNaN(+from) || isNaN(+to) || +from >= +to) {
    throw new BacktestRequestError("INVALID_RANGE", "Choose a start date before the end date.");
  }

  const version = await deps.versions.getStrategyVersion(request.strategyId, request.version, request.userId);
  if (!version) throw new BacktestRequestError("NOT_FOUND", "That strategy version doesn't exist.");
  const definition = version.definition;

  const validation = validateStrategyDefinition(definition);
  if (!validation.isReady) {
    throw new BacktestRequestError(
      "INVALID_STRATEGY",
      "Fix the strategy's validation issues before backtesting it.",
      validation.issues.map((i) => i.message),
    );
  }
  const instrumentId = definition.market.instrumentId;
  const instrument = instrumentId ? await deps.instruments.getInstrumentById(instrumentId) : null;
  if (!instrument) throw new BacktestRequestError("INVALID_STRATEGY", "Select an instrument for this strategy before backtesting it.");

  let source;
  try {
    source = fromStrategyDefinition(definition);
  } catch (e) {
    if (e instanceof BacktestConfigError) throw new BacktestRequestError("INVALID_STRATEGY", e.message);
    throw e;
  }

  const timeframe = definition.timeframe;
  const step = TIMEFRAME_MS[timeframe];
  const warmupBars = warmupBarsFor(definition);
  const rangeBars = Math.floor((+to - +from) / step) + 1;
  if (rangeBars + warmupBars > MAX_BACKTEST_CANDLES) {
    throw new BacktestRequestError(
      "RANGE_TOO_LARGE",
      `That range is ${rangeBars.toLocaleString()} ${timeframe} candles. Backtests are limited to ${MAX_BACKTEST_CANDLES.toLocaleString()}, including warm-up; choose a shorter range or a longer timeframe.`,
    );
  }

  const execution: BacktestRunSettings = { ...DEFAULT_RUN_SETTINGS, ...stripUndefined(request.execution ?? {}) };
  const configuration: BacktestConfiguration = {
    range: { from: from.toISOString(), to: to.toISOString() },
    execution,
    market: { symbol: instrument.symbol, exchange: instrument.exchange, instrumentId: instrument.id, timeframe },
    dataSource: dataSourceFor(instrument.exchange),
    isDemo: dataSourceFor(instrument.exchange) === "demo",
    candleCount: 0,
    warmupBars,
  };

  const backtestId = await deps.store.start({
    userId: request.userId,
    strategyId: request.strategyId,
    strategyVersionId: version.id,
    configuration: { ...configuration },
  });

  try {
    const range = await deps.candles.getRange(instrument, timeframe, new Date(+from - warmupBars * step), to);
    const ohlc = candlesToOhlc(range.candles);
    const actualWarmup = ohlc.filter((c) => c.openTime < +from).length;
    const inRange = ohlc.length - actualWarmup;
    configuration.dataSource = range.source;
    configuration.isDemo = range.source === "demo" || range.candles.some((c) => c.isDemo);
    configuration.candleCount = inRange;
    configuration.warmupBars = actualWarmup;
    if (inRange === 0) throw new Error(`No candles for ${instrument.symbol} ${timeframe} between ${configuration.range.from} and ${configuration.range.to}.`);

    const result = simulate(ohlc, source, {
      initialCapital: execution.initialCapital,
      feeRate: execution.feeRate,
      slippagePercent: execution.slippagePercent,
      maxLeverage: execution.maxLeverage,
      minRiskReward: execution.minRiskReward,
      lotSize: instrument.lotSize > 0 ? instrument.lotSize : undefined,
      warmupBars: actualWarmup,
    });

    await deps.store.complete(backtestId, {
      configuration,
      metrics: {
        metrics: toStoredMetrics(result.metrics),
        equityCurve: sampleEvenly(result.equityCurve, CURVE_POINTS),
        drawdownCurve: sampleEvenly(drawdownCurve(result.equityCurve, execution.initialCapital), CURVE_POINTS),
      },
      roundTrips: result.roundTrips,
    });
    return { backtestId, status: "COMPLETED" };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await deps.store.fail(backtestId, error);
    return { backtestId, status: "FAILED", error };
  }
}

// Bars of history loaded before the range: the definition's longest
// indicator period or lookback × 3, at least MIN_WARMUP_BARS.
export function warmupBarsFor(definition: StrategyDefinition): number {
  let longest = 0;
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === "number" && /period$|lookback$/i.test(key)) longest = Math.max(longest, value);
      else visit(value);
    }
  };
  visit(definition);
  return Math.max(MIN_WARMUP_BARS, Math.ceil(longest * 3));
}

function drawdownCurve(equity: { time: number; equity: number }[], initialCapital: number) {
  let peak = initialCapital;
  return equity.map(({ time, equity: e }) => {
    peak = Math.max(peak, e);
    return { time, drawdownPercent: peak > 0 ? ((peak - e) / peak) * 100 : 0 };
  });
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && !Number.isNaN(v))) as Partial<T>;
}
