"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { BellRing, Crosshair } from "lucide-react";
import { EmptyState, Panel, Tag } from "@/components/kit";
import { fetchJson } from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { isForex, marketLabel as baseLabel } from "@/lib/markets/yahoo";

const marketLabel = (symbol: string) => (symbol === "XAUUSDT" ? "Gold" : baseLabel(symbol));
import { fmtPrice } from "@/lib/plan/weeklyPlan";
import type { LevelAlert, LiquidityLevel, MarketLevels } from "@/lib/levels/liquidity";
import type { LevelsView } from "@/lib/levels/service";

export const LEVELS_KEY = ["liquidity-levels"];

// Once a minute, also while the tab is in the background, so alerts still arrive.
export function useLevels(enabled = true) {
  return useQuery({
    queryKey: LEVELS_KEY,
    queryFn: () => fetchJson<LevelsView>("/api/levels"),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    enabled,
  });
}

/** "12.5 pts", or pips on currency pairs. */
export function gapText(symbol: string, gap: number) {
  const g = Math.abs(gap);
  if (isForex(symbol)) {
    const pips = g * (symbol.toUpperCase().endsWith("JPY") ? 100 : 10_000);
    return `${pips < 10 ? pips.toFixed(1) : Math.round(pips)} pips`;
  }
  return `${g.toLocaleString("en-US", { maximumFractionDigits: g >= 100 ? 0 : 1, minimumFractionDigits: g >= 100 ? 0 : 1 })} pts`;
}

const hhmm = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
// The time, with the weekday when it isn't today (a market closed for the weekend).
const when = (t: number) =>
  new Date(t).toDateString() === new Date().toDateString() ? hhmm(t) : `${new Date(t).toLocaleDateString("en-GB", { weekday: "short" })} ${hhmm(t)}`;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** One line for an alert, used in the bar and in browser notifications. */
export function alertText(a: LevelAlert): string {
  const name = marketLabel(a.symbol);
  const lvl = `${lower(a.level.label)} (${fmtPrice(a.level.price, a.symbol)})`;
  if (a.kind === "sweep") {
    const back = a.level.label.toLowerCase().includes("high") ? "back below" : "back above";
    return a.reclaimed ? `${name} swept ${lvl} at ${when(a.at)} and is ${back} it` : `${name} broke ${lvl} at ${when(a.at)} and is holding beyond it`;
  }
  const gap = gapText(a.symbol, a.level.price - a.price);
  const where = a.level.side === "above" ? "under" : "over";
  return a.level.proximity === "at" ? `${name} is at ${lvl}, ${gap} away` : `${name} is ${gap} ${where} ${lvl}`;
}

const tone = (a: LevelAlert) => (a.kind === "sweep" ? "signal" : a.level.proximity === "at" ? "fees" : "neutral");

// --- browser notifications ------------------------------------------------------

const SEEN_KEY = "level-alerts-seen";
const SEEN_TTL = 24 * 3_600_000;

function readSeen(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, number>;
    const now = Date.now();
    return Object.fromEntries(Object.entries(raw).filter(([, t]) => now - t < SEEN_TTL));
  } catch {
    return {};
  }
}

function writeSeen(seen: Record<string, number>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // Private window: alerts may repeat after a reload, nothing worse.
  }
}

type Permission = NotificationPermission | "unsupported";
const currentPermission = (): Permission => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);

// Pops a system notification the first time each alert appears (an approach
// to "near", then to "at", and a sweep are separate alerts), at most once a day.
function useLevelNotifications(alerts: LevelAlert[] | undefined) {
  const [permission, setPermission] = useState<Permission>("unsupported");
  const seenRef = useRef<Record<string, number> | null>(null);
  useEffect(() => setPermission(currentPermission()), []);

  useEffect(() => {
    if (!alerts || permission !== "granted") return;
    const seen = (seenRef.current ??= readSeen());
    const fresh = alerts.filter((a) => !seen[a.id]);
    if (!fresh.length) return;
    for (const a of fresh.slice(0, 3)) {
      try {
        new Notification(a.kind === "sweep" ? "Liquidity swept" : a.level.proximity === "at" ? "At a liquidity level" : "Nearing a liquidity level", {
          body: alertText(a),
          tag: a.id,
        });
      } catch {
        // Some browsers only allow notifications from a service worker.
      }
    }
    const now = Date.now();
    for (const a of fresh) seen[a.id] = now;
    writeSeen(seen);
  }, [alerts, permission]);

  const ask = async () => {
    if (typeof Notification === "undefined") return;
    setPermission(await Notification.requestPermission());
  };
  return { permission, ask };
}

// --- the strip on every page ------------------------------------------------------

/** Price at, near or just through a weekly or daily liquidity level, shown above every page. */
export function LevelAlertsBar() {
  const { status } = useSession();
  const { data } = useLevels(status === "authenticated");
  const alerts = data?.alerts;
  const { permission, ask } = useLevelNotifications(alerts);
  const [open, setOpen] = useState(false);
  if (!alerts?.length) return null;
  const shown = open ? alerts : alerts.slice(0, 3);

  return (
    <section aria-label="Liquidity alerts" aria-live="polite" className="mb-6 rounded-[10px] border border-signal/30 bg-signal/[0.06] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="flex items-center gap-2 text-sm font-medium text-paper">
          <Crosshair size={15} className="text-signal" aria-hidden="true" />
          Price is near liquidity
        </h2>
        <div className="flex items-center gap-3 text-xs">
          {permission === "default" && (
            <button type="button" onClick={ask} className="flex items-center gap-1.5 rounded text-signal hover:text-paper focus-visible:outline-2 focus-visible:outline-signal">
              <BellRing size={13} aria-hidden="true" /> Notify me
            </button>
          )}
          <Link href="/playbook#levels" className="text-fog hover:text-paper">All levels</Link>
        </div>
      </div>
      <ul className="mt-2 flex flex-col gap-1.5">
        {shown.map((a) => (
          <li key={a.id} className="flex items-start gap-2 text-[13px] leading-snug text-paper">
            <Tag tone={tone(a)}>{a.kind === "sweep" ? "Swept" : a.level.proximity === "at" ? "At" : "Near"}</Tag>
            <span className="pt-px">
              {alertText(a)}
              <span className="text-mist"> ({a.level.timeframe === "W" ? "weekly" : "daily"})</span>
            </span>
          </li>
        ))}
      </ul>
      {alerts.length > 3 && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-2 text-xs text-fog hover:text-paper">
          {open ? "Show fewer" : `Show ${alerts.length - 3} more`}
        </button>
      )}
    </section>
  );
}

// --- the ladders on the Playbook -------------------------------------------------

function Rung({ l, symbol, price }: { l: LiquidityLevel; symbol: string; price: number }) {
  const hot = l.proximity !== "far";
  return (
    <li className={cn("grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-baseline gap-2 rounded px-1.5 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:gap-3 sm:px-2 py-1.5 text-[13px]", hot && (l.proximity === "at" ? "bg-fees/15" : "bg-signal/10"))}>
      <span className={cn("tabular-nums", l.side === "above" ? "text-loss-ink" : "text-gain-ink")}>{fmtPrice(l.price, symbol)}</span>
      <span className="flex min-w-0 items-baseline text-fog" title={[l.label, ...l.also].join("\n")}>
        <span className={cn("mr-1.5 inline-block w-4 shrink-0 text-center text-[11px] font-semibold", l.timeframe === "W" ? "text-paper" : "text-mist")} title={l.timeframe === "W" ? "Weekly" : "Daily"}>{l.timeframe}</span>
        <span className="leading-snug sm:truncate">{l.label}</span>
        {l.also.length > 0 && <span className="ml-1.5 shrink-0 text-[11px] text-mist">+{l.also.length}</span>}
      </span>
      <span className={cn("text-right text-xs tabular-nums", hot ? "text-paper" : "text-mist")}>{gapText(symbol, l.price - price)}</span>
    </li>
  );
}

function Ladder({ m }: { m: MarketLevels }) {
  const above = [...m.above].reverse(); // farthest at the top
  return (
    <div className="min-w-0 rounded-lg border border-rule bg-ink/40 p-2 sm:p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2 px-2">
        <h3 className="font-display text-[15px] font-semibold text-paper">{marketLabel(m.symbol)}</h3>
        <span className="text-xs text-mist">day&apos;s range {gapText(m.symbol, m.atr)}</span>
      </div>
      <ul aria-label={`Levels above ${marketLabel(m.symbol)}`}>
        {above.length ? above.map((l) => <Rung key={l.id} l={l} symbol={m.symbol} price={m.price} />) : <li className="px-2 py-1.5 text-[13px] text-mist">No untaken highs nearby.</li>}
      </ul>
      <div className="my-1 flex items-center gap-2 px-2">
        <span className="h-px flex-1 bg-paper/40" />
        <span className="text-[13px] font-semibold tabular-nums text-paper">{fmtPrice(m.price, m.symbol)}</span>
        <span className="text-[11px] text-mist">at {when(m.asOf + 1)}</span>
        <span className="h-px flex-1 bg-paper/40" />
      </div>
      <ul aria-label={`Levels below ${marketLabel(m.symbol)}`}>
        {m.below.length ? m.below.map((l) => <Rung key={l.id} l={l} symbol={m.symbol} price={m.price} />) : <li className="px-2 py-1.5 text-[13px] text-mist">No untaken lows nearby.</li>}
      </ul>
      {m.sweeps.length > 0 && (
        <p className="mt-2 border-t border-rule px-2 pt-2 text-xs leading-snug text-signal">
          {m.sweeps.map((s) => `${s.level.label} taken at ${when(s.at)}${s.reclaimed ? ", back inside" : ""}`).join(". ")}.
        </p>
      )}
    </div>
  );
}

/** Untaken weekly and daily liquidity either side of price, for the given markets. */
export function LiquidityLevels({ symbols }: { symbols: string[] }) {
  const { data, isLoading, error } = useLevels();
  const wanted = new Set(symbols);
  const markets = (data?.markets ?? []).filter((m) => wanted.has(m.symbol));
  const hot = (m: MarketLevels) => Math.min(...[...m.above, ...m.below].map((l) => l.distance), 99) - (m.sweeps.length ? 1 : 0);
  markets.sort((a, b) => hot(a) - hot(b));
  return (
    <div id="levels" className="scroll-mt-6">
      <Panel
        title="Liquidity levels"
        note="Where stops rest: above untaken highs and below untaken lows, from the weekly (W) and daily (D) charts. Price tends to run to them and often turns once they're taken. Highlighted when price is within 0.3 of a day's range."
      >
        {isLoading ? (
          <EmptyState>Finding the levels…</EmptyState>
        ) : error || !data ? (
          <EmptyState>Couldn&apos;t load the levels right now. They retry every minute.</EmptyState>
        ) : markets.length === 0 ? (
          <EmptyState>No levels for these markets yet: there&apos;s no hourly history for them (FTSE 100 needs the MT5 feed running).</EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {markets.map((m) => <Ladder key={m.symbol} m={m} />)}
          </div>
        )}
      </Panel>
    </div>
  );
}
