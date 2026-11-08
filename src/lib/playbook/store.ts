import type { PlaybookTrade } from "@prisma/client";
import { prisma } from "@/lib/db";
import { appError } from "@/lib/errors";
import { lotUnits, MANUAL_CHECKS, MISTAKES, PLAYBOOK_ACCOUNT, PLAYBOOK_RULES, PLAYBOOK_SETUPS, setupById, type PlaybookAccount } from "./config";
import { accountStatus, adherence, hardFailures, preTradeChecks, scorecard, usdPerUnitMove, type Check, type JournalEntry } from "./rules";

// Database side of the playbook journal: loading entries, opening a trade
// after checking it, closing it with the platform's P&L. The rules
// themselves live in rules.ts.

export function toEntry(t: PlaybookTrade): JournalEntry {
  return {
    id: t.id,
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
    rMultiple: t.rMultiple,
    exitReason: t.exitReason,
    mistakes: t.mistakes,
    notes: t.notes,
  };
}

export async function loadEntries(userId: string): Promise<JournalEntry[]> {
  const rows = await prisma.playbookTrade.findMany({ where: { userId }, orderBy: { entryTime: "desc" } });
  return rows.map(toEntry);
}

/** The prop account as this user has it: the firm's rules plus their P&L from before the playbook. */
export async function loadAccount(userId: string): Promise<PlaybookAccount> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { playbookPriorPnl: true } });
  return { ...PLAYBOOK_ACCOUNT, priorPnl: user?.playbookPriorPnl ?? 0 };
}

/**
 * Matches the playbook's balance to the platform's: the difference between
 * the balance entered and the playbook's own closed P&L is P&L from before
 * the playbook (or from trades not logged here).
 */
export async function setPlatformBalance(userId: string, body: Body): Promise<void> {
  const balance = num(body, "balance")!;
  if (balance <= 0) throw appError("INVALID_INPUT", "Enter the balance your platform shows.");
  const closed = await prisma.playbookTrade.aggregate({ where: { userId, status: "CLOSED" }, _sum: { pnl: true } });
  const priorPnl = balance - PLAYBOOK_ACCOUNT.size - (closed._sum.pnl ?? 0);
  await prisma.user.update({ where: { id: userId }, data: { playbookPriorPnl: Math.round(priorPnl * 100) / 100 } });
}

export async function playbookView(userId: string, now = Date.now()) {
  const [entries, account] = await Promise.all([loadEntries(userId), loadAccount(userId)]);
  return {
    asOf: now,
    account,
    rules: PLAYBOOK_RULES,
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

/**
 * Logs a trade from the playbook. The checks are rerun here against the
 * current open trades, so a stale page can't skip one. A trade that breaks a
 * rule is still logged when a reason is given (the journal records what
 * happened), but it's marked as a rule break.
 */
export async function openTrade(userId: string, body: Body, now = Date.now()): Promise<OpenResult> {
  const setup = setupById(str(body, "setupId"));
  if (!setup) throw appError("INVALID_INPUT", "Pick one of the playbook setups.");
  const side = str(body, "side") === "SHORT" ? "SHORT" : "LONG";
  const g = str(body, "grade");
  const grade = g === "A" || g === "B" ? g : null;
  const entry = num(body, "entryPrice")!;
  const stop = num(body, "stopLoss")!;
  const target = num(body, "takeProfit", false);
  const lots = num(body, "lots", false);
  const riskInput = num(body, "riskAmount", false);
  const entryTime = time(body, "entryTime", now);
  const perUnitRisk = Math.abs(entry - stop) * usdPerUnitMove(setup.symbol, stop);
  if (!(perUnitRisk > 0)) throw appError("INVALID_INPUT", "Entry and stop can't be the same price.");
  // Size from the lots actually traded when given, else from the $ risk.
  const quantity = lots !== null && lots > 0 ? lots * lotUnits(setup.symbol) : (riskInput ?? 0) / perUnitRisk;
  const riskAmount = quantity * perUnitRisk;

  const [entries, account] = await Promise.all([loadEntries(userId), loadAccount(userId)]);
  const checks = preTradeChecks(
    { setupId: setup.id, side, grade, entry, stop, target, riskAmount, signalEntry: num(body, "signalEntry", false), time: entryTime },
    entries,
    account,
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

  if (body.exitPrice !== undefined || body.pnl !== undefined) {
    const exitPrice = num(body, "exitPrice")!;
    const pnl = num(body, "pnl")!;
    const exitTime = time(body, "exitTime", now);
    if (exitTime < existing.entryTime.getTime()) throw appError("INVALID_INPUT", "The exit can't be before the entry.");
    const reason = str(body, "exitReason");
    Object.assign(data, {
      status: "CLOSED",
      exitPrice,
      pnl,
      exitTime: new Date(exitTime),
      rMultiple: existing.riskAmount > 0 ? pnl / existing.riskAmount : null,
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
