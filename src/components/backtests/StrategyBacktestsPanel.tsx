"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Button, Tag, pct, signedNumber, tableClass, tdClass, thClass, toneClass } from "@/components/kit";
import { fetchJson } from "@/lib/apiClient";
import type { BacktestSummary } from "@/db/repositories/backtestRepository";

const dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "2-digit" });
const fmtDate = (iso: string) => dateFmt.format(new Date(iso));

export function backtestsQueryKey(strategyId: string) {
  return ["strategy-backtests", strategyId];
}

function StatusTag({ status }: { status: BacktestSummary["status"] }) {
  if (status === "COMPLETED") return null;
  if (status === "FAILED") return <Tag tone="loss">Failed</Tag>;
  return <Tag tone="signal">Running</Tag>;
}

// Past backtests of a strategy, newest first, across all its versions.
export default function StrategyBacktestsPanel({ strategyId }: { strategyId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: backtestsQueryKey(strategyId),
    queryFn: () => fetchJson<{ backtests: BacktestSummary[] }>(`/api/strategies/${strategyId}/backtests`),
  });
  const remove = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/backtests/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: backtestsQueryKey(strategyId) }),
  });

  const backtests = query.data?.backtests ?? [];

  if (query.isLoading) return <p className="text-sm text-fog">Loading backtests…</p>;
  if (query.isError) return <p className="text-sm text-loss-ink">{(query.error as Error).message}</p>;
  if (backtests.length === 0) {
    return <p className="text-sm text-fog">No backtests yet. Use Backtest above to run this strategy on historical candles.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className={`${tableClass} min-w-[34rem] whitespace-nowrap`}>
        <thead>
          <tr>
            <th scope="col" className={thClass}>Version</th>
            <th scope="col" className={thClass}>Range</th>
            <th scope="col" className={`${thClass} text-right`}>Round trips</th>
            <th scope="col" className={`${thClass} text-right`}>Win rate</th>
            <th scope="col" className={`${thClass} text-right`}>Return</th>
            <th scope="col" className={thClass}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {backtests.map((b) => {
            const m = b.metrics;
            return (
              <tr key={b.id}>
                <td className={tdClass}>
                  <Link href={`/strategies/${strategyId}/backtests/${b.id}`} className="font-medium text-paper underline-offset-2 hover:underline">
                    v{b.version}
                  </Link>{" "}
                  <StatusTag status={b.status} />
                  {b.configuration.isDemo && (
                    <span className="ml-1">
                      <Tag tone="fees">Demo data</Tag>
                    </span>
                  )}
                </td>
                <td className={`${tdClass} text-fog`}>
                  {fmtDate(b.configuration.range.from)} – {fmtDate(b.configuration.range.to)}
                </td>
                <td className={`${tdClass} text-right tabular-nums`}>{m ? m.count : "—"}</td>
                <td className={`${tdClass} text-right tabular-nums`}>{m?.winRate != null ? pct(m.winRate) : "—"}</td>
                <td className={`${tdClass} text-right tabular-nums ${m ? toneClass(m.totalReturnPercent) : ""}`}>
                  {m ? signedNumber(m.totalReturnPercent, 2, "%") : "—"}
                </td>
                <td className={`${tdClass} text-right`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete backtest of version ${b.version} from ${fmtDate(b.createdAt)}`}
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm("Delete this backtest and its round trips?")) remove.mutate(b.id);
                    }}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
