"use client";

import { useMemo, useState } from "react";
import type { EquityPoint } from "@/lib/journal/metrics";
import { EmptyState, Legend, money, Tooltip, TipRow, useWidth, type TipState } from "./shared";

const MAIN_H = 240;
const DD_H = 72;
const GAP = 18;
const PAD = { left: 56, right: 12, top: 10, bottom: 22 };

function niceTicks(lo: number, hi: number, count = 4): number[] {
  const span = hi - lo || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? raw;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const fullDateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function EquityChart({ series }: { series: EquityPoint[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    if (!width || series.length === 0) return null;
    const points = [{ time: series[0].time, gross: 0, net: 0, drawdown: 0 }, ...series];
    const innerW = width - PAD.left - PAD.right;
    const values = points.flatMap((p) => [p.gross, p.net, 0]);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const ticks = niceTicks(lo, hi);
    const yLo = Math.min(lo, ticks[0]);
    const yHi = Math.max(hi, ticks[ticks.length - 1]);
    // Equal spacing per trade: the x axis is trade sequence, so bursts of
    // trades on one day don't collapse into a vertical smear.
    const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = (v: number) => PAD.top + (1 - (v - yLo) / (yHi - yLo || 1)) * (MAIN_H - PAD.top - PAD.bottom);
    const ddLo = Math.min(-1e-9, ...points.map((p) => p.drawdown));
    const ddTop = MAIN_H + GAP;
    const yd = (v: number) => ddTop + (v / ddLo) * (DD_H - 6);
    const line = (key: "gross" | "net") => points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p[key])}`).join("");
    const gap =
      points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.gross)}`).join("") +
      [...points].reverse().map((p, j) => `L${x(points.length - 1 - j)},${y(p.net)}`).join("") +
      "Z";
    const dd =
      `M${x(0)},${yd(0)}` + points.map((p, i) => `L${x(i)},${yd(p.drawdown)}`).join("") + `L${x(points.length - 1)},${yd(0)}Z`;
    const labelIdx = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((v, i, a) => a.indexOf(v) === i);
    return { points, x, y, yd, ticks, ddLo, ddTop, gross: line("gross"), net: line("net"), gap, dd, innerW, labelIdx };
  }, [series, width]);

  const total = MAIN_H + GAP + DD_H;

  let tip: TipState | null = null;
  if (geo && hover != null) {
    const p = geo.points[hover];
    tip = {
      x: geo.x(hover),
      y: geo.y(p.net),
      content: (
        <>
          <p className="mb-1 text-paper">{hover === 0 ? "Start" : `Trade ${hover}, ${fullDateFmt.format(p.time)}`}</p>
          <TipRow label="Gross" value={money(p.gross)} swatch="var(--fog)" />
          <TipRow label="Net" value={money(p.net)} swatch="var(--paper)" />
          <TipRow label="Costs so far" value={money(p.net - p.gross)} swatch="var(--fees)" />
          <TipRow label="Below peak" value={money(p.drawdown)} swatch="var(--loss)" />
        </>
      ),
    };
  }

  return (
    <div>
      <div className="mb-3">
        <Legend
          items={[
            { label: "Gross (price only)", color: "var(--fog)", shape: "line" },
            { label: "Net", color: "var(--paper)", shape: "line" },
            { label: "Fees and funding", color: "color-mix(in oklab, var(--fees) 45%, transparent)", shape: "block" },
            { label: "Drawdown from peak", color: "color-mix(in oklab, var(--loss) 55%, transparent)", shape: "block" },
          ]}
        />
      </div>
      <div ref={ref} className="relative" style={{ height: total }}>
        {series.length === 0 ? (
          <EmptyState>Close a trade to start the equity curve.</EmptyState>
        ) : (
          geo && (
            <svg
              width={width}
              height={total}
              role="img"
              aria-label={`Cumulative P&L over ${series.length} trades. Net ends at ${money(series[series.length - 1].net)}, gross at ${money(series[series.length - 1].gross)}.`}
              onMouseLeave={() => setHover(null)}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const mx = e.clientX - rect.left - PAD.left;
                const i = Math.round((mx / geo.innerW) * (geo.points.length - 1));
                setHover(Math.max(0, Math.min(geo.points.length - 1, i)));
              }}
            >
              {geo.ticks.map((t) => (
                <g key={t}>
                  <line x1={PAD.left} x2={width - PAD.right} y1={geo.y(t)} y2={geo.y(t)} stroke={t === 0 ? "var(--mist)" : "var(--rule)"} strokeWidth={1} />
                  <text x={PAD.left - 8} y={geo.y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--mist)">
                    {money(t, { digits: Math.abs(t) < 10 && t !== 0 ? 1 : 0 })}
                  </text>
                </g>
              ))}

              <path d={geo.gap} fill="var(--fees)" fillOpacity={0.22} />
              <path d={geo.gross} fill="none" stroke="var(--fog)" strokeWidth={1.5} strokeLinejoin="round" />
              <path d={geo.net} fill="none" stroke="var(--paper)" strokeWidth={2} strokeLinejoin="round" />

              {/* drawdown strip */}
              <line x1={PAD.left} x2={width - PAD.right} y1={geo.ddTop} y2={geo.ddTop} stroke="var(--mist)" strokeWidth={1} />
              <path d={geo.dd} fill="var(--loss)" fillOpacity={0.45} />
              <text x={PAD.left - 8} y={geo.ddTop} dy="0.9em" textAnchor="end" fontSize={11} fill="var(--mist)">
                $0
              </text>
              <text x={PAD.left - 8} y={geo.yd(geo.ddLo)} textAnchor="end" fontSize={11} fill="var(--mist)">
                {money(geo.ddLo, { digits: 0 })}
              </text>

              {geo.labelIdx.map((i) => (
                <text
                  key={i}
                  x={geo.x(i)}
                  y={MAIN_H - 4}
                  fontSize={11}
                  fill="var(--mist)"
                  textAnchor={i === 0 ? "start" : i === geo.points.length - 1 ? "end" : "middle"}
                >
                  {dateFmt.format(geo.points[i].time)}
                </text>
              ))}

              {hover != null && (
                <g pointerEvents="none">
                  <line x1={geo.x(hover)} x2={geo.x(hover)} y1={PAD.top} y2={total} stroke="var(--fog)" strokeWidth={1} />
                  <circle cx={geo.x(hover)} cy={geo.y(geo.points[hover].gross)} r={4} fill="var(--fog)" stroke="var(--deck)" strokeWidth={2} />
                  <circle cx={geo.x(hover)} cy={geo.y(geo.points[hover].net)} r={4.5} fill="var(--paper)" stroke="var(--deck)" strokeWidth={2} />
                </g>
              )}
            </svg>
          )
        )}
        <Tooltip tip={tip} containerWidth={width} />
      </div>
    </div>
  );
}
