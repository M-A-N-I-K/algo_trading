"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import TradesTable from "@/components/trading-journal/TradesTable";
import LossLimitBanner from "@/components/trading-journal/LossLimitBanner";
import MarketInsightCard from "@/components/trading-journal/MarketInsightCard";
import PnlCalendar from "@/components/trading-journal/PnlCalendar";
import { useDashboard } from "@/components/trading-journal/DashboardContext";
import type { DashboardSectionKey } from "@/components/dashboard/sections";
import PnlBridge from "@/components/viz/PnlBridge";
import EquityChart from "@/components/viz/EquityChart";
import RHistogram from "@/components/viz/RHistogram";
import WeekdayHourHeatmap from "@/components/viz/WeekdayHourHeatmap";
import HoldTimeScatter, { type HoldPoint } from "@/components/viz/HoldTimeScatter";
import BreakdownTable from "@/components/viz/BreakdownTable";
import RatioList from "@/components/viz/RatioList";
import { Panel, money } from "@/components/viz/shared";
import {
  equitySeries,
  groupBy,
  holdMinutesOf,
  pnlBreakdown,
  rHistogram,
  summarize,
  weekdayHourGrid,
} from "@/lib/journal/metrics";

const PERIODS = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "ytd", label: "This year", days: null },
  { key: "all", label: "All time", days: null },
] as const;
type PeriodKey = (typeof PERIODS)[number]["key"];

function periodStart(key: PeriodKey): number {
  const now = new Date();
  if (key === "all") return -Infinity;
  if (key === "ytd") return new Date(now.getFullYear(), 0, 1).getTime();
  const days = PERIODS.find((p) => p.key === key)!.days as number;
  return now.getTime() - days * 24 * 60 * 60 * 1000;
}

const EXIT_LABELS: Record<string, string> = {
  tpsl: "Take-profit or stop",
  manual: "Closed by hand",
  liquidation: "Liquidated",
  unknown: "Not recorded",
};

interface FundingStats {
  tradeFunding: number;
  openFunding: number;
  unattributedFunding: number;
  eventCount: number;
}

export default function DashboardPage() {
  const { trades, symbols, hiddenKpiCards, openTradeForm, handleDeleteTrade, openNotes } = useDashboard();
  const [period, setPeriod] = useState<PeriodKey>("all");
  const hidden = new Set(hiddenKpiCards);
  const show = (key: DashboardSectionKey) => !hidden.has(key);

  const filtered = useMemo(() => {
    const from = periodStart(period);
    return trades.filter((t) => new Date(t.time).getTime() >= from);
  }, [trades, period]);

  const m = useMemo(() => {
    const holdPoints: HoldPoint[] = [];
    for (const t of filtered) {
      const minutes = holdMinutesOf(t);
      if (minutes != null) holdPoints.push({ id: t.id, minutes, net: t.pnl, symbol: t.symbol, side: t.side });
    }
    return {
      breakdown: pnlBreakdown(filtered),
      summary: summarize(filtered),
      equity: equitySeries(filtered),
      rBins: rHistogram(filtered),
      grid: weekdayHourGrid(filtered),
      holdPoints,
      bySymbol: groupBy(filtered, (t) => t.symbol).sort((a, b) => b.count - a.count || a.net - b.net),
      bySide: groupBy(filtered, (t) => t.side).sort((a, b) => a.key.localeCompare(b.key)),
      byExit: groupBy(filtered, (t) => t.exitType ?? "unknown").sort((a, b) => b.count - a.count),
    };
  }, [filtered]);

  const fundingStats = useQuery({
    queryKey: ["coindcx-funding-stats"],
    queryFn: async (): Promise<FundingStats> => {
      const res = await fetch("/api/coindcx/funding-stats");
      if (!res.ok) throw new Error("Failed to load funding stats");
      return res.json();
    },
  });
  const openFunding = fundingStats.data?.openFunding ?? 0;

  const recent = useMemo(
    () => [...filtered].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 6),
    [filtered],
  );

  return (
    <div>
      <LossLimitBanner trades={trades} />

      <div className="mb-8 flex flex-wrap items-center gap-3" role="group" aria-label="Period">
        <div className="inline-flex rounded-md border border-rule bg-deck p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={period === p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-[5px] px-3 py-1.5 text-sm transition-colors ${
                period === p.key ? "bg-deck-2 text-paper" : "text-fog hover:text-paper"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {Math.abs(openFunding) >= 0.005 && (
          <p className="text-sm text-fog">
            Open positions have {openFunding < 0 ? "paid" : "received"}{" "}
            <span className="text-funding-ink">{money(Math.abs(openFunding), { sign: false })}</span> in funding so far.
          </p>
        )}
      </div>

      <PnlBridge breakdown={m.breakdown} summary={m.summary} fundingEvents={fundingStats.data?.eventCount} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {show("equity") && (
          <Panel
            className={show("ratios") ? "xl:col-span-8" : "xl:col-span-12"}
            title="Equity, before and after costs"
            note="Each step is one closed trade. The shaded gap is what fees and funding took from your price P&L."
          >
            <EquityChart series={m.equity} />
          </Panel>
        )}

        {show("ratios") && (
          <Panel className={show("equity") ? "xl:col-span-4" : "xl:col-span-12"} title="Key ratios" note="All on net P&L, after fees and funding.">
            <RatioList summary={m.summary} />
          </Panel>
        )}

        {show("rDistribution") && (
          <Panel
            className="xl:col-span-5"
            title="R-multiple distribution"
            note="Net result divided by the amount risked at entry. Wide right tails pay for many small losses."
          >
            <RHistogram bins={m.rBins} avgR={m.summary.avgR} />
          </Panel>
        )}

        {show("timing") && (
          <Panel
            className={show("rDistribution") ? "xl:col-span-7" : "xl:col-span-12"}
            title="When you trade"
            note="Net P&L by the weekday and hour each trade was opened."
          >
            <WeekdayHourHeatmap cells={m.grid} />
          </Panel>
        )}

        {show("holdTime") && (
          <Panel className="xl:col-span-7" title="Hold time and result" note="Each dot is a trade. Time is on a log scale.">
            <HoldTimeScatter points={m.holdPoints} />
          </Panel>
        )}

        {show("splits") && (
          <Panel className={show("holdTime") ? "xl:col-span-5" : "xl:col-span-12"} title="Direction and exit">
            <div className="space-y-6">
              <BreakdownTable
                rows={m.bySide}
                keyLabel="Direction"
                columns="compact"
                labelOf={(k) => (k === "LONG" ? "Long" : "Short")}
              />
              <BreakdownTable rows={m.byExit} keyLabel="How it closed" columns="compact" labelOf={(k) => EXIT_LABELS[k] ?? k} />
            </div>
          </Panel>
        )}

        {show("symbols") && (
          <Panel
            className="xl:col-span-12"
            title="By symbol"
            note="Price P&L, fees and funding for each market, so you can see which ones your costs eat."
          >
            <BreakdownTable rows={m.bySymbol} keyLabel="Symbol" />
          </Panel>
        )}

        {show("calendar") && (
          <div className="xl:col-span-12">
            <PnlCalendar trades={trades} onInspect={(t) => openNotes(t)} />
          </div>
        )}

        {show("recent") && (
          <Panel
            className="xl:col-span-12"
            title="Recent trades"
            aside={
              <Link href="/trades" className="text-sm text-signal hover:underline">
                Open the journal
              </Link>
            }
          >
            <TradesTable
              filteredTrades={recent}
              symbols={symbols}
              onEdit={(t) => openTradeForm(t)}
              onDelete={handleDeleteTrade}
              onInspect={(t) => openNotes(t)}
              isFullLog={false}
            />
          </Panel>
        )}

        <div className="xl:col-span-12">
          <MarketInsightCard />
        </div>
      </div>
    </div>
  );
}
