"use client";

import Link from "next/link";
import { Callout, EmptyState, Panel, Tag } from "@/components/kit";
import type { CoinPlan } from "@/lib/plan/weeklyPlan";
import { WEEK_MS } from "@/lib/plan/weeklyPlan";
import { assetClass } from "@/lib/markets/yahoo";
import { ASideTag, coinLabel, price, RangeBar, signedPct, usePlan } from "./shared";

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const trendTag = (t: "up" | "down") => <Tag tone={t === "up" ? "gain" : "loss"}>{t === "up" ? "Up" : "Down"}</Tag>;

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-fog">{label}</p>
      <p className="font-display text-[15px] font-semibold tabular-nums text-paper">{value}</p>
      {note && <p className="text-[11px] text-mist">{note}</p>}
    </div>
  );
}

function CoinCard({ coin }: { coin: CoinPlan }) {
  const label = coinLabel(coin.symbol);
  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-[10px] border border-rule bg-deck p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h3 className="font-display text-[19px] font-semibold text-paper">{label}</h3>
          <span className="font-display text-[17px] tabular-nums text-paper">{price(coin.price, coin.symbol)}</span>
          <span className={`text-sm tabular-nums ${coin.dayChangePct >= 0 ? "text-gain-ink" : "text-loss-ink"}`}>{signedPct(coin.dayChangePct, 2)}</span>
        </div>
        <ASideTag coin={coin} />
      </div>

      <div>
        <p className="mb-2 text-xs text-fog">
          Last week&apos;s range: discount (green) and premium (red). Price at <span className="text-paper">{Math.round(coin.position * 100)}%</span>; the blue line under it is this week so far.
        </p>
        <RangeBar coin={coin} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label="Yesterday" value={`${price(coin.yesterday.low, coin.symbol)} – ${price(coin.yesterday.high, coin.symbol)}`} />
        <Figure label="Today so far" value={`${price(coin.today.low, coin.symbol)} – ${price(coin.today.high, coin.symbol)}`} note={`${Math.round(coin.todayRangeOfAtr * 100)}% of a normal day`} />
        <Figure label="Daily ATR" value={price(coin.atr, coin.symbol)} note={`${((coin.atr / coin.price) * 100).toFixed(1)}% of price`} />
        <div className="min-w-0">
          <p className="text-xs text-fog">Weekly / daily trend</p>
          <p className="mt-0.5 flex gap-1.5">{trendTag(coin.weeklyTrend)}{trendTag(coin.dailyTrend)}</p>
          <p className="text-[11px] text-mist">{signedPct(coin.change4wPct)} in 4 weeks</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-fog">Resistance (nearest first)</p>
          <p className="tabular-nums text-loss-ink">{coin.resistance.length ? coin.resistance.map((n) => price(n, coin.symbol)).join(" · ") : "—"}</p>
        </div>
        <div>
          <p className="text-xs text-fog">Support (nearest first)</p>
          <p className="tabular-nums text-gain-ink">{coin.support.length ? coin.support.map((n) => price(n, coin.symbol)).join(" · ") : "—"}</p>
        </div>
      </div>

      <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[13px] leading-relaxed text-fog marker:text-mist">
        {coin.insights.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </article>
  );
}

// The top-down plan for every Signals market. Weekly levels roll over at
// Monday 00:00 UTC, daily ones at 00:00 UTC, from the latest 1h candles.
export default function WeeklyPlanBoard() {
  const { data, error, isLoading } = usePlan();

  if (isLoading) {
    return (
      <Panel title="Building the plan">
        <EmptyState>Loading the last two years of hourly candles for each market. The first load after a restart can take a minute.</EmptyState>
      </Panel>
    );
  }
  if (error || !data) {
    return <Callout tone="critical" title="Couldn't build the plan">{error instanceof Error ? error.message : "Try again in a minute."}</Callout>;
  }

  const weekStart = data.weekStart;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-fog">
        {weekStart !== null && (
          <>
            Week of <span className="text-paper">{dayFmt.format(weekStart)}</span> (weeks start Monday 00:00 UTC; next reset{" "}
            {timeFmt.format(weekStart + WEEK_MS)}). Daily levels reset at 00:00 UTC.{" "}
          </>
        )}
        Updated {timeFmt.format(data.asOf)}, every 5 minutes.
      </p>

      <Panel title="This week's read" note="Across every market the app scans.">
        <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm leading-relaxed text-paper marker:text-mist">
          {data.summary.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </Panel>

      <Callout title="How to use this">
        Take entries only from the <Link href="/playbook" className="underline underline-offset-4">Playbook</Link>, which grades and sizes each signal for you.{" "}
        <span className="text-paper">A-grade</span>: a long below last week&apos;s midpoint or a short above it, so take it at full size (0.5% risk on the prop account).{" "}
        <span className="text-paper">B-grade</span>: the opposite, so take it at half size. Over 2 years of backtests the A-grade trades made a profit factor of 2.10 against 1.44
        for B-grade, in both halves of the window. On currency pairs B-grade trades lost money outright (profit factor 0.72), so skip them there. The weekly and daily trends are shown for context only: waiting for them to agree made the same trades worse.
      </Callout>

      {data.errors.length > 0 && (
        <Callout tone="warning" title="Some markets didn't load">{data.errors.join(" · ")}</Callout>
      )}

      {[
        { title: "Crypto and metals", coins: data.coins.filter((c) => assetClass(c.symbol) === "crypto") },
        { title: "Currency pairs", coins: data.coins.filter((c) => assetClass(c.symbol) === "forex") },
        { title: "Indices", coins: data.coins.filter((c) => assetClass(c.symbol) === "index") },
        { title: "Commodities", coins: data.coins.filter((c) => assetClass(c.symbol) === "commodity") },
      ].map((g) =>
        g.coins.length ? (
          <section key={g.title} className="flex flex-col gap-3">
            <h2 className="font-display text-[19px] font-semibold text-paper">{g.title}</h2>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-3">
              {g.coins.map((c) => (
                <CoinCard key={c.symbol} coin={c} />
              ))}
            </div>
          </section>
        ) : null,
      )}
    </div>
  );
}
