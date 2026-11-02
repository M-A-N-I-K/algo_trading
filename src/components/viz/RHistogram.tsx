"use client";

import { useState } from "react";
import type { HistogramBin } from "@/lib/journal/metrics";
import { EmptyState, signedNumber, Tooltip, TipRow, useWidth, type TipState } from "./shared";

const H = 200;
const PAD = { left: 28, right: 8, top: 16, bottom: 24 };

function binLabel(b: HistogramBin, first: boolean, last: boolean) {
  if (first) return `${signedNumber(b.to, 1, "R")} or worse`;
  if (last) return `${signedNumber(b.from, 1, "R")} or better`;
  return `${signedNumber(b.from, 1, "R")} to ${signedNumber(b.to, 1, "R")}`;
}

export default function RHistogram({ bins, avgR }: { bins: HistogramBin[]; avgR: number | null }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const total = bins.reduce((s, b) => s + b.count, 0);

  if (total === 0) {
    return <EmptyState>Trades need a stop loss to have an R-multiple. Synced trades get one when the order had a stop attached.</EmptyState>;
  }

  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const slot = innerW / bins.length;
  const barW = Math.max(2, slot - 2); // 2px surface gap between bars
  const max = Math.max(...bins.map((b) => b.count));
  const y = (c: number) => PAD.top + (1 - c / max) * (H - PAD.top - PAD.bottom);
  const lo = bins[0].from;
  const hi = bins[bins.length - 1].to;
  const xv = (v: number) => PAD.left + ((v - lo) / (hi - lo)) * innerW;

  let tip: TipState | null = null;
  if (hover != null) {
    const b = bins[hover];
    tip = {
      x: PAD.left + hover * slot + slot / 2,
      y: y(b.count),
      content: (
        <>
          <p className="mb-1 text-paper">{binLabel(b, hover === 0, hover === bins.length - 1)}</p>
          <TipRow label="Trades" value={`${b.count} of ${total}`} />
        </>
      ),
    };
  }

  return (
    <div ref={ref} className="relative" style={{ height: H }}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={`R-multiple distribution of ${total} trades with a stop loss`}>
          <line x1={PAD.left} x2={width - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="var(--mist)" />
          <text x={PAD.left - 6} y={y(max)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--mist)">
            {max}
          </text>
          {bins.map((b, i) => {
            const top = y(b.count);
            const xLeft = PAD.left + i * slot + 1;
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={H - PAD.top - PAD.bottom} fill="transparent" />
                {b.count > 0 && (
                  <path
                    d={`M${xLeft},${H - PAD.bottom} V${top + 4} q0,-4 4,-4 H${xLeft + barW - 4} q4,0 4,4 V${H - PAD.bottom} Z`}
                    fill={b.to <= 0 ? "var(--loss)" : "var(--gain)"}
                    opacity={hover == null || hover === i ? 1 : 0.55}
                  />
                )}
              </g>
            );
          })}
          {[lo, 0, 1, 2, hi].filter((v, i, a) => v >= lo && v <= hi && a.indexOf(v) === i).map((v) => (
            <text key={v} x={xv(v)} y={H - 6} textAnchor={v === lo ? "start" : v === hi ? "end" : "middle"} fontSize={11} fill="var(--mist)">
              {v === 0 ? "0R" : signedNumber(v, 0, "R")}
            </text>
          ))}
          {avgR != null && (
            <g pointerEvents="none">
              <line x1={xv(Math.max(lo, Math.min(hi, avgR)))} x2={xv(Math.max(lo, Math.min(hi, avgR)))} y1={PAD.top - 6} y2={H - PAD.bottom} stroke="var(--paper)" strokeWidth={1.5} />
              <text x={xv(Math.max(lo, Math.min(hi, avgR))) + 5} y={PAD.top - 2} fontSize={11} fill="var(--paper)">
                avg {signedNumber(avgR, 2, "R")}
              </text>
            </g>
          )}
        </svg>
      )}
      <Tooltip tip={tip} containerWidth={width} />
    </div>
  );
}
