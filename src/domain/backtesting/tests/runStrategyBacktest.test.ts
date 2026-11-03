import { describe, expect, it } from "vitest";
import { StrategyDefinition, StrategyVersionRecord } from "@/domain/strategies";
import { Candle, Instrument, Timeframe } from "@/domain/market-data/types";
import { CandleRange, HistoricalCandleSource } from "@/domain/market-data/historicalCandles";
import { BacktestRequestError, BacktestStore, runStrategyBacktest, StoredBacktest } from "../runStrategyBacktest";

const HOUR = 3_600_000;
const FROM = Date.UTC(2026, 9, 10);
const TO = FROM + 48 * HOUR;

const btc: Instrument = {
  id: "btc",
  symbol: "BTCUSDT",
  exchange: "BINANCE",
  assetType: "CRYPTO",
  currency: "USDT",
  tickSize: 0.01,
  lotSize: 0.00001,
  isActive: true,
  createdAt: "",
  updatedAt: "",
};

const group = (left: object, operator: string, right: object) => ({
  type: "group" as const,
  id: "g",
  operator: "AND" as const,
  negate: false,
  conditions: [{ type: "condition" as const, id: "c", negate: false, left, operator, right }],
});

// Long when close crosses above EMA(20); 1% stop, 2R target.
function definition(overrides: Partial<StrategyDefinition> = {}): StrategyDefinition {
  return {
    metadata: { name: "EMA reclaim", description: "", strategyType: "CUSTOM" },
    market: { symbol: "BTCUSDT", instrumentId: "btc" },
    timeframe: "1h",
    direction: "LONG_ONLY",
    entry: {
      long: {
        conditions: group({ type: "price", field: "CLOSE" }, "CROSSES_ABOVE", { type: "indicator", indicator: "EMA", parameters: { period: 20 } }) as never,
        order: { type: "MARKET" },
      },
    },
    exit: { stopLoss: { type: "PERCENTAGE", percent: 1 }, takeProfit: { type: "R_MULTIPLE", multiple: 2 } },
    positionSizing: { type: "RISK_PERCENT", percent: 1 },
    risk: {},
    ...overrides,
  };
}

// Hourly candles oscillating around 100 so EMA crosses happen regularly.
function candlesBetween(fromMs: number, toMs: number, isDemo = false): Candle[] {
  const out: Candle[] = [];
  for (let t = Math.ceil(fromMs / HOUR) * HOUR; t <= toMs; t += HOUR) {
    const i = t / HOUR;
    const close = 100 + 3 * Math.sin(i / 4);
    const open = 100 + 3 * Math.sin((i - 1) / 4);
    out.push({
      instrumentId: "btc",
      timestamp: new Date(t).toISOString(),
      timeframe: "1h",
      open,
      high: Math.max(open, close) + 0.3,
      low: Math.min(open, close) - 0.3,
      close,
      volume: 1,
      isDemo,
    });
  }
  return out;
}

function harness(opts: { def?: StrategyDefinition; candles?: HistoricalCandleSource; instrument?: Instrument | null; isDemo?: boolean } = {}) {
  const def = opts.def ?? definition();
  const version: StrategyVersionRecord = { id: "v1-id", strategyId: "s1", version: 1, definition: def, createdAt: "" };
  const calls: { from: Date; to: Date; timeframe: Timeframe }[] = [];
  const saved: StoredBacktest[] = [];
  const events: string[] = [];

  const store: BacktestStore = {
    async start(input) {
      events.push("start");
      saved.push({ ...input, id: `bt${saved.length + 1}`, status: "RUNNING", metrics: null, roundTrips: [], error: null });
      return saved[saved.length - 1].id;
    },
    async complete(id, result) {
      events.push("complete");
      Object.assign(saved.find((b) => b.id === id)!, { status: "COMPLETED", ...result });
    },
    async fail(id, error) {
      events.push("fail");
      Object.assign(saved.find((b) => b.id === id)!, { status: "FAILED", error });
    },
  };

  const candles: HistoricalCandleSource =
    opts.candles ??
    {
      async getRange(_instrument, timeframe, from, to): Promise<CandleRange> {
        calls.push({ from, to, timeframe });
        return { candles: candlesBetween(+from, +to, opts.isDemo), source: opts.isDemo ? "demo" : "binance-spot", fetched: 0 };
      },
    };

  const deps = {
    versions: { getStrategyVersion: async (strategyId: string, v: number, userId: string) => (strategyId === "s1" && v === 1 && userId === "u1" ? version : null) },
    instruments: { getInstrumentById: async (id: string) => (opts.instrument === null ? null : id === "btc" ? (opts.instrument ?? btc) : null) },
    candles,
    store,
  };
  return { deps, calls, saved, events };
}

const request = (overrides = {}) => ({
  userId: "u1",
  strategyId: "s1",
  version: 1,
  range: { from: new Date(FROM), to: new Date(TO) },
  execution: { initialCapital: 10_000, feeRate: 0.0004, slippagePercent: 0.0002, maxLeverage: 1 },
  ...overrides,
});

describe("runStrategyBacktest", () => {
  it("runs a saved version and stores every round trip with full metrics", async () => {
    const h = harness();
    const outcome = await runStrategyBacktest(request(), h.deps);

    expect(outcome.status).toBe("COMPLETED");
    expect(h.events).toEqual(["start", "complete"]);
    const [bt] = h.saved;
    expect(bt.strategyVersionId).toBe("v1-id");
    expect(bt.roundTrips.length).toBeGreaterThan(0);
    expect(bt.roundTrips.length).toBe(bt.metrics!.metrics.count);
    expect(bt.metrics!.equityCurve.length).toBeGreaterThan(0);
    expect(bt.metrics!.drawdownCurve.length).toBe(bt.metrics!.equityCurve.length);
  });

  it("records the market, data source and run settings it actually used", async () => {
    const h = harness();
    await runStrategyBacktest(request(), h.deps);
    const c = h.saved[0].configuration;
    expect(c.market).toEqual({ symbol: "BTCUSDT", exchange: "BINANCE", instrumentId: "btc", timeframe: "1h" });
    expect(c.dataSource).toBe("binance-spot");
    expect(c.isDemo).toBe(false);
    expect(c.range).toEqual({ from: new Date(FROM).toISOString(), to: new Date(TO).toISOString() });
    expect(c.execution).toMatchObject({ initialCapital: 10_000, feeRate: 0.0004, slippagePercent: 0.0002, maxLeverage: 1 });
  });

  it("loads warm-up bars before the range so indicators are ready, and trades only inside the range", async () => {
    const h = harness();
    await runStrategyBacktest(request(), h.deps);

    // Largest period 20 × 3 = 60, but never fewer than 100.
    expect(h.calls[0].from.getTime()).toBe(FROM - 100 * HOUR);
    expect(h.saved[0].configuration.warmupBars).toBe(100);
    expect(h.saved[0].roundTrips.every((rt) => rt.entryTime >= FROM)).toBe(true);
    expect(h.saved[0].configuration.candleCount).toBe(49);
  });

  it("sizes warm-up from the definition's longest lookback", async () => {
    const def = definition();
    def.entry.long!.conditions = group({ type: "price", field: "CLOSE" }, "GREATER_THAN", {
      type: "indicator",
      indicator: "EMA",
      parameters: { period: 200 },
    }) as never;
    const h = harness({ def });
    await runStrategyBacktest(request(), h.deps);
    expect(h.saved[0].configuration.warmupBars).toBe(600);
  });

  it("marks backtests on demo instruments as synthetic data", async () => {
    const h = harness({ isDemo: true, instrument: { ...btc, exchange: "NSE", assetType: "INDEX" } });
    await runStrategyBacktest(request(), h.deps);
    expect(h.saved[0].configuration.isDemo).toBe(true);
    expect(h.saved[0].configuration.dataSource).toBe("demo");
  });

  it("rejects a version that doesn't exist or isn't the user's, without creating a backtest", async () => {
    const h = harness();
    await expect(runStrategyBacktest(request({ userId: "someone-else" }), h.deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(runStrategyBacktest(request({ version: 9 }), h.deps)).rejects.toBeInstanceOf(BacktestRequestError);
    expect(h.saved).toHaveLength(0);
  });

  it("rejects a definition that fails validation, listing the issues", async () => {
    const h = harness({ def: definition({ entry: {} }) });
    await expect(runStrategyBacktest(request(), h.deps)).rejects.toMatchObject({ code: "INVALID_STRATEGY" });
    expect(h.saved).toHaveLength(0);
  });

  it("rejects a strategy without a selected instrument", async () => {
    const h = harness({ def: definition({ market: { symbol: "BTCUSDT" } }) });
    await expect(runStrategyBacktest(request(), h.deps)).rejects.toMatchObject({ code: "INVALID_STRATEGY" });
  });

  it("rejects an empty or reversed range, and ranges over the candle cap", async () => {
    const h = harness();
    await expect(runStrategyBacktest(request({ range: { from: new Date(TO), to: new Date(FROM) } }), h.deps)).rejects.toMatchObject({
      code: "INVALID_RANGE",
    });
    const huge = { from: new Date(FROM - 200_000 * HOUR), to: new Date(TO) };
    await expect(runStrategyBacktest(request({ range: huge }), h.deps)).rejects.toMatchObject({ code: "RANGE_TOO_LARGE" });
    expect(h.saved).toHaveLength(0);
  });

  it("records a FAILED backtest with the reason when candles can't be loaded", async () => {
    const h = harness({
      candles: {
        async getRange() {
          throw new Error("Binance returned 503");
        },
      },
    });
    const outcome = await runStrategyBacktest(request(), h.deps);
    expect(outcome.status).toBe("FAILED");
    expect(h.events).toEqual(["start", "fail"]);
    expect(h.saved[0].error).toContain("Binance returned 503");
  });

  it("fails clearly when the range has no candles", async () => {
    const h = harness({
      candles: { getRange: async () => ({ candles: [], source: "binance-spot", fetched: 0 }) },
    });
    const outcome = await runStrategyBacktest(request(), h.deps);
    expect(outcome.status).toBe("FAILED");
    expect(h.saved[0].error).toMatch(/no candles/i);
  });
});
