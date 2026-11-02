"use client";

import { useState } from "react";
import type { HeatCell } from "@/lib/journal/metrics";
import { money, Tooltip, TipRow, useWidth, type TipState } from "./shared";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LABEL_W = 34;
const CELL_GAP = 2;

// Diverging: loss ↔ neutral ↔ gain. Intensity is sqrt-scaled so a single
// large trade doesn't wash every other cell out to the midpoint.
function cellColor(net: number, maxAbs: number): string {
  if (maxAbs === 0) return "var(--deck-2)";
  const t = Math.sqrt(Math.min(1, Math.abs(net) / maxAbs));
  const pole = net >= 0 ? "var(--gain)" : "var(--loss)";
  return `color-mix(in oklab, ${pole} ${Math.round(18 + t * 82)}%, var(--deck-2))`;
}

export default function WeekdayHourHeatmap({ cells }: { cells: HeatCell[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<HeatCell | null>(null);
  const maxAbs = Math.max(0, ...cells.filter((c) => c.count).map((c) => Math.abs(c.net)));

  const cell = Math.max(8, Math.floor((width - LABEL_W) / 24) - CELL_GAP);
  const h = 7 * (cell + CELL_GAP) + 20;

  let tip: TipState | null = null;
  if (hover) {
    tip = {
      x: LABEL_W + hover.hour * (cell + CELL_GAP) + cell / 2,
      y: hover.weekday * (cell + CELL_GAP),
      content: (
        <>
          <p className="mb-1 text-paper">
            {DAYS[hover.weekday]} {String(hover.hour).padStart(2, "0")}:00 to {String((hover.hour + 1) % 24).padStart(2, "0")}:00
          </p>
          <TipRow label="Trades opened" value={hover.count} />
          <TipRow label="Net" value={money(hover.net)} />
        </>
      ),
    };
  }

  return (
    <div>
      <div ref={ref} className="relative" style={{ height: h }}>
        {width > 0 && (
          <svg width={width} height={h} role="img" aria-label="Net P&L by weekday and hour the trade was opened">
            {DAYS.map((d, wd) => (
              <text key={d} x={0} y={wd * (cell + CELL_GAP) + cell / 2} dy="0.32em" fontSize={11} fill="var(--mist)">
                {d}
              </text>
            ))}
            {cells.map((c) => (
              <rect
                key={`${c.weekday}-${c.hour}`}
                x={LABEL_W + c.hour * (cell + CELL_GAP)}
                y={c.weekday * (cell + CELL_GAP)}
                width={cell}
                height={cell}
                rx={2}
                fill={c.count ? cellColor(c.net, maxAbs) : "var(--deck-2)"}
                fillOpacity={c.count ? 1 : 0.45}
                stroke={hover === c ? "var(--paper)" : "none"}
                strokeWidth={1.5}
                onMouseEnter={() => setHover(c)}
                onMouseLeave={() => setHover(null)}
              />
            ))}
            {[0, 6, 12, 18, 23].map((hr) => (
              <text
                key={hr}
                x={LABEL_W + hr * (cell + CELL_GAP) + cell / 2}
                y={h - 4}
                textAnchor="middle"
                fontSize={11}
                fill="var(--mist)"
              >
                {String(hr).padStart(2, "0")}
              </text>
            ))}
          </svg>
        )}
        <Tooltip tip={tip} containerWidth={width} />
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-fog">
        <span>Losing</span>
        <span
          className="h-2 w-28 rounded-full"
          style={{
            background: "linear-gradient(90deg, var(--loss), color-mix(in oklab, var(--loss) 18%, var(--deck-2)), var(--deck-2), color-mix(in oklab, var(--gain) 18%, var(--deck-2)), var(--gain))",
          }}
        />
        <span>Winning</span>
        <span className="ml-2 text-mist">Your local time, by when the trade opened</span>
      </div>
    </div>
  );
}
