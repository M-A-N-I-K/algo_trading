"use client";

import { useEffect, useRef } from "react";
import { AreaSeries, ColorType, LineSeries, UTCTimestamp, createChart } from "lightweight-charts";

const EQUITY = "#9db4ff";
const DRAWDOWN = "#e8646a";

// Mark-to-market equity by time, with drawdown from the running peak
// in a pane underneath. Points are already sampled for display.
export default function BacktestEquityChart({
  equity,
  drawdown,
  initialCapital,
  height = 340,
}: {
  equity: { time: number; equity: number }[];
  drawdown: { time: number; drawdownPercent: number }[];
  initialCapital: number;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || equity.length === 0) return;
    const chart = createChart(ref.current, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#a3a8bf", fontSize: 11 },
      grid: { vertLines: { color: "rgba(143, 164, 163, 0.08)" }, horzLines: { color: "rgba(143, 164, 163, 0.08)" } },
      rightPriceScale: { borderColor: "rgba(143, 164, 163, 0.15)" },
      timeScale: { borderColor: "rgba(143, 164, 163, 0.15)", timeVisible: true, secondsVisible: false },
      autoSize: true,
    });

    // Lightweight Charts needs strictly increasing times.
    const dedupe = <T extends { time: UTCTimestamp }>(rows: T[]) => rows.filter((r, i) => i === 0 || r.time > rows[i - 1].time);
    const toSec = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp;

    const equitySeries = chart.addSeries(LineSeries, { color: EQUITY, lineWidth: 2, priceLineVisible: false, title: "Equity" });
    equitySeries.setData(dedupe(equity.map((p) => ({ time: toSec(p.time), value: p.equity }))));
    equitySeries.createPriceLine({ price: initialCapital, color: "rgba(163, 168, 191, 0.5)", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "Start" });

    const ddSeries = chart.addSeries(
      AreaSeries,
      {
        lineColor: DRAWDOWN,
        topColor: "rgba(232, 100, 106, 0.05)",
        bottomColor: "rgba(232, 100, 106, 0.35)",
        lineWidth: 1,
        priceLineVisible: false,
        priceFormat: { type: "custom", formatter: (v: number) => `${v.toFixed(1)}%` },
        title: "Drawdown",
      },
      1,
    );
    ddSeries.setData(dedupe(drawdown.map((p) => ({ time: toSec(p.time), value: -p.drawdownPercent }))));
    chart.panes()[1]?.setHeight(Math.round(height * 0.28));
    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [equity, drawdown, initialCapital, height]);

  return (
    <div
      ref={ref}
      style={{ height }}
      className="w-full"
      role="img"
      aria-label="Equity over time, with drawdown from the running peak underneath"
    />
  );
}
