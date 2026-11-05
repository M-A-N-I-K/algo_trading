"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState, Panel, Segmented, Stat } from "@/components/kit";
import { useDashboard } from "@/components/trading-journal/DashboardContext";
import { MIN_TRADES_FOR_REVIEW, reviewTrades, type Finding, type Severity } from "@/lib/journal/review";

const PERIODS = [
  { value: "all", label: "All time", days: null },
  { value: "90d", label: "90 days", days: 90 },
  { value: "30d", label: "30 days", days: 30 },
] as const;
type Period = (typeof PERIODS)[number]["value"];

const usd = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;

const SECTION: Record<Severity, { title: string; note: string; border: string; label: string; labelClass: string }> = {
  critical: {
    title: "Fix these first",
    note: "The habits costing you the most, ranked by what they cost.",
    border: "border-l-loss",
    label: "Costing you",
    labelClass: "text-loss-ink",
  },
  warning: {
    title: "Also holding you back",
    note: "Smaller leaks, and the things that stop you learning from your trades.",
    border: "border-l-fees",
    label: "Costing you",
    labelClass: "text-fees-ink",
  },
  good: {
    title: "What's working",
    note: "Keep these. Build your plan around them.",
    border: "border-l-gain",
    label: "",
    labelClass: "text-gain-ink",
  },
};

function FindingCard({ f }: { f: Finding }) {
  const s = SECTION[f.severity];
  return (
    <article className={`flex flex-col gap-2 rounded-[10px] border border-l-[3px] border-rule bg-ink/40 p-4 ${s.border}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-display text-[16px] font-semibold text-paper">{f.title}</h3>
        {f.cost >= 1 && (
          <span className={`text-xs tabular-nums ${s.labelClass}`}>
            {s.label} {usd(f.cost)}
          </span>
        )}
      </div>
      <p className="text-sm leading-relaxed text-fog">{f.evidence}</p>
      <p className="text-sm leading-relaxed text-paper">
        <span className="font-medium">Fix: </span>
        {f.fix}
      </p>
    </article>
  );
}

// A blunt review of the trader's own closed trades: verdict, the habits
// that cost money (with numbers), what works, and a short set of rules.
export default function TradeReview() {
  const { trades, startingBalance, coindcxBalance, dailyLossLimit, weeklyLossLimit } = useDashboard();
  const [period, setPeriod] = useState<Period>("all");

  const review = useMemo(() => {
    const days = PERIODS.find((p) => p.value === period)!.days;
    const from = days === null ? -Infinity : Date.now() - days * 86_400_000;
    const inPeriod = trades.filter((t) => new Date(t.time).getTime() >= from);
    return reviewTrades({
      trades: inPeriod,
      startingBalance,
      currentBalance: coindcxBalance,
      dailyLossLimit,
      weeklyLossLimit,
    });
  }, [trades, period, startingBalance, coindcxBalance, dailyLossLimit, weeklyLossLimit]);

  const n = review.numbers;
  const bySeverity = (s: Severity) => review.findings.filter((f) => f.severity === s);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fog">
          Every claim below comes from your synced and logged trades. No opinions without numbers.
        </p>
        <Segmented label="Period" size="sm" value={period} onChange={setPeriod} options={PERIODS.map(({ value, label }) => ({ value, label }))} />
      </div>

      {review.count < MIN_TRADES_FOR_REVIEW ? (
        <Panel title="Not enough trades yet">
          <EmptyState>
            {review.count} closed trade{review.count === 1 ? "" : "s"} in this period. The review needs at least {MIN_TRADES_FOR_REVIEW} before it
            will tell you anything you can trust.
          </EmptyState>
        </Panel>
      ) : (
        <>
          <section
            className={`rounded-[10px] border border-l-[3px] border-rule bg-deck p-5 ${review.verdict.profitable ? "border-l-gain" : "border-l-loss"}`}
          >
            <h2 className="font-display text-[24px] font-bold leading-tight tracking-[-0.02em] text-paper">{review.verdict.headline}</h2>
            <p className="mt-2 max-w-[80ch] text-[15px] leading-relaxed text-fog">{review.verdict.detail}</p>
            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-rule pt-4 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="Net result" value={usd(n.net)} tone={n.net >= 0 ? "text-gain-ink" : "text-loss-ink"} note={`${n.accountChangePct >= 0 ? "+" : "−"}${Math.abs(n.accountChangePct).toFixed(1)}% of starting balance`} />
              <Stat label="From the market" value={usd(n.gross)} tone={n.gross >= 0 ? "text-gain-ink" : "text-loss-ink"} note="Before fees and funding" />
              <Stat label="Fees and funding" value={usd(n.fees - n.funding)} tone="text-fees-ink" note={`${usd((n.fees - n.funding) / review.count)} per trade`} />
              <Stat
                label="Win rate"
                value={n.winRate === null ? "—" : `${(n.winRate * 100).toFixed(0)}%`}
                note={n.breakevenWinRate === null ? undefined : `You need ${(n.breakevenWinRate * 100).toFixed(0)}% to break even`}
                tone={n.winRate !== null && n.breakevenWinRate !== null && n.winRate < n.breakevenWinRate ? "text-loss-ink" : undefined}
              />
              <Stat
                label="Average trade"
                value={n.expectancyR === null ? usd(n.expectancy ?? 0) : `${n.expectancyR >= 0 ? "+" : ""}${n.expectancyR.toFixed(2)}R`}
                tone={(n.expectancy ?? 0) >= 0 ? "text-gain-ink" : "text-loss-ink"}
                note={`${usd(n.expectancy ?? 0)} per trade`}
              />
            </div>
          </section>

          {review.rules.length > 0 && (
            <Panel
              title="Your rules for the next 30 trades"
              note="The few rules that would have saved you the most. Write them down, follow every one, then come back and compare."
            >
              <ol className="flex flex-col gap-2">
                {review.rules.map((rule, i) => (
                  <li key={rule} className="flex gap-3 rounded-md border border-rule bg-ink/40 px-3 py-2.5 text-sm text-paper">
                    <span className="font-display font-semibold tabular-nums text-signal">{i + 1}</span>
                    {rule}
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-mist">
                Size each trade on the <Link href="/risk" className="underline underline-offset-4">Position size</Link> page, and only take setups
                from the <Link href="/signals" className="underline underline-offset-4">Signals</Link> page while you rebuild.
              </p>
            </Panel>
          )}

          {(["critical", "warning", "good"] as const).map((sev) =>
            bySeverity(sev).length ? (
              <Panel key={sev} title={SECTION[sev].title} note={SECTION[sev].note}>
                <div className="grid gap-3 lg:grid-cols-2">
                  {bySeverity(sev).map((f) => (
                    <FindingCard key={f.id} f={f} />
                  ))}
                </div>
              </Panel>
            ) : null,
          )}
        </>
      )}
    </div>
  );
}
