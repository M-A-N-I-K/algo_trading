import { describe, expect, it } from "vitest";
import { accountById, PLAYBOOK_ACCOUNT, PLAYBOOK_ACCOUNTS, PLAYBOOK_SETUPS, setupById, type PlaybookAccount } from "./config";
import {
  accountStatus as accountStatusOn,
  adherence,
  exposureKeys,
  hardFailures,
  judgeSetup,
  minutesFromRollover,
  platformDay,
  pnlUsd,
  preTradeChecks as preTradeChecksOn,
  rankSignals as rankSignalsOn,
  riskBudget as riskBudgetOn,
  rStats,
  sizePosition,
  type JournalEntry,
  type TradePlan,
} from "./rules";

// Most tests run on a fixed $5k account at 0.5% risk with 4 slots, so the
// numbers below don't move when the real accounts' sizes change. The real
// accounts have their own tests at the end.
const ACCOUNT: PlaybookAccount = {
  ...PLAYBOOK_ACCOUNT,
  id: "test",
  name: "Test $5k",
  size: 5000,
  maxLossPct: 12,
  dailyLossPct: 4,
  targetPct: 10,
  rules: { ...PLAYBOOK_ACCOUNT.rules, riskPctA: 0.5, riskPctB: 0.25, maxOpen: 4, dailyStopPct: 2, maxLossesPerDay: 99 },
};
const accountStatus = (e: JournalEntry[], now: number, account = ACCOUNT) => accountStatusOn(e, now, account);
const preTradeChecks = (p: TradePlan, e: JournalEntry[], account = ACCOUNT, stopped: string[] = []) => preTradeChecksOn(p, e, account, stopped);
const rankSignals = (rows: Parameters<typeof rankSignalsOn>[0], e: JournalEntry[], now: number, account = ACCOUNT) => rankSignalsOn(rows, e, now, account);
const riskBudget = (symbol: string, grade: "A" | "B" | null, account = ACCOUNT) => riskBudgetOn(symbol, grade, account);

// Wed 11 Nov 2026 12:00 UTC = 14:00 platform time (UTC+2 in winter).
const NOON = Date.UTC(2026, 10, 11, 12, 0);
const ETH_SWEEP = "liquidity-sweep:ETHUSDT:1h";
const BTC_SMC = "smc:BTCUSDT:4h";
const XAU_LR = "liquidity-reversal:XAUUSDT:1h";
const JPY_LR = "liquidity-reversal:USDJPY:1h";
const EUR_LR = "liquidity-reversal:EURUSD:1h";

let n = 0;
function entry(over: Partial<JournalEntry>): JournalEntry {
  const setup = setupById(over.setupId ?? ETH_SWEEP)!;
  return {
    id: String(++n),
    accountId: "test",
    setupId: setup.id,
    symbol: setup.symbol,
    side: "LONG",
    grade: "A",
    status: "OPEN",
    entryTime: NOON - 3_600_000,
    entryPrice: 100,
    stopLoss: 95,
    takeProfit: 110,
    quantity: 5,
    lots: 5,
    riskAmount: 25,
    rulesFollowed: true,
    overrideReason: "",
    exitTime: null,
    exitPrice: null,
    pnl: null,
    rMultiple: null,
    exitReason: null,
    mistakes: [],
    notes: "",
    ...over,
  };
}
const closed = (pnl: number, exitTime = NOON - 1000, over: Partial<JournalEntry> = {}) =>
  entry({ status: "CLOSED", pnl, rMultiple: pnl / 25, exitTime, exitPrice: 100, ...over });

const plan = (over: Partial<TradePlan> = {}): TradePlan => ({
  setupId: ETH_SWEEP,
  side: "LONG",
  grade: "A",
  entry: 3000,
  stop: 2950,
  target: 3150,
  riskAmount: 25,
  time: NOON,
  ...over,
});
const status = (checks: ReturnType<typeof preTradeChecks>, id: string) => checks.find((c) => c.id === id)?.status;

describe("playbook config", () => {
  it("has 13 unique setups that the registry knows", () => {
    expect(PLAYBOOK_SETUPS).toHaveLength(13);
    expect(new Set(PLAYBOOK_SETUPS.map((s) => s.id)).size).toBe(13);
    for (const s of PLAYBOOK_SETUPS) expect(s.id).toBe(`${s.strategy}:${s.symbol}:${s.interval}`);
  });
});

describe("the firm's clock", () => {
  it("uses platform time (UTC+2 in winter, UTC+3 in summer) for the day", () => {
    expect(platformDay(Date.UTC(2026, 10, 11, 21, 59))).toBe("2026-11-11");
    expect(platformDay(Date.UTC(2026, 10, 11, 22, 1))).toBe("2026-11-12");
    expect(platformDay(Date.UTC(2026, 6, 1, 21, 1))).toBe("2026-07-02");
  });
  it("measures the distance to rollover either side of midnight", () => {
    expect(minutesFromRollover(Date.UTC(2026, 10, 11, 21, 50))).toBe(10);
    expect(minutesFromRollover(Date.UTC(2026, 10, 11, 22, 20))).toBe(20);
    expect(minutesFromRollover(NOON)).toBe(600);
  });
});

describe("sizing", () => {
  it("risks half as much on B-grade and skips B-grade currency trades", () => {
    expect(riskBudget("ETHUSDT", "A").amount).toBe(25);
    expect(riskBudget("ETHUSDT", "B").amount).toBe(12.5);
    expect(riskBudget("ETHUSDT", null).amount).toBe(12.5);
    expect(riskBudget("EURUSD", "B").skip).toMatch(/0\.72/);
    expect(riskBudget("EURUSD", "A").skip).toBeNull();
  });
  it("sizes gold in 100-ounce lots", () => {
    // $25 over a $10 stop = 2.5 oz = 0.025 lot → 0.02 lot, $20 at risk.
    const s = sizePosition("XAUUSDT", 4000, 3990, 25)!;
    expect(s.units).toBeCloseTo(2.5);
    expect(s.lots).toBe(0.02);
    expect(s.riskAtLots).toBeCloseTo(20);
    expect(s.belowMinLot).toBe(false);
  });
  it("converts yen pairs to dollars", () => {
    // 50 pips on USD/JPY at 150: $25 / (0.5 / 150) = 7,500 USD.
    const s = sizePosition("USDJPY", 150.5, 150, 25)!;
    expect(s.units).toBeCloseTo(7500);
    expect(s.lots).toBe(0.07);
    expect(pnlUsd("USDJPY", "LONG", 7500, 150.5, 150)).toBeCloseTo(-25, 0);
  });
  it("flags a stop too tight for the smallest lot", () => {
    const s = sizePosition("XAGUSDT", 50, 49, 25)!; // 0.01 lot = 50 oz = $50 at risk
    expect(s.belowMinLot).toBe(true);
    expect(s.riskAtLots).toBeCloseTo(50);
  });
  it("counts commission and spread inside the risk", () => {
    // $25 over a $10 stop plus $0.35/oz costs = 2.415 oz → 0.02 lot, $20.70 lost at the stop.
    const s = sizePosition("XAUUSDT", 4000, 3990, 25, 0.35)!;
    expect(s.units).toBeCloseTo(25 / 10.35);
    expect(s.lots).toBe(0.02);
    expect(s.riskAtLots).toBeCloseTo(20.7);
    expect(s.costAtLots).toBeCloseTo(0.7);
  });
  it("rejects a zero stop distance", () => {
    expect(sizePosition("ETHUSDT", 100, 100, 25)).toBeNull();
  });
});

describe("correlation", () => {
  it("treats BTC and ETH, gold and silver, and USD pairs by dollar direction as one bet", () => {
    expect(exposureKeys("BTCUSDT", "LONG")).toEqual(exposureKeys("ETHUSDT", "LONG"));
    expect(exposureKeys("XAUUSDT", "SHORT")).toEqual(exposureKeys("XAGUSDT", "SHORT"));
    expect(exposureKeys("EURUSD", "LONG")).toEqual(exposureKeys("USDJPY", "SHORT"));
    expect(exposureKeys("EURUSD", "LONG")).not.toEqual(exposureKeys("USDJPY", "LONG"));
  });
});

describe("account status", () => {
  it("counts today's P&L in platform time and the static floor", () => {
    const yesterday = Date.UTC(2026, 10, 10, 12);
    const s = accountStatus([closed(100, yesterday), closed(-30), entry({ riskAmount: 25 })], NOON);
    expect(s.balance).toBe(5070);
    expect(s.todayPnl).toBe(-30);
    expect(s.dayOpenBalance).toBe(5100);
    expect(s.firmDailyLimit).toBeCloseTo(204);
    expect(s.floor).toBe(4400);
    expect(s.openRisk).toBe(25);
    expect(s.roomToFloor).toBe(645);
    expect(s.dailyStopHit).toBe(false);
  });
  it("starts from the platform balance when there was P&L before the playbook", () => {
    // $4,850 on the platform after a $150 loss: the floor stays at $4,400.
    const account = { ...ACCOUNT, priorPnl: -150 };
    const s = accountStatus([entry({ riskAmount: 25 })], NOON, account);
    expect(s.balance).toBe(4850);
    expect(s.floor).toBe(4400);
    expect(s.roomToFloor).toBe(425);
    expect(s.toTarget).toBe(650);
    expect(s.firmDailyLimit).toBeCloseTo(194);
    // A loss that touches $4,400 now is $450 away, not $600.
    expect(status(preTradeChecks(plan({ riskAmount: 25 }), [closed(-425, Date.UTC(2026, 10, 2))], account), "floor")).toBe("fail");
    expect(status(preTradeChecks(plan({ riskAmount: 25 }), [closed(-425, Date.UTC(2026, 10, 2))]), "floor")).toBe("pass");
  });
  it("stops the day at −2% and flags the target", () => {
    expect(accountStatus([closed(-100)], NOON).dailyStopHit).toBe(true);
    expect(accountStatus([closed(500, Date.UTC(2026, 10, 1))], NOON).targetReached).toBe(true);
  });
});

describe("pre-trade checks", () => {
  it("passes a clean A-grade playbook trade", () => {
    const checks = preTradeChecks(plan({ signalEntry: 3000 }), []);
    expect(hardFailures(checks)).toEqual([]);
    expect(checks.filter((c) => c.status !== "pass")).toEqual([]);
  });
  it("fails a setup that isn't in the playbook", () => {
    expect(status(preTradeChecks(plan({ setupId: "vwap:ETHUSDT:5m" }), []), "setup")).toBe("fail");
  });
  it("fails a stop on the wrong side and oversized risk", () => {
    const checks = preTradeChecks(plan({ stop: 3050, riskAmount: 40 }), []);
    expect(status(checks, "stop")).toBe("fail");
    expect(status(checks, "risk")).toBe("fail");
  });
  it("allows half size on B-grade but not full size", () => {
    expect(status(preTradeChecks(plan({ grade: "B", riskAmount: 12.5 }), []), "risk")).toBe("pass");
    expect(status(preTradeChecks(plan({ grade: "B", riskAmount: 25 }), []), "risk")).toBe("fail");
  });
  it("fails B-grade currency trades", () => {
    expect(status(preTradeChecks(plan({ setupId: EUR_LR, grade: "B", entry: 1.1, stop: 1.09, target: 1.13, riskAmount: 12.5 }), []), "grade")).toBe("fail");
  });
  it("fails when all slots are full", () => {
    const open = [entry({ setupId: XAU_LR }), entry({ setupId: JPY_LR }), entry({ setupId: EUR_LR, side: "SHORT" }), entry({ setupId: BTC_SMC, side: "SHORT" })];
    expect(status(preTradeChecks(plan(), open), "slots")).toBe("fail");
  });
  it("fails a second crypto long, and a USD double-up", () => {
    expect(status(preTradeChecks(plan(), [entry({ setupId: BTC_SMC })]), "overlap")).toBe("fail");
    expect(status(preTradeChecks(plan(), [entry({ setupId: BTC_SMC, side: "SHORT" })]), "overlap")).toBe("pass");
    const longEur = entry({ setupId: EUR_LR, side: "LONG" });
    expect(status(preTradeChecks(plan({ setupId: JPY_LR, side: "SHORT", entry: 150, stop: 151, target: 147 }), [longEur]), "overlap")).toBe("fail");
  });
  it("fails after the daily stop and when the worst case would breach the firm's limits", () => {
    expect(status(preTradeChecks(plan(), [closed(-100)]), "daily-stop")).toBe("fail");
    // −$90 closed today and $100 open at risk: one more $25 loss reaches −$215, past the $200 limit.
    const open = [entry({ setupId: XAU_LR, riskAmount: 50 }), entry({ setupId: JPY_LR, riskAmount: 50 })];
    expect(status(preTradeChecks(plan(), [closed(-90), ...open]), "firm-daily")).toBe("fail");
    // $575 lost overall: one more $25 loss touches the $4,400 floor.
    expect(status(preTradeChecks(plan(), [closed(-575, Date.UTC(2026, 10, 2))]), "floor")).toBe("fail");
  });
  it("warns, without breaking a rule, on chasing and rollover", () => {
    const checks = preTradeChecks(plan({ entry: 3020, signalEntry: 3000, time: Date.UTC(2026, 10, 11, 21, 50) }), []);
    expect(status(checks, "chase")).toBe("warn");
    expect(status(checks, "rollover")).toBe("warn");
    expect(hardFailures(checks)).toEqual([]);
  });
});

describe("signal ranking", () => {
  const sig = (id: string, grade: "A" | "B", side: "LONG" | "SHORT" = "LONG", statusName: "new" | "open" = "new") => ({
    id,
    lastClose: 100,
    lastCloseTime: NOON,
    signal: { status: statusName, side, signalTime: NOON, entry: 100, stop: side === "LONG" ? 98 : 102, target: side === "LONG" ? 106 : 94, rr: 3, exitPrice: null, exitTime: null, rMultiple: null, grade },
  });
  it("puts new A-grade signals first, then by setup order, and drops non-playbook rows", () => {
    const ranked = rankSignals([sig(XAU_LR, "B"), sig(BTC_SMC, "A", "SHORT"), sig(ETH_SWEEP, "A", "LONG", "open"), sig(JPY_LR, "A"), sig("vwap:ETHUSDT:5m", "A")], [], NOON);
    expect(ranked.map((r) => r.setup.id)).toEqual([BTC_SMC, JPY_LR, XAU_LR, ETH_SWEEP]);
  });
  it("sizes each signal from its grade and marks blocked ones", () => {
    const ranked = rankSignals([sig(ETH_SWEEP, "A")], [entry({ setupId: BTC_SMC })], NOON);
    expect(ranked[0].plan?.riskAmount).toBeLessThanOrEqual(25);
    expect(ranked[0].takeable).toBe(false);
  });
});

describe("scorecard", () => {
  const setup = setupById(ETH_SWEEP)!;
  it("computes R statistics", () => {
    const s = rStats([2, -1, -1, 3, -1]);
    expect(s.trades).toBe(5);
    expect(s.winRatePct).toBe(40);
    expect(s.sumR).toBe(2);
    expect(s.profitFactor).toBeCloseTo(5 / 3);
    expect(s.maxDrawdownR).toBe(2);
    expect(s.lossStreak).toBe(1);
  });
  it("waits for enough trades, watches long streaks and pauses losing setups", () => {
    expect(judgeSetup(setup, rStats([])).verdict).toBe("no-trades");
    expect(judgeSetup(setup, rStats([1, -1, 2])).verdict).toBe("collecting");
    expect(judgeSetup(setup, rStats(Array(8).fill(-1))).verdict).toBe("watch");
    const losing = Array.from({ length: 26 }, (_, i) => (i % 3 === 0 ? 1.5 : -1));
    expect(judgeSetup(setup, rStats(losing)).verdict).toBe("pause");
    const fine = Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? 2 : -1));
    expect(judgeSetup(setup, rStats(fine)).verdict).toBe("on-track");
  });
  it("splits results by whether the rules were followed and ranks mistakes by cost", () => {
    const a = adherence([
      closed(50),
      closed(-25, NOON, { rulesFollowed: false }),
      closed(-50, NOON, { mistakes: ["moved-stop"] }),
      closed(-25, NOON, { mistakes: ["late-entry"] }),
      entry({}),
    ]);
    expect(a.followed.trades).toBe(1);
    expect(a.broken.trades).toBe(3);
    expect(a.mistakes.map((m) => m.id)).toEqual(["moved-stop", "late-entry"]);
  });
});

describe("the two FundingPips accounts", () => {
  const flex = accountById("flex-10k")!;
  const pro = accountById("pro-5k")!;
  const flexPlan = (over: Partial<TradePlan> = {}) => plan({ riskAmount: 100, ...over });
  const lossOn = (account: PlaybookAccount, pnl: number, over: Partial<JournalEntry> = {}) => closed(pnl, NOON - 1000, { accountId: account.id, riskAmount: Math.abs(pnl), ...over });

  it("matches the limits on the FundingPips dashboards", () => {
    expect(PLAYBOOK_ACCOUNTS.map((a) => a.id)).toEqual(["flex-10k", "pro-5k"]);
    const f = accountStatusOn([], NOON, flex);
    expect([f.floor, f.firmDailyLimit, f.targetBalance, f.ownDailyStop]).toEqual([8800, 400, 11000, 200]);
    const p = accountStatusOn([], NOON, pro);
    expect([p.floor, p.firmDailyLimit, p.targetBalance, p.ownDailyStop]).toEqual([4700, 150, 5300, 75]);
  });
  it("risks $100/$50 on the Flex and $37.50 A-grade only on the Pro", () => {
    expect(riskBudgetOn("ETHUSDT", "A", flex).amount).toBe(100);
    expect(riskBudgetOn("ETHUSDT", "B", flex).amount).toBe(50);
    expect(riskBudgetOn("EURUSD", "B", flex).skip).toMatch(/0\.72/);
    expect(riskBudgetOn("ETHUSDT", "A", pro).amount).toBe(37.5);
    expect(riskBudgetOn("ETHUSDT", "B", pro).skip).toMatch(/A-grade trades only/);
    expect(riskBudgetOn("ETHUSDT", null, pro).skip).toMatch(/A-grade trades only/);
    expect(status(preTradeChecksOn(plan({ grade: "B", riskAmount: 18.75 }), [], pro), "grade")).toBe("fail");
    expect(hardFailures(preTradeChecksOn(flexPlan(), [], flex))).toEqual([]);
    expect(hardFailures(preTradeChecksOn(plan({ riskAmount: 37.5 }), [], pro))).toEqual([]);
  });
  it("allows 2 open trades", () => {
    const open = [entry({ accountId: flex.id, setupId: XAU_LR, riskAmount: 100 })];
    expect(status(preTradeChecksOn(flexPlan(), open, flex), "slots")).toBe("pass");
    open.push(entry({ accountId: flex.id, setupId: JPY_LR, riskAmount: 100 }));
    expect(status(preTradeChecksOn(flexPlan(), open, flex), "slots")).toBe("fail");
  });
  it("stops the day after 2 losses, not counting breakeven exits", () => {
    expect(accountStatusOn([lossOn(flex, -100)], NOON, flex).dailyStopHit).toBe(false);
    expect(accountStatusOn([lossOn(flex, -100), lossOn(pro, -2, { exitReason: "breakeven" })], NOON, flex).dailyStopHit).toBe(false);
    const s = accountStatusOn([lossOn(flex, -40), lossOn(flex, -40)], NOON, flex);
    expect(s.lossesToday).toBe(2);
    expect(s.dailyStopHit).toBe(true);
    expect(status(preTradeChecksOn(flexPlan(), [lossOn(flex, -40), lossOn(flex, -40)], flex), "daily-stop")).toBe("fail");
  });
  it("keeps closed losses plus open risk inside the own daily stop", () => {
    // −$100 today and $100 open: another $100 could reach −$300, past the $200 stop.
    const entries = [lossOn(flex, -100), entry({ accountId: flex.id, setupId: XAU_LR, riskAmount: 100 })];
    expect(status(preTradeChecksOn(flexPlan(), entries, flex), "own-daily")).toBe("fail");
    // Two fresh trades fit exactly: −$200 worst case, with room for lot rounding.
    expect(status(preTradeChecksOn(flexPlan({ riskAmount: 103 }), [entry({ accountId: flex.id, setupId: XAU_LR, riskAmount: 100 })], flex), "own-daily")).toBe("pass");
    // Pro: $37.50 open plus $37.50 new is its $75 stop.
    expect(status(preTradeChecksOn(plan({ riskAmount: 37.5 }), [entry({ accountId: pro.id, setupId: XAU_LR, riskAmount: 37.5 })], pro), "own-daily")).toBe("pass");
    expect(status(preTradeChecksOn(plan({ riskAmount: 37.5 }), [lossOn(pro, -37.5), entry({ accountId: pro.id, setupId: XAU_LR, riskAmount: 37.5 })], pro), "own-daily")).toBe("fail");
  });
  it("blocks every account when another hit its daily stop", () => {
    const checks = preTradeChecksOn(flexPlan(), [], flex, [pro.name]);
    expect(status(checks, "linked-stop")).toBe("fail");
    expect(checks.find((c) => c.id === "linked-stop")?.detail).toContain(pro.name);
    expect(preTradeChecksOn(flexPlan(), [], flex).some((c) => c.id === "linked-stop")).toBe(false);
  });
  it("uses the Pro's 6% floor", () => {
    // $250 lost overall: one more $37.50 loss would leave $4,712.50, still above $4,700; $270 lost would not.
    expect(status(preTradeChecksOn(plan({ riskAmount: 37.5 }), [closed(-250, Date.UTC(2026, 10, 2), { accountId: pro.id })], pro), "floor")).toBe("pass");
    const checks = preTradeChecksOn(plan({ riskAmount: 37.5 }), [closed(-270, Date.UTC(2026, 10, 2), { accountId: pro.id })], pro);
    expect(status(checks, "floor")).toBe("fail");
    expect(checks.find((c) => c.id === "floor")?.label).toContain("6%");
  });
});
