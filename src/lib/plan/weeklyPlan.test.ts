import { describe, expect, it } from "vitest";
import type { OHLC } from "@/indicators/utils";
import { buildCoinPlan, DAY_MS, locationGrade, marketSummary, weekStartOf, WEEK_MS } from "./weeklyPlan";

const H = 3_600_000;
const MONDAY = Date.UTC(2026, 8, 7); // Mon 7 Sep 2026

// Hourly candles from `start`, each a ±0.5 wiggle around price(i).
function hourly(start: number, hours: number, price: (i: number) => number): OHLC[] {
  return Array.from({ length: hours }, (_, i) => {
    const p = price(i);
    return { openTime: start + i * H, closeTime: start + (i + 1) * H - 1, open: p, high: p + 0.5, low: p - 0.5, close: p, volume: 1 };
  });
}

// Six flat weeks at 100, then a "last week" swinging 90–110, then
// this week (Monday and Tuesday so far) at `now` prices.
function market(thisWeek: (i: number) => number, hoursThisWeek = 30) {
  const flat = hourly(MONDAY, 6 * 168, () => 100);
  const lastStart = MONDAY + 6 * WEEK_MS;
  const last = hourly(lastStart, 168, (i) => (i < 84 ? 90 + (20 * i) / 84 : 110 - (10 * (i - 84)) / 84));
  const cur = hourly(lastStart + WEEK_MS, hoursThisWeek, thisWeek);
  const candles = [...flat, ...last, ...cur];
  return { candles, now: candles[candles.length - 1].closeTime + 1, thisWeekStart: lastStart + WEEK_MS };
}

describe("weekStartOf", () => {
  it("returns Monday 00:00 UTC", () => {
    expect(weekStartOf(MONDAY)).toBe(MONDAY);
    expect(weekStartOf(MONDAY + 6 * DAY_MS + 23 * H)).toBe(MONDAY);
    expect(weekStartOf(MONDAY + WEEK_MS)).toBe(MONDAY + WEEK_MS);
  });
});

describe("buildCoinPlan", () => {
  it("measures price against last week's range and grades longs A in discount", () => {
    const { candles, now, thisWeekStart } = market(() => 93);
    const p = buildCoinPlan("ETHUSDT", candles, now)!;
    expect(p.weekStart).toBe(thisWeekStart);
    expect(p.lastWeek.high).toBeCloseTo(110.5, 1);
    expect(p.lastWeek.low).toBe(89.5);
    expect(p.lastWeek.mid).toBeCloseTo(100, 1);
    expect(p.position).toBeCloseTo((93 - 89.5) / 21, 2);
    expect(p.aSide).toBe("LONG");
    expect(p.insights[0]).toMatch(/Long signals are A-grade/);
  });

  it("grades shorts A above last week's high", () => {
    const { candles, now } = market(() => 115);
    const p = buildCoinPlan("BTCUSDT", candles, now)!;
    expect(p.aSide).toBe("SHORT");
    expect(p.insights[0]).toMatch(/Above last week's high/);
  });

  it("gives no grade on markets where it ran backwards", () => {
    const { candles, now } = market(() => 93);
    const p = buildCoinPlan("AVAXUSDT", candles, now)!;
    expect(p.gradeReversed).toBe(true);
    expect(p.insights[0]).toMatch(/No A\/B grade/);
  });

  it("spots a sweep of yesterday's low that closed back above", () => {
    // Monday sits at 100; Tuesday dips to 95, then recovers to 101.
    const { candles, now } = market((i) => (i < 24 ? 100 : i < 27 ? 95 : 101));
    const p = buildCoinPlan("ETHUSDT", candles, now)!;
    expect(p.yesterday.low).toBe(99.5);
    expect(p.today.low).toBe(94.5);
    expect(p.insights.some((s) => s.startsWith("Swept yesterday's low"))).toBe(true);
  });

  it("lists support below and resistance above price, nearest first", () => {
    const { candles, now } = market(() => 101);
    const p = buildCoinPlan("ETHUSDT", candles, now)!;
    expect(p.support.every((s) => s < p.price)).toBe(true);
    expect(p.resistance.every((r) => r > p.price)).toBe(true);
    expect(p.resistance).toEqual([...p.resistance].sort((a, b) => a - b));
    expect(p.support).toEqual([...p.support].sort((a, b) => b - a));
    expect(p.resistance).toContain(110.5);
  });

  it("ignores candles that haven't closed and needs enough history", () => {
    const { candles, now } = market(() => 93);
    expect(buildCoinPlan("ETHUSDT", candles.slice(-200), now)).toBeNull();
    const p = buildCoinPlan("ETHUSDT", [...candles, ...hourly(now, 5, () => 500)], now)!;
    expect(p.price).toBe(93);
  });
});

describe("locationGrade", () => {
  const { candles, thisWeekStart } = market(() => 100);
  const t = thisWeekStart + 10 * H;
  it("A for a long below the previous week's midpoint, B above", () => {
    expect(locationGrade("ETHUSDT", "LONG", 95, t, candles)).toBe("A");
    expect(locationGrade("ETHUSDT", "LONG", 105, t, candles)).toBe("B");
    expect(locationGrade("ETHUSDT", "SHORT", 105, t, candles)).toBe("A");
    expect(locationGrade("ETHUSDT", "SHORT", 95, t, candles)).toBe("B");
  });
  it("null without a previous week, or on a reversed market", () => {
    expect(locationGrade("ETHUSDT", "LONG", 95, MONDAY + H, candles)).toBeNull();
    expect(locationGrade("SOLUSDT", "LONG", 95, t, candles)).toBeNull();
  });
});

describe("marketSummary", () => {
  it("names the A-grade side per market", () => {
    const a = market(() => 93);
    const b = market(() => 108);
    const plans = [buildCoinPlan("ETHUSDT", a.candles, a.now)!, buildCoinPlan("XAUUSDT", b.candles, b.now)!];
    const s = marketSummary(plans, (x) => x.replace("USDT", ""));
    expect(s[0]).toBe("Longs are A-grade on ETH (below last week's midpoint).");
    expect(s[1]).toBe("Shorts are A-grade on XAU (above last week's midpoint).");
  });
});

describe("forex", () => {
  it("tells you to skip B-grade trades on currency pairs and quotes to the pipette", () => {
    const { candles, now } = market(() => 93);
    const p = buildCoinPlan("EURUSD", candles, now)!;
    expect(p.insights[0]).toMatch(/shorts B-grade \(skip\)/);
    expect(p.insights.join(" ")).toContain("92.50000–93.50000");
  });
  it("gives no grade on USD/CHF and the indices, where it ran backwards", () => {
    const { candles, thisWeekStart } = market(() => 100);
    expect(locationGrade("USDCHF", "LONG", 95, thisWeekStart + 10 * H, candles)).toBeNull();
    expect(locationGrade("NAS100", "LONG", 95, thisWeekStart + 10 * H, candles)).toBeNull();
  });
});
