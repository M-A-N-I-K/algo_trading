import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { appError } from "@/lib/errors";
import { loadCalendar } from "@/lib/economicCalendar";
import { newsClash, selectCatalysts, type Catalyst } from "@/lib/news/catalysts";
import { locationGrade } from "@/lib/plan/weeklyPlan";
import { accountById, customSetupId, MANUAL_CHECKS, PLAYBOOK_ACCOUNTS } from "@/lib/playbook/config";
import { journalToEntry } from "@/lib/playbook/journalLink";
import { planSync, syncedFields, type SyncStep } from "@/lib/playbook/mt5Sync";
import { accountStatus, hardFailures, preTradeChecks, type Check, type JournalEntry } from "@/lib/playbook/rules";
import { firstDeposit, isLogin, parseAccountInfo, parseDeals, parseOpenPositions, positionsFromDeals, type Mt5AccountInfo } from "./accountFiles";
import { MT5_FEED_DIR, loadFeedSpecs } from "./feed";
import { createCloudAccount, fetchCloudAccount, metaApiConfigured, readCloudAccount, removeCloudAccount } from "./metaapi";
import type { Mt5Position } from "./report";
import { upsertPositions } from "./store";

// Live MT5 sync: reads each account from one of two sources, what the
// PB_BarFeed expert exports from the MT5 app here (PlaybookFeed/accounts/, see
// accountFiles.ts) or MetaApi's cloud terminal (metaapi.ts), stores the positions, and
// keeps the Playbook journal in step for every login linked to a prop
// account. Runs on demand and, throttled, whenever the Playbook loads.

export const MT5_ACCOUNTS_DIR = process.env.MT5_ACCOUNTS_DIR || join(MT5_FEED_DIR, "accounts");

/**
 * The export folder is this machine's MT5, so it belongs to whoever runs it.
 * Only the users named in MT5_SYNC_EMAILS (comma-separated) may use live
 * sync. Unset, nobody can: it fails closed.
 */
export function mayUseLiveSync(email: string | null | undefined): boolean {
  const allowed = (process.env.MT5_SYNC_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return !!email && allowed.includes(email.toLowerCase());
}

/**
 * Cloud accounts are billed to the METAAPI_TOKEN's owner, so they're limited
 * to the same named users, and need the token set.
 */
export const mayUseCloudSync = (email: string | null | undefined) => metaApiConfigured() && mayUseLiveSync(email);
const AUTO_EVERY_MS = 15_000;
// A snapshot this fresh is the account as it is now: its balance can set the Playbook's.
const BALANCE_FRESH_MS = 15 * 60_000;

export interface Mt5Snapshot {
  info: Mt5AccountInfo;
  positions: Mt5Position[];
  deposit: number | null;
}

/** Where an account's data comes from: the MT5 app on this machine, or MetaApi's cloud. */
export type Mt5Source = "local" | "cloud";

type G = typeof globalThis & {
  __mt5Snapshots?: Map<string, { key: string; snap: Mt5Snapshot }>;
  __mt5SyncSig?: Map<string, string>;
  __mt5SyncRun?: Map<string, { at: number; running: Promise<unknown> | null }>;
  __mt5Cloud?: Map<string, { at: number; snap: Mt5Snapshot | null; status: string }>;
};
const g = globalThis as G;
const snapshots = (g.__mt5Snapshots ??= new Map());
const signatures = (g.__mt5SyncSig ??= new Map());
const runs = (g.__mt5SyncRun ??= new Map());
const cloudCache = (g.__mt5Cloud ??= new Map());
// MetaApi is asked at most this often per account; the sync itself runs every 15 s.
const CLOUD_EVERY_MS = 60_000;

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

export interface CloudSnapshot {
  login: string;
  server: string;
  snap: Mt5Snapshot | null;
  /** connected, connecting, or what went wrong. */
  status: string;
}

/** This user's cloud accounts, each fetched from MetaApi at most once a minute. Never throws per account. */
export async function readCloudSnapshots(userId: string, now = Date.now(), force = false): Promise<CloudSnapshot[]> {
  if (!metaApiConfigured()) return [];
  const rows = await prisma.mt5CloudAccount.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  return Promise.all(
    rows.map(async (r) => {
      const hit = cloudCache.get(r.metaapiId);
      if (hit && !force && now - hit.at < CLOUD_EVERY_MS) return { login: r.login, server: r.server, snap: hit.snap, status: hit.status };
      let snap: Mt5Snapshot | null = hit?.snap ?? null;
      let status: string;
      try {
        const acc = await readCloudAccount(r.metaapiId);
        if (acc.region && acc.region !== r.region) await prisma.mt5CloudAccount.update({ where: { id: r.id }, data: { region: acc.region } });
        if (acc.state !== "DEPLOYED" || acc.connectionStatus !== "CONNECTED") {
          status = acc.connectionStatus === "DISCONNECTED_FROM_BROKER" ? "MetaApi can't reach the broker: check the server name and investor password" : "connecting";
        } else {
          const { info, deals, open } = await fetchCloudAccount(r.metaapiId, acc.region || r.region, now);
          snap = { info: { ...info, login: r.login }, positions: positionsFromDeals(deals, open), deposit: firstDeposit(deals) };
          status = "connected";
        }
      } catch (e) {
        status = e instanceof Error ? e.message : String(e);
      }
      cloudCache.set(r.metaapiId, { at: now, snap, status });
      return { login: r.login, server: r.server, snap, status };
    }),
  );
}

/** Every account this user can sync, from both sources; a login in both uses the fresher copy. */
async function allSnapshots(userId: string, email: string | null | undefined, now = Date.now(), dir = MT5_ACCOUNTS_DIR, force = false) {
  const [local, cloud] = await Promise.all([mayUseLiveSync(email) ? readSnapshots(dir) : Promise.resolve([]), readCloudSnapshots(userId, now, force)]);
  const out = new Map<string, { snap: Mt5Snapshot; source: Mt5Source }>();
  for (const snap of local) out.set(snap.info.login, { snap, source: "local" });
  for (const c of cloud) {
    if (!c.snap) continue;
    const prev = out.get(c.login);
    if (!prev || (c.snap.info.writtenAt ?? 0) >= (prev.snap.info.writtenAt ?? 0)) out.set(c.login, { snap: c.snap, source: "cloud" });
  }
  return { snaps: out, cloud };
}

const emailOf = async (userId: string) => (await prisma.user.findUnique({ where: { id: userId }, select: { email: true } }))?.email ?? null;

/**
 * Connects an MT5 account through MetaApi with its investor password (sent to
 * MetaApi once, never stored), and links it to a prop account if one is given.
 * A login another user has linked or connected can't be connected again.
 */
export async function connectCloudAccount(userId: string, a: { login: string; server: string; password: string; accountId: string | null }) {
  if (!isLogin(a.login)) throw appError("INVALID_INPUT", "The login is the MT5 account number: digits only.");
  if (!a.server.trim() || a.server.length > 100) throw appError("INVALID_INPUT", "Enter the server name exactly as MT5 shows it.");
  if (!a.password || a.password.length > 100) throw appError("INVALID_INPUT", "Enter the account's investor password.");
  const [mine, others, taken] = await Promise.all([
    prisma.mt5CloudAccount.findFirst({ where: { userId, login: a.login } }),
    claimedByOthers(userId),
    prisma.mt5CloudAccount.findFirst({ where: { login: a.login, userId: { not: userId } }, select: { id: true } }),
  ]);
  if (mine) throw appError("INVALID_INPUT", "That account is already connected.");
  if (others.has(a.login) || taken) throw appError("FORBIDDEN", "That MT5 login is connected to another user.");
  const { id, region } = await createCloudAccount({ login: a.login, server: a.server.trim(), password: a.password });
  try {
    await prisma.mt5CloudAccount.create({ data: { userId, login: a.login, server: a.server.trim(), metaapiId: id, region } });
  } catch (e) {
    await removeCloudAccount(id).catch(() => {});
    throw e;
  }
  if (a.accountId) await setLink(userId, a.login, a.accountId);
}

/** Disconnects a cloud account: removes it from MetaApi and unlinks it. Trades already synced stay. */
export async function disconnectCloudAccount(userId: string, login: string) {
  const row = await prisma.mt5CloudAccount.findFirst({ where: { userId, login } });
  if (!row) throw appError("NOT_FOUND", "That account isn't connected.");
  await removeCloudAccount(row.metaapiId);
  await prisma.mt5CloudAccount.delete({ where: { id: row.id } });
  cloudCache.delete(row.metaapiId);
  await setLink(userId, login, null);
}

/**
 * Links a login to a prop account (or unlinks it with null). A login can be
 * one account; an account can have several logins (one per phase). Only a
 * login the expert has exported and no other user has linked can be linked:
 * the check and the write run in one serializable transaction, so two users
 * can't claim the same login at once.
 */
export async function setLink(userId: string, login: string, accountId: string | null, dir = MT5_ACCOUNTS_DIR) {
  if (accountId !== null) {
    const cloud = await prisma.mt5CloudAccount.findFirst({ where: { userId, login }, select: { id: true } });
    const local = !cloud && mayUseLiveSync(await emailOf(userId)) && (await readSnapshots(dir)).some((s) => s.info.login === login);
    if (!cloud && !local) throw appError("NOT_FOUND", "That MT5 login isn't available to link.");
  }
  await prisma.$transaction(
    async (tx) => {
      const users = await tx.user.findMany({ select: { id: true, mt5Links: true } });
      const own = linksOf(users.find((u) => u.id === userId)?.mt5Links);
      if (accountId !== null) {
        if (users.some((u) => u.id !== userId && login in linksOf(u.mt5Links))) throw appError("NOT_FOUND", "That MT5 login isn't available to link.");
        own[login] = accountId;
      } else delete own[login];
      await tx.user.update({ where: { id: userId }, data: { mt5Links: own } });
    },
    { isolationLevel: "Serializable" },
  );
  for (const k of [...signatures.keys()]) if (k.startsWith(`${userId}|`)) signatures.delete(k);
}

/** Logins another user has linked: nobody else sees or syncs them. */
async function claimedByOthers(userId: string): Promise<Set<string>> {
  const users = await prisma.user.findMany({ where: { id: { not: userId } }, select: { mt5Links: true } });
  return new Set(users.flatMap((u) => Object.keys(linksOf(u.mt5Links))));
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

/** Syncs every account this user can see: positions into the MT5 table, and into the Playbook for linked logins. */
export async function syncMt5(userId: string, now = Date.now(), dir = MT5_ACCOUNTS_DIR, force = false): Promise<SyncResult> {
  const [{ snaps }, links] = await Promise.all([emailOf(userId).then((email) => allSnapshots(userId, email, now, dir, force)), loadLinks(userId)]);
  const changes: SyncChanges = { created: 0, linked: 0, updated: 0, skipped: 0 };
  const errors: string[] = [];
  for (const { snap } of snaps.values()) {
    const login = snap.info.login;
    // Only this user's own logins: never another account's trades.
    const accountId = links[login];
    if (!accountId) continue;
    try {
      const allKey = `${userId}|${login}|*`;
      if (signatures.get(allKey) !== sigAll(snap)) {
        await upsertPositions(userId, login, snap.info.server, snap.positions);
        signatures.set(allKey, sigAll(snap));
      }
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
  if (!mayUseLiveSync(await emailOf(userId))) return;
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
  source: Mt5Source;
  /** Set for accounts connected through MetaApi: connected, connecting, or what went wrong. */
  status: string | null;
}

/** The accounts this user can sync, from both sources, with what each is linked to. */
export async function mt5Accounts(userId: string, dir = MT5_ACCOUNTS_DIR): Promise<Mt5AccountRow[]> {
  const [{ snaps, cloud }, links, others] = await Promise.all([emailOf(userId).then((email) => allSnapshots(userId, email, Date.now(), dir)), loadLinks(userId), claimedByOthers(userId)]);
  const statusOf = new Map(cloud.map((c) => [c.login, c.status]));
  const rows: Mt5AccountRow[] = [...snaps.values()]
    .filter(({ snap }) => !others.has(snap.info.login))
    .map(({ snap: { info, positions, deposit }, source }) => ({
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
      source,
      status: statusOf.get(info.login) ?? null,
    }));
  // Cloud accounts MetaApi hasn't fetched yet (still connecting, or failing).
  for (const c of cloud) {
    if (snaps.has(c.login)) continue;
    rows.push({ login: c.login, server: c.server, company: "", mode: "", currency: "", balance: null, equity: null, writtenAt: null, positions: 0, open: 0, firstTrade: null, deposit: null, accountId: links[c.login] ?? null, suggested: null, source: "cloud", status: c.status });
  }
  return rows.sort((a, b) => (b.writtenAt ?? 0) - (a.writtenAt ?? 0));
}

/** An uploaded HTML report, synced into the Playbook when its login is linked. Its balance is a past one, so it doesn't move the Playbook's. */
export async function syncReport(userId: string, login: string, server: string, positions: Mt5Position[], now = Date.now()): Promise<SyncChanges | null> {
  const accountId = (await loadLinks(userId))[login];
  if (!accountId) return null;
  const info: Mt5AccountInfo = { login, server, company: "", name: "", currency: "", mode: "", balance: null, equity: null, writtenAt: null };
  return syncAccount(userId, login, accountId, { info, positions, deposit: null }, now);
}
