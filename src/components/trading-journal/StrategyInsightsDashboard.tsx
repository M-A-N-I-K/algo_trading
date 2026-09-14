"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Chart from "chart.js/auto";
import Link from "next/link";
import { Trophy, FlaskConical, TrendingUp, Target, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { strategyLabel } from "@/lib/strategyCatalog";
import BacktestRunDetailModal from "@/components/trading-journal/BacktestRunDetailModal";

interface BacktestRunMetrics {
  symbol: string;
  strategyName: string;
  totalTrades: number;
  winRate: number;
  finalBalance: number;
  totalReturnPercent: number;
  maxDrawdownPercent: number;
  testPeriodDays: number | null;
}

function formatDays(days: number): string {
  if (days < 1) return `${Math.round(days * 24)}h`;
  return `${days.toFixed(1)}d`;
}

export interface BacktestRunAnalyticsRow {
  id: string;
  strategyKey: string;
  strategyName: string;
  symbols: string;
  interval: string;
  candleLimit: number;
  initialBalance: number;
  minRiskRewardRatio: number | null;
  createdAt: string;
  results: BacktestRunMetrics[];
}

interface FlatRow {
  runId: string;
  strategyKey: string;
  symbol: string;
  interval: string;
  candleLimit: number;
  initialBalance: number;
  minRiskRewardRatio: number | null;
  totalTrades: number;
  winRate: number;
  finalBalance: number;
  totalReturnPercent: number;
  maxDrawdownPercent: number;
  testPeriodDays: number | null;
  createdAt: string;
}

type SortKey = keyof Pick<
  FlatRow,
  "totalReturnPercent" | "winRate" | "maxDrawdownPercent" | "totalTrades" | "createdAt" | "testPeriodDays"
>;

function flatten(runs: BacktestRunAnalyticsRow[]): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const run of runs) {
    for (const r of run.results) {
      rows.push({
        runId: run.id,
        strategyKey: run.strategyKey,
        symbol: r.symbol,
        interval: run.interval,
        candleLimit: run.candleLimit,
        initialBalance: run.initialBalance,
        minRiskRewardRatio: run.minRiskRewardRatio,
        totalTrades: r.totalTrades,
        winRate: r.winRate,
        finalBalance: r.finalBalance,
        totalReturnPercent: r.totalReturnPercent,
        maxDrawdownPercent: r.maxDrawdownPercent,
        testPeriodDays: r.testPeriodDays,
        createdAt: run.createdAt,
      });
    }
  }
  return rows;
}

// Re-running the exact same backtest (same strategy + symbol + interval +
// candle count + initial balance + min R:R) shouldn't count twice toward
// the comparison stats/chart — keep only the most recent result per unique
// parameter set.
function dedupeByParameters(rows: FlatRow[]): FlatRow[] {
  const latestByKey = new Map<string, FlatRow>();
  for (const row of rows) {
    const key = [
      row.strategyKey,
      row.symbol,
      row.interval,
      row.candleLimit,
      row.initialBalance,
      row.minRiskRewardRatio,
    ].join("|");
    const existing = latestByKey.get(key);
    if (!existing || new Date(row.createdAt) > new Date(existing.createdAt)) {
      latestByKey.set(key, row);
    }
  }
  return Array.from(latestByKey.values());
}

export default function StrategyInsightsDashboard({ runs }: { runs: BacktestRunAnalyticsRow[] }) {
  const rows = useMemo(() => dedupeByParameters(flatten(runs)), [runs]);

  const [strategyFilter, setStrategyFilter] = useState("ALL");
  const [symbolFilter, setSymbolFilter] = useState("ALL");
  const [intervalFilter, setIntervalFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("totalReturnPercent");
  const [sortDesc, setSortDesc] = useState(true);
  const [selectedRun, setSelectedRun] = useState<{ runId: string; symbol: string } | null>(null);

  const strategies = useMemo(() => Array.from(new Set(rows.map((r) => r.strategyKey))), [rows]);
  const symbols = useMemo(() => Array.from(new Set(rows.map((r) => r.symbol))), [rows]);
  const intervals = useMemo(() => Array.from(new Set(rows.map((r) => r.interval))), [rows]);

  const filteredRows = useMemo(() => {
    return rows
      .filter((r) => strategyFilter === "ALL" || r.strategyKey === strategyFilter)
      .filter((r) => symbolFilter === "ALL" || r.symbol === symbolFilter)
      .filter((r) => intervalFilter === "ALL" || r.interval === intervalFilter)
      .sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        // Nulls (e.g. no hold-duration data) always sort last, regardless of direction.
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
        return sortDesc ? -cmp : cmp;
      });
  }, [rows, strategyFilter, symbolFilter, intervalFilter, sortKey, sortDesc]);

  // Per-strategy averages, for the headline stats and comparison chart.
  const byStrategy = useMemo(() => {
    const map = new Map<string, { returns: number[]; winRates: number[] }>();
    for (const r of rows) {
      const entry = map.get(r.strategyKey) ?? { returns: [], winRates: [] };
      entry.returns.push(r.totalReturnPercent);
      entry.winRates.push(r.winRate);
      map.set(r.strategyKey, entry);
    }
    return Array.from(map, ([strategyKey, v]) => ({
      strategyKey,
      avgReturn: v.returns.reduce((s, x) => s + x, 0) / v.returns.length,
      avgWinRate: v.winRates.reduce((s, x) => s + x, 0) / v.winRates.length,
      runCount: v.returns.length,
    }));
  }, [rows]);

  const bestStrategy = byStrategy.length > 0
    ? byStrategy.reduce((best, s) => (s.avgReturn > best.avgReturn ? s : best))
    : null;
  const bestRow = rows.length > 0
    ? rows.reduce((best, r) => (r.totalReturnPercent > best.totalReturnPercent ? r : best))
    : null;
  const avgWinRate = rows.length > 0 ? rows.reduce((s, r) => s + r.winRate, 0) / rows.length : 0;

  // Return per day of backtested period — the "how fast did it get there"
  // number: two strategies with the same totalReturnPercent can take wildly
  // different amounts of time to produce it.
  const rowsWithPeriod = rows.filter((r) => r.testPeriodDays != null && r.testPeriodDays > 0);
  const avgReturnPerDay = rowsWithPeriod.length > 0
    ? rowsWithPeriod.reduce((s, r) => s + r.totalReturnPercent / (r.testPeriodDays as number), 0) / rowsWithPeriod.length
    : null;

  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInst = useRef<Chart | null>(null);

  useEffect(() => {
    if (chartInst.current) {
      chartInst.current.destroy();
      chartInst.current = null;
    }
    if (!chartRef.current || byStrategy.length === 0) return;

    const sorted = [...byStrategy].sort((a, b) => b.avgReturn - a.avgReturn);
    const labels = sorted.map((s) => strategyLabel(s.strategyKey));
    const data = sorted.map((s) => s.avgReturn);
    const colors = data.map((v) => (v >= 0 ? "rgba(0, 230, 118, 0.6)" : "rgba(255, 23, 68, 0.6)"));
    const borders = data.map((v) => (v >= 0 ? "#00e676" : "#ff1744"));

    const ctx = chartRef.current.getContext("2d");
    if (!ctx) return;

    chartInst.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [{ label: "Avg Return (%)", data, backgroundColor: colors, borderColor: borders, borderWidth: 1.5, borderRadius: 8 }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: "rgba(255,255,255,0.03)" }, ticks: { color: "#8e8ea8" } },
          y: { grid: { display: false }, ticks: { color: "#8e8ea8", font: { size: 11 } } },
        },
      },
    });

    return () => {
      chartInst.current?.destroy();
      chartInst.current = null;
    };
  }, [byStrategy]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  const sortIndicator = (key: SortKey) => (sortKey === key ? (sortDesc ? " ↓" : " ↑") : "");

  if (runs.length === 0) {
    return (
      <Card className="glass border-slate-800">
        <CardContent className="flex flex-col items-center text-center gap-4 py-16 px-6">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center">
            <FlaskConical className="text-violet-500" size={26} />
          </div>
          <div>
            <h2 className="font-Outfit text-xl font-bold text-white">No backtests yet</h2>
            <p className="text-sm text-slate-400 mt-1.5 max-w-md">
              Run a backtest to start comparing strategies here — every run you save shows up automatically with its parameters and results.
            </p>
          </div>
          <Link
            href="/backtest"
            className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
          >
            Run a Backtest
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Headline stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="glass">
          <CardContent className="flex justify-between items-center p-6">
            <div>
              <span className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">Backtests Run</span>
              <h3 className="font-Outfit text-3xl font-bold text-white mt-1.5 mb-1">{runs.length}</h3>
              <span className="text-xs text-slate-400">{rows.length} unique configurations tested</span>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-violet-500/10 text-violet-500">
              <FlaskConical size={20} />
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardContent className="flex justify-between items-center p-6">
            <div>
              <span className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">Best Strategy</span>
              <h3 className="font-Outfit text-2xl font-bold text-emerald-400 mt-1.5 mb-1 truncate">
                {bestStrategy ? strategyLabel(bestStrategy.strategyKey) : "—"}
              </h3>
              <span className="text-xs text-slate-400">
                {bestStrategy ? `Avg ${bestStrategy.avgReturn >= 0 ? "+" : ""}${bestStrategy.avgReturn.toFixed(2)}% return` : "No data yet"}
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-emerald-500/10 text-emerald-400">
              <Trophy size={20} />
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardContent className="flex justify-between items-center p-6">
            <div>
              <span className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">Best Single Result</span>
              <h3 className={`font-Outfit text-3xl font-bold mt-1.5 mb-1 ${bestRow && bestRow.totalReturnPercent >= 0 ? "text-emerald-400" : "text-rose-500"}`}>
                {bestRow ? `${bestRow.totalReturnPercent >= 0 ? "+" : ""}${bestRow.totalReturnPercent.toFixed(2)}%` : "—"}
              </h3>
              <span className="text-xs text-slate-400">
                {bestRow ? `${strategyLabel(bestRow.strategyKey)} on ${bestRow.symbol}` : "No data yet"}
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-cyan-500/10 text-cyan-400">
              <TrendingUp size={20} />
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardContent className="flex justify-between items-center p-6">
            <div>
              <span className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">Avg Win Rate</span>
              <h3 className="font-Outfit text-3xl font-bold text-amber-400 mt-1.5 mb-1">{avgWinRate.toFixed(1)}%</h3>
              <span className="text-xs text-slate-400">Across all backtested results</span>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-amber-500/10 text-amber-400">
              <Target size={20} />
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardContent className="flex justify-between items-center p-6">
            <div>
              <span className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">Return Speed</span>
              <h3 className={`font-Outfit text-3xl font-bold mt-1.5 mb-1 ${avgReturnPerDay == null ? "text-slate-500" : avgReturnPerDay >= 0 ? "text-emerald-400" : "text-rose-500"}`}>
                {avgReturnPerDay != null ? `${avgReturnPerDay >= 0 ? "+" : ""}${avgReturnPerDay.toFixed(2)}%/day` : "—"}
              </h3>
              <span className="text-xs text-slate-400">Return % earned per day of backtested period</span>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-yellow-500/10 text-yellow-400">
              <Zap size={20} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Strategy comparison chart */}
      <Card className="glass p-6">
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-Outfit text-lg font-semibold">Strategy Comparison</h3>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Avg Return % by Strategy</span>
        </div>
        <div className="relative h-[280px] w-full">
          <canvas ref={chartRef}></canvas>
        </div>
      </Card>

      {/* Filters + full comparison table */}
      <Card className="glass border-slate-800 p-6">
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <select
            className="flex-1 bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500"
            value={strategyFilter}
            onChange={(e) => setStrategyFilter(e.target.value)}
          >
            <option value="ALL">All Strategies</option>
            {strategies.map((s) => (
              <option key={s} value={s}>{strategyLabel(s)}</option>
            ))}
          </select>
          <select
            className="flex-1 bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500"
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value)}
          >
            <option value="ALL">All Symbols</option>
            {symbols.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            className="flex-1 bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500"
            value={intervalFilter}
            onChange={(e) => setIntervalFilter(e.target.value)}
          >
            <option value="ALL">All Intervals</option>
            {intervals.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto w-full">
          <Table className="w-full">
            <TableHeader className="bg-slate-900/50">
              <TableRow className="hover:bg-transparent border-slate-800">
                <TableHead className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4">Strategy</TableHead>
                <TableHead className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4">Symbol</TableHead>
                <TableHead className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4">Interval</TableHead>
                <TableHead className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4">Candles</TableHead>
                <TableHead className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4">Initial Balance</TableHead>
                <TableHead className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4">Min R:R</TableHead>
                <TableHead
                  className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4 cursor-pointer select-none"
                  onClick={() => toggleSort("totalTrades")}
                >
                  Trades{sortIndicator("totalTrades")}
                </TableHead>
                <TableHead
                  className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4 cursor-pointer select-none"
                  onClick={() => toggleSort("winRate")}
                >
                  Win Rate{sortIndicator("winRate")}
                </TableHead>
                <TableHead
                  className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4 cursor-pointer select-none"
                  onClick={() => toggleSort("maxDrawdownPercent")}
                >
                  Max DD{sortIndicator("maxDrawdownPercent")}
                </TableHead>
                <TableHead
                  className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4 cursor-pointer select-none"
                  onClick={() => toggleSort("testPeriodDays")}
                >
                  Test Period{sortIndicator("testPeriodDays")}
                </TableHead>
                <TableHead
                  className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4 text-right cursor-pointer select-none"
                  onClick={() => toggleSort("totalReturnPercent")}
                >
                  Return %{sortIndicator("totalReturnPercent")}
                </TableHead>
                <TableHead className="text-slate-400 font-semibold uppercase text-[11px] tracking-wider py-4 text-right">
                  Return/Day
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((r, i) => (
                <TableRow
                  key={`${r.runId}-${r.symbol}-${i}`}
                  className="hover:bg-slate-800/10 border-slate-800/40 transition-colors cursor-pointer"
                  onClick={() => setSelectedRun({ runId: r.runId, symbol: r.symbol })}
                >
                  <TableCell className="text-white font-bold py-4 text-sm">{strategyLabel(r.strategyKey)}</TableCell>
                  <TableCell className="text-slate-300 py-4 font-medium text-sm">{r.symbol}</TableCell>
                  <TableCell className="py-4">
                    <span className="inline-flex px-2 py-1 rounded text-[10px] font-bold border bg-violet-500/10 text-violet-400 border-violet-500/20 uppercase">
                      {r.interval}
                    </span>
                  </TableCell>
                  <TableCell className="text-slate-300 py-4 font-medium text-sm">{r.candleLimit.toLocaleString()}</TableCell>
                  <TableCell className="text-slate-300 py-4 font-medium text-sm">${r.initialBalance.toLocaleString()}</TableCell>
                  <TableCell className="text-slate-300 py-4 font-medium text-sm">{r.minRiskRewardRatio != null ? `${r.minRiskRewardRatio}R` : "—"}</TableCell>
                  <TableCell className="text-slate-300 py-4 font-medium text-sm">{r.totalTrades}</TableCell>
                  <TableCell className="text-slate-300 py-4 font-medium text-sm">{r.winRate.toFixed(1)}%</TableCell>
                  <TableCell className="text-rose-400 py-4 font-medium text-sm">{r.maxDrawdownPercent.toFixed(2)}%</TableCell>
                  <TableCell className="text-slate-300 py-4 font-medium text-sm">
                    {r.testPeriodDays != null ? formatDays(r.testPeriodDays) : "—"}
                  </TableCell>
                  <TableCell className={`py-4 font-bold text-sm text-right ${r.totalReturnPercent >= 0 ? "text-emerald-400" : "text-rose-500"}`}>
                    {r.totalReturnPercent >= 0 ? "+" : ""}{r.totalReturnPercent.toFixed(2)}%
                  </TableCell>
                  <TableCell className={`py-4 font-medium text-sm text-right ${r.testPeriodDays == null || r.testPeriodDays === 0 ? "text-slate-600" : r.totalReturnPercent >= 0 ? "text-emerald-400" : "text-rose-500"}`}>
                    {r.testPeriodDays != null && r.testPeriodDays > 0
                      ? `${r.totalReturnPercent >= 0 ? "+" : ""}${(r.totalReturnPercent / r.testPeriodDays).toFixed(2)}%`
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {filteredRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-slate-500 font-medium py-12">
                    No results match these filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {selectedRun && (
        <BacktestRunDetailModal
          runId={selectedRun.runId}
          symbol={selectedRun.symbol}
          onClose={() => setSelectedRun(null)}
        />
      )}
    </div>
  );
}
