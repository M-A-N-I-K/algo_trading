import { describe, expect, it } from "vitest";
import type { OHLC } from "@/indicators/utils";
import type { Signal, Strategy, TradeTarget } from "@/types/strategy";
import { qualify, scanStrategy } from "./scan";

const HOUR = 3_600_000;
type Row = [number, number, number, number];
const bars = (rows: Row[]): OHLC[] =>
  rows.map(([open, high, low, close], i) => ({ openTime: i * HOUR, closeTime: (i + 1) * HOUR - 1, open, high, low, close, volume: 1 }));

// The liquidity-reversal test setup (see its strategy test): with swing
// lookback 3 that pattern doesn't fit, so these tests use the strategy's
// defaults on a long flat series and only check the scan's plumbing.
const flat = (n: number): Row[] => Array.from({ length: n }, () => [100, 100.5, 99.5, 100] as Row);

describe("scanStrategy", () => {
  it("reports backtest stats and no signal on a market that never moves", () => {
    const candles = bars(flat(300));
    const row = scanStrategy({ strategyKey: "liquidity-reversal", symbol: "BTCUSDT", interval: "1h", candles, now: 300 * HOUR });
    expect(row).toMatchObject({
      id: "liquidity-reversal:BTCUSDT:1h",
      strategyName: "Liquidity Reversal (Sweep + Shift)",
      lastClose: 100,
      lastCloseTime: 300 * HOUR - 1,
      signal: null,
      qualified: false,
    });
    expect(row!.stats.trades).toBe(0);
  });

  it("returns null for an unknown strategy or no candles", () => {
    expect(scanStrategy({ strategyKey: "nope", symbol: "BTCUSDT", interval: "1h", candles: bars(flat(5)), now: 0 })).toBeNull();
    expect(scanStrategy({ strategyKey: "liquidity-reversal", symbol: "BTCUSDT", interval: "1h", candles: [], now: 0 })).toBeNull();
  });
});

// A strategy that buys on the given bars with fixed stop and target.
function stub(buys: Record<number, TradeTarget>): Strategy {
  let n = 0;
  return {
    name: "Stub",
    generateSignals(candles) {
      n = candles.length;
      return candles.map((_, i): Signal => (buys[i] ? "BUY" : "HOLD"));
    },
    getTradeTargets: () => Array.from({ length: n }, (_, i) => buys[i] ?? null),
  };
}

function scanWith(rows: Row[], buys: Record<number, TradeTarget>, now = rows.length * HOUR) {
  return scanStrategy({ strategyKey: "stub", symbol: "BTCUSDT", interval: "1h", candles: bars(rows), now, strategy: stub(buys) })!;
}

describe("scanStrategy latest signal", () => {
  it("flags a signal on the last closed candle as new, priced off its close", () => {
    const row = scanWith(flat(10), { 9: { stopLoss: 98, takeProfit: 106 } });
    expect(row.signal).toMatchObject({ status: "new", side: "LONG", entry: 100, stop: 98, target: 106, rr: 3 });
  });

  it("shows a trade still running as open, marked at the last close", () => {
    const rows = flat(10);
    rows[9] = [100, 101.5, 99.5, 101];
    const row = scanWith(rows, { 5: { stopLoss: 98, takeProfit: 106 } });
    expect(row.signal).toMatchObject({ status: "open", entry: 100, stop: 98, target: 106, rMultiple: 0.5 });
  });

  it("shows a recent trade that hit its target, and drops it once it's old", () => {
    const rows = flat(10);
    rows[8] = [100, 107, 99.5, 105];
    const row = scanWith(rows, { 5: { stopLoss: 98, takeProfit: 106 } });
    expect(row.signal).toMatchObject({ status: "target", exitPrice: 106 });
    expect(scanWith(rows, { 5: { stopLoss: 98, takeProfit: 106 } }, 10 * 24 * HOUR).signal).toBeNull();
  });

  it("ignores a new signal while the backtest is already in a trade", () => {
    const row = scanWith(flat(10), { 5: { stopLoss: 98, takeProfit: 106 }, 9: { stopLoss: 97, takeProfit: 110 } });
    expect(row.signal).toMatchObject({ status: "open", stop: 98 });
  });
});

describe("qualify", () => {
  const base = {
    trades: 40, winRatePct: 40, profitFactor: 1.5, returnPct: 30, maxDrawdownPct: 10, days: 730,
    annualReturnPct: 14, buyHoldPct: 5, firstHalfPct: 10, secondHalfPct: 18,
  };
  it("passes a strategy that clears every bar", () => {
    expect(qualify(base)).toEqual([]);
  });
  it("names each bar a strategy misses", () => {
    expect(qualify({ ...base, days: 200 })).toEqual(["only 200 days of history"]);
    expect(qualify({ ...base, trades: 12 })).toEqual(["only 12 trades"]);
    expect(qualify({ ...base, profitFactor: 1.2 })).toEqual(["profit factor 1.20"]);
    expect(qualify({ ...base, annualReturnPct: 5 })).toEqual(["5.0% a year"]);
    expect(qualify({ ...base, buyHoldPct: 40 })).toEqual(["didn't beat buy & hold (40.0%)"]);
    expect(qualify({ ...base, maxDrawdownPct: 25 })).toEqual(["25.0% drawdown"]);
    expect(qualify({ ...base, firstHalfPct: -3 })).toEqual(["halves -3.0% / 18.0%"]);
  });
});
