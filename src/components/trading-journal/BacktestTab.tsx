import { useState, useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import { Card, CardContent } from "@/components/ui/card";
import { Play, TrendingUp, DollarSign, Award, Target, Percent } from "lucide-react";
import TraderLoader from "@/components/trading-journal/TraderLoader";
import BacktestHistoryPanel, { BacktestRunRecord } from "@/components/trading-journal/BacktestHistoryPanel";
import { STRATEGY_CATALOG } from "@/lib/strategyCatalog";

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

export default function BacktestTab({ addNotification }: { addNotification: (msg: string, type: "success" | "error") => void }) {
  // Input parameters
  const [strategy, setStrategy] = useState("macd-200ema-sr");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setInterval] = useState("15m");
  const [limit, setLimit] = useState("2000");
  const [initialBalance, setInitialBalance] = useState("10000");
  const [minRiskRewardRatio, setMinRiskRewardRatio] = useState("1.5");
  
  // Results states
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [selectedResultIndex, setSelectedResultIndex] = useState<number>(0);

  // History panel state — every completed run is auto-saved server-side;
  // `historyRefreshTrigger` tells the panel to reload its list, and
  // `activeRunId` highlights whichever run's results are currently shown
  // (either just-run live, or reopened from history).
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  // Chart ref and instance tracking
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<Chart | null>(null);

  const runSimulation = async () => {
    setLoading(true);
    setResults([]);
    setActiveRunId(null);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategy,
          symbol,
          interval,
          limit: parseInt(limit) || 1000,
          initialBalance: parseFloat(initialBalance) || 10000,
          minRiskRewardRatio: minRiskRewardRatio !== "" ? parseFloat(minRiskRewardRatio) : undefined
        })
      });
      const data = await res.json();
      if (res.ok) {
        setResults(data.results);
        setSelectedResultIndex(0);
        if (data.savedRunId) {
          setActiveRunId(data.savedRunId);
          setHistoryRefreshTrigger((n) => n + 1);
        }
        addNotification("Backtest completed successfully!", "success");
      } else {
        addNotification(data.error || "Simulation failed.", "error");
      }
    } catch (e: any) {
      addNotification("Error executing backtest: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectHistoryRun = (run: BacktestRunRecord) => {
    setResults(run.results);
    setSelectedResultIndex(0);
    setActiveRunId(run.id);
  };

  // Render Chart when selected result changes
  useEffect(() => {
    if (results.length > 0 && results[selectedResultIndex]) {
      renderEquityChart(results[selectedResultIndex]);
    }
    return () => {
      destroyChart();
    };
  }, [results, selectedResultIndex]);

  const destroyChart = () => {
    if (chartInstance.current) {
      chartInstance.current.destroy();
      chartInstance.current = null;
    }
  };

  const renderEquityChart = (res: BacktestResult) => {
    destroyChart();
    if (!chartRef.current) return;

    const ctx = chartRef.current.getContext("2d");
    if (!ctx) return;

    const labels = res.equityCurve.map((_, i) => `Trade ${i}`);
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, "rgba(139, 92, 246, 0.35)");
    gradient.addColorStop(1, "rgba(139, 92, 246, 0.0)");

    chartInstance.current = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Simulation Equity",
          data: res.equityCurve,
          borderColor: "#8b5cf6",
          borderWidth: 2.5,
          pointBackgroundColor: "#8b5cf6",
          pointRadius: 0,
          pointHoverRadius: 4,
          backgroundColor: gradient,
          fill: true,
          tension: 0.15
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { 
            grid: { display: false },
            ticks: { display: false }
          },
          y: { 
            grid: { color: "rgba(255,255,255,0.03)" },
            ticks: { color: "#8e8ea8", font: { size: 10 } }
          }
        }
      }
    });
  };

  const activeResult = results[selectedResultIndex];

  return (
    <div className="flex flex-col gap-6">

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 items-start">
      {/* Parameters Panel */}
      <Card className="glass border-slate-800 p-6 sm:p-8">
        <h3 className="font-Outfit text-lg font-bold text-white mb-6">Simulation Engine Parameters</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400">Trading Strategy</label>
            <select 
              value={strategy} 
              onChange={(e) => setStrategy(e.target.value)} 
              className="bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500"
            >
              {STRATEGY_CATALOG.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400">Symbols (comma separated)</label>
            <input 
              type="text" 
              value={symbol} 
              onChange={(e) => setSymbol(e.target.value)} 
              placeholder="BTCUSDT,ETHUSDT" 
              className="bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500 placeholder-slate-600"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400">Timeframe</label>
            <select 
              value={interval} 
              onChange={(e) => setInterval(e.target.value)} 
              className="bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500"
            >
              <option value="1m">1 Minute (1m)</option>
              <option value="5m">5 Minutes (5m)</option>
              <option value="15m">15 Minutes (15m)</option>
              <option value="1h">1 Hour (1h)</option>
              <option value="4h">4 Hours (4h)</option>
              <option value="1d">1 Day (1d)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400">Candles Limit</label>
            <select 
              value={limit} 
              onChange={(e) => setLimit(e.target.value)} 
              className="bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500"
            >
              <option value="500">Last 500 candles</option>
              <option value="1000">Last 1,000 candles</option>
              <option value="2000">Last 2,000 candles</option>
              <option value="5000">Last 5,000 candles</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400">Initial capital ($)</label>
            <input 
              type="number" 
              value={initialBalance} 
              onChange={(e) => setInitialBalance(e.target.value)} 
              className="bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500 placeholder-slate-600"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400">Min Risk:Reward (e.g. 1.5)</label>
            <input 
              type="number" 
              step="any"
              value={minRiskRewardRatio} 
              onChange={(e) => setMinRiskRewardRatio(e.target.value)} 
              placeholder="1.5"
              className="bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:border-violet-500 placeholder-slate-600"
            />
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button 
            onClick={runSimulation}
            disabled={loading}
            className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-violet-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Running Simulation...
              </>
            ) : (
              <>
                <Play size={16} /> Run Backtests
              </>
            )}
          </button>
        </div>
      </Card>

      <BacktestHistoryPanel refreshTrigger={historyRefreshTrigger} activeRunId={activeRunId} onSelectRun={handleSelectHistoryRun} />
      </div>

      {/* Results Section */}
      {results.length > 0 && (
        <div className="flex flex-col gap-6">
          
          {/* Symbol Select Tabs */}
          {results.length > 1 && (
            <div className="flex gap-2 border-b border-slate-900 pb-3 overflow-x-auto">
              {results.map((res, index) => (
                <button
                  key={res.symbol}
                  onClick={() => setSelectedResultIndex(index)}
                  className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all border ${
                    selectedResultIndex === index 
                      ? "bg-violet-500/10 border-violet-500/30 text-violet-400" 
                      : "bg-slate-900/50 border-slate-900 text-slate-400 hover:text-white"
                  }`}
                >
                  {res.symbol} ({res.totalReturnPercent >= 0 ? "+" : ""}{res.totalReturnPercent.toFixed(1)}%)
                </button>
              ))}
            </div>
          )}

          {activeResult && (
            <div className="flex flex-col gap-6">
              
              {/* Metrics cards grid */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                
                <Card className="glass p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                    <TrendingUp size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Return</p>
                    <h4 className={`text-lg font-black tracking-tight ${activeResult.totalReturnPercent >= 0 ? "text-emerald-400" : "text-rose-500"}`}>
                      {activeResult.totalReturnPercent >= 0 ? "+" : ""}{activeResult.totalReturnPercent.toFixed(2)}%
                    </h4>
                  </div>
                </Card>

                <Card className="glass p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                    <DollarSign size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Final Balance</p>
                    <h4 className="text-lg font-black tracking-tight text-white">
                      ${activeResult.finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </h4>
                  </div>
                </Card>

                <Card className="glass p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                    <Percent size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Win Rate</p>
                    <h4 className="text-lg font-black tracking-tight text-white">
                      {activeResult.winRate.toFixed(2)}%
                    </h4>
                  </div>
                </Card>

                <Card className="glass p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                    <Target size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Simulated Trades</p>
                    <h4 className="text-lg font-black tracking-tight text-white">
                      {activeResult.totalTrades}
                    </h4>
                  </div>
                </Card>

                <Card className="glass p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                    <Award size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Max Drawdown</p>
                    <h4 className="text-lg font-black tracking-tight text-rose-500">
                      {activeResult.maxDrawdownPercent.toFixed(2)}%
                    </h4>
                  </div>
                </Card>

              </div>

              {/* Equity curve charting */}
              <Card className="glass p-6">
                <div className="flex justify-between items-center mb-5">
                  <h4 className="font-Outfit text-md font-bold text-white">Simulated Equity Progression ({activeResult.symbol})</h4>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Curve Growth</span>
                </div>
                <div className="relative h-[280px] w-full">
                  <canvas ref={chartRef}></canvas>
                </div>
              </Card>

              {/* Trade Log list */}
              <Card className="glass border-slate-800 p-6">
                <h4 className="font-Outfit text-md font-bold text-white mb-6">Simulation Trades Log (Last 100)</h4>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-900 text-slate-500 font-semibold uppercase tracking-wider">
                        <th className="pb-3.5 pl-4">Side</th>
                        <th className="pb-3.5">Entry Time</th>
                        <th className="pb-3.5">Entry Price</th>
                        <th className="pb-3.5">Exit Time</th>
                        <th className="pb-3.5">Exit Price</th>
                        <th className="pb-3.5">Quantity</th>
                        <th className="pb-3.5 pr-4 text-right">PnL ($ / %)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeResult.trades.length > 0 ? (
                        activeResult.trades.map((trade, index) => (
                          <tr key={index} className="border-b border-slate-900/50 hover:bg-slate-900/20 font-medium text-slate-300">
                            <td className="py-3 pl-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                trade.side === "LONG" 
                                  ? "bg-emerald-500/10 text-emerald-400" 
                                  : "bg-rose-500/10 text-rose-500"
                              }`}>
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
                          <td colSpan={7} className="py-8 text-center text-slate-500 font-medium">
                            No trades executed in this simulation.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

            </div>
          )}

        </div>
      )}

      {loading && (
        <Card className="glass border-slate-800 p-12 flex justify-center items-center">
          <TraderLoader message="Running Strategy Backtests" />
        </Card>
      )}

      {/* Default State Empty card */}
      {!loading && results.length === 0 && (
        <Card className="glass border-slate-800 p-12 text-center flex flex-col items-center justify-center gap-3">
          <TrendingUp className="text-slate-600 animate-pulse" size={48} />
          <h4 className="text-slate-300 font-Outfit font-bold text-md">No Active Backtest Reports</h4>
          <p className="text-slate-500 text-xs max-w-[400px] leading-relaxed">
            Select a strategy, symbol, and candlestick parameters above and click &quot;Run Backtests&quot; to execute real-time market simulations.
          </p>
        </Card>
      )}

    </div>
  );
}
