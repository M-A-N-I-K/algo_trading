"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Plus } from "lucide-react";
import { fetchJson } from "@/lib/apiClient";

interface StrategyListItem {
  id: string;
  name: string;
  description: string;
  market: string;
  timeframe: string;
  status: string;
  updatedAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-800 text-slate-400 border-slate-700",
  READY: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  ARCHIVED: "bg-slate-900 text-slate-600 border-slate-800",
};

export default function StrategiesPage() {
  const queryClient = useQueryClient();
  const strategiesQuery = useQuery({
    queryKey: ["strategies"],
    queryFn: () => fetchJson<{ strategies: StrategyListItem[] }>("/api/strategies"),
  });

  const strategies = strategiesQuery.data?.strategies ?? [];

  const handleDuplicate = async (id: string) => {
    await fetchJson(`/api/strategies/${id}/duplicate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    queryClient.invalidateQueries({ queryKey: ["strategies"] });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this strategy and all its versions? This cannot be undone.")) return;
    await fetchJson(`/api/strategies/${id}`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: ["strategies"] });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layers className="text-violet-500" size={22} />
          <div>
            <h1 className="text-xl font-bold text-slate-100">Strategy Builder</h1>
            <p className="text-sm text-slate-500">Visually build and version trading strategies as structured, backtest-ready definitions.</p>
          </div>
        </div>
        <Link
          href="/strategies/new"
          className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg bg-violet-600 border border-violet-500 text-white hover:bg-violet-500 transition-all"
        >
          <Plus size={14} /> New Strategy
        </Link>
      </div>

      {strategiesQuery.isLoading && <p className="text-sm text-slate-500">Loading strategies…</p>}

      {!strategiesQuery.isLoading && strategies.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 border border-dashed border-slate-800 rounded-2xl text-center">
          <Layers className="text-slate-700" size={32} />
          <p className="text-sm text-slate-500">No strategies yet.</p>
          <Link href="/strategies/new" className="text-xs font-semibold text-violet-400 hover:text-violet-300">
            Create your first strategy →
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {strategies.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-3">
            <Link href={`/strategies/${s.id}/edit`} className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-200 truncate">{s.name || "Untitled Strategy"}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase ${STATUS_STYLES[s.status] ?? STATUS_STYLES.DRAFT}`}>{s.status}</span>
              </div>
              <p className="text-xs text-slate-500 truncate">
                {s.market} · {s.timeframe} · updated {new Date(s.updatedAt).toLocaleDateString()}
              </p>
            </Link>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={() => handleDuplicate(s.id)} className="text-xs font-semibold text-slate-400 hover:text-slate-200 px-2 py-1">
                Duplicate
              </button>
              <button type="button" onClick={() => handleDelete(s.id)} className="text-xs font-semibold text-slate-500 hover:text-rose-400 px-2 py-1">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
