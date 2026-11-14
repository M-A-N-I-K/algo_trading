import { accountSetup, activeSetupById, type PlaybookAccount } from "./config";
import { platformDay, riskBudget, type JournalEntry } from "./rules";

// The discipline streak: a daily checklist of the habits that cost money in
// week 46 (9–13 Nov 2026: 16 of 18 trades off-plan, −$215 of −$240). Most
// rules are checked against the journal automatically; the rest are ticked
// when the day is closed out. A trading day counts toward the streak only when
// it's closed out and every rule was kept, like a Snapchat streak: miss a day
// and it starts again.

export type RuleKind = "auto" | "manual";
export interface DisciplineRule {
  id: string;
  label: string;
  why: string;
  kind: RuleKind;
  fridayOnly?: boolean;
}

export const DISCIPLINE_RULES: readonly DisciplineRule[] = [
  { id: "plan-only", kind: "auto", label: "Only this account's Playbook setups", why: "No custom trades, retired setups or another account's setups. No signal, no trade." },
  { id: "loss-limit", kind: "auto", label: "No trade after 2 losses or the daily stop", why: "Once an account is stopped for the day, close the platform." },
  { id: "no-revenge", kind: "auto", label: "No re-entry within an hour of a loss", why: "And never flip direction in the same market on the same day after a loss." },
  { id: "right-size", kind: "auto", label: "Risk no more than the plan's size", why: "The Playbook's A/B risk times the setup's scale (8/33 setups: a quarter)." },
  { id: "logged-first", kind: "auto", label: "Logged in the Playbook before entry", why: "Trades logged afterwards on the Trades page skip the pre-trade checks." },
  { id: "stop-line", kind: "auto", label: "Stay above this week's stop line", why: "No new trades on an account below its line." },
  { id: "all-logged", kind: "manual", label: "Every trade I took today is logged here", why: "The automatic checks only see logged trades." },
  { id: "weekly-review", kind: "manual", fridayOnly: true, label: "Compared the week's trades with the Playbook's signals", why: "Friday: the goal is that every trade matched a signal." },
];

/** This week's goals and limits, shown above the checklist. */
export const WEEK_PLAN = {
  weekOf: "2026-11-16",
  goals: [
    "Every trade is a Playbook signal on its own account. Zero custom trades.",
    "Stop after 2 losses or the daily stop, on every account.",
    "Pro at 0.5% risk; done for the week below $4,850.",
    "Flex: the 8/33 basket at $25 a trade, the other setups at their Playbook size.",
  ],
  // No new trades on an account whose balance is below its line.
  stopLines: { "pro-5k": 4850 } as Record<string, number>,
};

export const STREAK_MILESTONES = [5, 10, 20, 50, 100] as const;
const HOUR = 3_600_000;
const RISK_TOLERANCE = 1.05;

export type RuleStatus = "kept" | "broken" | "unchecked";
export interface RuleResult {
  id: string;
  status: RuleStatus;
  detail: string;
}

export const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 Sunday … 6 Saturday
export const isWeekday = (day: string) => { const w = weekdayOf(day); return w >= 1 && w <= 5; };
export const shiftDay = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 24 * HOUR).toISOString().slice(0, 10);
/** Monday of the week a day falls in. */
export const mondayOf = (day: string) => shiftDay(day, -((weekdayOf(day) + 6) % 7));

export const rulesForDay = (day: string) => DISCIPLINE_RULES.filter((r) => !r.fridayOnly || weekdayOf(day) === 5);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const marketOf = (e: JournalEntry) => e.symbol;

/**
 * Checks one platform day's trades against the automatic rules. `entries` is
 * every account's journal; the trades entered on `day` are judged, with
 * earlier trades as context (losses already taken, balance so far).
 */
export function evaluateAutoRules(day: string, entries: JournalEntry[], accounts: readonly PlaybookAccount[]): RuleResult[] {
  const tz = accounts[0]?.timeZone;
  const dayOf = (ms: number) => platformDay(ms, tz);
  const todays = entries.filter((e) => dayOf(e.entryTime) === day).sort((a, b) => a.entryTime - b.entryTime);
  const acct = (id: string) => accounts.find((a) => a.id === id);
  const results: RuleResult[] = [];

  // plan-only
  const offPlan = todays.filter((e) => { const a = acct(e.accountId); return !a || !activeSetupById(e.setupId) || !accountSetup(a, e.setupId); });
  results.push(offPlan.length
    ? { id: "plan-only", status: "broken", detail: `${plural(offPlan.length, "trade")} outside the account's setups (${[...new Set(offPlan.map(marketOf))].join(", ")})` }
    : { id: "plan-only", status: "kept", detail: todays.length ? `${plural(todays.length, "trade")}, all Playbook setups` : "No trades" });

  // loss-limit: a trade entered after its account was already stopped that day
  const afterStop: JournalEntry[] = [];
  for (const e of todays) {
    const a = acct(e.accountId);
    if (!a) continue;
    const before = entries.filter((x) => x.accountId === a.id && x.id !== e.id && x.status === "CLOSED" && x.pnl !== null && x.exitTime !== null && x.exitTime <= e.entryTime && dayOf(x.exitTime) === day);
    const losses = before.filter((x) => x.pnl! < 0 && x.exitReason !== "breakeven").length;
    const pnl = before.reduce((s, x) => s + x.pnl!, 0);
    if (losses >= a.rules.maxLossesPerDay || pnl <= -(a.size * a.rules.dailyStopPct) / 100) afterStop.push(e);
  }
  results.push(afterStop.length
    ? { id: "loss-limit", status: "broken", detail: `${plural(afterStop.length, "trade")} taken after the account was stopped for the day` }
    : { id: "loss-limit", status: "kept", detail: "Stopped when the rules said to" });

  // no-revenge
  const revenge = todays.filter((b) => entries.some((a) =>
    a.id !== b.id && a.symbol === b.symbol && a.pnl !== null && a.pnl < 0 && a.exitTime !== null && a.exitTime <= b.entryTime &&
    (b.entryTime - a.exitTime < HOUR || (a.side !== b.side && dayOf(a.exitTime) === day))));
  results.push(revenge.length
    ? { id: "no-revenge", status: "broken", detail: `${revenge.length} ${revenge.length === 1 ? "re-entry" : "re-entries"} after a loss (${[...new Set(revenge.map(marketOf))].join(", ")})` }
    : { id: "no-revenge", status: "kept", detail: "No revenge trades" });

  // right-size: only for Playbook setups (off-plan trades are already broken above)
  const oversized = todays.filter((e) => {
    const a = acct(e.accountId), s = activeSetupById(e.setupId);
    if (!a || !s) return false;
    const budget = riskBudget(e.symbol, e.grade, a, s).amount;
    return budget > 0 && e.riskAmount > budget * RISK_TOLERANCE;
  });
  results.push(oversized.length
    ? { id: "right-size", status: "broken", detail: `${plural(oversized.length, "trade")} risked more than the plan (${oversized.map((e) => `$${e.riskAmount.toFixed(0)}`).join(", ")})` }
    : { id: "right-size", status: "kept", detail: "Sized from the plan" });

  // logged-first
  const late = todays.filter((e) => e.source === "journal");
  results.push(late.length
    ? { id: "logged-first", status: "broken", detail: `${plural(late.length, "trade")} logged on the Trades page instead` }
    : { id: "logged-first", status: "kept", detail: "Every trade went through the pre-trade checks" });

  // stop-line
  const belowLine = todays.filter((e) => {
    const a = acct(e.accountId), line = WEEK_PLAN.stopLines[e.accountId];
    if (!a || line === undefined) return false;
    const closed = entries.filter((x) => x.accountId === a.id && x.pnl !== null && x.exitTime !== null && x.exitTime <= e.entryTime && x.id !== e.id);
    return a.size + a.priorPnl + closed.reduce((s, x) => s + x.pnl!, 0) < line;
  });
  results.push(belowLine.length
    ? { id: "stop-line", status: "broken", detail: `${plural(belowLine.length, "trade")} taken below the stop line` }
    : { id: "stop-line", status: "kept", detail: "Above the line" });

  return results;
}

export interface CheckIn {
  day: string;
  kept: string[]; // manual rule ids ticked
}

export type DayState = "kept" | "broken" | "missed" | "open" | "future" | "weekend";
export interface DayReport {
  day: string;
  state: DayState;
  rules: RuleResult[];
  checkedIn: boolean;
  trades: number;
}

/** One day: automatic results plus the close-out's ticks. */
export function dayReport(day: string, today: string, entries: JournalEntry[], accounts: readonly PlaybookAccount[], checkIn: CheckIn | undefined): DayReport {
  const tz = accounts[0]?.timeZone;
  const trades = entries.filter((e) => platformDay(e.entryTime, tz) === day).length;
  if (day > today) return { day, state: "future", rules: [], checkedIn: false, trades: 0 };
  const auto = evaluateAutoRules(day, entries, accounts);
  const manual: RuleResult[] = rulesForDay(day).filter((r) => r.kind === "manual").map((r) => ({
    id: r.id,
    status: !checkIn ? "unchecked" : checkIn.kept.includes(r.id) ? "kept" : "broken",
    detail: !checkIn ? "Tick when you close out the day" : checkIn.kept.includes(r.id) ? "Ticked" : "Not ticked",
  }));
  const rules = [...auto, ...manual];
  const broken = rules.some((r) => r.status === "broken");
  // A weekend day without trades never counts, closed out or not.
  const state: DayState = !isWeekday(day) && trades === 0
    ? "weekend"
    : broken ? "broken" : checkIn ? "kept" : day === today ? "open" : "missed";
  return { day, state, rules, checkedIn: !!checkIn, trades };
}

export interface Streak {
  current: number;
  best: number;
  atRisk: boolean; // today is a trading day, not closed out yet, and a streak is running
  todayDone: boolean;
  nextMilestone: number | null;
}

/**
 * Consecutive kept trading days. Weekends without trades are skipped; a
 * weekday that wasn't closed out, or broke a rule, ends the streak. Today
 * doesn't break it while it's still open. Counting starts at the first close-out.
 */
export function streakOf(reports: Map<string, DayReport>, today: string, firstDay: string | null): Streak {
  if (!firstDay) return { current: 0, best: 0, atRisk: false, todayDone: false, nextMilestone: STREAK_MILESTONES[0] };
  let run = 0, best = 0;
  for (let d = firstDay; d <= today; d = shiftDay(d, 1)) {
    const r = reports.get(d);
    if (!r || r.state === "weekend" || r.state === "future") continue;
    if (r.state === "open") continue; // today, still to close out
    if (r.state === "kept") { run++; best = Math.max(best, run); } else run = 0;
  }
  const t = reports.get(today);
  const todayDone = !!t && t.checkedIn;
  return {
    current: run,
    best,
    atRisk: !!t && t.state === "open" && run > 0,
    todayDone,
    nextMilestone: STREAK_MILESTONES.find((m) => m > run) ?? null,
  };
}
