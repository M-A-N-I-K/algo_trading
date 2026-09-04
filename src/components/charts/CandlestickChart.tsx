"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  CandlestickData,
  ColorType,
  CrosshairMode,
  HistogramData,
  HistogramSeries,
  IChartApi,
  ISeriesApi,
  LineSeries,
  Time,
  UTCTimestamp,
  createChart,
  createSeriesMarkers,
} from "lightweight-charts";
import { Candle } from "@/domain/market-data/types";
import { ChartOverlays } from "./types";

interface CandlestickChartProps {
  candles: Candle[];
  overlays?: ChartOverlays;
  showVolume?: boolean;
  height?: number;
}

interface OhlcReadout {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function toUnixSeconds(isoTimestamp: string): UTCTimestamp {
  return Math.floor(new Date(isoTimestamp).getTime() / 1000) as UTCTimestamp;
}

// A thin, source-agnostic wrapper around Lightweight Charts. Callers pass
// domain `Candle[]` (never a vendor-specific shape) plus a declarative
// `overlays` prop — indicator lines, entry/exit markers, and stop/target
// price lines can all be layered on without this component knowing what
// produced them (an indicator engine, a strategy signal, or a backtest).
export default function CandlestickChart({ candles, overlays, showVolume = true, height = 500 }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lineSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const priceLineRefs = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[]>([]);

  const [ohlc, setOhlc] = useState<OhlcReadout | null>(null);

  // Chart lifecycle: created once per mount, torn down on unmount.
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.08)" },
        horzLines: { color: "rgba(148, 163, 184, 0.08)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(148, 163, 184, 0.15)" },
      timeScale: { borderColor: "rgba(148, 163, 184, 0.15)", timeVisible: true, secondsVisible: false },
      autoSize: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#f43f5e",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#f43f5e",
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    if (showVolume) {
      const volumeSeries = chart.addSeries(
        HistogramSeries,
        { priceFormat: { type: "volume" }, priceScaleId: "" },
        1, // separate pane below price
      );
      chart.panes()[1]?.setHeight(Math.round(height * 0.2));
      volumeSeriesRef.current = volumeSeries;
    }

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.size) {
        setOhlc(null);
        return;
      }
      const bar = param.seriesData.get(candleSeries) as CandlestickData<Time> | undefined;
      const vol = volumeSeriesRef.current ? (param.seriesData.get(volumeSeriesRef.current) as HistogramData<Time> | undefined) : undefined;
      if (!bar) {
        setOhlc(null);
        return;
      }
      setOhlc({
        time: typeof param.time === "number" ? new Date(param.time * 1000).toLocaleString() : String(param.time),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: vol?.value ?? 0,
      });
    });

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      lineSeriesRef.current.clear();
      priceLineRefs.current = [];
    };
  }, [showVolume, height]);

  // Candle/volume data updates.
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    const candleData: CandlestickData<Time>[] = candles.map((c) => ({
      time: toUnixSeconds(c.timestamp),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candleSeries.setData(candleData);

    if (volumeSeriesRef.current) {
      const volumeData: HistogramData<Time>[] = candles.map((c) => ({
        time: toUnixSeconds(c.timestamp),
        value: c.volume,
        color: c.close >= c.open ? "rgba(16, 185, 129, 0.5)" : "rgba(244, 63, 94, 0.5)",
      }));
      volumeSeriesRef.current.setData(volumeData);
    }

    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // Overlay lines (EMA/SMA/VWAP/...).
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    for (const series of lineSeriesRef.current.values()) {
      chart.removeSeries(series);
    }
    lineSeriesRef.current.clear();

    for (const line of overlays?.lines ?? []) {
      const series = chart.addSeries(LineSeries, { color: line.color, lineWidth: 2, title: line.label });
      series.setData(line.points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
      lineSeriesRef.current.set(line.id, series);
    }
  }, [overlays?.lines]);

  // Overlay markers (entry/exit signals, backtest trades).
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    const markersPlugin = createSeriesMarkers(
      candleSeries,
      (overlays?.markers ?? []).map((m) => ({
        time: m.time as UTCTimestamp,
        position: m.position,
        color: m.color,
        shape: m.shape,
        text: m.text,
      })),
    );

    return () => markersPlugin.detach();
  }, [overlays?.markers]);

  // Overlay price lines (stop-loss / take-profit).
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    for (const priceLine of priceLineRefs.current) {
      candleSeries.removePriceLine(priceLine);
    }
    priceLineRefs.current = [];

    for (const pl of overlays?.priceLines ?? []) {
      const created = candleSeries.createPriceLine({
        price: pl.price,
        color: pl.color,
        title: pl.title,
        lineStyle: pl.lineStyle === "dashed" ? 2 : pl.lineStyle === "dotted" ? 1 : 0,
        lineWidth: 1,
      });
      priceLineRefs.current.push(created);
    }
  }, [overlays?.priceLines]);

  return (
    <div className="relative w-full" style={{ height }}>
      {ohlc && (
        <div className="absolute top-2 left-2 z-10 flex flex-wrap gap-x-3 gap-y-1 bg-slate-950/80 backdrop-blur-sm border border-slate-800 rounded-lg px-3 py-1.5 text-[11px] font-mono">
          <span className="text-slate-500">{ohlc.time}</span>
          <span className="text-slate-400">O <span className="text-slate-200">{ohlc.open.toFixed(2)}</span></span>
          <span className="text-slate-400">H <span className="text-slate-200">{ohlc.high.toFixed(2)}</span></span>
          <span className="text-slate-400">L <span className="text-slate-200">{ohlc.low.toFixed(2)}</span></span>
          <span className={`font-semibold ${ohlc.close >= ohlc.open ? "text-emerald-400" : "text-rose-400"}`}>C {ohlc.close.toFixed(2)}</span>
          <span className="text-slate-500">Vol {ohlc.volume.toLocaleString()}</span>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
