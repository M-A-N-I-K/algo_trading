"use client";

import BacktestTab from "@/components/trading-journal/BacktestTab";
import { useDashboard } from "@/components/trading-journal/DashboardContext";

export default function BacktestPage() {
  const { addNotification } = useDashboard();
  return <BacktestTab addNotification={addNotification} />;
}
