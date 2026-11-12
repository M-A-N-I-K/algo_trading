import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TesterMeta } from "@/lib/mt5/testerReport";
import { accountSetup, PLAYBOOK_ACCOUNTS, setupById, type PlaybookAccount, type PlaybookSetup } from "@/lib/playbook/config";
import { setupRiskScale } from "@/lib/playbook/rules";
import { days, numbers, simulateChallenge, streaks, verdict, type ChallengeResult, type Days, type Numbers, type ReportTrade, type Streaks } from "./analyze";
import { TESTER_REPORTS, type TesterReportInfo } from "./catalog";

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
}

interface ReportFile {
  slug: string;
  meta: TesterMeta;
  trades: ReportTrade[];
}

async function loadFile(slug: string): Promise<ReportFile | null> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "src/data/tester-reports", `${slug}.json`), "utf8")) as ReportFile;
  } catch {
    return null;
  }
}

const periodEnd = (period: string) => /- (\d{4})\.(\d{2})\.(\d{2})\)/.exec(period)?.slice(1).join("-");

export function buildDashboard(info: TesterReportInfo, file: ReportFile, sims = 4000): Dashboard {
  const trades = file.trades;
  const n = numbers(trades, undefined, periodEnd(file.meta.period));
  const accounts = PLAYBOOK_ACCOUNTS.map((account, i): AccountView => {
    const riskPct = account.rules.riskPctA * setupRiskScale(account, info.setupId);
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
    setup: setupById(info.setupId),
    meta: file.meta,
    trades,
    numbers: n,
    streaks: streaks(trades),
    days: days(trades),
    accounts,
    home,
    verdict: verdict(n, home.half),
  };
}

export async function loadDashboard(slug: string, sims?: number): Promise<Dashboard | null> {
  const info = TESTER_REPORTS.find((r) => r.slug === slug);
  if (!info) return null;
  const file = await loadFile(slug);
  return file ? buildDashboard(info, file, sims) : null;
}

/** Every report that has been imported, in catalog order. */
export async function loadDashboards(sims = 2000): Promise<Dashboard[]> {
  const all = await Promise.all(TESTER_REPORTS.map((r) => loadDashboard(r.slug, sims)));
  return all.filter((d): d is Dashboard => d !== null);
}
