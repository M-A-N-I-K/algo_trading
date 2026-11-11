import { isForex } from "@/lib/markets/yahoo";
import { usdPerUnitMove } from "@/lib/costs/fundingpips";
import { specFor } from "@/lib/mt5/specs";
import type { LatestSignal } from "@/lib/signals/scan";
import {
  lotUnits,
  MISTAKES,
  PLAYBOOK_ACCOUNT,
  activeSetupById,
  customSetup,
  PLAYBOOK_SETUPS,
  RETIRED_SETUPS,
  setupById,
  type PlaybookAccount,
  type PlaybookSetup,
} from "./config";

// The playbook's logic: account status against the firm's limits, position
// size, the pre-trade checks, signal ranking and the per-setup scorecard.
// Pure: entries and numbers in, results out. Times are epoch milliseconds.

export type Side = "LONG" | "SHORT";
export type Grade = "A" | "B";

export interface JournalEntry {
  id: string;
  accountId: string;
  setupId: string;
  symbol: string;
  side: Side;
  grade: Grade | null;
  status: "OPEN" | "CLOSED";
  entryTime: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number | null;
  quantity: number;
  lots: number | null;
  riskAmount: number; // $ lost if the stop is hit
  rulesFollowed: boolean;
  overrideReason: string;
  exitTime: number | null;
  exitPrice: number | null;
  pnl: number | null; // net $: profit + commission + swap
  commission: number | null; // $ charged, negative
  swap: number | null; // $ as the platform shows it
  rMultiple: number | null;
  exitReason: string | null;
  mistakes: string[];
  notes: string;
}

/* ---------- the firm's clock ---------- */

const dayFormatters = new Map<string, Intl.DateTimeFormat>();
function parts(ms: number, timeZone: string) {
  let f = dayFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    dayFormatters.set(timeZone, f);
  }
  const p = Object.fromEntries(f.formatToParts(ms).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/** The firm's trading day (YYYY-MM-DD) a moment falls in. */
export const platformDay = (ms: number, timeZone = PLAYBOOK_ACCOUNT.timeZone) => parts(ms, timeZone).day;

/** Minutes to the nearest platform midnight (rollover), either side. */
export function minutesFromRollover(ms: number, timeZone = PLAYBOOK_ACCOUNT.timeZone): number {
  const m = parts(ms, timeZone).minutes;
  return Math.min(m, 24 * 60 - m);
}

/* ---------- account ---------- */

export interface AccountStatus {
  size: number;
  balance: number; // starting size + P&L before the playbook + closed playbook P&L
  priorPnl: number; // P&L on the platform before trades were logged here
  closedPnl: number; // closed playbook P&L
  floor: number; // equity may never touch this
  roomToFloor: number; // balance − open risk − floor
  today: string;
  todayPnl: number; // closed today, platform time
  dayOpenBalance: number;
  ownDailyStop: number; // $, positive
  firmDailyLimit: number; // $, positive
  openCount: number;
  openRisk: number; // $ lost if every open trade hits its stop
  worstCaseToday: number; // todayPnl − openRisk
  targetBalance: number;
  toTarget: number;
  lossesToday: number; // losing trades closed today, platform time
  dailyStopHit: boolean; // own daily stop reached, or too many losses today
  targetReached: boolean;
}

export function accountStatus(entries: JournalEntry[], now: number, account: PlaybookAccount = PLAYBOOK_ACCOUNT): AccountStatus {
  const rules = account.rules;
  const today = platformDay(now, account.timeZone);
  let closedPnl = 0;
  let todayPnl = 0;
  let lossesToday = 0;
  let openCount = 0;
  let openRisk = 0;
  for (const e of entries) {
    if (e.status === "OPEN") {
      openCount++;
      openRisk += e.riskAmount;
    } else if (e.pnl !== null) {
      closedPnl += e.pnl;
      if (e.exitTime !== null && platformDay(e.exitTime, account.timeZone) === today) {
        todayPnl += e.pnl;
        if (e.pnl < 0 && e.exitReason !== "breakeven") lossesToday++; // costs on a breakeven exit aren't a loss
      }
    }
  }
  const balance = account.size + account.priorPnl + closedPnl;
  const dayOpenBalance = balance - todayPnl;
  const floor = account.size * (1 - account.maxLossPct / 100);
  const ownDailyStop = (account.size * rules.dailyStopPct) / 100;
  const targetBalance = account.size * (1 + account.targetPct / 100);
  return {
    size: account.size,
    balance,
    priorPnl: account.priorPnl,
    closedPnl,
    floor,
    roomToFloor: balance - openRisk - floor,
    today,
    todayPnl,
    dayOpenBalance,
    ownDailyStop,
    firmDailyLimit: (dayOpenBalance * account.dailyLossPct) / 100,
    openCount,
    openRisk,
    worstCaseToday: todayPnl - openRisk,
    targetBalance,
    toTarget: targetBalance - balance,
    lossesToday,
    dailyStopHit: todayPnl <= -ownDailyStop || lossesToday >= rules.maxLossesPerDay,
    targetReached: balance >= targetBalance,
  };
}

/* ---------- sizing ---------- */

/** What the plan lets this trade risk, from its grade. `skip` says why the account doesn't take it. */
export function riskBudget(symbol: string, grade: Grade | null, account: PlaybookAccount = PLAYBOOK_ACCOUNT) {
  const rules = account.rules;
  const full = grade === "A";
  const riskPct = full ? rules.riskPctA : (rules.riskPctB ?? 0);
  const skip =
    !full && rules.riskPctB === null
      ? `This account takes A-grade trades only (${grade === "B" ? "this one is B-grade" : "this one has no grade"})`
      : grade === "B" && rules.skipBOnForex && isForex(symbol)
        ? "B-grade currency trades lost money in the backtest (profit factor 0.72)"
        : null;
  return { riskPct, amount: (account.size * riskPct) / 100, skip };
}

/** $ gained per unit (coin, ounce, base currency) per 1.0 move in price. */
export { usdPerUnitMove };

export function pnlUsd(symbol: string, side: Side, units: number, entry: number, exit: number): number {
  const d = side === "LONG" ? 1 : -1;
  return (exit - entry) * d * units * usdPerUnitMove(symbol, exit);
}

export interface Sizing {
  units: number; // exact size for the risk
  lots: number; // rounded down to 0.01 lot
  riskAtLots: number; // $ lost at the stop with the rounded lots, costs included
  costAtLots: number; // $ of that which is commission and spread
  belowMinLot: boolean; // even 0.01 lot risks more than the budget
}

/**
 * Size so that a stopped-out trade loses `riskAmount` in all: the stop
 * distance plus `costPerUnitUsd`, the round trip's commission and spread per
 * unit (see roundTripCostPerUnitUsd in src/lib/costs/fundingpips.ts).
 */
export function sizePosition(symbol: string, entry: number, stop: number, riskAmount: number, costPerUnitUsd = 0): Sizing | null {
  const distance = Math.abs(entry - stop);
  if (!(distance > 0) || !(riskAmount > 0)) return null;
  const perUnit = distance * usdPerUnitMove(symbol, stop) + Math.max(0, costPerUnitUsd);
  const unitsPerLot = lotUnits(symbol);
  // A market sized from MT5's specs (FTSE 100) can't be sized before the terminal sends them.
  if (!Number.isFinite(perUnit) || !Number.isFinite(unitsPerLot)) return null;
  const units = riskAmount / perUnit;
  const spec = specFor(symbol);
  const step = spec?.volumeStep || 0.01;
  const minLot = spec?.volumeMin || 0.01;
  const lots = +(Math.floor(units / unitsPerLot / step + 1e-9) * step).toFixed(4);
  const belowMinLot = lots < minLot;
  const usedLots = belowMinLot ? minLot : lots;
  const usedUnits = usedLots * unitsPerLot;
  return { units, lots: usedLots, riskAtLots: usedUnits * perUnit, costAtLots: usedUnits * Math.max(0, costPerUnitUsd), belowMinLot };
}

/* ---------- correlation ---------- */

/**
 * The ideas a position is a bet on. Two trades sharing one are the same bet:
 * BTC and ETH move together, so do gold and silver, and every USD pair is a
 * bet on the dollar (long EUR/USD = short USD = long USD/JPY's opposite).
 */
export function exposureKeys(symbol: string, side: Side): string[] {
  const s = symbol.toUpperCase();
  if (s.startsWith("BTC") || s.startsWith("ETH")) return [`crypto ${side === "LONG" ? "long" : "short"}`];
  if (s.startsWith("XAU") || s.startsWith("XAG")) return [`metals ${side === "LONG" ? "long" : "short"}`];
  if (isForex(s)) {
    const usdLong = s.startsWith("USD") ? side === "LONG" : side === "SHORT";
    return [`USD ${usdLong ? "long" : "short"}`];
  }
  return [`${s} ${side === "LONG" ? "long" : "short"}`];
}

/* ---------- pre-trade checks ---------- */

export type CheckStatus = "pass" | "warn" | "fail";

export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  hard: boolean; // a failed hard check breaks a rule; a warning doesn't
}

export interface TradePlan {
  setupId: string;
  side: Side;
  grade: Grade | null;
  entry: number;
  stop: number;
  target: number | null;
  riskAmount: number; // $ at risk as entered
  signalEntry?: number | null; // the signal's price, to spot chasing
  time: number;
}

const usd = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;

/**
 * The checks for one trade on one account. `entries` are that account's
 * trades; `stoppedElsewhere` names other accounts that hit their daily stop
 * today (a bad day on one is a reason to stop on all).
 */
export function preTradeChecks(plan: TradePlan, entries: JournalEntry[], account: PlaybookAccount = PLAYBOOK_ACCOUNT, stoppedElsewhere: string[] = []): Check[] {
  const rules = account.rules;
  const checks: Check[] = [];
  const add = (id: string, label: string, ok: boolean | "warn", detail: string, hard = true) =>
    checks.push({ id, label, status: ok === "warn" ? "warn" : ok ? "pass" : "fail", detail, hard });

  const setup = activeSetupById(plan.setupId);
  const custom = setup ? undefined : customSetup(plan.setupId);
  const retired = setup || custom ? undefined : setupById(plan.setupId)?.retired;
  const symbol = (setup ?? custom)?.symbol ?? "";
  add(
    "setup",
    "A playbook setup",
    Boolean(setup),
    setup
      ? `${setup.strategyName} on ${setup.platformSymbol} ${setup.interval}`
      : custom
        ? `Custom trade on ${custom.platformSymbol}: no backtest behind it.`
        : retired
          ? `Retired: ${retired}.`
          : "This strategy and market aren't in the playbook.",
  );

  const budget = riskBudget(symbol, plan.grade, account);
  if (budget.skip) add("grade", "Grade", false, budget.skip);
  else if (plan.grade === "A") add("grade", "Grade", true, `A-grade: full size, ${rules.riskPctA}% risk`);
  else add("grade", "Grade", "warn", `${plan.grade === "B" ? "B-grade" : "No grade"}: half size, ${rules.riskPctB}% risk`, false);

  const d = plan.side === "LONG" ? 1 : -1;
  const stopOk = (plan.entry - plan.stop) * d > 0;
  add("stop", "Stop on the right side", stopOk, stopOk ? `Stop ${Math.abs(plan.entry - plan.stop).toPrecision(4)} from entry` : `A ${plan.side.toLowerCase()} needs its stop ${d > 0 ? "below" : "above"} entry.`);
  if (stopOk && plan.target !== null) {
    const targetOk = (plan.target - plan.entry) * d > 0;
    add("target", "Target on the right side", targetOk, targetOk ? `${((plan.target - plan.entry) * d / ((plan.entry - plan.stop) * d)).toFixed(1)}R to target` : `A ${plan.side.toLowerCase()} needs its target ${d > 0 ? "above" : "below"} entry.`);
  }

  const allowed = budget.amount * rules.riskTolerance;
  add("risk", "Risk within plan", plan.riskAmount > 0 && plan.riskAmount <= allowed, `${usd(plan.riskAmount)} at risk; the plan allows ${usd(budget.amount)}`);

  const open = entries.filter((e) => e.status === "OPEN");
  add("slots", "A free slot", open.length < rules.maxOpen, `${open.length} of ${rules.maxOpen} trades open`);

  if (symbol) {
    const sameMarket = open.find((e) => e.symbol === symbol);
    const keys = exposureKeys(symbol, plan.side);
    const overlap = open.find((e) => e.symbol !== symbol && exposureKeys(e.symbol, e.side).some((k) => keys.includes(k)));
    if (sameMarket) add("overlap", "Not doubling up", false, `Already ${sameMarket.side.toLowerCase()} ${setupById(sameMarket.setupId)?.platformSymbol ?? sameMarket.symbol}.`);
    else if (overlap) add("overlap", "Not doubling up", false, `Same bet (${keys[0]}) as the open ${overlap.side.toLowerCase()} on ${setupById(overlap.setupId)?.platformSymbol ?? overlap.symbol}.`);
    else add("overlap", "Not doubling up", true, `No open trade is the same bet (${keys[0]})`);
  }

  const status = accountStatus(entries, plan.time, account);
  const lossesLeft = rules.maxLossesPerDay - status.lossesToday;
  add(
    "daily-stop",
    "Not stopped for the day",
    !status.dailyStopHit,
    status.lossesToday >= rules.maxLossesPerDay
      ? `${status.lossesToday} losing trades today; you stop after ${rules.maxLossesPerDay}`
      : `${usd(status.todayPnl)} today, ${lossesLeft} loss${lossesLeft === 1 ? "" : "es"} left; you stop at ${usd(-status.ownDailyStop)} or after ${rules.maxLossesPerDay} losses`,
  );
  if (stoppedElsewhere.length > 0) add("linked-stop", "Other accounts still trading", false, `${stoppedElsewhere.join(" and ")} hit the daily stop today: stop on every account until the reset.`);
  const worstDay = status.worstCaseToday - plan.riskAmount;
  add(
    "own-daily",
    "Stays inside your daily stop",
    worstDay >= -status.ownDailyStop * rules.riskTolerance,
    `If every open trade and this one hit their stops: ${usd(worstDay)} today, your stop ${usd(-status.ownDailyStop)}`,
  );
  add("firm-daily", "Can't breach the daily limit", worstDay > -status.firmDailyLimit, `Worst case ${usd(worstDay)} today, the firm's limit ${usd(-status.firmDailyLimit)}`);
  const worstEquity = status.balance - status.openRisk - plan.riskAmount;
  add("floor", `Can't breach the ${account.maxLossPct}% floor`, worstEquity > status.floor, `Worst case equity ${usd(worstEquity)}, floor ${usd(status.floor)}`);

  if (plan.signalEntry && stopOk) {
    const offR = ((plan.entry - plan.signalEntry) * d) / Math.abs(plan.signalEntry - plan.stop);
    add("chase", "Not chasing", offR <= rules.chaseR ? true : "warn", offR <= rules.chaseR ? "Entry close to the signal price" : `Entry is ${offR.toFixed(2)}R worse than the signal; the backtest didn't pay that`, false);
  }
  const fromRollover = minutesFromRollover(plan.time, account.timeZone);
  add("rollover", "Away from rollover", fromRollover >= rules.rolloverMinutes ? true : "warn", fromRollover >= rules.rolloverMinutes ? "More than 30 minutes from the daily rollover" : `${fromRollover} minutes from rollover, when spreads widen and can hit stops`, false);
  if (status.targetReached) add("target-reached", "Phase target", "warn", "The target is reached. Close everything and stop: extra trades only risk the pass.", false);

  return checks;
}

export const hardFailures = (checks: Check[]) => checks.filter((c) => c.hard && c.status === "fail");

/* ---------- live signals ---------- */

export interface SignalInput {
  id: string;
  lastClose: number;
  lastCloseTime: number;
  signal: LatestSignal | null;
}

/* ---------- priority tiers ---------- */

// Which signal gets a slot first. Built from two measured edges only:
// - the location grade: A-grade trades made profit factor 2.10 against 1.44
//   for B-grade, and B-grade currency trades lost (0.72);
// - the setup's own backtest average R.
// The tier sets priority, not size: risk stays the account's A or B amount,
// the sizes its limits were tested with. C means skip.
export type Tier = "S" | "A+" | "A" | "B" | "C";
export const TIERS: readonly Tier[] = ["S", "A+", "A", "B", "C"];

// Setup strength from its backtest average R: roughly the top, middle and
// bottom third of the playbook.
export const STRONG_AVG_R = 0.6;
export const MID_AVG_R = 0.3;
export type SetupStrength = "strong" | "mid" | "low";
export const setupStrength = (setup: PlaybookSetup): SetupStrength =>
  setup.baseline.avgR >= STRONG_AVG_R ? "strong" : setup.baseline.avgR >= MID_AVG_R ? "mid" : "low";

const STRENGTH_LABEL: Record<SetupStrength, string> = {
  strong: `a strong setup (backtest ${STRONG_AVG_R}R+ a trade)`,
  mid: `a mid setup (backtest ${MID_AVG_R}–${STRONG_AVG_R}R a trade)`,
  low: `a weaker setup (backtest under ${MID_AVG_R}R a trade)`,
};

export function signalTier(setup: PlaybookSetup, grade: Grade | null, account: PlaybookAccount, chasing: boolean): { tier: Tier; reason: string } {
  const r = setup.baseline.avgR.toFixed(2);
  if (chasing) return { tier: "C", reason: "Price has run past the signal's entry: the backtest didn't pay a late fill. Skip it." };
  const skip = riskBudget(setup.symbol, grade, account).skip;
  if (skip) return { tier: "C", reason: `${skip}. Skip it.` };
  const strength = setupStrength(setup);
  if (grade !== "A") return { tier: "B", reason: `${grade === "B" ? "B-grade" : "No grade"} on ${STRENGTH_LABEL[strength]}, ${r}R. B risk.` };
  const tier: Tier = strength === "strong" ? "S" : strength === "mid" ? "A+" : "A";
  return { tier, reason: `A-grade on ${STRENGTH_LABEL[strength]}, ${r}R. Full risk.` };
}

export interface RankedSignal {
  setup: PlaybookSetup;
  signal: LatestSignal;
  plan: TradePlan | null; // null when the signal has no stop
  sizing: Sizing | null;
  checks: Check[];
  takeable: boolean; // no rule would break
  tier: Tier;
  tierReason: string;
  riskPct: number; // what the account risks on it (0 for C)
}

/**
 * New and running signals for playbook setups, best first: ones you can take
 * before blocked ones, then by tier (S, A+, A, B, C), new before running, and
 * the setup with the higher backtest average R.
 */
export function rankSignals(rows: SignalInput[], entries: JournalEntry[], now: number, account: PlaybookAccount = PLAYBOOK_ACCOUNT, stoppedElsewhere: string[] = []): RankedSignal[] {
  const out: RankedSignal[] = [];
  for (const row of rows) {
    const s = row.signal;
    const setup = activeSetupById(row.id);
    if (!setup || !s || (s.status !== "new" && s.status !== "open")) continue;
    const grade = s.grade ?? null;
    const entry = s.status === "new" ? s.entry : row.lastClose;
    let plan: TradePlan | null = null;
    let sizing: Sizing | null = null;
    let checks: Check[] = [];
    if (s.stop !== null) {
      const budget = riskBudget(setup.symbol, grade, account);
      sizing = sizePosition(setup.symbol, entry, s.stop, budget.amount);
      plan = { setupId: setup.id, side: s.side, grade, entry, stop: s.stop, target: s.target, riskAmount: sizing?.riskAtLots ?? budget.amount, signalEntry: s.entry, time: now };
      checks = preTradeChecks(plan, entries, account, stoppedElsewhere);
    }
    const chasing = checks.some((c) => c.id === "chase" && c.status === "warn");
    const { tier, reason } = signalTier(setup, grade, account, chasing);
    const takeable = plan !== null && hardFailures(checks).length === 0;
    out.push({ setup, signal: s, plan, sizing, checks, takeable, tier, tierReason: reason, riskPct: tier === "C" ? 0 : riskBudget(setup.symbol, grade, account).riskPct });
  }
  const order = (r: RankedSignal) => [r.takeable && r.tier !== "C" ? 0 : 1, TIERS.indexOf(r.tier), r.signal.status === "new" ? 0 : 1, -r.setup.baseline.avgR];
  return out.sort((a, b) => {
    const x = order(a), y = order(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return PLAYBOOK_SETUPS.indexOf(a.setup) - PLAYBOOK_SETUPS.indexOf(b.setup);
  });
}

/* ---------- scorecard ---------- */

export interface RStats {
  trades: number;
  winRatePct: number;
  avgR: number;
  sumR: number;
  profitFactor: number | null; // null with no losses
  maxDrawdownR: number;
  lossStreak: number; // current run of losses
}

export function rStats(rs: number[]): RStats {
  let sum = 0, wins = 0, gw = 0, gl = 0, peak = 0, dd = 0, streak = 0;
  for (const r of rs) {
    sum += r;
    if (r > 0) { wins++; gw += r; streak = 0; } else { gl -= r; streak++; }
    peak = Math.max(peak, sum);
    dd = Math.max(dd, peak - sum);
  }
  const n = rs.length;
  return { trades: n, winRatePct: n ? (wins / n) * 100 : 0, avgR: n ? sum / n : 0, sumR: sum, profitFactor: gl > 0 ? gw / gl : null, maxDrawdownR: dd, lossStreak: streak };
}

export type SetupVerdict = "no-trades" | "collecting" | "on-track" | "watch" | "pause" | "retired";

export interface SetupScore {
  setup: PlaybookSetup;
  live: RStats;
  verdict: SetupVerdict;
  reason: string;
}

export const JUDGE_AFTER = 25; // trades before a setup can be paused
const LOOK_AFTER = 10; // trades before averages mean anything

const closedR = (entries: JournalEntry[]) =>
  entries
    .filter((e) => e.status === "CLOSED" && e.rMultiple !== null)
    .sort((a, b) => (a.exitTime ?? 0) - (b.exitTime ?? 0));

export function judgeSetup(setup: PlaybookSetup, live: RStats): { verdict: SetupVerdict; reason: string } {
  const b = setup.baseline;
  if (setup.retired) return { verdict: "retired", reason: `No longer traded: ${setup.retired}` };
  if (live.trades === 0) return { verdict: "no-trades", reason: `Expect about ${(b.perWeek * 4.3).toFixed(1)} signals a month` };
  if (live.lossStreak > b.maxLossStreak + 2)
    return { verdict: "watch", reason: `${live.lossStreak} losses in a row; the backtest's worst was ${b.maxLossStreak}` };
  if (live.trades >= JUDGE_AFTER) {
    if ((live.profitFactor ?? Infinity) < 1) return { verdict: "pause", reason: `Losing after ${live.trades} trades (profit factor ${live.profitFactor!.toFixed(2)})` };
    if (live.maxDrawdownR > 2 * b.maxDrawdownR) return { verdict: "pause", reason: `Drawdown ${live.maxDrawdownR.toFixed(1)}R, over twice the backtest's ${b.maxDrawdownR}R` };
  }
  if (live.trades < LOOK_AFTER) return { verdict: "collecting", reason: `${live.trades} of ${LOOK_AFTER} trades before the averages mean much` };
  if (live.avgR < 0) return { verdict: "watch", reason: `Averaging ${live.avgR.toFixed(2)}R against the backtest's +${b.avgR}R` };
  return { verdict: "on-track", reason: `Averaging ${live.avgR >= 0 ? "+" : ""}${live.avgR.toFixed(2)}R against the backtest's +${b.avgR}R` };
}

export function scorecard(entries: JournalEntry[]): SetupScore[] {
  const closed = closedR(entries);
  // Retired setups show only when trades were logged on them.
  const logged = new Set(entries.map((e) => e.setupId));
  const setups = [...PLAYBOOK_SETUPS, ...RETIRED_SETUPS.filter((s) => logged.has(s.id))];
  return setups.map((setup) => {
    const live = rStats(closed.filter((e) => e.setupId === setup.id).map((e) => e.rMultiple!));
    return { setup, live, ...judgeSetup(setup, live) };
  });
}

export interface Adherence {
  followed: RStats;
  broken: RStats;
  mistakes: { id: string; label: string; trades: number; sumR: number }[]; // costliest first
}

export function adherence(entries: JournalEntry[]): Adherence {
  const closed = closedR(entries);
  const mistakes = MISTAKES.map((m) => {
    const hit = closed.filter((e) => e.mistakes.includes(m.id));
    return { id: m.id, label: m.label, trades: hit.length, sumR: hit.reduce((s, e) => s + e.rMultiple!, 0) };
  })
    .filter((m) => m.trades > 0)
    .sort((a, b) => a.sumR - b.sumR);
  return {
    followed: rStats(closed.filter((e) => e.rulesFollowed && e.mistakes.length === 0).map((e) => e.rMultiple!)),
    broken: rStats(closed.filter((e) => !e.rulesFollowed || e.mistakes.length > 0).map((e) => e.rMultiple!)),
    mistakes,
  };
}
