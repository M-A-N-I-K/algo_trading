"use client";

import { useQuery } from "@tanstack/react-query";
import { Sparkles, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MarketInsight {
  mood: "BULLISH" | "BEARISH" | "NEUTRAL";
  moodLabel: string;
  volatilityLabel: "High" | "Moderate" | "Low";
  avgAtrPercent: number;
  bullets: string[];
  symbolCount: number;
  updatedAt: string;
}

async function fetchInsight(): Promise<MarketInsight> {
  const res = await fetch("/api/market/insight");
  if (!res.ok) throw new Error("Failed to load market insight");
  return res.json();
}

const MOOD_STYLES: Record<MarketInsight["mood"], { badge: string; dot: string }> = {
  BULLISH: { badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400" },
  BEARISH: { badge: "bg-rose-500/10 text-rose-400 border-rose-500/20", dot: "bg-rose-400" },
  NEUTRAL: { badge: "bg-amber-500/10 text-amber-400 border-amber-500/20", dot: "bg-amber-400" },
};

export default function MarketInsightCard() {
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["market-insight"],
    queryFn: fetchInsight,
    staleTime: 5 * 60_000,
  });

  const moodStyle = data ? MOOD_STYLES[data.mood] : MOOD_STYLES.NEUTRAL;

  return (
    <Card className="glass border-slate-800 p-6 mb-8">
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
            <Sparkles size={16} />
          </div>
          <div>
            <h3 className="font-Outfit text-lg font-bold text-white">Market Insight</h3>
            <p className="text-[11px] text-slate-500">Binance public data</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {dataUpdatedAt > 0 && (
            <span className="text-[11px] text-slate-500">
              Updated {new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-40"
            aria-label="Refresh"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          </button>
          {data && (
            <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border", moodStyle.badge)}>
              {data.mood}
            </span>
          )}
        </div>
      </div>

      {isLoading && <p className="text-xs text-slate-500">Loading market data...</p>}
      {error && <p className="text-xs text-rose-400">{(error as Error).message}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Market Mood</span>
              <p className="text-lg font-bold text-white mt-1">{data.moodLabel}</p>
            </div>
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Volatility</span>
              <p className="text-lg font-bold text-white mt-1">{data.volatilityLabel}</p>
            </div>
          </div>

          <ul className="flex flex-col gap-2.5 mb-5">
            {data.bullets.map((bullet, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-slate-300">
                <span className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", moodStyle.dot)} />
                {bullet}
              </li>
            ))}
          </ul>

          <div className="border-t border-slate-900 pt-4">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Calculated from Binance {data.symbolCount}-pair 1h candles using EMA(20/50), RSI(14), ATR(14), and relative volume.
            </p>
            <p className="text-[11px] text-slate-600 mt-0.5">Information only &middot; not investment advice.</p>
          </div>
        </>
      )}
    </Card>
  );
}
