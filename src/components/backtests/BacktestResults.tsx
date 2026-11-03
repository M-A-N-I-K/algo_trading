"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button, Callout, Panel, Stat, Tag, money, pct, signedNumber, tableClass, tdClass, thClass, toneClass } from "@/components/kit";
import CandlestickChart from "@/components/charts/CandlestickChart";
import type { OverlayMarker } from "@/components/charts/types";
import RHistogram from "@/components/viz/RHistogram";
import BreakdownTable from "@/components/viz/BreakdownTable";
import BacktestEquityChart from "./BacktestEquityChart";
import { fetchJson } from "@/lib/apiClient";
import { groupBy, JournalTrade, rHistogram } from "@/lib/journal/metrics";
import type { BacktestDetail, BacktestRoundTripRow } from "@/db/repositories/backtestRepository";
import type { Candle } from "@/domain/market-data/types";

const PAGE_SIZE = 50;

const EXIT_LABELS: Record<string, string> = {
  stop: "Stop",
  "trailing-stop": "Trailing stop",
  target: "Target",
  signal: "Signal exit",
  time: "Time exit",
  "end-of-data": "End of data",
};

const dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const num = (n: number, digits = 4) => n.toLocaleString(undefined, { maximumFractionDigits: digits });

// R = net / initial risk, so initial risk = net / R.
function toJournalTrade(t: BacktestRoundTripRow, i: number): JournalTrade {
  return {
    id: String(i),
    time: new Date(t.exitTime),
    openedAt: new Date(t.entryTime),
    pnl: t.netPnl,
    fees: t.fees,
    funding: 0,
    symbol: "",
    side: t.side,
    exitType: t.exitType,
    initialRiskAmount: t.rMultiple ? t.netPnl / t.rMultiple : null,
    quantity: t.quantity,
    entryPrice: t.entryPrice,
  };
}

function tradeMarkers(trades: BacktestRoundTripRow[]): OverlayMarker[] {
  const markers: OverlayMarker[] = [];
  for (const t of trades) {
    const long = t.side === "LONG";
    markers.push({
      time: Math.floor(t.entryTime / 1000),
      position: long ? "belowBar" : "aboveBar",
      color: long ? "#2fa97f" : "#e8646a",
      shape: long ? "arrowUp" : "arrowDown",
      text: long ? "L" : "S",
    });
    markers.push({
      time: Math.floor(t.exitTime / 1000),
      position: long ? "aboveBar" : "belowBar",
      color: t.netPnl >= 0 ? "#2fa97f" : "#e8646a",
      shape: "circle",
    });
  }
  // Lightweight Charts wants markers in time order.
  return markers.sort((a, b) => a.time - b.time);
}

export default function BacktestResults({ strategyId, backtestId }: { strategyId: string; backtestId: string }) {
  const [page, setPage] = useState(0);

  const query = useQuery({
    queryKey: ["backtest", backtestId],
    queryFn: () => fetchJson<{ backtest: BacktestDetail }>(`/api/backtests/${backtestId}`),
  });
  const bt = query.data?.backtest;

  const candlesQuery = useQuery({
    queryKey: ["backtest-candles", backtestId],
    queryFn: () => fetchJson<{ candles: Candle[] }>(`/api/backtests/${backtestId}/candles`),
    enabled: bt?.status === "COMPLETED",
  });

  const derived = useMemo(() => {
    if (!bt) return null;
    const journal = bt.roundTrips.map(toJournalTrade);
    return {
      bins: rHistogram(journal),
      byExit: groupBy(journal, (t) => t.exitType ?? "unknown").sort((a, b) => b.count - a.count),
      markers: tradeMarkers(bt.roundTrips),
    };
  }, [bt]);

  const back = (
    <Link href={`/strategies/${strategyId}/edit`} className="inline-flex items-center gap-1.5 text-[13px] text-fog hover:text-paper">
      <ArrowLeft size={14} aria-hidden="true" /> Back to strategy
    </Link>
  );

  if (query.isLoading) return <p className="text-sm text-fog">Loading backtest…</p>;
  if (query.isError || !bt) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <Callout tone="critical" title="Backtest not found">{query.error ? (query.error as Error).message : null}</Callout>
      </div>
    );
  }

  const c = bt.configuration;
  const m = bt.metrics;
  const trips = bt.roundTrips;
  const pageCount = Math.max(1, Math.ceil(trips.length / PAGE_SIZE));
  const pageRows = trips.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-2">
        {back}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-paper">
              {bt.strategyName || "Untitled strategy"} <span className="text-fog">v{bt.version}</span>
            </h1>
            <p className="mt-0.5 text-[13px] text-fog">
              {c.market.symbol} · {c.market.timeframe} · {dateFmt.format(new Date(c.range.from))} – {dateFmt.format(new Date(c.range.to))} ·{" "}
              {c.candleCount.toLocaleString()} candles · fee {signedNumber(c.execution.feeRate * 100, 3, "%").replace("+", "")} · slippage{" "}
              {signedNumber(c.execution.slippagePercent * 100, 3, "%").replace("+", "")} · leverage {c.execution.maxLeverage}×
            </p>
          </div>
          <div className="flex gap-1.5">
            <Tag tone={c.isDemo ? "fees" : "neutral"}>{c.isDemo ? "Synthetic demo data" : c.dataSource === "binance-futures" ? "Binance futures" : "Binance spot"}</Tag>
            {bt.status !== "COMPLETED" && <Tag tone={bt.status === "FAILED" ? "loss" : "signal"}>{bt.status === "FAILED" ? "Failed" : "Running"}</Tag>}
          </div>
        </div>
      </div>

      {bt.status === "FAILED" && (
        <Callout tone="critical" title="This backtest failed">
          {bt.error ?? "No reason was recorded."}
        </Callout>
      )}
      {c.isDemo && (
        <Callout tone="warning" title="Synthetic demo data">
          These candles are a seeded random walk, not market history. Use the results to check the strategy&apos;s mechanics, not its edge.
        </Callout>
      )}
      {!c.isDemo && bt.status === "COMPLETED" && (
        <p className="text-xs text-mist">
          {c.dataSource === "binance-futures"
            ? "Prices are Binance USDⓈ-M futures. CoinDCX futures track them closely but not exactly, so fills on the exchange would differ slightly."
            : "Prices are Binance spot. CoinDCX futures track spot closely but not exactly, so fills on the exchange would differ slightly."}
        </p>
      )}

      {m && (
        <>
          <section aria-label="Headline metrics" className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-[10px] border border-rule bg-deck p-5 sm:grid-cols-3 lg:grid-cols-5">
            <Stat size="lg" label="Return" value={signedNumber(m.totalReturnPercent, 2, "%")} tone={toneClass(m.totalReturnPercent)} note={`${money(m.initialCapital, { sign: false })} → ${money(m.finalEquity, { sign: false })}`} />
            <Stat label="Net P&L" value={money(m.netPnl)} tone={toneClass(m.netPnl)} note={`after ${money(m.totalFees, { sign: false })} fees`} />
            <Stat label="Win rate" value={m.winRate == null ? "—" : pct(m.winRate)} note={`${m.wins} of ${m.count} round trips`} />
            <Stat label="Profit factor" value={m.profitFactorInfinite ? "∞" : m.profitFactor == null ? "—" : m.profitFactor.toFixed(2)} />
            <Stat label="Expectancy" value={m.expectancy == null ? "—" : money(m.expectancy)} tone={m.expectancy == null ? undefined : toneClass(m.expectancy)} note="per round trip" />
            <Stat label="Average R" value={m.avgR == null ? "—" : signedNumber(m.avgR, 2, "R")} />
            <Stat label="Max drawdown" value={`${m.maxDrawdownPercent.toFixed(2)}%`} tone="text-loss-ink" note="mark-to-market" />
            <Stat label="Time in market" value={`${m.exposurePercent.toFixed(1)}%`} />
            <Stat label="Longest losing streak" value={String(m.longestLosingStreak)} />
            <Stat label="Test period" value={`${m.testPeriodDays.toFixed(1)} days`} />
          </section>

          {m.endOfDataExits > 0 && (
            <Callout tone="info">
              {m.endOfDataExits === 1 ? "One round trip was" : `${m.endOfDataExits} round trips were`} still open when the range ended and closed at the last candle&apos;s close.
            </Callout>
          )}

          <Panel title="Equity" note="Marked to market at every candle close. Drawdown is measured from the running peak.">
            <BacktestEquityChart equity={bt.equityCurve} drawdown={bt.drawdownCurve} initialCapital={m.initialCapital} />
          </Panel>

          <Panel title="Trades on the chart" note="Arrows mark entries; dots mark exits, coloured by whether the round trip made money.">
            {candlesQuery.isLoading ? (
              <p className="py-10 text-center text-sm text-fog">Loading candles…</p>
            ) : candlesQuery.data && candlesQuery.data.candles.length > 0 ? (
              <CandlestickChart candles={candlesQuery.data.candles} overlays={{ markers: derived?.markers ?? [] }} showVolume={false} height={420} />
            ) : (
              <p className="py-10 text-center text-sm text-fog">No candles stored for this range.</p>
            )}
          </Panel>

          <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel title="R-multiple distribution" note="Net P&L of each round trip in units of its initial risk.">
              <RHistogram bins={derived?.bins ?? []} avgR={m.avgR} />
            </Panel>
            <Panel title="How round trips ended">
              <BreakdownTable rows={derived?.byExit ?? []} keyLabel="Exit" columns="compact" labelOf={(k) => EXIT_LABELS[k] ?? k} />
            </Panel>
          </div>

          <Panel
            title="Round trips"
            note={`All ${trips.length.toLocaleString()}, oldest first. Times are UTC.`}
            aside={
              pageCount > 1 && (
                <div className="flex items-center gap-2 text-[13px] text-fog">
                  <Button size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                    Previous
                  </Button>
                  <span aria-live="polite">
                    {page + 1} / {pageCount}
                  </span>
                  <Button size="sm" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}>
                    Next
                  </Button>
                </div>
              )
            }
          >
            {trips.length === 0 ? (
              <p className="py-6 text-center text-sm text-fog">The strategy didn&apos;t trade in this range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className={`${tableClass} min-w-[56rem] whitespace-nowrap`}>
                  <thead>
                    <tr>
                      <th scope="col" className={thClass}>#</th>
                      <th scope="col" className={thClass}>Side</th>
                      <th scope="col" className={thClass}>Entry</th>
                      <th scope="col" className={`${thClass} text-right`}>Price</th>
                      <th scope="col" className={thClass}>Exit</th>
                      <th scope="col" className={`${thClass} text-right`}>Price</th>
                      <th scope="col" className={`${thClass} text-right`}>Quantity</th>
                      <th scope="col" className={thClass}>Exit type</th>
                      <th scope="col" className={`${thClass} text-right`}>R</th>
                      <th scope="col" className={`${thClass} text-right`}>MAE / MFE</th>
                      <th scope="col" className={`${thClass} text-right`}>Fees</th>
                      <th scope="col" className={`${thClass} text-right`}>Net P&amp;L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((t, i) => (
                      <tr key={page * PAGE_SIZE + i}>
                        <td className={`${tdClass} text-mist tabular-nums`}>{page * PAGE_SIZE + i + 1}</td>
                        <td className={tdClass}>
                          <Tag tone={t.side === "LONG" ? "gain" : "loss"}>{t.side === "LONG" ? "Long" : "Short"}</Tag>
                        </td>
                        <td className={`${tdClass} text-fog`}>{timeFmt.format(new Date(t.entryTime))}</td>
                        <td className={`${tdClass} text-right tabular-nums`}>{num(t.entryPrice)}</td>
                        <td className={`${tdClass} text-fog`}>{timeFmt.format(new Date(t.exitTime))}</td>
                        <td className={`${tdClass} text-right tabular-nums`}>{num(t.exitPrice)}</td>
                        <td className={`${tdClass} text-right tabular-nums`}>{num(t.quantity, 6)}</td>
                        <td className={tdClass}>
                          {t.exitType ? EXIT_LABELS[t.exitType] ?? t.exitType : "—"}
                          {t.legs.length > 1 && <span className="ml-1 text-xs text-mist">({t.legs.length} legs)</span>}
                        </td>
                        <td className={`${tdClass} text-right tabular-nums ${t.rMultiple == null ? "" : toneClass(t.rMultiple)}`}>
                          {t.rMultiple == null ? "—" : signedNumber(t.rMultiple, 2, "R")}
                        </td>
                        <td className={`${tdClass} text-right tabular-nums text-fog`}>
                          {t.mae == null ? "—" : money(-t.mae, { sign: false })} / {t.mfe == null ? "—" : money(t.mfe)}
                        </td>
                        <td className={`${tdClass} text-right tabular-nums text-fog`}>{money(t.fees, { sign: false })}</td>
                        <td className={`${tdClass} text-right font-medium tabular-nums ${toneClass(t.netPnl)}`}>{money(t.netPnl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
