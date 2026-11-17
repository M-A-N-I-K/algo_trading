"use client";

import { useEffect, useState } from "react";
import type { FeedStatus as Status } from "@/lib/mt5/feed";

const POLL_MS = 15_000;

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/**
 * Sidebar light for the MT5 bar feed (mt5/PB_BarFeed.mq5): green while it
 * writes current bars, amber while it runs but its bars are old (MT5 not
 * connected), red when it has stopped. Hover for what each means.
 */
export default function FeedStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/mt5/feed", { cache: "no-store" });
        if (res.ok && !stopped) setStatus(await res.json());
      } catch {
        // Keep the last answer; the next poll tries again.
      }
      if (!stopped) setNow(Date.now());
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  if (!status) {
    return (
      <div className="flex items-center gap-2.5 rounded-md px-3 py-2 text-xs text-mist">
        <span className="h-2 w-2 rounded-full bg-mist/50" />
        MT5 feed: checking…
      </div>
    );
  }

  const { live, lastBeat, markets, newestBar, pricesFresh } = status;
  // live + fresh prices: green. Running but writing old bars (usually not
  // connected to the broker): amber. Not running: red.
  const state = live ? (pricesFresh ? "live" : "stale") : "off";
  const label = { live: "MT5 feed live", stale: "MT5 prices stale", off: "MT5 feed off" }[state];
  const detail =
    state === "live"
      ? `${markets ?? "?"} markets · FundingPips prices`
      : state === "stale"
        ? newestBar
          ? `Newest bar ${ago(now - newestBar)}`
          : "No bars written"
        : lastBeat
          ? `Last seen ${ago(now - lastBeat)}`
          : "Never started";
  const title = {
    live: "PB_BarFeed is running in MT5 and its bars are current. Signals and backtests use FundingPips' own prices.",
    stale:
      "PB_BarFeed is running but writing old bars, usually because MT5 isn't connected to the FundingPips server. Signals use Binance and Yahoo until it reconnects; backtests end at the newest bar. Check the connection icon in MT5's bottom-right corner.",
    off: "PB_BarFeed isn't running. Signals fall back to Binance and Yahoo; backtests end at the last bar it wrote. Open MT5 and attach PB_BarFeed to a chart.",
  }[state];
  const dot = { live: "bg-gain", stale: "bg-amber-400", off: "bg-loss" }[state];
  const ink = { live: "text-gain-ink", stale: "text-amber-300", off: "text-loss-ink" }[state];

  return (
    <div className="flex items-start gap-2.5 rounded-md px-3 py-2" title={title} role="status" aria-live="polite">
      <span className="relative mt-1 flex h-2 w-2 shrink-0">
        {state === "live" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gain opacity-60 motion-reduce:hidden" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dot}`} />
      </span>
      <span className="min-w-0">
        <span className={`block text-xs font-medium ${ink}`}>{label}</span>
        <span className="block truncate text-[11px] text-mist">{detail}</span>
      </span>
    </div>
  );
}
