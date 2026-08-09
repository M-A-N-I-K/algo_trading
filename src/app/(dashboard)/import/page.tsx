"use client";

import CSVImporter from "@/components/trading-journal/CSVImporter";
import { useDashboard } from "@/components/trading-journal/DashboardContext";

export default function ImportPage() {
  const { loadTrades, addNotification } = useDashboard();
  return (
    <CSVImporter
      onImportComplete={() => loadTrades()}
      addNotification={addNotification}
    />
  );
}
