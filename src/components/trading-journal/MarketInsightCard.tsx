"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Callout, Panel, Stat, Tag } from "@/components/kit";

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

const MOOD_TONE = { BULLISH: "gain", BEARISH: "loss", NEUTRAL: "neutral" } as const;
const MOOD_WORD = { BULLISH: "Bullish", BEARISH: "Bearish", NEUTRAL: "Neutral" } as const;

export default function MarketInsightCard() {
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["market-insight"],
    queryFn: fetchInsight,
    staleTime: 5 * 60_000,
  });

  return (
    <Panel
      title="Market conditions"
      note={data ? `${data.symbolCount} Binance pairs on the 1-hour chart.` : "From Binance public data."}
      aside={
        <div className="flex items-center gap-2">
          {data && <Tag tone={MOOD_TONE[data.mood]}>{MOOD_WORD[data.mood]}</Tag>}
          {dataUpdatedAt > 0 && (
            <span className="text-xs text-mist">
              {new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="rounded-md p-2 text-fog transition-colors hover:bg-deck-2 hover:text-paper disabled:opacity-40"
            aria-label="Refresh market conditions"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin motion-reduce:animate-none" : ""} />
          </button>
        </div>
      }
    >
      {isLoading && <p className="text-sm text-fog">Loading market data…</p>}
      {error && (
        <Callout tone="warning" title="Market data is unavailable">
          {(error as Error).message}. Try refreshing in a minute.
        </Callout>
      )}

      {data && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-6">
            <Stat label="Mood" value={data.moodLabel} />
            <Stat label="Volatility" value={data.volatilityLabel} note={`Average ATR ${data.avgAtrPercent.toFixed(2)}% of price`} />
          </div>
          <ul className="space-y-2 text-sm leading-relaxed text-paper/90">
            {data.bullets.map((bullet, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-fog" aria-hidden="true" />
                {bullet}
              </li>
            ))}
          </ul>
          <p className="mt-5 border-t border-rule pt-3 text-xs leading-relaxed text-mist">
            Based on EMA 20 and 50, RSI 14, ATR 14 and relative volume. For context, not advice.
          </p>
        </>
      )}
    </Panel>
  );
}
