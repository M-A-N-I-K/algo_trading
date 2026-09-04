"use client";

import Link from "next/link";
import KPICards from "@/components/trading-journal/KPICards";
import AnalyticsCharts from "@/components/trading-journal/AnalyticsCharts";
import TradesTable from "@/components/trading-journal/TradesTable";
import LossLimitBanner from "@/components/trading-journal/LossLimitBanner";
import StrategySummaryCard from "@/components/trading-journal/StrategySummaryCard";
import { useDashboard } from "@/components/trading-journal/DashboardContext";

export default function DashboardPage() {
  const { trades, symbols, openTradeForm, handleDeleteTrade, openNotes } = useDashboard();

  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const netPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;

  const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = losses.reduce((sum, t) => sum + Math.abs(t.pnl), 0);
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
  const avgRr = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;

  const chronTrades = [...trades].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  const startBal = chronTrades.length > 0 ? chronTrades[0].balanceBefore || 100000 : 100000;
  const growthPct = startBal > 0 ? (netPnl / startBal) * 100 : 0;

  const tradesWithRisk = trades.filter(t => t.initialRiskAmount && t.initialRiskAmount > 0);
  const avgRMultiple = tradesWithRisk.length > 0
    ? tradesWithRisk.reduce((sum, t) => sum + t.pnl / (t.initialRiskAmount as number), 0) / tradesWithRisk.length
    : null;

  return (
    <div>
      <LossLimitBanner trades={trades} />

      <KPICards
        netPnl={netPnl}
        growthPct={growthPct}
        winRate={winRate}
        winsCount={wins.length}
        lossesCount={losses.length}
        profitFactor={profitFactor}
        avgRr={avgRr}
        avgWin={avgWin}
        avgLoss={avgLoss}
        avgRMultiple={avgRMultiple}
        rMultipleTradeCount={tradesWithRisk.length}
      />

      <AnalyticsCharts trades={trades} />

      <StrategySummaryCard />

      <div className="glass border-slate-800 p-6 rounded-2xl mb-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-Outfit text-lg font-bold text-white">Recent Activity</h3>
          <Link
            href="/trades"
            className="bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            View Log
          </Link>
        </div>
        <TradesTable
          filteredTrades={trades.slice(0, 5)}
          symbols={symbols}
          onEdit={(t) => openTradeForm(t)}
          onDelete={handleDeleteTrade}
          onInspect={(t) => openNotes(t)}
          isFullLog={false}
        />
      </div>
    </div>
  );
}
