"use client";

import { useQuery } from "@tanstack/react-query";
import { Tag } from "@/components/kit";
import { fetchJson } from "@/lib/apiClient";
import type { WeeklyPlan } from "@/lib/plan/planner";
import { marketLabel } from "@/lib/markets/yahoo";
import { fmtPrice, type CoinPlan } from "@/lib/plan/weeklyPlan";

// Rechecked every 5 minutes: the plan only moves when a 1h candle closes.
export function usePlan() {
  return useQuery({
    queryKey: ["weekly-plan"],
    queryFn: () => fetchJson<WeeklyPlan>("/api/plan"),
    refetchInterval: 5 * 60_000,
  });
}

export const coinLabel = marketLabel;
export const price = fmtPrice;
export const signedPct = (n: number, d = 1) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(d)}%`;

export function ASideTag({ coin }: { coin: CoinPlan }) {
  if (coin.gradeReversed) return <Tag>No grade</Tag>;
  return <Tag tone={coin.aSide === "LONG" ? "gain" : "loss"}>{coin.aSide === "LONG" ? "Longs A-grade" : "Shorts A-grade"}</Tag>;
}

// Last week's range as a bar: discount (lower half) and premium (upper
// half), the midpoint, this week's range so far, and where price is now.
export function RangeBar({ coin, compact = false }: { coin: CoinPlan; compact?: boolean }) {
  const lw = coin.lastWeek;
  const tw = coin.thisWeek;
  const lo = Math.min(lw.low, tw.low, coin.price);
  const hi = Math.max(lw.high, tw.high, coin.price);
  const span = hi - lo || 1;
  const at = (v: number) => `${((v - lo) / span) * 100}%`;
  const width = (a: number, b: number) => `${((b - a) / span) * 100}%`;
  return (
    <div className={compact ? "w-28" : "w-full"}>
      <div
        className={`relative ${compact ? "h-2.5" : "h-4"} rounded-sm bg-deck-2`}
        role="img"
        aria-label={`Price ${price(coin.price, coin.symbol)} at ${Math.round(coin.position * 100)}% of last week's range ${price(lw.low, coin.symbol)} to ${price(lw.high, coin.symbol)}`}
      >
        <div className="absolute inset-y-0 bg-gain/25" style={{ left: at(lw.low), width: width(lw.low, lw.mid) }} />
        <div className="absolute inset-y-0 bg-loss/25" style={{ left: at(lw.mid), width: width(lw.mid, lw.high) }} />
        <div className="absolute inset-y-0 w-px bg-fog" style={{ left: at(lw.mid) }} />
        {!compact && (
          <div className="absolute -bottom-1.5 h-1 rounded-full bg-signal/60" style={{ left: at(tw.low), width: width(tw.low, tw.high) }} />
        )}
        <div
          className={`absolute top-1/2 ${compact ? "h-3.5 w-1" : "h-6 w-1.5"} -translate-x-1/2 -translate-y-1/2 rounded-sm bg-paper`}
          style={{ left: at(coin.price) }}
        />
      </div>
      {!compact && (
        <div className="mt-3 flex justify-between text-[11px] tabular-nums text-mist">
          <span>{price(lw.low, coin.symbol)}</span>
          <span>mid {price(lw.mid, coin.symbol)}</span>
          <span>{price(lw.high, coin.symbol)}</span>
        </div>
      )}
    </div>
  );
}
