"use client";

import CSVImporter from "@/components/trading-journal/CSVImporter";
import CoinDcxSync from "@/components/trading-journal/CoinDcxSync";
import { useDashboard } from "@/components/trading-journal/DashboardContext";

export default function ImportPage() {
  const { loadTrades, addNotification } = useDashboard();
  return (
    <div className="flex flex-col gap-6">
      <CoinDcxSync
        onImportComplete={() => loadTrades()}
        addNotification={addNotification}
      />
      <CSVImporter
        onImportComplete={() => loadTrades()}
        addNotification={addNotification}
      />
    </div>
  );
}
