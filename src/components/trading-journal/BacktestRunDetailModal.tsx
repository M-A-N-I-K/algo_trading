"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import Chart from "chart.js/auto";
import { TrendingUp, Target, Award, DollarSign } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import TraderLoader from "@/components/trading-journal/TraderLoader";
import { strategyLabel } from "@/lib/strategyCatalog";

interface BacktestTrade {
  side: "LONG" | "SHORT";
  entryTime: string;
  entryPrice: number;
  exitTime: string;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
}

interface BacktestResult {
  symbol: string;
  strategyName: string;
  totalTrades: number;
  winRate: number;
  finalBalance: number;
  totalReturnPercent: number;
  maxDrawdownPercent: number;
  trades: BacktestTrade[];
  equityCurve: number[];
}

interface BacktestRunRecord {
  id: string;
  strategyKey: string;
  interval: string;
  candleLimit: number;
  initialBalance: number;
  minRiskRewardRatio: number | null;
  createdAt: string;
  results: BacktestResult[];
}

interface BacktestRunDetailModalProps {
  runId: string;
  symbol: string;
  onClose: () => void;
}

async function fetchRun(runId: string): Promise<BacktestRunRecord> {
  const res = await fetch(`/api/backtest/history/${runId}`);
  if (!res.ok) throw new Error("Failed to load backtest run");
  const json = await res.json();
  return json.run;
}

export default function BacktestRunDetailModal({ runId, symbol, onClose }: BacktestRunDetailModalProps) {
  const { data: run, isLoading, error } = useQuery({
    queryKey: ["backtest-run", runId],
    queryFn: () => fetchRun(runId),
  });

  const result = run?.results.find((r) => r.symbol === symbol);

  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInst = useRef<Chart | null>(null);

  useEffect(() => {
    if (chartInst.current) {
      chartInst.current.destroy();
      chartInst.current = null;
    }
    if (!result || !chartRef.current) return;

    const ctx = chartRef.current.getContext("2d");
    if (!ctx) return;


    chartInst.current = new Chart(ctx, {
      type: "line",
      data: {
        labels: result.equityCurve.map((_, i) => `Trade ${i}`),
        datasets: [{
          data: result.equityCurve,
          borderColor: "#9db4ff",
          borderWidth: 2.5,
          pointBackgroundColor: "#9db4ff",
          pointRadius: 0,
          pointHoverRadius: 4,
          backgroundColor: "rgba(157, 180, 255, 0.08)",
          fill: true,
          tension: 0.15,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: "#2c3146" }, ticks: { color: "#a3a8bf", maxTicksLimit: 8 } },
          y: { grid: { color: "#2c3146" }, ticks: { color: "#a3a8bf" } },
        },
      },
    });

    return () => {
      chartInst.current?.destroy();
      chartInst.current = null;
    };
  }, [result]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-5xl bg-slate-950 border border-slate-800 text-slate-200 p-4 sm:p-6 md:p-8 rounded-[10px] overflow-y-auto overflow-x-hidden max-h-[90vh]">
        <DialogHeader className="mb-4 pr-8">
          <DialogTitle className="font-display text-lg sm:text-xl font-bold text-paper tracking-tight">
            {run ? `${strategyLabel(run.strategyKey)} — ${symbol}` : "Loading..."}
          </DialogTitle>
          {run && (
            <p className="text-xs sm:text-sm text-slate-400">
              {run.interval} candles ({run.candleLimit.toLocaleString()}), starting from ${run.initialBalance.toLocaleString()}
              {run.minRiskRewardRatio != null && `, minimum R:R ${run.minRiskRewardRatio}`}
              {". Run "}{new Date(run.createdAt).toLocaleString()}
            </p>
          )}
        </DialogHeader>

        {isLoading && (
          <div className="py-16 flex justify-center">
            <TraderLoader
              message="Loading backtest"
              subMessages={["Fetching full trade log...", "Rebuilding equity curve..."]}
            />
          </div>
        )}

        {error && <p className="text-sm text-rose-400">{(error as Error).message}</p>}

        {result && (
          <div className="flex flex-col gap-6 min-w-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="bg-deck p-5 flex items-center gap-4 border border-rule">
                <div className="w-10 h-10 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
                  <TrendingUp size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-mist">Return</p>
                  <h4 className={`text-lg font-bold tracking-tight ${result.totalReturnPercent >= 0 ? "text-emerald-400" : "text-rose-500"}`}>
                    {result.totalReturnPercent >= 0 ? "+" : ""}{result.totalReturnPercent.toFixed(2)}%
                  </h4>
                </div>
              </Card>

              <Card className="bg-deck p-5 flex items-center gap-4 border border-rule">
                <div className="w-10 h-10 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
                  <Target size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-mist">Win rate</p>
                  <h4 className="text-lg font-bold tracking-tight text-paper">{result.winRate.toFixed(2)}%</h4>
                </div>
              </Card>

              <Card className="bg-deck p-5 flex items-center gap-4 border border-rule">
                <div className="w-10 h-10 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
                  <Award size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-mist">Max drawdown</p>
                  <h4 className="text-lg font-bold tracking-tight text-rose-500">{result.maxDrawdownPercent.toFixed(2)}%</h4>
                </div>
              </Card>

              <Card className="bg-deck p-5 flex items-center gap-4 border border-rule">
                <div className="w-10 h-10 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
                  <DollarSign size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-mist">Final balance</p>
                  <h4 className="text-lg font-bold tracking-tight text-paper">${result.finalBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</h4>
                </div>
              </Card>
            </div>

            <Card className="bg-deck p-6 border border-rule">
              <div className="flex justify-between items-center mb-5">
                <h4 className="font-display text-md font-bold text-paper">Equity progression</h4>
                <span className="text-xs text-mist">{result.totalTrades} Trades</span>
              </div>
              <div className="relative h-[240px] w-full">
                <canvas ref={chartRef}></canvas>
              </div>
            </Card>

            <Card className="bg-deck border-slate-800 p-6 min-w-0">
              <h4 className="font-display text-md font-bold text-paper mb-6">Trade log</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-900 text-xs text-mist">
                      <th className="pb-3.5 pl-4">Side</th>
                      <th className="pb-3.5">Entry time</th>
                      <th className="pb-3.5">Entry price</th>
                      <th className="pb-3.5">Exit time</th>
                      <th className="pb-3.5">Exit price</th>
                      <th className="pb-3.5">Quantity</th>
                      <th className="pb-3.5 pr-4 text-right">PnL ($ / %)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.length > 0 ? (
                      result.trades.map((trade, index) => (
                        <tr key={index} className="border-b border-slate-900/50 hover:bg-slate-900/20 font-medium text-slate-300">
                          <td className="py-3 pl-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${trade.side === "LONG" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-500"}`}>
                              {trade.side}
                            </span>
                          </td>
                          <td>{trade.entryTime}</td>
                          <td>${trade.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                          <td>{trade.exitTime}</td>
                          <td>${trade.exitPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                          <td>{trade.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                          <td className={`pr-4 text-right font-semibold ${trade.pnl >= 0 ? "text-emerald-400" : "text-rose-500"}`}>
                            ${trade.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <span className="text-[10px] opacity-75 font-medium ml-1">
                              ({trade.pnlPercent >= 0 ? "+" : ""}{trade.pnlPercent.toFixed(2)}%)
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="text-center text-slate-500 font-medium py-8">No trades recorded.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
