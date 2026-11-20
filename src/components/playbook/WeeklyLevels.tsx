"use client";

import { EmptyState, Panel, tableClass, tdClass, thClass } from "@/components/kit";
import { ASideTag, coinLabel, price, RangeBar, signedPct, usePlan } from "./planShared";

// This week's levels for the markets this account trades: where price sits in
// last week's range (which side is A-grade), today's move, the nearest support
// and resistance, and today's read. From the scanner's 1h candles; weekly
// levels reset Monday 00:00 UTC, daily ones at 00:00 UTC.
export function WeeklyLevels({ symbols }: { symbols: string[] }) {
  const { data, isLoading, error } = usePlan();
  const wanted = new Set(symbols);
  const coins = (data?.coins ?? []).filter((c) => wanted.has(c.symbol));
  return (
    <Panel
      title="This week's levels"
      note="A-grade: a long below last week's midpoint (green half) or a short above it (red half), at full size. The other side is B-grade: half size, and skip it on currency pairs."
    >
      {isLoading ? (
        <EmptyState>Building this week&apos;s levels…</EmptyState>
      ) : error || !data ? (
        <EmptyState>Couldn&apos;t load the levels right now.</EmptyState>
      ) : coins.length === 0 ? (
        <EmptyState>No levels for these markets yet: the scanner has no 1h history for them.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Market</th>
                <th className={thClass}>Price</th>
                <th className={thClass}>Today</th>
                <th className={thClass}>In last week&apos;s range</th>
                <th className={thClass}>Grade</th>
                <th className={thClass}>Resistance</th>
                <th className={thClass}>Support</th>
                <th className={thClass}>Today&apos;s read</th>
              </tr>
            </thead>
            <tbody>
              {coins.map((c) => (
                <tr key={c.symbol}>
                  <td className={`${tdClass} font-medium`}>{coinLabel(c.symbol)}</td>
                  <td className={`${tdClass} tabular-nums`}>{price(c.price, c.symbol)}</td>
                  <td className={`${tdClass} tabular-nums ${c.dayChangePct >= 0 ? "text-gain-ink" : "text-loss-ink"}`}>{signedPct(c.dayChangePct, 2)}</td>
                  <td className={tdClass}>
                    <span className="flex items-center gap-2">
                      <RangeBar coin={c} compact />
                      <span className="text-xs tabular-nums text-fog">{Math.round(c.position * 100)}%</span>
                    </span>
                  </td>
                  <td className={tdClass}><ASideTag coin={c} /></td>
                  <td className={`${tdClass} tabular-nums text-loss-ink`}>{c.resistance.slice(0, 2).map((n) => price(n, c.symbol)).join(" · ") || "—"}</td>
                  <td className={`${tdClass} tabular-nums text-gain-ink`}>{c.support.slice(0, 2).map((n) => price(n, c.symbol)).join(" · ") || "—"}</td>
                  <td className={`${tdClass} min-w-[16rem] text-[13px] text-fog`}>{c.insights[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
