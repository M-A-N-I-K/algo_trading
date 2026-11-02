import { describe, expect, it } from "vitest";
import {
  equitySeries,
  grossOf,
  groupBy,
  holdMinutesOf,
  pnlBreakdown,
  rHistogram,
  summarize,
  weekdayHourGrid,
  type JournalTrade,
} from "./metrics";

let n = 0;
function trade(p: Partial<JournalTrade> & Pick<JournalTrade, "pnl" | "time">): JournalTrade {
  return { id: `t${++n}`, symbol: "ETHUSDT", side: "LONG", quantity: 1, entryPrice: 100, ...p };
}

describe("journal metrics", () => {
  const synced = trade({ time: "2026-01-05T10:00:00", openedAt: "2026-01-05T09:30:00", pnl: -1.5, grossPnl: 1, fees: 2, funding: -0.5 });
  const manual = trade({ time: "2026-01-06T10:00:00", pnl: 9, fees: 1 });

  it("derives gross for manual trades as pnl + fees", () => {
    expect(grossOf(synced)).toBe(1);
    expect(grossOf(manual)).toBe(10);
  });

  it("breaks P&L into gross, fees, funding and net that reconcile", () => {
    const b = pnlBreakdown([synced, manual]);
    expect(b).toEqual({ gross: 11, fees: 3, funding: -0.5, net: 7.5, count: 2 });
    expect(b.gross - b.fees + b.funding).toBeCloseTo(b.net);
  });

  it("builds cumulative gross and net equity with drawdown from the net peak", () => {
    const series = equitySeries([
      trade({ time: "2026-01-03", pnl: 5, grossPnl: 6, fees: 1 }),
      trade({ time: "2026-01-01", pnl: 10, grossPnl: 11, fees: 1 }),
      trade({ time: "2026-01-02", pnl: -8, grossPnl: -7, fees: 1 }),
    ]);
    expect(series.map((p) => [p.gross, p.net, p.drawdown])).toEqual([
      [11, 10, 0],
      [4, 2, -8],
      [10, 7, -3],
    ]);
  });

  it("summarizes win rate, profit factor, R, fee drag and streaks", () => {
    const s = summarize([
      trade({ time: "2026-01-01", pnl: 4, grossPnl: 6, fees: 2, initialRiskAmount: 2 }),
      trade({ time: "2026-01-02", pnl: -2, grossPnl: -1, fees: 1, initialRiskAmount: 2 }),
      trade({ time: "2026-01-03", pnl: -1, grossPnl: 0, fees: 1 }),
    ]);
    expect(s.winRate).toBeCloseTo(1 / 3);
    expect(s.profitFactor).toBeCloseTo(4 / 3);
    expect(s.avgR).toBeCloseTo((2 - 1) / 2);
    expect(s.rCount).toBe(2);
    expect(s.feeToGross).toBeCloseTo(4 / 5);
    expect(s.breakevenMovePct).toBeCloseTo((4 / 3 / 100) * 100);
    expect(s.longestLosingStreak).toBe(2);
    expect(s.maxDrawdown).toBe(-3);
  });

  it("returns nulls rather than zeros when there is nothing to measure", () => {
    const s = summarize([]);
    expect(s).toMatchObject({ winRate: null, profitFactor: null, expectancy: null, avgR: null, maxDrawdown: 0 });
  });

  it("bins R-multiples and clamps outliers into the end bins", () => {
    const bins = rHistogram(
      [
        trade({ time: "2026-01-01", pnl: 1, initialRiskAmount: 1 }),
        trade({ time: "2026-01-01", pnl: -10, initialRiskAmount: 1 }),
        trade({ time: "2026-01-01", pnl: 50, initialRiskAmount: 1 }),
        trade({ time: "2026-01-01", pnl: 5 }),
      ],
      { width: 1, min: -2, max: 3 },
    );
    expect(bins.map((b) => b.count)).toEqual([1, 0, 0, 1, 1]);
  });

  it("places trades on a Monday-first weekday × hour grid by open time", () => {
    const grid = weekdayHourGrid([synced]);
    const cell = grid.find((c) => c.count > 0)!;
    expect(cell).toMatchObject({ weekday: 0, hour: 9, net: -1.5 }); // 2026-01-05 is a Monday
  });

  it("measures hold time and groups with a full breakdown", () => {
    expect(holdMinutesOf(synced)).toBe(30);
    expect(holdMinutesOf(manual)).toBeNull();
    const rows = groupBy([synced, manual], (t) => (t.grossPnl == null ? "manual" : "synced"));
    expect(rows.find((r) => r.key === "manual")).toMatchObject({ count: 1, wins: 1, gross: 10, net: 9 });
  });
});
