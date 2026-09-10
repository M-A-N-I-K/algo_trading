"use client";

import { useEffect, useState } from "react";
import { History, Trash2, ChevronRight, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

export interface BacktestRunResult {
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

interface BacktestRunSummary {
  id: string;
  strategyKey: string;
  strategyName: string;
  symbols: string;
  interval: string;
  candleLimit: number;
  initialBalance: number;
  minRiskRewardRatio: number | null;
  createdAt: string;
}

export interface BacktestRunRecord extends BacktestRunSummary {
  results: BacktestRunResult[];
}

interface BacktestHistoryPanelProps {
  refreshTrigger: number;
  activeRunId: string | null;
  onSelectRun: (run: BacktestRunRecord) => void;
}

// Only this many runs show in the compact sidebar panel — beyond that, a
// "View more" button opens the full list in a dialog rather than growing
// the sidebar indefinitely (see the [id] route for the full-record fetch
// that backs each row's click).
const COMPACT_LIMIT = 3;

export default function BacktestHistoryPanel({ refreshTrigger, activeRunId, onSelectRun }: BacktestHistoryPanelProps) {
  const [runs, setRuns] = useState<BacktestRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/backtest/history");
      const data = await res.json();
      if (res.ok) {
        setRuns(data.runs);
      } else {
        setError(data.error || "Failed to load history.");
      }
    } catch (e) {
      setError("Failed to load history: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [refreshTrigger]);

  const handleSelect = async (id: string) => {
    setLoadingId(id);
    try {
      const res = await fetch(`/api/backtest/history/${id}`);
      const data = await res.json();
      if (res.ok) {
        onSelectRun(data.run);
        setShowAll(false);
      } else {
        setError(data.error || "Failed to load run.");
      }
    } catch (e) {
      setError("Failed to load run: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm("Delete this backtest run from history?")) return;
    try {
      const res = await fetch(`/api/backtest/history/${id}`, { method: "DELETE" });
      if (res.ok) {
        setRuns((prev) => prev.filter((r) => r.id !== id));
      }
    } catch {
      // Best-effort — the list will self-correct on next full reload.
    }
  };

  const renderRow = (run: BacktestRunSummary) => {
    const isActive = run.id === activeRunId;
    return (
      <div
        key={run.id}
        role="button"
        tabIndex={0}
        aria-disabled={loadingId === run.id}
        onClick={() => loadingId !== run.id && handleSelect(run.id)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && loadingId !== run.id) {
            e.preventDefault();
            handleSelect(run.id);
          }
        }}
        className={`flex items-center justify-between gap-3 text-left px-4 py-3 rounded-xl border transition-all cursor-pointer ${
          loadingId === run.id ? "opacity-60 pointer-events-none" : ""
        } ${isActive ? "bg-violet-500/10 border-violet-500/30" : "bg-slate-900/40 border-slate-800 hover:border-slate-700"}`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-200 truncate">{strategyLabel(run.strategyKey) || run.strategyName}</span>
            <span className="shrink-0 text-[10px] font-bold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded-md uppercase tracking-wider">
              {run.interval}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 truncate mt-0.5">
            {run.symbols} · {run.candleLimit.toLocaleString()} candles · {new Date(run.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => handleDelete(e, run.id)}
            title="Delete"
            className="text-slate-600 hover:text-rose-400 transition-colors p-1.5 rounded-lg hover:bg-rose-500/10"
          >
            <Trash2 size={13} />
          </button>
          <ChevronRight size={14} className="text-slate-600" />
        </div>
      </div>
    );
  };

  const visibleRuns = runs.slice(0, COMPACT_LIMIT);
  const hiddenCount = runs.length - visibleRuns.length;

  return (
    <>
      <Card className="glass border-slate-800 p-6">
        <div className="flex items-center gap-2 mb-6">
          <History size={20} className="text-violet-400" />
          <h3 className="font-Outfit text-lg font-bold text-white">Backtest History</h3>
        </div>

        {loading && <p className="text-xs text-slate-500">Loading history…</p>}
        {error && <p className="text-xs text-rose-400">{error}</p>}

        {!loading && runs.length === 0 && (
          <p className="text-xs text-slate-500 leading-relaxed">No saved backtest runs yet — every simulation you run is saved here automatically.</p>
        )}

        <div className="flex flex-col gap-2">{visibleRuns.map(renderRow)}</div>

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="w-full flex items-center justify-center gap-1.5 mt-3 text-xs font-semibold text-violet-400 hover:text-violet-300 bg-violet-500/5 hover:bg-violet-500/10 border border-violet-500/20 rounded-xl py-2.5 transition-all"
          >
            View more ({hiddenCount} more) <ChevronDown size={14} />
          </button>
        )}
      </Card>

      <Dialog open={showAll} onOpenChange={setShowAll}>
        <DialogContent className="max-w-[95vw] sm:max-w-xl bg-slate-950 border border-slate-800 text-slate-200 p-6 md:p-8 rounded-2xl overflow-y-auto max-h-[85vh]">
          <DialogHeader className="mb-6">
            <DialogTitle className="font-Outfit text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
              <History size={22} className="text-violet-400" /> All Backtest Runs
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">{runs.map(renderRow)}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}
