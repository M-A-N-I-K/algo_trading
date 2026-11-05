import { describe, expect, it } from "vitest";
import { MAX_RULES, reviewTrades, type ReviewTrade } from "./review";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 0, 5); // a Monday, 00:00 UTC

let seq = 0;
function trade(p: Partial<ReviewTrade> & { pnl: number; open: number; holdMin?: number }): ReviewTrade {
  const { open, holdMin = 180, ...rest } = p;
  return {
    id: `t${++seq}`,
    openedAt: new Date(open).toISOString(),
    time: new Date(open + holdMin * 60_000).toISOString(),
    symbol: "BTCUSDT",
    side: "LONG",
    quantity: 1,
    entryPrice: 100,
    fees: 0,
    initialRiskAmount: 10,
    stopLoss: 90,
    ...rest,
  };
}
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const review = (trades: ReviewTrade[], extra: Partial<Parameters<typeof reviewTrades>[0]> = {}) =>
  reviewTrades({ trades, startingBalance: 1000, dayOf: utcDay, hourOf: (ms) => new Date(ms).getUTCHours(), now: T0 + 400 * DAY, ...extra });
const ids = (r: ReturnType<typeof reviewTrades>) => r.findings.map((f) => f.id);

describe("reviewTrades", () => {
  it("states the verdict and splits the loss into market and fees", () => {
    const trades = Array.from({ length: 10 }, (_, i) => trade({ pnl: -2, grossPnl: -1, fees: 1, open: T0 + i * DAY }));
    const r = review(trades);
    expect(r.verdict.profitable).toBe(false);
    expect(r.verdict.headline).toBe("You're not profitable yet: −$20.00 over 10 trades.");
    expect(r.numbers).toMatchObject({ net: -20, gross: -10, fees: 10 });
    expect(r.findings.find((f) => f.id === "fees")).toMatchObject({ severity: "critical", cost: 10 });
  });

  it("flags busy days that lose while quiet days make money, and sets a cap", () => {
    const trades = [
      // Two busy days of 4 losers each.
      ...[0, 1].flatMap((d) => Array.from({ length: 4 }, (_, i) => trade({ pnl: -5, open: T0 + d * DAY + i * HOUR }))),
      // Quiet days with one winner each.
      ...Array.from({ length: 5 }, (_, i) => trade({ pnl: 8, open: T0 + (10 + i) * DAY })),
    ];
    const f = review(trades).findings.find((x) => x.id === "overtrading");
    expect(f).toMatchObject({ severity: "critical", cost: 40, rule: "Maximum 1 trade a day." });
    expect(f!.evidence).toContain("On 2 days with 4+ trades (8 trades) you lost −$40.00");
  });

  it("counts days past the daily limit and the trades taken after it", () => {
    const trades = [
      trade({ pnl: -20, open: T0 + 1 * HOUR, holdMin: 10 }),
      trade({ pnl: -15, open: T0 + 2 * HOUR, holdMin: 10 }), // limit hit here (−35)
      trade({ pnl: -5, open: T0 + 3 * HOUR, holdMin: 10 }), // after the limit
    ];
    const f = review(trades, { dailyLossLimit: 30 }).findings.find((x) => x.id === "daily-limit");
    expect(f?.evidence).toBe("You set a $30.00 daily limit and went past it on 1 day. You kept trading after hitting it 1 times, for −$5.00.");
  });

  it("contrasts quick trades with patient ones", () => {
    const trades = [
      ...Array.from({ length: 10 }, (_, i) => trade({ pnl: -3, open: T0 + i * DAY, holdMin: 10 })),
      ...Array.from({ length: 10 }, (_, i) => trade({ pnl: i < 6 ? 6 : -3, open: T0 + (20 + i) * DAY, holdMin: 300 })),
    ];
    const r = review(trades);
    expect(r.findings.find((f) => f.id === "hold")).toMatchObject({ severity: "critical", cost: 30 });
    expect(r.findings.find((f) => f.id === "patient-good")?.evidence).toBe("Trades held 2 hours or more made $24.00 over 10 trades (profit factor 3.00).");
  });

  it("works out the win rate needed for the payoff", () => {
    // 6 wins of +1R, 14 losses of −1R: needs 50%, has 30%.
    const trades = Array.from({ length: 20 }, (_, i) => trade({ pnl: i < 6 ? 10 : -10, open: T0 + i * DAY }));
    const r = review(trades);
    expect(r.numbers.breakevenWinRate).toBeCloseTo(0.5);
    expect(r.findings.find((f) => f.id === "payoff")).toMatchObject({ severity: "critical" });
  });

  it("says nothing it can't back up with enough trades", () => {
    const r = review([trade({ pnl: -5, open: T0, holdMin: 5 }), trade({ pnl: 3, open: T0 + DAY })]);
    expect(ids(r)).toEqual([]);
    expect(r.rules).toEqual([]);
  });

  it("keeps the rule list short", () => {
    const trades = Array.from({ length: 80 }, (_, i) =>
      trade({ pnl: i % 3 ? -6 : 4, fees: 1, grossPnl: i % 3 ? -5 : 5, open: T0 + Math.floor(i / 8) * DAY + (i % 8) * HOUR + 13 * HOUR, holdMin: i % 2 ? 10 : 200, side: i % 2 ? "SHORT" : "LONG", symbol: i % 4 ? "ETHUSDT" : "XRPUSDT", stopLoss: null, initialRiskAmount: null }),
    );
    const r = review(trades, { dailyLossLimit: 10 });
    expect(r.rules.length).toBeLessThanOrEqual(MAX_RULES);
    expect(r.findings.filter((f) => f.severity === "critical").length).toBeGreaterThan(2);
  });
});
