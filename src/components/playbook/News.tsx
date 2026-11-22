"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Callout, EmptyState, Panel, Segmented } from "@/components/kit";
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

const timeFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });
const clockFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short" });

function relative(ms: number) {
  const mins = Math.round(Math.abs(ms) / 60_000);
  const days = Math.floor(mins / 1440);
  const text = mins < 60 ? `${mins}m` : days >= 1 ? `${days}d ${Math.floor((mins % 1440) / 60)}h` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return ms >= 0 ? `in ${text}` : `${text} ago`;
}

/** "in 10m", "in 17h", "in 2d": short enough for the time column. */
function shortRelative(ms: number) {
  const mins = Math.round(Math.abs(ms) / 60_000);
  const text = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins / 60)}h` : `${Math.floor(mins / 1440)}d`;
  return ms >= 0 ? `in ${text}` : `${text} ago`;
}

const platformName = (symbol: string) => marketForSymbol(symbol)?.platformSymbol ?? symbol;

const localDay = (t: number) => new Date(t).toDateString();
function dayLabel(t: number, now: number) {
  if (localDay(t) === localDay(now)) return "Today";
  if (localDay(t) === localDay(now + 24 * HOUR)) return `Tomorrow, ${dayFmt.format(t)}`;
  return dayFmt.format(t);
}

type Scope = "high" | "all";

/** This week's high (and medium) impact news for `symbols`, by day, with a warning inside the 30-minute window. */
export function NewsPanel({ symbols }: { symbols: string[] }) {
  const { data, error, isLoading } = useCatalysts();
  const now = useNow();
  const [scope, setScope] = useState<Scope>("all");
  const [wholeWeek, setWholeWeek] = useState(false);
  const markets = [...new Set(symbols)];
  const byCurrency = new Map<string, string[]>();
  for (const s of markets) for (const c of newsCurrencies(s)) byCurrency.set(c, [...(byCurrency.get(c) ?? []), platformName(s)]);

  const all = data?.catalysts ?? [];
  const mine = all.filter((c) => byCurrency.has(c.currency) && c.time >= now - NEWS_WINDOW_MS && (scope === "all" || c.impact === "High"));
  const soonEnd = now + AHEAD_MS;
  const shown = wholeWeek ? mine : mine.filter((c) => c.time <= soonEnd);
  const later = mine.length - shown.length;
  const blocked = markets.filter((s) => newsClash(all, s, now).length > 0);
  const blockEnd = Math.max(0, ...markets.flatMap((s) => newsClash(all, s, now).map((c) => c.time + NEWS_WINDOW_MS)));
  const nextHigh = all.find((c) => c.impact === "High" && byCurrency.has(c.currency) && c.time > now);

  const days: { key: string; label: string; items: Catalyst[] }[] = [];
  for (const c of shown) {
    const key = localDay(c.time);
    const d = days[days.length - 1];
    if (d?.key === key) d.items.push(c);
    else days.push({ key, label: dayLabel(c.time, now), items: [c] });
  }

  return (
    <Panel
      title="News"
      note={`For ${[...byCurrency.keys()].join(" and ") || "your markets"}. No new trades from 30 minutes before high-impact news to 30 minutes after.`}
      aside={
        <Segmented
          size="sm"
          label="Which news to show"
          value={scope}
          onChange={setScope}
          options={[
            { value: "all", label: "High + medium" },
            { value: "high", label: "High" },
          ]}
        />
      }
    >
      {isLoading ? (
        <EmptyState>Loading the calendar.</EmptyState>
      ) : error || !data ? (
        <Callout tone="warning" title="Couldn't load the news calendar">Check ForexFactory before you enter, and tick the news check only once you have.</Callout>
      ) : (
        <div className="flex flex-col gap-4">
          {blocked.length > 0 ? (
            <div role="alert" className="rounded-lg border border-loss/45 bg-loss/[0.08] px-4 py-3">
              <p className="text-sm font-semibold text-loss-ink">No new trades on {blocked.map(platformName).join(", ")}</p>
              <p className="mt-0.5 text-[13px] text-paper">
                High-impact news is inside the window. Clear at {clockFmt.format(blockEnd)} ({relative(blockEnd - now)}).
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-rule bg-ink/40 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-paper">
                <span className="h-2 w-2 rounded-full bg-gain" aria-hidden="true" />
                No news in the way right now
              </p>
              <p className="mt-0.5 text-[13px] text-fog">
                {nextHigh ? (
                  <>
                    Next high-impact: <span className="text-paper">{nextHigh.currency} {nextHigh.title}</span>, {timeFmt.format(nextHigh.time)}{" "}
                    <span className="tabular-nums text-paper">({relative(nextHigh.time - now)})</span>
                  </>
                ) : (
                  "No more high-impact news on this week's calendar."
                )}
              </p>
            </div>
          )}

          {days.length === 0 ? (
            <EmptyState>
              {mine.length ? "Nothing in the next 24 hours." : `No ${scope === "high" ? "high" : "high or medium"} impact news left this week for these markets.`}
            </EmptyState>
          ) : (
            days.map((d) => (
              <section key={d.key} aria-label={d.label}>
                <h3 className="mb-1.5 text-xs font-medium text-mist">{d.label}</h3>
                <ul className="flex flex-col gap-1">
                  {d.items.map((c, i) => {
                    const sameTime = i > 0 && d.items[i - 1].time === c.time;
                    const high = c.impact === "High";
                    const live = high && Math.abs(c.time - now) <= NEWS_WINDOW_MS;
                    const past = c.time < now;
                    return (
                      <li
                        key={`${c.time}-${c.currency}-${c.title}`}
                        className={cn(
                          "grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 rounded-r-md border-l-2 py-1.5 pl-3 pr-2",
                          high ? "border-loss bg-loss/[0.05]" : "border-fees/60",
                          live && "bg-loss/[0.12]",
                          past && !live && "opacity-60",
                        )}
                      >
                        <div className="text-[13px] leading-tight tabular-nums">
                          {!sameTime && (
                            <>
                              <div className="text-paper">{clockFmt.format(c.time)}</div>
                              <div className={cn("mt-0.5 text-[11px]", live ? "font-medium text-loss-ink" : "text-mist")}>{shortRelative(c.time - now)}</div>
                            </>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className={cn("text-[13px] leading-snug", high ? "text-paper" : "text-fog")}>
                            <span className="mr-1.5 text-[11px] font-semibold text-mist">{c.currency}</span>
                            {c.title}
                            <span className="sr-only">, {c.impact} impact</span>
                          </p>
                          <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-mist">
                            {c.forecast && <span>Forecast <span className="tabular-nums text-fog">{c.forecast}</span></span>}
                            {c.previous && <span>Previous <span className="tabular-nums text-fog">{c.previous}</span></span>}
                            {(byCurrency.get(c.currency)?.length ?? 0) < markets.length && <span>{byCurrency.get(c.currency)?.join(", ")} only</span>}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}

          {(later > 0 || wholeWeek) && (
            <button type="button" onClick={() => setWholeWeek((w) => !w)} className="self-start text-[13px] text-signal hover:text-paper focus-visible:outline-2 focus-visible:outline-signal">
              {wholeWeek ? "Only the next 24 hours" : `Rest of the week (${later} more)`}
            </button>
          )}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-mist">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-0.5 bg-loss" aria-hidden="true" />High impact</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-0.5 bg-fees/60" aria-hidden="true" />Medium</span>
            <span>Your time zone. Source: {data.source}.</span>
          </p>
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
