"use client";

import { useParams } from "next/navigation";
import BacktestResults from "@/components/backtests/BacktestResults";

export default function BacktestResultsPage() {
  const { strategyId, backtestId } = useParams<{ strategyId: string; backtestId: string }>();
  return <BacktestResults strategyId={strategyId} backtestId={backtestId} />;
}
