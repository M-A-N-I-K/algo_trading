"use client";

import { useState } from "react";
import { Segmented } from "@/components/kit";
import BacktestTab from "@/components/trading-journal/BacktestTab";
import BacktestInsights from "@/components/trading-journal/BacktestInsights";
import { useDashboard } from "@/components/trading-journal/DashboardContext";

export default function BacktestPage() {
  const { addNotification } = useDashboard();
  const [view, setView] = useState<"run" | "insights">("run");
  return (
    <div className="flex flex-col gap-5">
      <Segmented
        label="Backtests view"
        options={[{ value: "run", label: "Run and history" }, { value: "insights", label: "Insights" }]}
        value={view}
        onChange={setView}
      />
      {view === "run" ? <BacktestTab addNotification={addNotification} /> : <BacktestInsights />}
    </div>
  );
}
