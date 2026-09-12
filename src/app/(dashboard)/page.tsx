"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import KPICards from "@/components/trading-journal/KPICards";
import AnalyticsCharts from "@/components/trading-journal/AnalyticsCharts";
import TradesTable from "@/components/trading-journal/TradesTable";
import LossLimitBanner from "@/components/trading-journal/LossLimitBanner";
import PnlCalendar from "@/components/trading-journal/PnlCalendar";
import SymbolPerformanceTable from "@/components/trading-journal/SymbolPerformanceTable";
import { Card, CardContent } from "@/components/ui/card";
import DatePicker from "@/components/ui/date-picker";
import { useDashboard } from "@/components/trading-journal/DashboardContext";

export default function DashboardPage() {
  const { trades, symbols, startingBalance, openTradeForm, handleDeleteTrade, openNotes } = useDashboard();

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const filteredTrades = useMemo(() => {
    if (!startDate && !endDate) return trades;
    const from = startDate ? new Date(startDate).getTime() : -Infinity;
    // End boundary covers the whole selected day (up to 23:59:59.999).
    const to = endDate ? new Date(endDate).getTime() + 24 * 60 * 60 * 1000 - 1 : Infinity;
    return trades.filter(t => {
      const time = new Date(t.time).getTime();
      return time >= from && time <= to;
    });
  }, [trades, startDate, endDate]);

  const wins = filteredTrades.filter(t => t.pnl > 0);
  const losses = filteredTrades.filter(t => t.pnl <= 0);
  const netPnl = filteredTrades.reduce((sum, t) => sum + t.pnl, 0);
  const winRate = filteredTrades.length > 0 ? (wins.length / filteredTrades.length) * 100 : 0;

  const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = losses.reduce((sum, t) => sum + Math.abs(t.pnl), 0);
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
  const avgRr = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;

  const chronTrades = [...filteredTrades].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  const startBal = chronTrades.length > 0 ? chronTrades[0].balanceBefore || startingBalance : startingBalance;
  const growthPct = startBal > 0 ? (netPnl / startBal) * 100 : 0;

  const tradesWithRisk = filteredTrades.filter(t => t.initialRiskAmount && t.initialRiskAmount > 0);
  const avgRMultiple = tradesWithRisk.length > 0
    ? tradesWithRisk.reduce((sum, t) => sum + t.pnl / (t.initialRiskAmount as number), 0) / tradesWithRisk.length
    : null;

  const pnlBySymbol = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of filteredTrades) {
      map.set(t.symbol, (map.get(t.symbol) ?? 0) + t.pnl);
    }
    return Array.from(map, ([symbol, pnl]) => ({ symbol, pnl }));
  }, [filteredTrades]);

  const bestSymbol = pnlBySymbol.length > 0
    ? pnlBySymbol.reduce((best, s) => (s.pnl > best.pnl ? s : best))
    : null;
  const worstSymbol = pnlBySymbol.length > 0
    ? pnlBySymbol.reduce((worst, s) => (s.pnl < worst.pnl ? s : worst))
    : null;

  const tradesWithFees = filteredTrades.filter(t => t.fees != null);
  const totalFees = tradesWithFees.reduce((sum, t) => sum + (t.fees as number), 0);

  return (
    <div>
      <LossLimitBanner trades={trades} />

      <Card className="glass mb-8 border-slate-800">
        <CardContent className="flex flex-col md:flex-row gap-5 p-6 md:items-end">
          <div className="flex-1 flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">From</label>
            <DatePicker
              value={startDate}
              onChange={setStartDate}
              maxDate={endDate || undefined}
              placeholder="Any start date"
            />
          </div>

          <div className="flex-1 flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">To</label>
            <DatePicker
              value={endDate}
              onChange={setEndDate}
              minDate={startDate || undefined}
              placeholder="Any end date"
            />
          </div>

          <button
            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
            onClick={() => {
              setStartDate("");
              setEndDate("");
            }}
          >
            Reset
          </button>
        </CardContent>
      </Card>

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
        bestSymbol={bestSymbol}
        worstSymbol={worstSymbol}
        totalFees={totalFees}
        feesTradeCount={tradesWithFees.length}
      />

      <PnlCalendar trades={trades} onInspect={(t) => openNotes(t)} />

      <AnalyticsCharts trades={filteredTrades} startingBalance={startingBalance} />

      <div className="mb-8">
        <SymbolPerformanceTable trades={filteredTrades} />
      </div>

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
          filteredTrades={filteredTrades.slice(0, 5)}
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
