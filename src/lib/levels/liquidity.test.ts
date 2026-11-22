import { describe, expect, it } from "vitest";
import type { OHLC } from "@/indicators/utils";
import { DAY_MS, weekStartOf } from "@/lib/plan/weeklyPlan";
import { levelAlerts, marketLevels } from "./liquidity";

const H = 3_600_000;
// 56 days ending on a Wednesday, so "today" is mid-week.
const START = weekStartOf(Date.UTC(2026, 8, 1)) + 7 * DAY_MS; // a Monday
const DAYS = 58;

// 24 hourly bars per day, the high at 06:00 and the low at 12:00.
function day(i: number, high: number, low: number, close = (high + low) / 2): OHLC[] {
  const t0 = START + i * DAY_MS;
  return Array.from({ length: 24 }, (_, h) => {
    const mid = (high + low) / 2;
    const c = h === 23 ? close : mid;
    return { openTime: t0 + h * H, closeTime: t0 + (h + 1) * H - 1, open: mid, close: c, high: h === 6 ? high : Math.max(mid, c) + 1, low: h === 12 ? low : Math.min(mid, c) - 1, volume: 1 };
  });
}

function build(special: Record<number, [number, number]>, todayBars: OHLC[] = []) {
  const bars: OHLC[] = [];
  for (let i = 0; i < DAYS; i++) {
    const [hi, lo] = special[i] ?? [1010, 990];
    bars.push(...day(i, hi, lo));
  }
  return [...bars, ...todayBars];
}

const todayStart = START + DAYS * DAY_MS;
const hourAt = (h: number, o: number, hi: number, lo: number, c: number): OHLC => ({ openTime: todayStart + h * H, closeTime: todayStart + (h + 1) * H - 1, open: o, high: hi, low: lo, close: c, volume: 1 });

describe("marketLevels", () => {
  it("lists yesterday's and last week's extremes, and untaken daily swings, nearest first", () => {
    // Day 40: swing high 1050 and day 46: 1051 → equal highs. Day 44: swing low 950.
    const h1 = build({ 40: [1050, 990], 46: [1051, 990], 44: [1010, 950], [DAYS - 1]: [1020, 985] }, [hourAt(0, 1000, 1004, 998, 1002)]);
    const m = marketLevels("NAS100", h1, todayStart + 2 * H)!;
    expect(m.price).toBe(1002);
    expect(m.above[0].label).toContain("Yesterday's high");
    expect(m.above[0].price).toBe(1020);
    const eq = m.above.find((l) => [l.label, ...l.also].some((x) => x.includes("Equal daily highs")));
    expect(eq?.price).toBe(1051);
    expect(m.below.some((l) => l.price === 950)).toBe(true);
    expect(m.below[0].label).toContain("Yesterday's low");
  });

  it("drops a swing low once price has traded through it", () => {
    // Day 44 swing low 950, then day 50 trades to 940.
    const h1 = build({ 44: [1010, 950], 50: [1010, 940] }, [hourAt(0, 1000, 1004, 998, 1002)]);
    const m = marketLevels("NAS100", h1, todayStart + 2 * H)!;
    expect(m.below.some((l) => l.price === 950)).toBe(false);
  });

  it("flags price near a level, and a fresh sweep that closed back inside", () => {
    // Yesterday's high 1020; today trades 1024 at 03:00 and closes back at 1015.
    const h1 = build({ [DAYS - 1]: [1020, 985] }, [hourAt(0, 1000, 1010, 998, 1008), hourAt(1, 1008, 1016, 1006, 1014), hourAt(2, 1014, 1024, 1012, 1015)]);
    const m = marketLevels("NAS100", h1, todayStart + 3 * H)!;
    expect(m.sweeps[0].level.label).toContain("Yesterday's high");
    expect(m.sweeps[0].reclaimed).toBe(true);
    const alerts = levelAlerts([m]);
    expect(alerts[0].kind).toBe("sweep");
  });

  it("calls a level 'at' within a tenth of a day's range", () => {
    // ATR is about 20 (1010 − 990), so 1019 is 0.05 ATR under yesterday's high of 1020.
    const h1 = build({ [DAYS - 1]: [1020, 985] }, [hourAt(0, 1000, 1019, 998, 1019)]);
    const m = marketLevels("NAS100", h1, todayStart + H)!;
    expect(m.above[0].proximity).toBe("at");
    expect(levelAlerts([m]).some((a) => a.kind === "approach" && a.level.price === 1020)).toBe(true);
  });

  it("uses finer recent candles for a fresher price", () => {
    const h1 = build({}, [hourAt(0, 1000, 1004, 998, 1002)]);
    const m15: OHLC = { openTime: todayStart + H, closeTime: todayStart + H + 15 * 60_000 - 1, open: 1002, high: 1007, low: 1001, close: 1006, volume: 1 };
    const m = marketLevels("NAS100", h1, todayStart + H + 20 * 60_000, [m15])!;
    expect(m.price).toBe(1006);
  });
});
