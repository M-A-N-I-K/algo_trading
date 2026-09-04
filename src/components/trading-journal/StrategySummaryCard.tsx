"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Layers, FlaskConical } from "lucide-react";
import { fetchJson } from "@/lib/apiClient";

interface DashboardSummary {
  strategyCount: number;
  backtestCount: number;
  accountBalance: string | null;
}

// Shows real counts only. With no strategy builder or backtest engine
// wired to persistence yet, "best strategy" / win-rate / profit-factor
// have no real data to report — showing an honest empty state instead of
// inventing numbers, per the product principle against fabricated results.
export default function StrategySummaryCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => fetchJson<DashboardSummary>("/api/dashboard/summary"),
  });

  return (
    <div className="glass border-slate-800 p-6 rounded-2xl mb-8">
      <h3 className="font-Outfit text-lg font-bold text-white mb-6">Strategy Summary</h3>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <span className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">Strategies</span>
          <h4 className="font-Outfit text-3xl font-bold text-white mt-1.5">{isLoading ? "—" : data?.strategyCount ?? 0}</h4>
        </div>
        <div>
          <span className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">Backtests Run</span>
          <h4 className="font-Outfit text-3xl font-bold text-white mt-1.5">{isLoading ? "—" : data?.backtestCount ?? 0}</h4>
        </div>
      </div>

      {!isLoading && (data?.strategyCount ?? 0) === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-slate-400 leading-relaxed">
            No strategies yet — win rate and profit factor will appear here once you've built a strategy and run a backtest.
          </p>
          <Link
            href="/strategies"
            className="shrink-0 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-xl text-xs font-semibold transition-all"
          >
            <Layers size={14} /> Build a Strategy
          </Link>
        </div>
      )}

      <Link
        href="/backtest"
        className="mt-3 flex items-center gap-2 text-xs font-semibold text-violet-400 hover:text-violet-300 transition-colors w-fit"
      >
        <FlaskConical size={13} /> Or run one of the existing tested strategies in Backtests
      </Link>
    </div>
  );
}
