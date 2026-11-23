import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { loadCalendar } from "@/lib/economicCalendar";
import { newsClash, selectCatalysts, type Catalyst } from "@/lib/news/catalysts";
import { locationGrade } from "@/lib/plan/weeklyPlan";
import { accountById, customSetupId, MANUAL_CHECKS, PLAYBOOK_ACCOUNTS } from "@/lib/playbook/config";
import { journalToEntry } from "@/lib/playbook/journalLink";
import { planSync, syncedFields, type SyncStep } from "@/lib/playbook/mt5Sync";
import { accountStatus, hardFailures, preTradeChecks, type Check, type JournalEntry } from "@/lib/playbook/rules";
import { firstDeposit, isLogin, parseAccountInfo, parseDeals, parseOpenPositions, positionsFromDeals, type Mt5AccountInfo } from "./accountFiles";
import { MT5_FEED_DIR, loadFeedSpecs } from "./feed";
import type { Mt5Position } from "./report";
import { upsertPositions } from "./store";

// Live MT5 sync: reads what the PB_BarFeed expert exports for each account
// (PlaybookFeed/accounts/, see accountFiles.ts), stores the positions, and
// keeps the Playbook journal in step for every login linked to a prop
// account. Runs on demand and, throttled, whenever the Playbook loads.

export const MT5_ACCOUNTS_DIR = process.env.MT5_ACCOUNTS_DIR || join(MT5_FEED_DIR, "accounts");
const AUTO_EVERY_MS = 15_000;
// A snapshot this fresh is the account as it is now: its balance can set the Playbook's.
const BALANCE_FRESH_MS = 15 * 60_000;

export interface Mt5Snapshot {
  info: Mt5AccountInfo;
  positions: Mt5Position[];
  deposit: number | null;
}

type G = typeof globalThis & {
  __mt5Snapshots?: Map<string, { key: string; snap: Mt5Snapshot }>;
  __mt5SyncSig?: Map<string, string>;
  __mt5SyncRun?: Map<string, { at: number; running: Promise<unknown> | null }>;
};
const g = globalThis as G;
const snapshots = (g.__mt5Snapshots ??= new Map());
const signatures = (g.__mt5SyncSig ??= new Map());
const runs = (g.__mt5SyncRun ??= new Map());

const mtime = (file: string) => stat(file).then((s) => s.mtimeMs, () => null);
const readOr = (file: string) => readFile(file, "utf8").catch(() => "");

/** Every account the expert has exported, parsed (and re-parsed only when its files change). */
export async function readSnapshots(dir = MT5_ACCOUNTS_DIR): Promise<Mt5Snapshot[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const logins = names.filter((n) => n.endsWith(".txt")).map((n) => n.slice(0, -4)).filter(isLogin);
  const out: Mt5Snapshot[] = [];
  for (const login of logins) {
    const files = [`${login}.txt`, `${login}_deals.csv`, `${login}_positions.csv`].map((f) => join(dir, f));
    const key = (await Promise.all(files.map(mtime))).join("|");
    const hit = snapshots.get(login);
    if (hit?.key === key) {
      out.push(hit.snap);
      continue;
    }
    const [infoText, dealsText, openText] = await Promise.all(files.map(readOr));
    const info = parseAccountInfo(infoText);
    if (!info || info.login !== login) continue;
    const deals = parseDeals(dealsText);
    const snap = { info, positions: positionsFromDeals(deals, parseOpenPositions(openText)), deposit: firstDeposit(deals) };
    snapshots.set(login, { key, snap });
    out.push(snap);
  }
  return out;
}

const linksOf = (v: unknown): Record<string, string> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k, x]) => isLogin(k) && typeof x === "string" && accountById(x)) as [string, string][])
    : {};

export async function loadLinks(userId: string): Promise<Record<string, string>> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { mt5Links: true } });
  return linksOf(user?.mt5Links);
}

/** Links a login to a prop account (or unlinks it with null). A login can be one account; an account can have several logins (one per phase). */
export async function setLink(userId: string, login: string, accountId: string | null) {
  const links = await loadLinks(userId);
  if (accountId === null) delete links[login];
  else links[login] = accountId;
  await prisma.user.update({ where: { id: userId }, data: { mt5Links: links } });
  for (const k of [...signatures.keys()]) if (k.startsWith(`${userId}|`)) signatures.delete(k);
}

export interface SyncChanges {
  created: number;
  linked: number;
  updated: number;
  skipped: number;
}

const sig = (p: Mt5Position) => JSON.stringify(p);

/** Checks for a trade the sync found on the platform, as they stood when it was opened. */
function syncedChecks(p: Mt5Position, symbol: string, accountId: string, fields: ReturnType<typeof syncedFields>, all: Map<string, JournalEntry[]>, catalysts: Catalyst[] | null, h1: Map<string, import("@/indicators/utils").OHLC[]>) {
  const t = p.openTime.getTime();
  const account = accountById(accountId)!;
  const others = PLAYBOOK_ACCOUNTS.filter((a) => a.id !== accountId).map((a) => ({ a, s: accountStatus((all.get(a.id) ?? []).filter((e) => e.entryTime < t), t, a) }));
  const bars = h1.get(symbol);
  const grade = bars ? locationGrade(symbol, p.side, p.openPrice, t, bars) : null;
  const checks: Check[] = preTradeChecks(
    { setupId: customSetupId(symbol), side: p.side, grade, entry: p.openPrice, stop: fields.stopLoss, target: fields.takeProfit, riskAmount: fields.riskAmount, signalEntry: null, time: t },
    (all.get(accountId) ?? []).filter((e) => e.entryTime < t),
    account,
    others.filter((o) => o.s.dailyStopHit).map((o) => o.a.name),
    others.reduce((n, o) => n + o.s.tradesToday, 0),
  );
  const covered = catalysts && catalysts.length > 0 && t >= Math.min(...catalysts.map((c) => c.time)) - 12 * 3_600_000;
  for (const m of MANUAL_CHECKS) {
    if (m.id === "news") {
      const clash = catalysts ? newsClash(catalysts, symbol, t) : [];
      if (clash.length) checks.push({ id: m.id, label: m.label, status: "fail", detail: `${clash[0].currency} ${clash[0].title} inside the 30-minute window`, hard: true });
      else checks.push({ id: m.id, label: m.label, status: covered ? "pass" : "warn", detail: covered ? "No high-impact news in the window" : "Older than this week's calendar: not checked", hard: !!covered });
    } else if (m.id === "stop-placed") {
      const ok = p.stopLoss !== null;
      checks.push({ id: m.id, label: m.label, status: ok ? "pass" : "fail", detail: ok ? "MT5 had a stop on it" : "No stop on the platform", hard: true });
    } else if (m.id === "size-matches") {
      checks.push({ id: m.id, label: m.label, status: "pass", detail: "Size taken from MT5", hard: true });
    } else {
      checks.push({ id: m.id, label: m.label, status: "warn", detail: "Synced from MT5: only you know", hard: false });
    }
  }
  return { checks, grade, rulesFollowed: hardFailures(checks).length === 0 };
}

async function syncAccount(userId: string, login: string, accountId: string, snap: Mt5Snapshot, now: number): Promise<SyncChanges> {
  const [rows, journalRows] = await Promise.all([
    prisma.playbookTrade.findMany({ where: { userId } }),
    prisma.trade.findMany({ where: { userId, playbookAccountId: { not: null } } }),
  ]);
  const own = rows.filter((r) => r.accountId === accountId);
  const steps = planSync(
    login,
    snap.positions,
    own.map((r) => ({ id: r.id, symbol: r.symbol, side: r.side === "SHORT" ? "SHORT" : "LONG", entryTime: r.entryTime.getTime(), lots: r.lots, mt5Login: r.mt5Login, mt5PositionId: r.mt5PositionId })),
    journalRows.filter((j) => j.playbookAccountId === accountId).map((j) => ({ symbol: j.symbol, side: j.side === "SHORT" ? "SHORT" : "LONG", exitTime: j.time.getTime(), lots: j.quantity })),
  );
  const changes: SyncChanges = { created: 0, linked: 0, updated: 0, skipped: 0 };
  const byId = new Map(own.map((r) => [r.id, r]));
  const creates = steps.filter((s): s is Extract<SyncStep, { kind: "create" }> => s.kind === "create");

  // What creating needs: every account's entries (for the checks), the week's news, hourly candles for the grade.
  let all = new Map<string, JournalEntry[]>();
  let catalysts: Catalyst[] | null = null;
  const h1 = new Map<string, import("@/indicators/utils").OHLC[]>();
  await loadFeedSpecs(now);
  if (creates.length) {
    const { toEntry } = await import("@/lib/playbook/store");
    const entries = [...rows.map(toEntry), ...journalRows.map(journalToEntry).filter((e): e is JournalEntry => e !== null)];
    all = new Map(PLAYBOOK_ACCOUNTS.map((a) => [a.id, entries.filter((e) => e.accountId === a.id)]));
    catalysts = await loadCalendar().then((ev) => selectCatalysts(ev, null, 0), () => null);
    try {
      const { loadSeries } = await import("@/lib/signals/scanner");
      const { series } = await loadSeries("1h", now, [...new Set(creates.map((c) => c.symbol))]);
      for (const [k, v] of series) h1.set(k, v);
    } catch {
      // No grade then: the checks size it as ungraded.
    }
  }

  for (const step of steps) {
    const key = `${userId}|${login}|${step.position.positionId}`;
    if (step.kind === "skip") {
      changes.skipped++;
      continue;
    }
    if (step.kind === "update") {
      if (signatures.get(key) === sig(step.position)) continue;
      const r = byId.get(step.tradeId)!;
      await prisma.playbookTrade.update({ where: { id: r.id }, data: syncedFields(step.position, step.symbol, r) });
      changes.updated++;
    } else if (step.kind === "link") {
      const r = byId.get(step.tradeId)!;
      await prisma.playbookTrade.update({ where: { id: r.id }, data: { ...syncedFields(step.position, step.symbol, r), mt5Login: login, mt5PositionId: step.position.positionId } });
      changes.linked++;
    } else {
      // Guard against a sync running alongside: the same position never twice.
      const dup = await prisma.playbookTrade.findFirst({ where: { userId, mt5Login: login, mt5PositionId: step.position.positionId }, select: { id: true } });
      if (dup) continue;
      const p = step.position;
      const fields = syncedFields(p, step.symbol);
      const { checks, grade, rulesFollowed } = syncedChecks(p, step.symbol, accountId, fields, all, catalysts, h1);
      const created = await prisma.playbookTrade.create({
        data: {
          userId,
          accountId,
          setupId: customSetupId(step.symbol),
          symbol: step.symbol,
          strategy: "custom",
          interval: "",
          side: p.side,
          grade,
          checks: checks as unknown as object[],
          rulesFollowed,
          overrideReason: rulesFollowed ? "" : "Synced from MT5: taken without the Playbook's checks",
          source: "mt5",
          mt5Login: login,
          mt5PositionId: p.positionId,
          ...fields,
        },
      });
      const { toEntry } = await import("@/lib/playbook/store");
      all.get(accountId)?.push(toEntry(created));
      changes.created++;
    }
    signatures.set(key, sig(step.position));
  }

  // MT5's balance is the truth: whatever the journal doesn't explain is P&L from before it.
  if (snap.info.balance !== null && snap.info.writtenAt !== null && now - snap.info.writtenAt < BALANCE_FRESH_MS) {
    const account = accountById(accountId)!;
    const [closed, linked, user] = await Promise.all([
      prisma.playbookTrade.aggregate({ where: { userId, accountId, status: "CLOSED" }, _sum: { pnl: true } }),
      prisma.trade.aggregate({ where: { userId, playbookAccountId: accountId }, _sum: { pnl: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { playbookPriorPnls: true } }),
    ]);
    const priorPnl = Math.round((snap.info.balance - account.size - (closed._sum.pnl ?? 0) - (linked._sum.pnl ?? 0)) * 100) / 100;
    const prior = (user?.playbookPriorPnls && typeof user.playbookPriorPnls === "object" ? user.playbookPriorPnls : {}) as Record<string, number>;
    if (prior[accountId] !== priorPnl) await prisma.user.update({ where: { id: userId }, data: { playbookPriorPnls: { ...prior, [accountId]: priorPnl } } });
  }
  return changes;
}

const sigAll = (snap: Mt5Snapshot) => JSON.stringify(snap.positions);

export interface SyncResult {
  at: number;
  changes: SyncChanges;
  errors: string[];
}

/** Syncs every exported account: positions into the MT5 table, and into the Playbook for linked logins. */
export async function syncMt5(userId: string, now = Date.now(), dir = MT5_ACCOUNTS_DIR): Promise<SyncResult> {
  const [snaps, links] = await Promise.all([readSnapshots(dir), loadLinks(userId)]);
  const changes: SyncChanges = { created: 0, linked: 0, updated: 0, skipped: 0 };
  const errors: string[] = [];
  for (const snap of snaps) {
    const login = snap.info.login;
    try {
      const allKey = `${userId}|${login}|*`;
      if (signatures.get(allKey) !== sigAll(snap)) {
        await upsertPositions(userId, login, snap.info.server, snap.positions);
        signatures.set(allKey, sigAll(snap));
      }
      const accountId = links[login];
      if (!accountId) continue;
      const c = await syncAccount(userId, login, accountId, snap, now);
      changes.created += c.created;
      changes.linked += c.linked;
      changes.updated += c.updated;
      changes.skipped += c.skipped;
    } catch (e) {
      errors.push(`${login}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  runs.set(userId, { at: now, running: null });
  return { at: now, changes, errors };
}

/** The sync, at most every 15 seconds per user and never two at once. Never throws. */
export async function autoSyncMt5(userId: string, now = Date.now()): Promise<void> {
  const run = runs.get(userId);
  if (run?.running) {
    await run.running.catch(() => {});
    return;
  }
  if (run && now - run.at < AUTO_EVERY_MS) return;
  const running = syncMt5(userId, now).catch((e) => console.error("MT5 sync failed:", e));
  runs.set(userId, { at: now, running });
  await running;
  runs.set(userId, { at: now, running: null });
}

export interface Mt5AccountRow {
  login: string;
  server: string;
  company: string;
  mode: string;
  currency: string;
  balance: number | null;
  equity: number | null;
  writtenAt: number | null;
  positions: number;
  open: number;
  firstTrade: number | null;
  deposit: number | null;
  accountId: string | null;
  suggested: string | null; // the prop account whose size matches the first deposit
}

/** The accounts the expert has exported, with what each is linked to. */
export async function mt5Accounts(userId: string, dir = MT5_ACCOUNTS_DIR): Promise<Mt5AccountRow[]> {
  const [snaps, links] = await Promise.all([readSnapshots(dir), loadLinks(userId)]);
  return snaps
    .map(({ info, positions, deposit }) => ({
      login: info.login,
      server: info.server,
      company: info.company,
      mode: info.mode,
      currency: info.currency,
      balance: info.balance,
      equity: info.equity,
      writtenAt: info.writtenAt,
      positions: positions.length,
      open: positions.filter((p) => p.status === "OPEN").length,
      firstTrade: positions[0]?.openTime.getTime() ?? null,
      deposit,
      accountId: links[info.login] ?? null,
      suggested: deposit !== null ? (PLAYBOOK_ACCOUNTS.find((a) => Math.abs(a.size - deposit) < 1)?.id ?? null) : null,
    }))
    .sort((a, b) => (b.writtenAt ?? 0) - (a.writtenAt ?? 0));
}

/** An uploaded HTML report, synced into the Playbook when its login is linked. Its balance is a past one, so it doesn't move the Playbook's. */
export async function syncReport(userId: string, login: string, server: string, positions: Mt5Position[], now = Date.now()): Promise<SyncChanges | null> {
  const accountId = (await loadLinks(userId))[login];
  if (!accountId) return null;
  const info: Mt5AccountInfo = { login, server, company: "", name: "", currency: "", mode: "", balance: null, equity: null, writtenAt: null };
  return syncAccount(userId, login, accountId, { info, positions, deposit: null }, now);
}
