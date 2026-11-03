import { describe, expect, it } from "vitest";
import { OHLC } from "@/indicators/utils";
import { createExtremeOrderBlockStrategy, ExtremeOrderBlockOptions } from "../extremeOrderBlockStrategy";

const HOUR = 3_600_000;
const bars = (rows: [number, number, number, number][]): OHLC[] =>
  rows.map(([open, high, low, close], i) => ({ openTime: i * HOUR, closeTime: (i + 1) * HOUR - 1, open, high, low, close, volume: 1 }));

// Swing high 105 (bar 2), drop to the protected low 95 (bar 6). Bar 5 is the
// last bearish candle at the bottom of the leg: the extreme bullish order
// block, zone 95–99.5. Bar 8 is the decisional block just before the break
// (98.8–100.5). Bar 9 closes above 105: bullish break of structure. The
// impulse runs to 112, then the first pullback (bars 11–13) only reaches the
// decisional block; the second (bar 14) trades into the extreme zone and bar
// 15 closes back out of it.
const UPTREND_PULLBACK: [number, number, number, number][] = [
  [100, 101, 99, 100.5],
  [100.5, 102, 100, 101.5],
  [101.5, 105, 101, 104],
  [104, 104.5, 101, 101.5],
  [101.5, 102, 99, 99.5],
  [99.5, 100, 96, 96.5], // 5: extreme bullish order block
  [96.5, 98.5, 95, 98], // 6: protected low
  [98, 101, 97.5, 100.5],
  [100.5, 102, 98.8, 99], // 8: decisional order block
  [99, 106, 98.9, 105.5], // 9: bullish break of structure
  [105.5, 112, 105, 111], // 10: impulse high
  [111, 111.5, 104, 104.5],
  [104.5, 105, 100, 100.2], // 12: into the decisional block only
  [100.2, 101.5, 99.8, 101.2],
  [101.2, 101.4, 98, 98.5], // 14: into the extreme zone
  [98.5, 100.8, 98.2, 100.4], // 15: rejection close above 99.5
];

const BASE: ExtremeOrderBlockOptions = { swingLookback: 2, stopBufferAtr: 0 };

function run(rows: [number, number, number, number][], options: ExtremeOrderBlockOptions = BASE) {
  const candles = bars(rows);
  const strategy = createExtremeOrderBlockStrategy(options);
  const signals = strategy.generateSignals(candles);
  const targets = strategy.getTradeTargets!(candles);
  const entries = signals.flatMap((s, t) => (s === "HOLD" ? [] : [{ t, signal: s, ...targets[t] }]));
  return entries;
}

describe("extreme order block: long setup", () => {
  it("buys the rejection from the extreme block, not the decisional one, stop under the protected low, target the impulse high", () => {
    expect(run(UPTREND_PULLBACK)).toEqual([{ t: 15, signal: "BUY", stopLoss: 95, takeProfit: 112 }]);
  });
});

// Price mirrored around 100: the same setup as a downtrend.
const mirror = (rows: [number, number, number, number][]) =>
  rows.map(([o, h, l, c]) => [200 - o, 200 - l, 200 - h, 200 - c] as [number, number, number, number]);

describe("extreme order block: short setup", () => {
  it("sells the rejection from the extreme bearish block, stop over the protected high, target the impulse low", () => {
    expect(run(mirror(UPTREND_PULLBACK))).toEqual([{ t: 15, signal: "SELL", stopLoss: 105, takeProfit: 88 }]);
  });
});

describe("extreme order block: zone validity", () => {
  it("drops the zone when a candle closes beyond its far edge", () => {
    const rows = [...UPTREND_PULLBACK];
    rows[14] = [101.2, 101.4, 94, 94.5]; // closes under 95
    expect(run(rows).filter((e) => e.signal === "BUY")).toEqual([]);
  });

  it("trades only the first return to the zone", () => {
    const rows: [number, number, number, number][] = [
      ...UPTREND_PULLBACK,
      [100.4, 101, 98, 98.5], // back into the zone
      [98.5, 100.5, 98.3, 100.2], // and out again
    ];
    expect(run(rows).map((e) => e.t)).toEqual([15]);
  });
});

describe("extreme order block: risk-reward", () => {
  it("skips a setup whose structure target is under the minimum R:R", () => {
    // Entry 100.4, stop 95: risk 5.4, reward to 112 is 11.6 (2.15R).
    expect(run(UPTREND_PULLBACK, { ...BASE, minRr: 2.5 })).toEqual([]);
  });

  it("caps the target at the maximum R:R", () => {
    const [entry] = run(UPTREND_PULLBACK, { ...BASE, minRr: 1, maxRr: 1.5 });
    expect(entry.takeProfit).toBeCloseTo(108.5, 10); // 100.4 + 1.5 × 5.4
  });

  it("puts the stop an ATR buffer beyond the zone", () => {
    const [plain] = run(UPTREND_PULLBACK, { ...BASE, minRr: 1 });
    const [buffered] = run(UPTREND_PULLBACK, { ...BASE, minRr: 1, stopBufferAtr: 0.5 });
    expect(buffered.stopLoss).toBeLessThan(plain.stopLoss);
    expect(plain.stopLoss).toBe(95);
  });
});

// 15m random walk with slow trend regimes, aggregated to 1h.
function walk(n: number): OHLC[] {
  let seed = 7;
  const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const out: OHLC[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = Math.max(1, open * (1 + (Math.sin(i / 300) * 0.2 + (rand() - 0.5) * 1.2) / 100));
    const high = Math.max(open, close) * (1 + rand() * 0.004);
    const low = Math.min(open, close) * (1 - rand() * 0.004);
    out.push({ openTime: i * 900_000, closeTime: (i + 1) * 900_000 - 1, open, high, low, close, volume: 1 });
    price = close;
  }
  return out;
}
function toHourly(c: OHLC[]): OHLC[] {
  const out: OHLC[] = [];
  for (let i = 0; i + 4 <= c.length; i += 4) {
    const g = c.slice(i, i + 4);
    out.push({ openTime: g[0].openTime, closeTime: g[3].closeTime, open: g[0].open, close: g[3].close, high: Math.max(...g.map((x) => x.high)), low: Math.min(...g.map((x) => x.low)), volume: 4 });
  }
  return out;
}

describe("extreme order block: higher-timeframe zones", () => {
  const ltf = walk(6000);
  const htf = toHourly(ltf);
  const full = createExtremeOrderBlockStrategy({ htfCandles: htf, minRr: 0 });
  const signals = full.generateSignals(ltf);
  const targets = full.getTradeTargets!(ltf);

  it("finds setups on the sample (so the check below isn't vacuous)", () => {
    expect(signals.filter((s) => s !== "HOLD").length).toBeGreaterThan(5);
  });

  it("decides each 15m bar from 1h candles that had closed by then", () => {
    // Every bar where the full run acts, plus every 5th bar: a leak through a
    // forming 1h candle only shows on the 15m bars inside that hour.
    const checks = signals.flatMap((sig, t) => (sig !== "HOLD" || t % 5 === 0) && t >= 400 ? [t] : []);
    for (const t of checks) {
      const known = htf.filter((h) => h.closeTime <= ltf[t].closeTime);
      const s = createExtremeOrderBlockStrategy({ htfCandles: known, minRr: 0 });
      const sig = s.generateSignals(ltf.slice(0, t + 1));
      const tg = s.getTradeTargets!(ltf.slice(0, t + 1));
      expect(sig).toEqual(signals.slice(0, t + 1));
      expect(tg).toEqual(targets.slice(0, t + 1));
    }
  });
});
