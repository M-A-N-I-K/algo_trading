import { Callout, Stat, Tag, tableClass, tdClass, thClass } from "@/components/kit";
import { signedNumber, toneClass } from "@/components/viz/format";
import type { ChallengeResult } from "@/lib/testerReports/analyze";
import type { AccountView, Dashboard } from "@/lib/testerReports/dashboard";
import { cn } from "@/lib/utils";
import { BackLink, Bar, RCurve, Section, Stepper, VerdictPill } from "./parts";

const R = (v: number, d = 1) => signedNumber(v, d, "R");
const pct = (v: number) => `${v < 1 && v > 0 ? "<1" : Math.round(v)}%`;
const usd = (v: number) => `$${Math.round(v).toLocaleString()}`;
const weeks = (w: number) => (w >= 52 ? `${(w / 52).toFixed(1)} yr` : `${Math.round(w)} wk`);
const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function AccountName({ a }: { a: AccountView }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="text-paper">{a.account.name.replace("FundingPips ", "")}</span>
      {a.own ? <Tag tone="gain">its account</Tag> : <Tag>other setup</Tag>}
    </span>
  );
}

// Median on top, the slow 1-in-10 case under it.
function Spread({ x, fmt = (v) => String(Math.round(v)), unit = "" }: { x: ChallengeResult["tradesToPass"]; fmt?: (v: number) => string; unit?: string }) {
  if (!x) return <span className="text-fog">never</span>;
  return (
    <span className="flex flex-col whitespace-nowrap">
      <span>{fmt(x.median)}{unit}</span>
      <span className="text-xs text-mist">1 in 10: {fmt(x.p90)}{unit}+</span>
    </span>
  );
}

export default function TesterReportView({ d }: { d: Dashboard }) {
  const { info, numbers: n, streaks: s, days, accounts, home } = d;
  const base = d.setup?.baseline;
  const homeR = home.riskPct; // % of the account per R
  const maxRun = Math.max(...s.lossRuns.map((x) => x.count), 1);
  const yearMax = Math.max(...n.years.map((y) => Math.abs(y.netR)), 1);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-display text-[24px] font-semibold tracking-[-0.02em] text-paper">
            {info.market} · {info.title} · {info.timeframe}
          </h1>
          {d.setup?.retired ? <Tag tone="loss">Retired</Tag> : accounts.some((a) => a.own) ? <Tag tone="gain">In the Playbook</Tag> : <Tag tone="fees">In neither account&apos;s plan</Tag>}
        </div>
        <p className="text-[13px] text-fog">
          MT5 Strategy Tester: {d.meta.expert} on {d.meta.symbol}, {d.meta.period}, history quality {d.meta.historyQuality}, FundingPips spreads and commission. Every result is in R: the P&amp;L
          over what the trade&apos;s stop would have lost, so lot rounding doesn&apos;t blur it.
        </p>
        {info.note && <Callout tone="warning">{info.note}</Callout>}
      </div>

      <Stepper verdict={d.verdict.verdict} />

      {/* 1 */}
      <Section
        id="numbers"
        step={1}
        title="Your numbers"
        note={base ? `The app's own backtest of this setup: ${base.trades} trades, ${base.winRatePct}% won, profit factor ${base.profitFactor}. The tester re-checks it on real ticks.` : undefined}
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <Stat label="Trades" value={n.trades} note={`${n.perWeek.toFixed(2)} a week, ${fmtDay(n.from)} to ${fmtDay(n.to)}`} />
          <Stat label="Won" value={`${n.winRatePct.toFixed(1)}%`} note={`Avg win ${R(n.avgWinR, 2)}, avg loss ${R(n.avgLossR, 2)}`} />
          <Stat label="Profit factor" value={n.profitFactor?.toFixed(2) ?? "—"} tone={(n.profitFactor ?? 0) >= 1.2 ? "text-gain-ink" : "text-loss-ink"} note="Won ÷ lost, in R" />
          <Stat label="Net" value={R(n.netR)} tone={toneClass(n.netR)} note={`${R(n.avgR, 2)} a trade`} />
          <Stat label="Max drawdown" value={`${n.maxDrawdownR.toFixed(1)}R`} note={`${(n.maxDrawdownR * homeR).toFixed(1)}% of the account at ${homeR}% a trade`} />
          <Stat label="Best / worst trade" value={`${R(n.bestR)} / ${R(n.worstR)}`} />
          <Stat label="First half / second half" value={`${R(n.halves[0])} / ${R(n.halves[1])}`} tone={n.halves[0] > 0 && n.halves[1] > 0 ? "text-gain-ink" : "text-fees-ink"} note={n.halves[0] > 0 && n.halves[1] > 0 ? "Made money in both" : "One half lost"} />
        </div>
        <div className="mt-5">
          <RCurve equity={n.equity} />
        </div>
        <div className="mt-4 grid gap-1.5 sm:max-w-md">
          {n.years.map((y) => (
            <Bar key={y.year} label={`${y.year} · ${y.trades}`} value={y.netR} max={yearMax} tone={y.netR >= 0 ? "gain" : "loss"} right={<span className={toneClass(y.netR)}>{R(y.netR)}</span>} />
          ))}
          <p className="text-xs text-mist">Net R by year (year · trades)</p>
        </div>
      </Section>

      {/* 2 */}
      <Section
        id="streak"
        step={2}
        title="Your normal losing streak"
        note={`It loses ${(100 - n.winRatePct).toFixed(0)}% of its trades, so runs of losses are part of the plan, not a sign it broke. These are the runs to expect, drawn from that loss rate.`}
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <Stat label="Longest in the report" value={`${s.longestLoss} losses`} note={`Longest win run: ${s.longestWin}`} />
          <Stat label={`Normal in any ${s.window} trades`} value={`${s.typical} in a row`} note="Half of all stretches reach this" />
          <Stat label="Bad but normal" value={`${s.bad} in a row`} note="1 stretch in 10" tone="text-fees-ink" />
          <Stat label="Rare" value={`${s.worst} in a row`} note="1 stretch in 100" tone="text-loss-ink" />
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="grid gap-1.5">
            {s.lossRuns.map((x) => (
              <Bar key={x.length} label={`${x.length} loss${x.length > 1 ? "es" : ""}`} value={x.count} max={maxRun} tone="loss" right={`${x.count}×`} />
            ))}
            <p className="text-xs text-mist">How often each run of losses happened in the report</p>
          </div>
          <div className="text-[13px] leading-relaxed text-fog">
            <p>
              On the {home.account.name.replace("FundingPips ", "")} at {homeR}% a trade, a {s.bad}-loss run costs about{" "}
              <span className="text-paper">{(s.bad * homeR).toFixed(1)}%</span> ({usd((s.bad * homeR * home.account.size) / 100)}), against {home.account.maxLossPct}% of total room.
              {s.worst * homeR >= home.account.maxLossPct ? (
                <span className="text-loss-ink"> A rare {s.worst}-loss run would breach it: that&apos;s why the risk is where it is.</span>
              ) : (
                <> Even the rare {s.worst}-loss run ({(s.worst * homeR).toFixed(1)}%) stays inside it.</>
              )}
            </p>
            <p className="mt-2">Don&apos;t change anything inside a {s.bad}-loss run. Review the setup only past {s.worst}, or after 25 trades if it&apos;s losing overall.</p>
          </div>
        </div>
      </Section>

      {/* 3 */}
      <Section
        id="trades"
        step={3}
        title="How many trades the target really takes"
        note="The target in R is the account's target over the risk per trade. Dividing by the average R gives a neat number; the replay of Phase 1 (4,000 runs, drawing random days from the report) shows the real spread, because wins arrive in clumps."
      >
        <div className="relative overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Account</th>
                <th className={thClass}>Risk a trade</th>
                <th className={thClass}>Target</th>
                <th className={thClass}>At the average R</th>
                <th className={thClass}>Trades to pass</th>
                <th className={thClass}>Time to pass</th>
                <th className={thClass}>Trades, half edge</th>
                <th className={thClass}>Time, half edge</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.account.id}>
                  <td className={tdClass}><AccountName a={a} /></td>
                  <td className={cn(tdClass, "whitespace-nowrap tabular-nums")}>{a.riskPct}% ({usd((a.riskPct * a.account.size) / 100)})</td>
                  <td className={cn(tdClass, "whitespace-nowrap tabular-nums")}>{a.account.targetPct}% = {a.full.targetR.toFixed(1)}R</td>
                  <td className={cn(tdClass, "tabular-nums")}>
                    {n.avgR > 0 ? (
                      <span className="flex flex-col whitespace-nowrap">
                        <span>{Math.ceil(a.full.targetR / n.avgR)} trades</span>
                        <span className="text-xs text-mist">{weeks(a.full.targetR / n.avgR / Math.max(n.perWeek, 1e-9))}</span>
                      </span>
                    ) : "never"}
                  </td>
                  <td className={cn(tdClass, "tabular-nums")}><Spread x={a.full.tradesToPass} /></td>
                  <td className={cn(tdClass, "tabular-nums")}><Spread x={a.full.weeksToPass} fmt={weeks} /></td>
                  <td className={cn(tdClass, "tabular-nums")}><Spread x={a.half.tradesToPass} unit=" trades" /></td>
                  <td className={cn(tdClass, "tabular-nums")}><Spread x={a.half.weeksToPass} fmt={weeks} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[13px] text-fog">
          &quot;Trades to pass&quot; counts only the runs that passed within 3 years, the luckier ones, so it can sit below the average-R figure; the rest show as
          &quot;still going&quot; in step 5. At {n.perWeek.toFixed(2)} trades a week this setup alone is slow; the account&apos;s other setups add trades toward the same target.
        </p>
      </Section>

      {/* 4 */}
      <Section
        id="worst-day"
        step={4}
        title="Your worst day"
        note="Trades grouped by the platform day they closed on (FundingPips resets at 00:00 server time). The daily limit counts from the day's starting balance, open trades included."
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <Stat label="Worst day" value={R(days.worstDay.r, 2)} tone="text-loss-ink" note={`${fmtDay(days.worstDay.day)}, ${days.worstDay.trades} trade${days.worstDay.trades > 1 ? "s" : ""}`} />
          <Stat label="Worst week" value={R(days.worstWeek.r, 2)} tone="text-loss-ink" note={`Week of ${fmtDay(days.worstWeek.start)}, ${days.worstWeek.trades} trades`} />
          <Stat label="Trading days" value={days.tradingDays} note={`${days.multiTradeDays} with more than one trade closing`} />
        </div>
        <div className="relative mt-5 overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Account</th>
                <th className={thClass}>Worst day here</th>
                <th className={thClass}>Your daily stop</th>
                <th className={thClass}>Firm&apos;s daily limit</th>
                <th className={thClass}>Daily-limit breaches in the replay</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const lossPct = -days.worstDay.r * a.riskPct;
                const own = a.account.rules.dailyStopPct;
                return (
                  <tr key={a.account.id}>
                    <td className={tdClass}><AccountName a={a} /></td>
                    <td className={cn(tdClass, "tabular-nums", lossPct >= a.account.dailyLossPct ? "text-loss-ink" : lossPct >= own ? "text-fees-ink" : "text-paper")}>
                      −{lossPct.toFixed(2)}% ({usd((lossPct * a.account.size) / 100)})
                    </td>
                    <td className={cn(tdClass, "tabular-nums")}>−{own}% ({usd((own * a.account.size) / 100)})</td>
                    <td className={cn(tdClass, "tabular-nums")}>−{a.account.dailyLossPct}% ({usd((a.account.dailyLossPct * a.account.size) / 100)})</td>
                    <td className={cn(tdClass, "tabular-nums")}>{pct(a.full.breachDailyPct)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[13px] text-fog">
          One trade at a time can lose about 1R in a day, so this setup alone can&apos;t hit the daily limit. The danger is stacking it with other setups on the same day: keep
          today&apos;s losses plus open risk inside your own stop.
        </p>
      </Section>

      {/* 5 */}
      <Section
        id="attempts"
        step={5}
        title="How many attempts you actually need to pass one"
        note="Phase 1 replayed 4,000 times per account: it passes on the target, fails on the static floor or the daily limit, and stops after 3 years. Half the edge is the cautious case, since live trading usually earns less than a backtest."
      >
        <div className="relative overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Account</th>
                <th className={thClass}>Edge</th>
                <th className={thClass}>Passes</th>
                <th className={thClass}>Breaches</th>
                <th className={thClass}>Still going after 3 years</th>
                <th className={thClass}>Attempts on average</th>
                <th className={thClass}>For a 90% chance</th>
              </tr>
            </thead>
            <tbody>
              {accounts.flatMap((a) =>
                ([["As tested", a.full], ["Half", a.half]] as const).map(([label, c], i) => (
                  <tr key={a.account.id + label}>
                    <td className={tdClass}>{i === 0 ? <AccountName a={a} /> : null}</td>
                    <td className={cn(tdClass, "text-fog")}>{label}</td>
                    <td className={cn(tdClass, "tabular-nums", c.passPct >= 50 ? "text-gain-ink" : "text-paper")}>{pct(c.passPct)}</td>
                    <td className={cn(tdClass, "tabular-nums", c.breachMaxPct + c.breachDailyPct >= 10 ? "text-loss-ink" : "text-paper")}>{pct(c.breachMaxPct + c.breachDailyPct)}</td>
                    <td className={cn(tdClass, "tabular-nums text-fog")}>{pct(c.unfinishedPct)}</td>
                    <td className={cn(tdClass, "tabular-nums")}>{c.attempts.expected ?? "—"}</td>
                    <td className={cn(tdClass, "tabular-nums")}>{c.attempts.for90 ?? "—"}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[13px] text-fog">
          An attempt here is one challenge fee. &quot;Still going&quot; means it neither passed nor failed in 3 years: the setup is safe but too slow to pass on its own.
          {accounts.some((a) => a.account.rules.riskPctB === null) && " The EA took every signal; the Pro takes A-grade signals only, so it would trade a little less."}
        </p>
      </Section>

      <section id="verdict" className="scroll-mt-6 flex flex-col gap-3 rounded-[10px] border border-rule bg-deck p-5 sm:flex-row sm:items-center">
        <VerdictPill verdict={d.verdict.verdict} className="self-start px-6 py-2.5 text-[17px]" />
        <div className="text-[14px] leading-relaxed text-paper">
          <p>{d.verdict.reason}</p>
          <p className="mt-1 text-[13px] text-fog">
            Judged on {home.account.name.replace("FundingPips ", "")} at {homeR}% a trade{home.own ? ", the account that trades it" : ", since neither account trades it"}, with half the tested edge.
          </p>
        </div>
      </section>
    </div>
  );
}
