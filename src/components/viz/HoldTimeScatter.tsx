"use client";

import { useMemo, useState } from "react";
import { EmptyState, duration, money, Tooltip, TipRow, useWidth, type TipState } from "./shared";

export interface HoldPoint {
  id: string;
  minutes: number;
  net: number;
  symbol: string;
  side: "LONG" | "SHORT";
}

const H = 220;
const PAD = { left: 52, right: 12, top: 10, bottom: 24 };
const TICKS = [1, 5, 15, 60, 240, 1440, 4320, 10080];

export default function HoldTimeScatter({ points }: { points: HoldPoint[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<HoldPoint | null>(null);

  const geo = useMemo(() => {
    if (!width || points.length === 0) return null;
    const mins = points.map((p) => Math.max(1, p.minutes));
    const xLo = Math.log10(Math.min(...mins) * 0.8);
    const xHi = Math.log10(Math.max(...mins) * 1.25);
    const absMax = Math.max(...points.map((p) => Math.abs(p.net))) * 1.1 || 1;
    const x = (m: number) => PAD.left + ((Math.log10(Math.max(1, m)) - xLo) / (xHi - xLo || 1)) * (width - PAD.left - PAD.right);
    const y = (v: number) => PAD.top + (1 - (v + absMax) / (2 * absMax)) * (H - PAD.top - PAD.bottom);
    const ticks = TICKS.filter((t) => Math.log10(t) >= xLo && Math.log10(t) <= xHi);
    return { x, y, absMax, ticks };
  }, [points, width]);

  if (points.length === 0) {
    return <EmptyState>Hold time appears for trades synced with an open time. Run a sync to backfill it.</EmptyState>;
  }

  let tip: TipState | null = null;
  if (geo && hover) {
    tip = {
      x: geo.x(hover.minutes),
      y: geo.y(hover.net),
      content: (
        <>
          <p className="mb-1 text-paper">
            {hover.symbol} {hover.side === "LONG" ? "long" : "short"}
          </p>
          <TipRow label="Held" value={duration(hover.minutes)} />
          <TipRow label="Net" value={money(hover.net)} />
        </>
      ),
    };
  }

  return (
    <div ref={ref} className="relative" style={{ height: H }}>
      {geo && (
        <svg width={width} height={H} role="img" aria-label={`Net P&L against hold time for ${points.length} trades`}>
          {[geo.absMax / 1.1, 0, -geo.absMax / 1.1].map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={geo.y(v)} y2={geo.y(v)} stroke={v === 0 ? "var(--mist)" : "var(--rule)"} />
              <text x={PAD.left - 8} y={geo.y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--mist)">
                {money(v, { digits: 0 })}
              </text>
            </g>
          ))}
          {geo.ticks.map((t) => (
            <text key={t} x={geo.x(t)} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--mist)">
              {duration(t)}
            </text>
          ))}
          {points.map((p) => (
            <circle
              key={p.id}
              cx={geo.x(p.minutes)}
              cy={geo.y(p.net)}
              r={hover?.id === p.id ? 6 : 4}
              fill={p.net >= 0 ? "var(--gain)" : "var(--loss)"}
              fillOpacity={0.85}
              stroke="var(--deck)"
              strokeWidth={2}
              onMouseEnter={() => setHover(p)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
      )}
      <Tooltip tip={tip} containerWidth={width} />
    </div>
  );
}
