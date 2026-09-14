"use client";

import { useQuery } from "@tanstack/react-query";
import StrategyInsightsDashboard, {
  type BacktestRunAnalyticsRow,
} from "@/components/trading-journal/StrategyInsightsDashboard";
import TraderLoader from "@/components/trading-journal/TraderLoader";

async function fetchAnalytics(): Promise<BacktestRunAnalyticsRow[]> {
  const res = await fetch("/api/backtest/analytics");
  if (!res.ok) throw new Error("Failed to load backtest analytics");
  const json = await res.json();
  return json.runs;
}

export default function InsightsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["backtest-analytics"],
    queryFn: fetchAnalytics,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <TraderLoader
          message="Loading Insights"
          subMessages={["Gathering backtest runs...", "Crunching strategy performance..."]}
        />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-rose-400">{(error as Error).message}</p>;
  }

  return <StrategyInsightsDashboard runs={data ?? []} />;
}
