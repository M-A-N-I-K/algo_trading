"use client";

import CoinDcxSync from "@/components/trading-journal/CoinDcxSync";
import Mt5Import from "@/components/mt5/Mt5Import";
import { useDashboard } from "@/components/trading-journal/DashboardContext";

export default function ImportPage() {
  const { loadTrades, addNotification } = useDashboard();
  return (
    <div className="flex flex-col gap-10">
      <Mt5Import />
      <CoinDcxSync
        onImportComplete={() => loadTrades()}
        addNotification={addNotification}
      />
    </div>
  );
}
