"use client";

import CoinDcxSync from "@/components/trading-journal/CoinDcxSync";
import { useDashboard } from "@/components/trading-journal/DashboardContext";

export default function ImportPage() {
  const { loadTrades, addNotification } = useDashboard();
  return (
    <CoinDcxSync
      onImportComplete={() => loadTrades()}
      addNotification={addNotification}
    />
  );
}
