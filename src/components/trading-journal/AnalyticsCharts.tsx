import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import { Card, CardContent } from "@/components/ui/card";

interface Trade {
  id: string;
  time: string;
  balanceBefore: number;
  balanceAfter: number;
  pnl: number;
  currency: string;
  symbol: string;
  exchange: string;
  side: "LONG" | "SHORT";
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  strategy: string;
  notes: string;
}

interface AnalyticsChartsProps {
  trades: Trade[];
  startingBalance?: number;
}

export default function AnalyticsCharts({ trades, startingBalance = 100000 }: AnalyticsChartsProps) {
  const equityChartRef = useRef<HTMLCanvasElement | null>(null);
  const assetChartRef = useRef<HTMLCanvasElement | null>(null);
  const strategyChartRef = useRef<HTMLCanvasElement | null>(null);

  const equityChartInst = useRef<Chart | null>(null);
  const assetChartInst = useRef<Chart | null>(null);
  const strategyChartInst = useRef<Chart | null>(null);

  useEffect(() => {
    renderCharts();
    return () => {
      destroyCharts();
    };
  }, [trades, startingBalance]);

  const destroyCharts = () => {
    if (equityChartInst.current) {
      equityChartInst.current.destroy();
      equityChartInst.current = null;
    }
    if (assetChartInst.current) {
      assetChartInst.current.destroy();
      assetChartInst.current = null;
    }
    if (strategyChartInst.current) {
      strategyChartInst.current.destroy();
      strategyChartInst.current = null;
    }
  };

  const renderCharts = () => {
    destroyCharts();
    if (trades.length === 0) return;

    // Chronological sorting for equity curve
    const chronTrades = [...trades].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    // 1. Equity Curve Chart
    if (equityChartRef.current) {
      const startBal = chronTrades[0].balanceBefore || startingBalance;
      let runningBal = startBal;
      const equityData = [startBal];
      const equityLabels = ["Start"];

      chronTrades.forEach(t => {
        runningBal += t.pnl;
        equityData.push(runningBal);
        equityLabels.push(t.time.split(" ")[0]);
      });

      const ctx = equityChartRef.current.getContext("2d");
      if (ctx) {
        const gradient = ctx.createLinearGradient(0, 0, 0, 240);
        gradient.addColorStop(0, "rgba(124, 77, 255, 0.35)");
        gradient.addColorStop(1, "rgba(124, 77, 255, 0.0)");

        equityChartInst.current = new Chart(ctx, {
          type: "line",
          data: {
            labels: equityLabels,
            datasets: [{
              label: "Account Equity",
              data: equityData,
              borderColor: "#7c4dff",
              borderWidth: 3,
              pointBackgroundColor: "#7c4dff",
              pointHoverRadius: 6,
              backgroundColor: gradient,
              fill: true,
              tension: 0.25
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { 
                grid: { color: "rgba(255,255,255,0.03)" },
                ticks: { color: "#8e8ea8", maxTicksLimit: 8 }
              },
              y: { 
                grid: { color: "rgba(255,255,255,0.03)" },
                ticks: { color: "#8e8ea8" }
              }
            }
          }
        });
      }
    }

    // 2. Asset Allocation Chart
    if (assetChartRef.current) {
      const assetPnls: Record<string, number> = {};
      trades.forEach(t => {
        assetPnls[t.symbol] = (assetPnls[t.symbol] || 0) + t.pnl;
      });

      const labels = Object.keys(assetPnls);
      const data = Object.values(assetPnls);
      const colors = data.map(val => val >= 0 ? "rgba(0, 230, 118, 0.6)" : "rgba(255, 23, 68, 0.6)");
      const borders = data.map(val => val >= 0 ? "#00e676" : "#ff1744");

      const ctx = assetChartRef.current.getContext("2d");
      if (ctx) {
        assetChartInst.current = new Chart(ctx, {
          type: "bar",
          data: {
            labels,
            datasets: [{
              label: "Net Profit ($)",
              data,
              backgroundColor: colors,
              borderColor: borders,
              borderWidth: 1.5,
              borderRadius: 8
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false }, ticks: { color: "#8e8ea8" } },
              y: { grid: { color: "rgba(255,255,255,0.03)" }, ticks: { color: "#8e8ea8" } }
            }
          }
        });
      }
    }

    // 3. Strategy Chart
    if (strategyChartRef.current) {
      const stats: Record<string, { wins: number; total: number }> = {};
      trades.forEach(t => {
        if (!stats[t.strategy]) {
          stats[t.strategy] = { wins: 0, total: 0 };
        }
        stats[t.strategy].total++;
        if (t.pnl > 0) stats[t.strategy].wins++;
      });

      const labels = Object.keys(stats);
      const winRates = labels.map(s => (stats[s].wins / stats[s].total) * 100);

      const ctx = strategyChartRef.current.getContext("2d");
      if (ctx) {
        strategyChartInst.current = new Chart(ctx, {
          type: "polarArea",
          data: {
            labels,
            datasets: [{
              label: "Win Rate (%)",
              data: winRates,
              backgroundColor: [
                "rgba(124, 77, 255, 0.4)",
                "rgba(0, 230, 118, 0.4)",
                "rgba(255, 234, 0, 0.35)",
                "rgba(0, 229, 255, 0.4)",
                "rgba(255, 109, 0, 0.4)"
              ],
              borderColor: "rgba(255,255,255,0.1)",
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { 
                position: "bottom",
                labels: { color: "#8e8ea8", font: { size: 9 }, boxWidth: 10 }
              }
            },
            scales: {
              r: {
                grid: { color: "rgba(255,255,255,0.03)" },
                angleLines: { color: "rgba(255,255,255,0.03)" },
                ticks: { display: false }
              }
            }
          }
        });
      }
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
      
      <Card className="glass lg:col-span-2 p-6">
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-Outfit text-lg font-semibold">Equity Curve</h3>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Balance Progression</span>
        </div>
        <div className="relative h-[260px] w-full">
          {trades.length > 0 ? (
            <canvas ref={equityChartRef}></canvas>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500 font-medium">Log a trade to see the curve</div>
          )}
        </div>
      </Card>

      <Card className="glass p-6">
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-Outfit text-lg font-semibold">Asset Allocation</h3>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Net Profit Distribution</span>
        </div>
        <div className="relative h-[260px] w-full">
          {trades.length > 0 ? (
            <canvas ref={assetChartRef}></canvas>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500 font-medium">No asset data</div>
          )}
        </div>
      </Card>

      <Card className="glass lg:col-span-3 p-6">
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-Outfit text-lg font-semibold">Strategy Performance</h3>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Win Rate by Strategy Setup</span>
        </div>
        <div className="relative h-[260px] w-full">
          {trades.length > 0 ? (
            <canvas ref={strategyChartRef}></canvas>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500 font-medium">No strategy data</div>
          )}
        </div>
      </Card>

    </div>
  );
}
