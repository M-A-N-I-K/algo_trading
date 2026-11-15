import { describe, expect, it } from "vitest";
import type { ReportTrade } from "./analyze";
import { extraStats, monthlyReturns, rDistribution, split, timeline, tradesCsv, weekdayOf } from "./report";

const t = (open: string, close: string, r: number, over: Partial<ReportTrade> = {}): ReportTrade => ({ open, close, side: "LONG", r, exit: r > 0 ? "tp" : "sl", ...over });
// Mon 5 Jan 2026 … : +2, −1, −1, +2 (new high on 2 Feb), −1 in March.
const trades = [
  t("2026-01-05 08:00:00", "2026-01-05 12:00:00", 2),
  t("2026-01-12 08:00:00", "2026-01-12 09:00:00", -1),
  t("2026-01-20 08:00:00", "2026-01-20 10:00:00", -1, { side: "SHORT" }),
  t("2026-02-02 08:00:00", "2026-02-02 16:00:00", 2),
  t("2026-03-03 08:00:00", "2026-03-03 09:00:00", -1),
];

describe("tester full report", () => {
  it("tracks cumulative R and drawdown, and thins long reports keeping the deepest dip", () => {
    expect(timeline(trades).map((p) => [p.r, p.ddR])).toEqual([[2, 0], [1, 1], [0, 2], [2, 0], [1, 1]]);
    const many = Array.from({ length: 1000 }, (_, i) => t("2026-01-05 08:00:00", "2026-01-05 09:00:00", i === 500 ? -30 : 0.1));
    const thin = timeline(many, 100);
    expect(thin.length).toBeLessThanOrEqual(200);
    expect(Math.max(...thin.map((p) => p.ddR))).toBe(30);
    expect(thin[thin.length - 1].i).toBe(1000);
  });

  it("sums R by month and year", () => {
    const [y] = monthlyReturns(trades);
    expect(y.year).toBe(2026);
    expect(y.months.slice(0, 4)).toEqual([{ r: 0, trades: 3 }, { r: 2, trades: 1 }, { r: -1, trades: 1 }, null]);
    expect([y.r, y.trades]).toEqual([1, 5]);
  });

  it("splits by direction and weekday", () => {
    expect(split(trades, (x) => x.side)).toEqual([
      { key: "LONG", trades: 4, winPct: 50, netR: 2, avgR: 0.5, profitFactor: 2 },
      { key: "SHORT", trades: 1, winPct: 0, netR: -1, avgR: -1, profitFactor: 0 },
    ]);
    expect(trades.map(weekdayOf)).toEqual(["Mon", "Mon", "Tue", "Mon", "Tue"]);
  });

  it("bins R and trims empty ends", () => {
    const bins = rDistribution(trades);
    expect(bins[0]).toMatchObject({ at: -1, from: -1.25, to: -0.75, count: 3 });
    expect(bins[bins.length - 1]).toMatchObject({ at: 2, count: 2 });
    expect(rDistribution([t("2026-01-05 08:00:00", "2026-01-05 09:00:00", -1.04), t("2026-01-05 08:00:00", "2026-01-05 09:00:00", 9)]).map((b) => [b.at, b.count]).filter(([, c]) => c)).toEqual([[-1, 1], [5, 1]]);
  });

  it("measures the longest time without a new high and the hold times", () => {
    const s = extraStats(trades);
    expect(s.longestDrawdownDays).toBe(29); // 2 Feb 16:00 → 3 Mar 09:00, still below the high at the end (Jan: 28)
    expect(s.longestDrawdownOpen).toBe(true);
    expect(s.recoveryFactor).toBe(0.5); // net 1R over a 2R drawdown
    expect(s.profitableMonthsPct).toBe(33);
    expect(s.avgHoldHoursWin).toBe(6);
    expect(s.avgHoldHoursLoss).toBe(1.3);
  });

  it("writes every trade to CSV with running totals", () => {
    const csv = tradesCsv(trades).trim().split("\n");
    expect(csv).toHaveLength(6);
    expect(csv[3]).toBe("3,2026-01-20 08:00:00,2026-01-20 10:00:00,SHORT,-1,sl,0,2");
  });
});
