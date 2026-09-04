"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import CandlestickChart from "@/components/charts/CandlestickChart";
import { ChartOverlays, OverlayLine, OverlayMarker } from "@/components/charts/types";
import { fetchJson } from "@/lib/apiClient";
import { Candle } from "@/domain/market-data/types";
import {
  ConditionNode,
  Expression,
  IndicatorExpression,
  StrategyDefinition,
  createEvaluationContext,
  evaluateExpressionSeries,
  getIndicatorDefinition,
  getStrategyInterpreter,
} from "@/domain/strategies";
import { candlesToOhlc } from "@/domain/strategies/marketAdapter";

interface StrategyChartProps {
  definition: StrategyDefinition;
  // Indicators the user added purely for visualization, distinct from the
  // ones auto-detected from entry/exit/filter conditions (see the builder's
  // left-sidebar "Indicators" panel in the layout spec).
  manualIndicators?: IndicatorExpression[];
  height?: number;
}

const LINE_COLORS = ["#38bdf8", "#a78bfa", "#22d3ee", "#f472b6", "#fbbf24", "#34d399"];

// Walks every condition tree in the definition and collects indicator
// expressions that make sense to plot on the price chart (overlay pane,
// and not volume-sourced — a volume-scaled SMA would misrender against a
// price y-axis).
function collectOverlayIndicators(definition: StrategyDefinition): IndicatorExpression[] {
  const found: IndicatorExpression[] = [];

  const visitExpression = (expr: Expression) => {
    if (expr.type === "indicator") {
      const def = getIndicatorDefinition(expr.indicator);
      const sourceIsVolume = expr.source?.type === "volume";
      if (def.chartPane === "overlay" && !sourceIsVolume) found.push(expr);
      if (expr.source) visitExpression(expr.source);
    }
  };

  const visitNode = (node: ConditionNode) => {
    if (node.type === "condition") {
      visitExpression(node.left);
      if (node.right) visitExpression(node.right);
    } else {
      node.conditions.forEach(visitNode);
    }
  };

  if (definition.entry.long) visitNode(definition.entry.long.conditions);
  if (definition.entry.short) visitNode(definition.entry.short.conditions);
  if (definition.exit.signalExit) visitNode(definition.exit.signalExit.conditions);
  if (definition.filters) visitNode(definition.filters);

  return found;
}

export default function StrategyChart({ definition, manualIndicators = [], height = 480 }: StrategyChartProps) {
  const instrumentId = definition.market.instrumentId;

  const candlesQuery = useQuery({
    queryKey: ["strategy-chart-candles", instrumentId, definition.timeframe],
    queryFn: () =>
      fetchJson<{ candles: Candle[] }>(`/api/instruments/${instrumentId}/candles?timeframe=${definition.timeframe}&limit=1000`),
    enabled: !!instrumentId,
  });

  const candles = candlesQuery.data?.candles ?? [];

  const overlays: ChartOverlays = useMemo(() => {
    if (candles.length === 0) return {};

    const ohlc = candlesToOhlc(candles);
    const ctx = createEvaluationContext(ohlc);
    const indicatorExprs = [...collectOverlayIndicators(definition), ...manualIndicators];

    const lines: OverlayLine[] = indicatorExprs.map((expr, i) => {
      const def = getIndicatorDefinition(expr.indicator);
      const outputLabel = expr.output ? def.outputs.find((o) => o.id === expr.output)?.label : undefined;
      const series = evaluateExpressionSeries(expr, ctx);
      return {
        id: `${expr.indicator}-${i}`,
        label: `${def.label}${outputLabel ? ` (${outputLabel})` : ""}`,
        color: LINE_COLORS[i % LINE_COLORS.length],
        points: series
          .map((value, idx) => ({ time: Math.floor(new Date(candles[idx].timestamp).getTime() / 1000), value }))
          .filter((p) => Number.isFinite(p.value)),
      };
    });

    const interpreter = getStrategyInterpreter();
    const markers: OverlayMarker[] = [];
    for (let t = 0; t < ohlc.length; t++) {
      const signal = interpreter.evaluateEntry(definition, ctx, t);
      const time = Math.floor(new Date(candles[t].timestamp).getTime() / 1000);
      if (signal.long) markers.push({ time, position: "belowBar", color: "#34d399", shape: "arrowUp", text: "LONG" });
      if (signal.short) markers.push({ time, position: "aboveBar", color: "#f87171", shape: "arrowDown", text: "SHORT" });
    }

    return { lines, markers };
  }, [candles, definition, manualIndicators]);

  if (!instrumentId) {
    return <div className="flex items-center justify-center h-[480px] text-sm text-slate-500 border border-slate-800 rounded-xl">Select an instrument to preview the chart.</div>;
  }
  if (candlesQuery.isLoading) {
    return <div className="flex items-center justify-center h-[480px] text-sm text-slate-500 border border-slate-800 rounded-xl">Loading chart…</div>;
  }

  return <CandlestickChart candles={candles} overlays={overlays} showVolume height={height} />;
}
