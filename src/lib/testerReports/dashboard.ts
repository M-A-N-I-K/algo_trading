import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { TesterMeta } from "@/lib/mt5/testerReport";
import { accountSetup, OTHER_SETUP_RISK_SCALE, PLAYBOOK_ACCOUNTS, setupById, type PlaybookAccount, type PlaybookSetup } from "@/lib/playbook/config";
import { setupRiskScale } from "@/lib/playbook/rules";
import { days, numbers, simulateChallenge, streaks, verdict, type ChallengeResult, type Days, type Numbers, type ReportTrade, type Streaks } from "./analyze";
import { TESTER_REPORTS, type TesterReportInfo } from "./catalog";
import { fullReport, type FullReport } from "./report";

export interface AccountView {
  account: PlaybookAccount;
  own: boolean; // the setup is in this account's plan
  riskPct: number;
  full: ChallengeResult; // the report as it is
  half: ChallengeResult; // half the average R
}

export interface Dashboard {
  info: TesterReportInfo;
  setup: PlaybookSetup | undefined;
  meta: TesterMeta;
  trades: ReportTrade[];
  numbers: Numbers;
  streaks: Streaks;
  days: Days;
  accounts: AccountView[];
  home: AccountView; // the account that trades it, or the Flex for a setup neither does
  verdict: ReturnType<typeof verdict>;
  report: FullReport; // the MT5-style views: balance and drawdown over time, months, splits, trade list
}

interface ReportFile {
  slug: string;
  meta: TesterMeta;
  trades: ReportTrade[];
}

const fileOf = (slug: string) => path.join(process.cwd(), "src/data/tester-reports", `${slug}.json`);

async function loadFile(slug: string): Promise<ReportFile | null> {
  try {
    return JSON.parse(await readFile(fileOf(slug), "utf8")) as ReportFile;
  } catch {
    return null;
  }
}

// The challenge simulations take ~50–400 ms a report, so results are kept in
// memory until the report's file changes (re-import) or the server restarts
// (config changes reload this module in dev).
const cache = new Map<string, { mtime: number; value: Dashboard | SummaryRow }>();
async function cached<T extends Dashboard | SummaryRow>(key: string, slug: string, build: () => Promise<T | null>): Promise<T | null> {
  let mtime: number;
  try {
    mtime = (await stat(fileOf(slug))).mtimeMs;
  } catch {
    return null;
  }
  const hit = cache.get(key);
  if (hit && hit.mtime === mtime) return hit.value as T;
  const value = await build();
  if (value) cache.set(key, { mtime, value });
  return value;
}

const periodEnd = (period: string) => /- (\d{4})\.(\d{2})\.(\d{2})\)/.exec(period)?.slice(1).join("-");

export function buildDashboard(info: TesterReportInfo, file: ReportFile, sims = 4000): Dashboard {
  const trades = file.trades;
  const n = numbers(trades, undefined, periodEnd(file.meta.period));
  const accounts = PLAYBOOK_ACCOUNTS.map((account, i): AccountView => {
    // A research strategy is sized like another account's setup: half risk.
    const riskPct = account.rules.riskPctA * (info.research ? OTHER_SETUP_RISK_SCALE : setupRiskScale(account, info.setupId));
    const rules = { riskPct, targetPct: account.targetPct, maxLossPct: account.maxLossPct, dailyLossPct: account.dailyLossPct };
    return {
      account,
      own: !!accountSetup(account, info.setupId),
      riskPct,
      full: simulateChallenge(trades, rules, { sims, seed: 11 + i }),
      half: simulateChallenge(trades, rules, { sims, seed: 11 + i, edge: 0.5 }),
    };
  });
  const home = accounts.find((a) => a.own) ?? accounts[0];
  return {
    info,
    setup: info.parts ? undefined : setupById(info.setupId), // a basket has no single app baseline
    meta: file.meta,
    trades,
    numbers: n,
    streaks: streaks(trades),
    days: days(trades),
    accounts,
    home,
    verdict: verdict(n, home.half),
    report: fullReport(trades),
  };
}

export async function loadDashboard(slug: string, sims = 4000): Promise<Dashboard | null> {
  const info = TESTER_REPORTS.find((r) => r.slug === slug);
  if (!info) return null;
  return cached(`full:${slug}:${sims}`, slug, async () => {
    const file = await loadFile(slug);
    return file ? buildDashboard(info, file, sims) : null;
  });
}

/** One row of the reports table: only the home account at half edge is simulated. */
export interface SummaryRow {
  info: TesterReportInfo;
  setup: PlaybookSetup | undefined;
  numbers: Numbers;
  streaks: Streaks;
  home: Pick<AccountView, "account" | "own" | "riskPct" | "half">;
  verdict: ReturnType<typeof verdict>;
}

export function buildSummary(info: TesterReportInfo, file: ReportFile, sims = 2000): SummaryRow {
  const trades = file.trades;
  const n = numbers(trades, undefined, periodEnd(file.meta.period));
  const i = Math.max(0, PLAYBOOK_ACCOUNTS.findIndex((a) => accountSetup(a, info.setupId)));
  const account = PLAYBOOK_ACCOUNTS[i];
  const riskPct = account.rules.riskPctA * (info.research ? OTHER_SETUP_RISK_SCALE : setupRiskScale(account, info.setupId));
  const rules = { riskPct, targetPct: account.targetPct, maxLossPct: account.maxLossPct, dailyLossPct: account.dailyLossPct };
  // Same seed as buildDashboard, so the table matches the report page at equal sims.
  const half = simulateChallenge(trades, rules, { sims, seed: 11 + i, edge: 0.5 });
  return {
    info,
    setup: info.parts ? undefined : setupById(info.setupId),
    numbers: n,
    streaks: streaks(trades),
    home: { account, own: !!accountSetup(account, info.setupId), riskPct, half },
    verdict: verdict(n, half),
  };
}

/** The reports table: every imported report, in catalog order. */
export async function loadSummaries(sims = 2000): Promise<SummaryRow[]> {
  const all = await Promise.all(
    TESTER_REPORTS.map((info) =>
      cached(`row:${info.slug}:${sims}`, info.slug, async () => {
        const file = await loadFile(info.slug);
        return file ? buildSummary(info, file, sims) : null;
      }),
    ),
  );
  return all.filter((d): d is SummaryRow => d !== null);
}

/** One report's trades, for the CSV download. */
export async function loadReportTrades(slug: string): Promise<ReportTrade[] | null> {
  if (!TESTER_REPORTS.some((r) => r.slug === slug)) return null;
  return (await loadFile(slug))?.trades ?? null;
}

/** Every report that has been imported, in catalog order, with every simulation. */
export async function loadDashboards(sims = 2000): Promise<Dashboard[]> {
  const all = await Promise.all(TESTER_REPORTS.map((r) => loadDashboard(r.slug, sims)));
  return all.filter((d): d is Dashboard => d !== null);
}
