import { describe, expect, it } from "vitest";
import { OHLC } from "@/indicators/utils";
import { simulate } from "../simulate";
import { Decision, SignalSource, TradeLevels } from "../types";

const BAR_MS = 15 * 60 * 1000;

// [open, high, low, close]
function bars(rows: [number, number, number, number][], startMs = 0): OHLC[] {
  return rows.map(([open, high, low, close], i) => ({
    openTime: startMs + i * BAR_MS,
    closeTime: startMs + (i + 1) * BAR_MS - 1,
    open,
    high,
    low,
    close,
    volume: 1,
  }));
}

const flat = (n: number, price = 100): [number, number, number, number][] =>
  Array.from({ length: n }, () => [price, price + 1, price - 1, price]);

// A signal source scripted bar by bar: { [barIndex]: decision }.
function scripted(script: Record<number, Decision>, extra: Partial<SignalSource> = {}): SignalSource {
  return {
    name: "scripted",
    prepare: () => ({ decide: (t) => script[t] ?? {} }),
    ...extra,
  };
}

const long = (levels: TradeLevels = {}): Decision => ({ enter: { side: "LONG", levels: () => levels } });
const short = (levels: TradeLevels = {}): Decision => ({ enter: { side: "SHORT", levels: () => levels } });

const noCosts = { feeRate: 0, initialCapital: 10_000 };

describe("simulate: fills", () => {
  it("fills an entry signalled on bar t at bar t+1's open, and closes at the target", () => {
    const candles = bars([
      [100, 101, 99, 100],
      [100, 101, 99, 100], // signal
      [101, 103, 100, 102], // entry fills at 101
      [102, 111, 101, 110], // target 110 hit
      [110, 111, 109, 110],
    ]);

    const result = simulate(candles, scripted({ 1: long({ stop: 95, target: 110 }) }), noCosts);

    expect(result.roundTrips).toHaveLength(1);
    const [rt] = result.roundTrips;
    expect(rt.entryIndex).toBe(2);
    expect(rt.entryPrice).toBe(101);
    expect(rt.exitType).toBe("target");
    expect(rt.exitPrice).toBe(110);
    expect(rt.quantity).toBeCloseTo(10_000 / 101, 9);
    expect(rt.netPnl).toBeCloseTo(891.0891089, 5);
  });

  it("takes the stop when one bar touches both the stop and the target", () => {
    const candles = bars([...flat(2), [100, 112, 94, 100], ...flat(1)]);
    const [rt] = simulate(candles, scripted({ 0: long({ stop: 95, target: 110 }) }), noCosts).roundTrips;
    expect(rt.exitType).toBe("stop");
    expect(rt.exitPrice).toBe(95);
  });

  it("fills at the open, not the stop, when price gaps through the stop", () => {
    const candles = bars([...flat(2), [90, 91, 88, 89], ...flat(1, 89)]);
    const [rt] = simulate(candles, scripted({ 0: long({ stop: 95, target: 110 }) }), noCosts).roundTrips;
    expect(rt.exitType).toBe("stop");
    expect(rt.exitPrice).toBe(90);
  });

  it("skips an entry whose fill has already gapped past its stop", () => {
    const candles = bars([...flat(1), [94, 95, 93, 94], ...flat(2, 94)]);
    const result = simulate(candles, scripted({ 0: long({ stop: 95, target: 110 }) }), noCosts);
    expect(result.roundTrips).toHaveLength(0);
  });

  it("skips a short whose fill has already gapped past its stop", () => {
    const candles = bars([...flat(1), [106, 107, 105, 106], ...flat(2, 106)]);
    const result = simulate(candles, scripted({ 0: short({ stop: 105, target: 90 }) }), noCosts);
    expect(result.roundTrips).toHaveLength(0);
  });

  it("closes a position still open after the last bar at its close, as end-of-data", () => {
    const candles = bars([...flat(2), [100, 104, 99, 103]]);
    const result = simulate(candles, scripted({ 0: long() }), noCosts);
    const [rt] = result.roundTrips;
    expect(rt.exitType).toBe("end-of-data");
    expect(rt.exitPrice).toBe(103);
    expect(result.metrics.endOfDataExits).toBe(1);
    expect(result.equityCurve[2].equity).toBeCloseTo(10_300, 6);
  });
});

describe("simulate: costs", () => {
  it("charges the fee on each leg and moves every fill against the trader by the slippage", () => {
    const candles = bars([...flat(1), [100, 101, 99, 100], [100, 111, 99, 110], ...flat(1, 110)]);
    const [rt] = simulate(candles, scripted({ 0: long({ stop: 90, target: 110 }) }), {
      initialCapital: 10_000,
      feeRate: 0.001,
      slippagePercent: 0.001,
    }).roundTrips;

    expect(rt.entryPrice).toBeCloseTo(100.1, 9);
    expect(rt.exitPrice).toBeCloseTo(109.89, 9);
    expect(rt.grossPnl).toBeCloseTo(978.021978, 5);
    expect(rt.fees).toBeCloseTo(20.978022, 5);
    expect(rt.netPnl).toBeCloseTo(957.043956, 5);
    expect(rt.funding).toBe(0);
  });

  it("slips a short's entry down and its exit up", () => {
    const candles = bars([...flat(1), [100, 101, 99, 100], [100, 101, 89, 90], ...flat(1, 90)]);
    const [rt] = simulate(candles, scripted({ 0: short({ stop: 110, target: 90 }) }), {
      feeRate: 0,
      slippagePercent: 0.01,
    }).roundTrips;
    expect(rt.entryPrice).toBeCloseTo(99, 9);
    expect(rt.exitPrice).toBeCloseTo(90.9, 9);
  });
});

describe("simulate: partial exits and trailing stops", () => {
  it("records partial take-profits as legs of one round trip, counted once in the metrics", () => {
    const candles = bars([
      ...flat(2),
      [100, 106, 99, 105], // partial: half at 105
      [105, 111, 104, 110], // remainder at target 110
      ...flat(1, 110),
    ]);
    const result = simulate(
      candles,
      scripted({ 0: long({ stop: 95, target: 110, partials: [{ price: 105, portion: 0.5 }] }) }),
      noCosts,
    );

    expect(result.roundTrips).toHaveLength(1);
    const [rt] = result.roundTrips;
    expect(rt.legs.map((l) => l.exitType)).toEqual(["partial", "target"]);
    expect(rt.exitType).toBe("target");
    expect(rt.exitPrice).toBeCloseTo(107.5, 9);
    expect(rt.netPnl).toBeCloseTo(750, 6); // 100 units: 50 × 5 + 50 × 10
    expect(result.metrics.count).toBe(1);
    expect(result.metrics.wins).toBe(1);
  });

  it("ends the round trip by stop when the stop takes what the partial left", () => {
    const candles = bars([...flat(2), [100, 106, 99, 105], [105, 105, 94, 95], ...flat(1, 95)]);
    const [rt] = simulate(
      candles,
      scripted({ 0: long({ stop: 95, target: 110, partials: [{ price: 105, portion: 0.5 }] }) }),
      noCosts,
    ).roundTrips;
    expect(rt.legs.map((l) => l.exitType)).toEqual(["partial", "stop"]);
    expect(rt.exitType).toBe("stop");
    expect(rt.netPnl).toBeCloseTo(0, 6); // +250 then −250
  });

  it("ratchets the stop behind each bar's high once price moves triggerR × risk in favour", () => {
    const candles = bars([
      ...flat(2), // fill at 100, risk 5
      [100, 106, 101, 105], // +6 ≥ 1R → stop to 106 − 3 = 103
      [105, 105, 102, 102], // trailing stop 103 hit
      ...flat(1, 102),
    ]);
    const [rt] = simulate(
      candles,
      scripted({ 0: long({ stop: 95, target: 200, trailing: { triggerR: 1, distance: 3 } }) }),
      noCosts,
    ).roundTrips;
    expect(rt.exitType).toBe("trailing-stop");
    expect(rt.exitPrice).toBe(103);
    expect(rt.initialRisk).toBeCloseTo(500, 6);
  });
});

describe("simulate: position sizing", () => {
  // Signal on bar 0, fill at 100 on bar 1, nothing else happens.
  const quiet = bars(flat(4));
  const qtyOf = (source: SignalSource, execution = {}) =>
    simulate(quiet, source, { ...noCosts, ...execution }).roundTrips[0]?.quantity;

  it("defaults to the whole account's equity", () => {
    expect(qtyOf(scripted({ 0: long() }))).toBeCloseTo(100, 9);
  });

  it("sizes RISK_PERCENT so the stop loses that share of equity", () => {
    const qty = qtyOf(scripted({ 0: long({ stop: 95 }) }), { sizing: { type: "RISK_PERCENT", percent: 1 } });
    expect(qty).toBeCloseTo(20, 9); // 1% of 10 000 = 100 / 5 per unit
  });

  it("supports fractional quantities for risk sizing when no lot size is set", () => {
    const qty = qtyOf(scripted({ 0: long({ stop: 95 }) }), { sizing: { type: "RISK_AMOUNT", amount: 7 } });
    expect(qty).toBeCloseTo(1.4, 9);
  });

  it("supports FIXED_QUANTITY and FIXED_CAPITAL", () => {
    expect(qtyOf(scripted({ 0: long() }), { sizing: { type: "FIXED_QUANTITY", quantity: 3 } })).toBe(3);
    expect(qtyOf(scripted({ 0: long() }), { sizing: { type: "FIXED_CAPITAL", capital: 2500 } })).toBeCloseTo(25, 9);
  });

  it("skips a risk-sized entry that has no stop to size from", () => {
    expect(qtyOf(scripted({ 0: long() }), { sizing: { type: "RISK_PERCENT", percent: 1 } })).toBeUndefined();
  });

  it("caps notional at equity × maxLeverage", () => {
    const tightStop = scripted({ 0: long({ stop: 99.9 }) });
    const sizing = { type: "RISK_PERCENT", percent: 10 } as const; // would be 10 000 units
    expect(qtyOf(tightStop, { sizing })).toBeCloseTo(100, 9);
    expect(qtyOf(tightStop, { sizing, maxLeverage: 5 })).toBeCloseTo(500, 9);
  });

  it("rounds down to whole lots when a lot size is given", () => {
    expect(qtyOf(scripted({ 0: long() }), { lotSize: 7 })).toBe(98);
  });

  it("uses the source's own sizing unless the execution settings override it", () => {
    const source = scripted({ 0: long({ stop: 95 }) }, { sizing: { type: "RISK_PERCENT", percent: 1 } });
    expect(qtyOf(source)).toBeCloseTo(20, 9);
    expect(qtyOf(source, { sizing: { type: "FIXED_QUANTITY", quantity: 2 } })).toBe(2);
  });
});

describe("simulate: guardrails", () => {
  const quiet = bars(flat(4));
  const qtyOf = (source: SignalSource, execution = {}) =>
    simulate(quiet, source, { ...noCosts, ...execution }).roundTrips[0]?.quantity;

  it("caps size so one trade never risks more than maxRiskPerTradePercent", () => {
    const qty = qtyOf(scripted({ 0: long({ stop: 95 }) }), {
      sizing: { type: "RISK_PERCENT", percent: 1 },
      guardrails: { maxRiskPerTradePercent: 0.5 },
    });
    expect(qty).toBeCloseTo(10, 9);
  });

  it("caps notional at maxPositionSizeCapital", () => {
    expect(qtyOf(scripted({ 0: long() }), { guardrails: { maxPositionSizeCapital: 2000 } })).toBeCloseTo(20, 9);
  });

  it("blocks new entries for the rest of the UTC day once maxDailyLossPercent is lost", () => {
    const BARS_PER_DAY = 96;
    const rows = flat(BARS_PER_DAY * 2);
    rows[2] = [100, 100, 97, 98]; // first trade stopped at 98: −2% of equity
    const candles = bars(rows);
    const source = scripted({
      0: long({ stop: 98 }),
      5: long({ stop: 90 }), // same day: blocked
      [BARS_PER_DAY]: long({ stop: 90 }), // next day: allowed
    });

    const result = simulate(candles, source, { ...noCosts, guardrails: { maxDailyLossPercent: 1 } });
    expect(result.roundTrips.map((rt) => rt.entryIndex)).toEqual([1, BARS_PER_DAY + 1]);
  });
});

describe("simulate: decisions", () => {
  const quiet = bars(flat(6));

  it("ignores an opposite signal while a position is open, by default", () => {
    const result = simulate(quiet, scripted({ 0: long(), 2: short() }), noCosts);
    expect(result.roundTrips.map((rt) => [rt.side, rt.entryIndex, rt.exitType])).toEqual([["LONG", 1, "end-of-data"]]);
  });

  it("closes and reverses on an opposite signal when reverseOnOppositeSignal is on", () => {
    const result = simulate(quiet, scripted({ 0: long(), 2: short() }), { ...noCosts, reverseOnOppositeSignal: true });
    expect(result.roundTrips.map((rt) => [rt.side, rt.entryIndex, rt.exitIndex, rt.exitType])).toEqual([
      ["LONG", 1, 3, "signal"],
      ["SHORT", 3, 5, "end-of-data"],
    ]);
  });

  it("takes reverseOnOppositeSignal from the source when execution doesn't set it", () => {
    const source = scripted({ 0: long(), 2: short() }, { reverseOnOppositeSignal: true });
    expect(simulate(quiet, source, noCosts).roundTrips).toHaveLength(2);
  });

  it("fills a signal exit decided at bar t's close at bar t+1's open", () => {
    const candles = bars([...flat(3), [104, 105, 103, 104], ...flat(2, 104)]);
    const [rt] = simulate(candles, scripted({ 0: long(), 2: { exit: true } }), noCosts).roundTrips;
    expect(rt.exitType).toBe("signal");
    expect(rt.exitIndex).toBe(3);
    expect(rt.exitPrice).toBe(104);
  });

  it("closes at the open of the bar the source marks for a time exit", () => {
    const source: SignalSource = {
      name: "timed",
      prepare: () => ({ decide: (t) => (t === 0 ? long() : {}), exitAtOpen: (t) => t === 4 }),
    };
    const [rt] = simulate(quiet, source, noCosts).roundTrips;
    expect(rt.exitType).toBe("time");
    expect(rt.exitIndex).toBe(4);
  });

  it("skips entries whose reward-to-risk at the actual fill is below minRiskReward", () => {
    const thin = simulate(quiet, scripted({ 0: long({ stop: 95, target: 105 }) }), { ...noCosts, minRiskReward: 1.5 });
    const wide = simulate(quiet, scripted({ 0: long({ stop: 95, target: 110 }) }), { ...noCosts, minRiskReward: 1.5 });
    expect(thin.roundTrips).toHaveLength(0);
    expect(wide.roundTrips).toHaveLength(1);
  });

  it("records the worst and best excursion while the position was open", () => {
    const candles = bars([...flat(2), [100, 104, 96, 100], ...flat(1)]);
    const [rt] = simulate(candles, scripted({ 0: long() }), noCosts).roundTrips;
    expect(rt.mae).toBeCloseTo(400, 6);
    expect(rt.mfe).toBeCloseTo(400, 6);
  });
});

describe("simulate: metrics", () => {
  // Trade A: long 100 → dips to a 90 close → target 110 (+1000).
  // Trade B: long 110 → stopped at 104 (−600).
  const candles = bars([
    [100, 101, 99, 100],
    [100, 101, 99, 100],
    [100, 100, 89, 90],
    [90, 111, 90, 110],
    [110, 111, 103, 105],
    [105, 106, 104, 105],
  ]);
  const source = scripted({
    0: long({ stop: 85, target: 110 }),
    3: long({ stop: 104, target: 130 }),
  });
  const { metrics } = simulate(candles, source, noCosts);

  it("counts round trips for win rate, profit factor and expectancy", () => {
    expect(metrics.count).toBe(2);
    expect(metrics.winRate).toBe(0.5);
    expect(metrics.profitFactor).toBeCloseTo(1000 / 600, 9);
    expect(metrics.expectancy).toBeCloseTo(200, 6);
    expect(metrics.avgR).toBeCloseTo((1000 / 1500 - 1) / 2, 9);
  });

  it("reports return on starting capital", () => {
    expect(metrics.netPnl).toBeCloseTo(400, 6);
    expect(metrics.finalEquity).toBeCloseTo(10_400, 6);
    expect(metrics.totalReturnPercent).toBeCloseTo(4, 9);
  });

  it("measures drawdown on the mark-to-market curve, so an open trade's dip counts", () => {
    expect(metrics.maxDrawdownPercent).toBeCloseTo(10, 9); // 10 000 → 9 000 at bar 2's close
  });

  it("reports exposure and test period", () => {
    expect(metrics.exposurePercent).toBeCloseTo((4 / 6) * 100, 9);
    expect(metrics.testPeriodDays).toBeCloseTo((6 * 15 * 60_000 - 1) / 86_400_000, 9);
  });

  it("returns one equity point per bar", () => {
    const { equityCurve } = simulate(candles, source, noCosts);
    expect(equityCurve.map((p) => Math.round(p.equity))).toEqual([10_000, 10_000, 9_000, 11_000, 10_400, 10_400]);
  });
});

describe("simulate: warm-up", () => {
  it("takes no entries during warm-up and starts the equity curve and metrics at the first live bar", () => {
    const candles = bars(flat(8));
    const result = simulate(candles, scripted({ 0: long(), 1: long(), 3: long() }), { ...noCosts, warmupBars: 3 });

    expect(result.roundTrips.map((rt) => rt.entryIndex)).toEqual([4]); // decisions at bars 0–1 are warm-up
    expect(result.equityCurve).toHaveLength(5);
    expect(result.equityCurve[0].time).toBe(candles[3].closeTime);
    expect(result.metrics.exposurePercent).toBeCloseTo((4 / 5) * 100, 9);
    expect(result.metrics.testPeriodDays).toBeCloseTo((5 * 15 * 60_000 - 1) / 86_400_000, 9);
  });

  it("lets the decision made at the last warm-up bar's close fill at the first live bar", () => {
    const result = simulate(bars(flat(6)), scripted({ 2: long() }), { ...noCosts, warmupBars: 3 });
    expect(result.roundTrips[0].entryIndex).toBe(3);
  });
});

describe("simulate: slippage cost", () => {
  it("records what slippage cost each round trip, across entry and every leg", () => {
    const candles = bars([...flat(1), [100, 101, 99, 100], [100, 111, 99, 110], ...flat(1, 110)]);
    const [rt] = simulate(candles, scripted({ 0: long({ stop: 90, target: 110 }) }), {
      initialCapital: 10_000,
      feeRate: 0,
      slippagePercent: 0.001,
    }).roundTrips;
    const qty = 10_000 / 100.1;
    expect(rt.slippage).toBeCloseTo((0.1 + 0.11) * qty, 6);
  });
});
