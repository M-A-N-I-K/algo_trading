"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Callout, EmptyState, Panel, Tag } from "@/components/kit";
import { fetchJson } from "@/lib/apiClient";
import { NEWS_WINDOW_MS, newsClash, newsCurrencies, nextHighImpact, type Catalyst } from "@/lib/news/catalysts";
import { marketForSymbol } from "@/lib/playbook/config";
import { cn } from "@/lib/utils";

// This week's economic calendar beside the Playbook's "No high-impact news"
// check: a panel of what's coming for the markets you trade, and a line in
// the trade dialog for the market and time you're about to enter.

const HOUR = 3_600_000;
const AHEAD_MS = 24 * HOUR;

export function useCatalysts() {
  return useQuery({
    queryKey: ["market-catalysts"],
    queryFn: () => fetchJson<{ catalysts: Catalyst[]; source: string }>("/api/market/catalysts"),
    refetchInterval: 15 * 60_000,
    staleTime: 5 * 60_000,
  });
}

/** The current time, ticking every 30 s so "in 12m" stays true. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const timeFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
const clockFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

function relative(ms: number) {
  const mins = Math.round(Math.abs(ms) / 60_000);
  const text = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return ms >= 0 ? `in ${text}` : `${text} ago`;
}

const platformName = (symbol: string) => marketForSymbol(symbol)?.platformSymbol ?? symbol;

/** The next 24 hours of high and medium impact news for `symbols`, with a warning inside the 30-minute window. */
export function NewsPanel({ symbols }: { symbols: string[] }) {
  const { data, error, isLoading } = useCatalysts();
  const now = useNow();
  const markets = [...new Set(symbols)];
  const byCurrency = new Map<string, string[]>();
  for (const s of markets) for (const c of newsCurrencies(s)) byCurrency.set(c, [...(byCurrency.get(c) ?? []), platformName(s)]);

  const all = data?.catalysts ?? [];
  const soon = all.filter((c) => byCurrency.has(c.currency) && c.time >= now - NEWS_WINDOW_MS && c.time <= now + AHEAD_MS);
  const blocked = markets.filter((s) => newsClash(all, s, now).length > 0);
  const blockEnd = Math.max(0, ...markets.flatMap((s) => newsClash(all, s, now).map((c) => c.time + NEWS_WINDOW_MS)));

  return (
    <Panel
      title="News"
      note={`High-impact news for ${[...byCurrency.keys()].join(", ") || "your markets"} in the next 24 hours. No new trades within 30 minutes either side.`}
    >
      {isLoading ? (
        <EmptyState>Loading the calendar.</EmptyState>
      ) : error || !data ? (
        <Callout tone="warning" title="Couldn't load the news calendar">Check ForexFactory before you enter, and tick the news check only once you have.</Callout>
      ) : (
        <div className="flex flex-col gap-3">
          {blocked.length > 0 && (
            <Callout tone="critical" title={`No new trades on ${blocked.map(platformName).join(", ")} until ${clockFmt.format(blockEnd)}`}>
              High-impact news is inside the 30-minute window.
            </Callout>
          )}
          {soon.length === 0 ? (
            <EmptyState>No high or medium impact events in the next 24 hours for these markets.</EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-rule text-[13px]">
              {soon.map((c) => {
                const live = Math.abs(c.time - now) <= NEWS_WINDOW_MS && c.impact === "High";
                return (
                  <li key={`${c.time}-${c.currency}-${c.title}`} className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2", c.impact === "Medium" && "text-fog")}>
                    <span className="w-28 shrink-0 tabular-nums text-paper">{timeFmt.format(c.time)}</span>
                    <span className={cn("w-20 shrink-0 tabular-nums", live ? "font-medium text-loss-ink" : "text-mist")}>{relative(c.time - now)}</span>
                    <Tag tone={c.impact === "High" ? "loss" : "fees"}>{c.impact}</Tag>
                    <span className={cn("min-w-0 flex-1", c.impact === "High" && "text-paper")}>
                      {c.currency} {c.title}
                    </span>
                    <span className="text-xs text-mist">{byCurrency.get(c.currency)?.join(", ")}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-mist">Times in your browser&apos;s time zone. Source: {data.source}.</p>
        </div>
      )}
    </Panel>
  );
}

/** One line under the news check: what the calendar says about this market at this time. */
export function NewsNote({ symbol, at }: { symbol: string; at: number }) {
  const { data, error } = useCatalysts();
  if (error) return <p className="text-xs text-fees-ink">The news calendar didn&apos;t load: check ForexFactory before ticking.</p>;
  if (!data || !Number.isFinite(at)) return null;
  const clash = newsClash(data.catalysts, symbol, at);
  if (clash.length) {
    const c = clash[0];
    return (
      <p className="text-xs font-medium text-loss-ink" role="alert">
        {c.currency} {c.title} at {clockFmt.format(c.time)} ({relative(c.time - at)}): inside the 30-minute window. Don&apos;t take this trade.
      </p>
    );
  }
  const next = nextHighImpact(data.catalysts, symbol, at);
  return (
    <p className="text-xs text-mist">
      {next
        ? `Next high-impact news for ${platformName(symbol)}: ${next.currency} ${next.title}, ${timeFmt.format(next.time)} (${relative(next.time - at)}).`
        : `No high-impact news for ${platformName(symbol)} left on this week's calendar.`}
    </p>
  );
}
