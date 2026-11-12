import Link from "next/link";
import { Callout, Tag, tableClass, tdClass, thClass } from "@/components/kit";
import { signedNumber, toneClass } from "@/components/viz/format";
import { VerdictPill } from "@/components/testerReports/parts";
import { loadDashboards } from "@/lib/testerReports/dashboard";
import { cn } from "@/lib/utils";

const R = (v: number) => signedNumber(v, 1, "R");

export default async function TesterReportsPage() {
  const all = await loadDashboards();
  return (
    <div className="flex flex-col gap-6">
      <Callout title="What these are">
        Each row is a run of a Playbook setup&apos;s Expert Advisor in MT5&apos;s Strategy Tester on FundingPips&apos; own tick history since 2020, with its real spreads and
        commission. Open one for its numbers, its normal losing streak, how many trades the target takes, its worst day, and how many challenge attempts it needs. To add or
        refresh a report, save it from the tester&apos;s Results tab (right-click → Report → Open XML) into MT5&apos;s Documents folder and run{" "}
        <code className="text-paper">npx tsx src/backtest/importTesterReports.ts</code>.
      </Callout>
      <div className="relative overflow-x-auto rounded-[10px] border border-rule bg-deck p-5">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Setup</th>
              <th className={thClass}>Account</th>
              <th className={thClass}>Trades</th>
              <th className={thClass}>Won</th>
              <th className={thClass}>PF</th>
              <th className={thClass}>Net</th>
              <th className={thClass}>Max DD</th>
              <th className={thClass}>Losing run (1 in 10)</th>
              <th className={thClass}>Passes alone</th>
              <th className={thClass}>Breaches</th>
              <th className={thClass}>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {all.map((d) => (
              <tr key={d.info.slug}>
                <td className={tdClass}>
                  <Link href={`/tester-reports/${d.info.slug}`} className="font-medium text-paper underline-offset-4 hover:underline">
                    {d.info.market} {d.info.title} {d.info.timeframe}
                  </Link>
                  {d.info.note && <span className="ml-1.5 text-fees-ink" title={d.info.note}>*</span>}
                </td>
                <td className={tdClass}>
                  {d.info.research ? <Tag tone="fees">Research</Tag> : d.setup?.retired ? <Tag tone="loss">Retired</Tag> : d.home.own ? <Tag tone="gain">{d.home.account.id === "pro-5k" ? "$5k Pro" : "$10k Flex"}</Tag> : <Tag>Neither</Tag>}
                </td>
                <td className={cn(tdClass, "whitespace-nowrap tabular-nums")}>{d.numbers.trades}</td>
                <td className={cn(tdClass, "whitespace-nowrap tabular-nums")}>{d.numbers.winRatePct.toFixed(0)}%</td>
                <td className={cn(tdClass, "whitespace-nowrap tabular-nums", (d.numbers.profitFactor ?? 0) >= 1.2 ? "text-gain-ink" : "text-loss-ink")}>{d.numbers.profitFactor?.toFixed(2)}</td>
                <td className={cn(tdClass, "whitespace-nowrap tabular-nums", toneClass(d.numbers.netR))}>{R(d.numbers.netR)}</td>
                <td className={cn(tdClass, "whitespace-nowrap tabular-nums")}>{d.numbers.maxDrawdownR.toFixed(1)}R</td>
                <td className={cn(tdClass, "whitespace-nowrap tabular-nums")}>{d.streaks.bad} losses</td>
                <td className={cn(tdClass, "whitespace-nowrap tabular-nums")}>{Math.round(d.home.half.passPct)}%</td>
                <td className={cn(tdClass, "whitespace-nowrap tabular-nums", d.home.half.breachMaxPct + d.home.half.breachDailyPct >= 10 ? "text-loss-ink" : "")}>{Math.round(d.home.half.breachMaxPct + d.home.half.breachDailyPct)}%</td>
                <td className={tdClass}><VerdictPill verdict={d.verdict.verdict} className="px-3 py-1 text-[13px]" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-mist">
          * a caveat about that run, on its page. &quot;Passes alone&quot; and &quot;Breaches&quot;: Phase 1 on its own account at half the tested edge, with no other setup trading, over 3 years. Most setups are slow
          alone; the accounts trade several.
        </p>
      </div>
    </div>
  );
}
