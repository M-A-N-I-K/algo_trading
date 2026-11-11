import type { PlaybookTrade } from "@prisma/client";
import { prisma } from "@/lib/db";
import { appError } from "@/lib/errors";
import { loadFeedSpecs } from "@/lib/mt5/feed";
import { accountById, lotUnits, MANUAL_CHECKS, MISTAKES, PLAYBOOK_ACCOUNTS, PLAYBOOK_SETUPS, activeSetupById, setupById, type PlaybookAccount } from "./config";
import { accountStatus, adherence, hardFailures, preTradeChecks, scorecard, usdPerUnitMove, type AccountStatus, type Check, type JournalEntry } from "./rules";

// Database side of the playbook journal: loading entries, opening a trade
// after checking it, closing it with the platform's P&L. The rules
// themselves live in rules.ts.

export function toEntry(t: PlaybookTrade): JournalEntry {
  return {
    id: t.id,
    accountId: t.accountId,
    setupId: t.setupId,
    symbol: t.symbol,
    side: t.side === "SHORT" ? "SHORT" : "LONG",
    grade: t.grade === "A" || t.grade === "B" ? t.grade : null,
    status: t.status === "CLOSED" ? "CLOSED" : "OPEN",
    entryTime: t.entryTime.getTime(),
    entryPrice: t.entryPrice,
    stopLoss: t.stopLoss,
    takeProfit: t.takeProfit,
    quantity: t.quantity,
    lots: t.lots,
    riskAmount: t.riskAmount,
    rulesFollowed: t.rulesFollowed,
    overrideReason: t.overrideReason,
    exitTime: t.exitTime?.getTime() ?? null,
    exitPrice: t.exitPrice,
    pnl: t.pnl,
    commission: t.commission,
    swap: t.swap,
    rMultiple: t.rMultiple,
    exitReason: t.exitReason,
    mistakes: t.mistakes,
    notes: t.notes,
  };
}

/** One of the playbook's accounts by id; the first when no id is given. */
export function pickAccount(id: unknown): PlaybookAccount {
  if (id === undefined || id === null || id === "") return PLAYBOOK_ACCOUNTS[0];
  const account = accountById(String(id));
  if (!account) throw appError("INVALID_INPUT", `Unknown account. Use one of: ${PLAYBOOK_ACCOUNTS.map((a) => a.id).join(", ")}.`);
  return account;
}

/** Every trade this user logged, on every account, newest first. */
export async function loadEntries(userId: string): Promise<JournalEntry[]> {
  const rows = await prisma.playbookTrade.findMany({ where: { userId }, orderBy: { entryTime: "desc" } });
  return rows.map(toEntry);
}

const priorPnlsOf = (v: unknown): Record<string, number> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === "number" && Number.isFinite(x)) as [string, number][])
    : {};

/** Every prop account as this user has it: the firm's rules plus their P&L from before the playbook. */
export async function loadAccounts(userId: string): Promise<PlaybookAccount[]> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { playbookPriorPnls: true } });
  const prior = priorPnlsOf(user?.playbookPriorPnls);
  return PLAYBOOK_ACCOUNTS.map((a) => ({ ...a, priorPnl: prior[a.id] ?? 0 }));
}

export interface AccountsState {
  accounts: PlaybookAccount[];
  entries: Map<string, JournalEntry[]>; // by account id
  statuses: Map<string, AccountStatus>;
}

/** Every account with its trades and status, so one account's checks can see the others. */
export async function loadAccountsState(userId: string, now = Date.now()): Promise<AccountsState> {
  const [all, accounts] = await Promise.all([loadEntries(userId), loadAccounts(userId)]);
  const entries = new Map(accounts.map((a) => [a.id, all.filter((e) => e.accountId === a.id)]));
  const statuses = new Map(accounts.map((a) => [a.id, accountStatus(entries.get(a.id)!, now, a)]));
  return { accounts, entries, statuses };
}

/** Names of the other accounts that hit their daily stop today. */
export function stoppedElsewhere(state: AccountsState, accountId: string): string[] {
  return state.accounts.filter((a) => a.id !== accountId && state.statuses.get(a.id)?.dailyStopHit).map((a) => a.name);
}

/** One account's slice of the state. */
export function forAccount(state: AccountsState, accountId: string) {
  const account = state.accounts.find((a) => a.id === accountId)!;
  return { account, entries: state.entries.get(accountId) ?? [], stoppedElsewhere: stoppedElsewhere(state, accountId) };
}

/**
 * Matches the playbook's balance to the platform's: the difference between
 * the balance entered and the account's own closed P&L here is P&L from
 * before the playbook (or from trades not logged here).
 */
export async function setPlatformBalance(userId: string, body: Body): Promise<PlaybookAccount> {
  const account = pickAccount(body.accountId);
  const balance = num(body, "balance")!;
  if (balance <= 0) throw appError("INVALID_INPUT", "Enter the balance your platform shows.");
  const [closed, user] = await Promise.all([
    prisma.playbookTrade.aggregate({ where: { userId, accountId: account.id, status: "CLOSED" }, _sum: { pnl: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { playbookPriorPnls: true } }),
  ]);
  const priorPnl = Math.round((balance - account.size - (closed._sum.pnl ?? 0)) * 100) / 100;
  const prior = { ...priorPnlsOf(user?.playbookPriorPnls), [account.id]: priorPnl };
  await prisma.user.update({ where: { id: userId }, data: { playbookPriorPnls: prior } });
  return account;
}

export async function playbookView(userId: string, accountId: string, now = Date.now()) {
  const state = await loadAccountsState(userId, now);
  const { account, entries, stoppedElsewhere: stopped } = forAccount(state, accountId);
  return {
    asOf: now,
    account,
    rules: account.rules,
    // Every account, for the switcher.
    accounts: state.accounts.map((a) => ({ account: a, status: state.statuses.get(a.id)! })),
    stoppedElsewhere: stopped,
    setups: PLAYBOOK_SETUPS,
    manualChecks: MANUAL_CHECKS,
    mistakes: MISTAKES,
    status: accountStatus(entries, now, account),
    open: entries.filter((e) => e.status === "OPEN"),
    closed: entries.filter((e) => e.status === "CLOSED"),
    scorecard: scorecard(entries),
    adherence: adherence(entries),
  };
}
export type PlaybookView = Awaited<ReturnType<typeof playbookView>>;

/* ---------- input parsing ---------- */

type Body = Record<string, unknown>;
const num = (b: Body, k: string, required = true): number | null => {
  const v = b[k];
  if ((v === undefined || v === null || v === "") && !required) return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw appError("INVALID_INPUT", `${k} must be a number.`);
  return n;
};
const str = (b: Body, k: string) => (typeof b[k] === "string" ? (b[k] as string).trim() : "");
const time = (b: Body, k: string, fallback: number) => {
  const v = b[k];
  if (v === undefined || v === null || v === "") return fallback;
  const t = typeof v === "number" ? v : Date.parse(String(v));
  if (!Number.isFinite(t)) throw appError("INVALID_INPUT", `${k} must be a date.`);
  return t;
};

/* ---------- open ---------- */

export interface OpenResult {
  trade?: JournalEntry;
  checks: Check[];
  rulesFollowed: boolean;
}

// FTSE 100 (quoted in pounds) is sized from the MT5 terminal's symbol spec.
const MT5_SPEC_NEEDED = "This market is sized from MT5's contract spec. Start the PB_BarFeed service in MT5 and try again.";

/**
 * Logs a trade from the playbook. The checks are rerun here against the
 * current open trades, so a stale page can't skip one. A trade that breaks a
 * rule is still logged when a reason is given (the journal records what
 * happened), but it's marked as a rule break.
 */
export async function openTrade(userId: string, body: Body, now = Date.now()): Promise<OpenResult> {
  const accountId = pickAccount(body.accountId).id;
  const setup = activeSetupById(str(body, "setupId"));
  if (!setup) throw appError("INVALID_INPUT", setupById(str(body, "setupId"))?.retired ? "That setup is retired. Pick one of the playbook setups." : "Pick one of the playbook setups.");
  const side = str(body, "side") === "SHORT" ? "SHORT" : "LONG";
  const g = str(body, "grade");
  const grade = g === "A" || g === "B" ? g : null;
  const entry = num(body, "entryPrice")!;
  const stop = num(body, "stopLoss")!;
  const target = num(body, "takeProfit", false);
  const lots = num(body, "lots", false);
  const riskInput = num(body, "riskAmount", false);
  const entryTime = time(body, "entryTime", now);
  await loadFeedSpecs(now);
  const perUnitRisk = Math.abs(entry - stop) * usdPerUnitMove(setup.symbol, stop);
  if (!Number.isFinite(perUnitRisk)) throw appError("INVALID_INPUT", MT5_SPEC_NEEDED);
  if (!(perUnitRisk > 0)) throw appError("INVALID_INPUT", "Entry and stop can't be the same price.");
  // Size from the lots actually traded when given, else from the $ risk.
  const quantity = lots !== null && lots > 0 ? lots * lotUnits(setup.symbol) : (riskInput ?? 0) / perUnitRisk;
  const riskAmount = quantity * perUnitRisk;

  const { account, entries, stoppedElsewhere: stopped } = forAccount(await loadAccountsState(userId, entryTime), accountId);
  const checks = preTradeChecks(
    { setupId: setup.id, side, grade, entry, stop, target, riskAmount, signalEntry: num(body, "signalEntry", false), time: entryTime },
    entries,
    account,
    stopped,
  );
  const ticked = Array.isArray(body.manualChecks) ? new Set((body.manualChecks as unknown[]).map(String)) : new Set<string>();
  for (const m of MANUAL_CHECKS) {
    const ok = ticked.has(m.id);
    checks.push({ id: m.id, label: m.label, status: ok ? "pass" : "fail", detail: ok ? "Ticked before entry" : "Not ticked", hard: true });
  }
  const rulesFollowed = hardFailures(checks).length === 0;
  const overrideReason = str(body, "overrideReason");
  if (!rulesFollowed && !overrideReason) return { checks, rulesFollowed };

  const created = await prisma.playbookTrade.create({
    data: {
      userId,
      accountId,
      setupId: setup.id,
      symbol: setup.symbol,
      strategy: setup.strategy,
      interval: setup.interval,
      side,
      grade,
      entryTime: new Date(entryTime),
      entryPrice: entry,
      stopLoss: stop,
      takeProfit: target,
      quantity,
      lots,
      riskAmount,
      checks: checks as unknown as object[],
      rulesFollowed,
      overrideReason: rulesFollowed ? "" : overrideReason,
      notes: str(body, "notes"),
    },
  });
  return { trade: toEntry(created), checks, rulesFollowed };
}

/* ---------- close / edit ---------- */

const EXIT_REASONS = new Set(["stop", "target", "breakeven", "manual"]);

/** Closes an open trade (exitPrice and pnl given) or edits notes and mistakes on any trade. */
export async function updateTrade(userId: string, id: string, body: Body, now = Date.now()): Promise<JournalEntry> {
  const existing = await prisma.playbookTrade.findFirst({ where: { id, userId } });
  if (!existing) throw appError("NOT_FOUND", "Trade not found.");

  const known = new Set<string>(MISTAKES.map((m) => m.id));
  const data: Record<string, unknown> = {};
  if (Array.isArray(body.mistakes)) data.mistakes = (body.mistakes as unknown[]).map(String).filter((m) => known.has(m));
  if (typeof body.notes === "string") data.notes = body.notes;

  // Correct an open trade as it really is on the platform: fill price, stop,
  // target, lots, entry time. Risk is recomputed the same way as when logging.
  const edits = ["entryPrice", "stopLoss", "takeProfit", "lots", "entryTime"].filter((k) => body[k] !== undefined);
  if (edits.length) {
    if (existing.status !== "OPEN") throw appError("INVALID_INPUT", "Only an open trade's prices and size can be changed.");
    const entry = body.entryPrice !== undefined ? num(body, "entryPrice")! : existing.entryPrice;
    const stop = body.stopLoss !== undefined ? num(body, "stopLoss")! : existing.stopLoss;
    const target = body.takeProfit !== undefined ? num(body, "takeProfit", false) : existing.takeProfit;
    const lots = body.lots !== undefined ? num(body, "lots", false) : existing.lots;
    const entryTime = time(body, "entryTime", existing.entryTime.getTime());
    if (entryTime > now) throw appError("INVALID_INPUT", "The entry can't be in the future.");
    await loadFeedSpecs(now);
    const perUnitRisk = Math.abs(entry - stop) * usdPerUnitMove(existing.symbol, stop);
    if (!Number.isFinite(perUnitRisk)) throw appError("INVALID_INPUT", MT5_SPEC_NEEDED);
    if (!(perUnitRisk > 0)) throw appError("INVALID_INPUT", "Entry and stop can't be the same price.");
    if (lots !== null && !(lots > 0)) throw appError("INVALID_INPUT", "Lots must be more than 0.");
    const quantity = lots !== null ? lots * lotUnits(existing.symbol) : existing.quantity;
    Object.assign(data, { entryPrice: entry, stopLoss: stop, takeProfit: target, lots, quantity, riskAmount: quantity * perUnitRisk, entryTime: new Date(entryTime) });
  }

  if (body.exitPrice !== undefined || body.pnl !== undefined || body.profit !== undefined) {
    const exitPrice = num(body, "exitPrice")!;
    // Commission is always a cost, whatever sign it's typed with; swap keeps its sign.
    const commission = -Math.abs(num(body, "commission", false) ?? 0);
    const swap = num(body, "swap", false) ?? 0;
    // `profit` is the platform's Profit column (price move only): net it here.
    // A bare `pnl` is taken as already net.
    const profit = num(body, "profit", false);
    const pnl = profit !== null ? profit + commission + swap : num(body, "pnl")!;
    const exitTime = time(body, "exitTime", now);
    if (exitTime < existing.entryTime.getTime()) throw appError("INVALID_INPUT", "The exit can't be before the entry.");
    const reason = str(body, "exitReason");
    const risk = (data.riskAmount as number | undefined) ?? existing.riskAmount;
    Object.assign(data, {
      status: "CLOSED",
      exitPrice,
      pnl,
      commission: profit !== null || body.commission !== undefined ? commission : null,
      swap: profit !== null || body.swap !== undefined ? swap : null,
      exitTime: new Date(exitTime),
      rMultiple: risk > 0 ? pnl / risk : null,
      exitReason: EXIT_REASONS.has(reason) ? reason : "manual",
    });
  }
  const updated = await prisma.playbookTrade.update({ where: { id }, data });
  return toEntry(updated);
}

export async function deleteTrade(userId: string, id: string): Promise<void> {
  const { count } = await prisma.playbookTrade.deleteMany({ where: { id, userId } });
  if (count === 0) throw appError("NOT_FOUND", "Trade not found.");
}
