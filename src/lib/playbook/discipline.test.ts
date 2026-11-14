import { describe, expect, it } from "vitest";
import { PLAYBOOK_ACCOUNTS, customSetupId } from "./config";
import { dayReport, evaluateAutoRules, mondayOf, rulesForDay, streakOf, type DayReport } from "./discipline";
import type { JournalEntry } from "./rules";

const MON = "2026-11-16";
const at = (day: string, hhmm: string) => Date.parse(`${day}T${hhmm}:00Z`);
let n = 0;
// A Pro trade on a Playbook setup, sized at the plan's $25 (0.5% of $5,000).
const trade = (over: Partial<JournalEntry> = {}): JournalEntry => ({
  id: `t${++n}`, accountId: "pro-5k", setupId: "macd-200ema-sr:NAS100:4h", symbol: "NAS100", side: "LONG", grade: "A", status: "CLOSED",
  entryTime: at(MON, "10:00"), entryPrice: 100, stopLoss: 99, takeProfit: 102, quantity: 1, lots: 1, riskAmount: 25, rulesFollowed: true,
  overrideReason: "", exitTime: at(MON, "11:00"), exitPrice: 102, pnl: 50, commission: 0, swap: 0, rMultiple: 2, exitReason: "target", mistakes: [], notes: "",
  ...over,
});
const status = (entries: JournalEntry[], day = MON) => Object.fromEntries(evaluateAutoRules(day, entries, PLAYBOOK_ACCOUNTS).map((r) => [r.id, r.status]));

describe("evaluateAutoRules", () => {
  it("keeps every rule on a clean day and on a day without trades", () => {
    expect(Object.values(status([trade()]))).toEqual(Array(6).fill("kept"));
    expect(Object.values(status([]))).toEqual(Array(6).fill("kept"));
  });

  it("flags custom trades and another account's setups", () => {
    expect(status([trade({ setupId: customSetupId("ETHUSDT"), symbol: "custom:ETHUSDT" })])["plan-only"]).toBe("broken");
    expect(status([trade({ setupId: "ema833-zones:NAS100:5m" })])["plan-only"]).toBe("broken"); // a Flex setup on the Pro
  });

  it("flags a trade after two losses", () => {
    const loss = (h: string) => trade({ symbol: "SPX500", setupId: "liquidity-reversal:SPX500:4h", entryTime: at(MON, h), exitTime: at(MON, h.replace(":00", ":30")), pnl: -25, exitReason: "stop" });
    const third = trade({ entryTime: at(MON, "15:00"), exitTime: at(MON, "16:00") });
    expect(status([loss("08:00"), loss("09:00"), third])["loss-limit"]).toBe("broken");
    expect(status([loss("08:00"), third])["loss-limit"]).toBe("kept");
  });

  it("flags re-entry within an hour of a loss and same-day flips", () => {
    const loss = trade({ entryTime: at(MON, "08:00"), exitTime: at(MON, "09:00"), pnl: -25, exitReason: "stop" });
    expect(status([loss, trade({ entryTime: at(MON, "09:30"), exitTime: at(MON, "10:30") })])["no-revenge"]).toBe("broken");
    expect(status([loss, trade({ side: "SHORT", entryTime: at(MON, "13:00"), exitTime: at(MON, "14:00") })])["no-revenge"]).toBe("broken");
    expect(status([loss, trade({ entryTime: at(MON, "13:00"), exitTime: at(MON, "14:00") })])["no-revenge"]).toBe("kept");
  });

  it("flags oversized and journal-logged trades", () => {
    expect(status([trade({ riskAmount: 37.5 })])["right-size"]).toBe("broken"); // the old 0.75%
    expect(status([trade({ riskAmount: 26 })])["right-size"]).toBe("kept"); // within 5%
    expect(status([trade({ source: "journal" })])["logged-first"]).toBe("broken");
  });

  it("flags trades below the week's stop line", () => {
    const earlier = trade({ entryTime: at("2026-11-13", "10:00"), exitTime: at("2026-11-13", "11:00"), pnl: -200 });
    expect(status([earlier, trade()])["stop-line"]).toBe("broken");
  });
});

describe("streak", () => {
  const days = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"];
  const reports = (states: DayReport["state"][]) => new Map(days.slice(0, states.length).map((d, i) => [d, { day: d, state: states[i], rules: [], checkedIn: states[i] === "kept" || states[i] === "broken", trades: 0 }]));

  it("counts kept trading days and skips weekends", () => {
    const s = streakOf(reports(["kept", "kept", "kept", "kept", "kept", "weekend", "weekend", "open"]), "2026-11-23", MON);
    expect(s).toMatchObject({ current: 5, best: 5, atRisk: true, todayDone: false, nextMilestone: 10 });
  });

  it("restarts after a missed or broken day", () => {
    expect(streakOf(reports(["kept", "kept", "missed", "kept"]), "2026-11-19", MON)).toMatchObject({ current: 1, best: 2 });
    expect(streakOf(reports(["kept", "broken", "kept"]), "2026-11-18", MON)).toMatchObject({ current: 1, best: 1, todayDone: true });
  });

  it("is empty before the first close-out", () => {
    expect(streakOf(new Map(), MON, null)).toMatchObject({ current: 0, best: 0, nextMilestone: 5 });
  });

  it("turns a day into kept, broken, missed or open", () => {
    const all = rulesForDay(MON).filter((r) => r.kind === "manual").map((r) => r.id);
    expect(dayReport(MON, MON, [trade()], PLAYBOOK_ACCOUNTS, undefined).state).toBe("open");
    expect(dayReport(MON, "2026-11-17", [trade()], PLAYBOOK_ACCOUNTS, undefined).state).toBe("missed");
    expect(dayReport(MON, MON, [trade()], PLAYBOOK_ACCOUNTS, { day: MON, kept: all }).state).toBe("kept");
    expect(dayReport(MON, MON, [trade()], PLAYBOOK_ACCOUNTS, { day: MON, kept: [] }).state).toBe("broken");
    expect(dayReport("2026-11-21", "2026-11-23", [], PLAYBOOK_ACCOUNTS, undefined).state).toBe("weekend");
    expect(dayReport("2026-11-21", "2026-11-21", [], PLAYBOOK_ACCOUNTS, { day: "2026-11-21", kept: all }).state).toBe("weekend");
  });

  it("asks for the weekly review only on Fridays", () => {
    expect(rulesForDay("2026-11-20").some((r) => r.id === "weekly-review")).toBe(true);
    expect(rulesForDay(MON).some((r) => r.id === "weekly-review")).toBe(false);
    expect(mondayOf("2026-11-22")).toBe(MON);
  });
});
