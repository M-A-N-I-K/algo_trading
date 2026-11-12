import { describe, expect, it } from "vitest";
import { days, numbers, percentile, simulateChallenge, streaks, verdict, type ReportTrade } from "./analyze";

const t = (day: string, r: number): ReportTrade => ({ open: `${day} 10:00:00`, close: `${day} 15:00:00`, side: "LONG", r, exit: r > 0 ? "tp" : "sl" });
// Two losses then a win (3R by default: +0.33R a trade), one trade a day.
function pattern(n: number, win = 3): ReportTrade[] {
  const out: ReportTrade[] = [];
  const start = Date.UTC(2024, 0, 1);
  for (let i = 0; i < n; i++) out.push(t(new Date(start + i * 86_400_000).toISOString().slice(0, 10), i % 3 === 2 ? win : -1));
  return out;
}

describe("tester report analysis", () => {
  it("takes nearest-rank percentiles", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
  });

  it("computes the numbers in R", () => {
    const n = numbers([t("2024-01-01", -1), t("2024-01-02", -1), t("2024-01-03", 3), t("2025-01-01", -1)]);
    expect(n).toMatchObject({ trades: 4, winRatePct: 25, netR: 0, maxDrawdownR: 2, bestR: 3, worstR: -1 });
    expect(n.profitFactor).toBeCloseTo(1);
    expect(n.equity).toEqual([0, -1, -2, 1, 0]);
    expect(n.years).toEqual([{ year: "2024", trades: 3, netR: 1 }, { year: "2025", trades: 1, netR: -1 }]);
  });

  it("counts losing runs and expects longer ones over many trades", () => {
    const s = streaks(pattern(30));
    expect(s.longestLoss).toBe(2);
    expect(s.lossRuns).toEqual([{ length: 2, count: 10 }]);
    expect(s.typical).toBeGreaterThanOrEqual(2);
    expect(s.bad).toBeGreaterThanOrEqual(s.typical);
    expect(s.worst).toBeGreaterThanOrEqual(s.bad);
  });

  it("finds the worst day and week by close date", () => {
    const d = days([t("2024-01-01", -1), { ...t("2024-01-01", -1), close: "2024-01-01 20:00:00" }, t("2024-01-03", -1), t("2024-01-08", 2)]);
    expect(d.worstDay).toEqual({ day: "2024-01-01", r: -2, trades: 2 });
    expect(d.worstWeek).toEqual({ start: "2024-01-01", r: -3, trades: 3 });
    expect(d.multiTradeDays).toBe(1);
  });

  it("passes a winning setup and fails a losing one, with the same random draws every time", () => {
    const rules = { riskPct: 1, targetPct: 10, maxLossPct: 12, dailyLossPct: 4 };
    const good = simulateChallenge(pattern(90), rules, { sims: 500 });
    expect(good.targetR).toBe(10);
    expect(good.passPct).toBeGreaterThan(90);
    expect(good.tradesToPass!.median).toBeGreaterThanOrEqual(10);
    expect(good.attempts.expected).toBeCloseTo(1, 0);
    expect(simulateChallenge(pattern(90), rules, { sims: 500 })).toEqual(good);
    const bad = simulateChallenge(pattern(90, 1), rules, { sims: 500 });
    expect(bad.passPct).toBeLessThan(5);
    expect(bad.breachMaxPct).toBeGreaterThan(90);
    // Half the edge makes it slower.
    expect(simulateChallenge(pattern(90), rules, { sims: 500, edge: 0.5 }).tradesToPass!.median).toBeGreaterThan(good.tradesToPass!.median);
  });

  it("breaches the daily limit when one day loses more than it allows", () => {
    const day = (d: string) => [t(d, -1), t(d, -1), t(d, -1)];
    const r = simulateChallenge([...day("2024-01-01"), ...day("2024-01-02")], { riskPct: 1.5, targetPct: 10, maxLossPct: 12, dailyLossPct: 4 }, { sims: 50 });
    expect(r.breachDailyPct).toBe(100);
  });

  it("skips a thin edge, calls a fast one a buy and a safe slow one 'only with others'", () => {
    const thin = numbers(pattern(60, 2.2));
    const make = (passPct: number, breach: number) => ({ sims: 1, targetR: 10, passPct, breachMaxPct: breach, breachDailyPct: 0, unfinishedPct: 100 - passPct - breach, tradesToPass: null, weeksToPass: { median: 80, p75: 100, p90: 120 }, attempts: { expected: 2, for90: 4 } });
    expect(verdict(thin, make(80, 1)).verdict).toBe("skip");
    const ok = numbers(pattern(60));
    expect(verdict(ok, make(70, 3)).verdict).toBe("buy");
    expect(verdict(ok, make(30, 3)).verdict).toBe("slow");
    expect(verdict(ok, make(60, 25)).verdict).toBe("skip");
  });
});
