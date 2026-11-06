"use client";

import Link from "next/link";
import { EmptyState, Panel, tableClass, tdClass, thClass } from "@/components/kit";
import { ASideTag, coinLabel, price, RangeBar, signedPct, usePlan } from "./shared";

// The weekly plan in brief, for the dashboard: each market's grade side,
// where it sits in last week's range, today's move and today's main read.
export default function PlanCard({ className = "" }: { className?: string }) {
  const { data, isLoading, error } = usePlan();
  return (
    <Panel
      className={className}
      title="This week's plan"
      note={data?.summary[data.summary.length > 2 ? 2 : 0] ?? "Last week's range, today's levels and the A-grade side for each market."}
      aside={
        <Link href="/plan" className="text-sm text-signal hover:underline">
          Open the plan
        </Link>
      }
    >
      {isLoading ? (
        <EmptyState>Building the plan…</EmptyState>
      ) : error || !data ? (
        <EmptyState>Couldn&apos;t load the plan right now.</EmptyState>
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
                <th className={thClass}>Today&apos;s read</th>
              </tr>
            </thead>
            <tbody>
              {data.coins.map((c) => (
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
                  <td className={tdClass}>
                    <ASideTag coin={c} />
                  </td>
                  <td className={`${tdClass} min-w-[18rem] text-[13px] text-fog`}>{c.insights[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
