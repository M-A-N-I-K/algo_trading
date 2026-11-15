"use client";

import { useMemo, useState, type PointerEvent, type KeyboardEvent } from "react";
import type { TimelinePoint } from "@/lib/testerReports/report";

// Balance (top) and drawdown below the running high (bottom) on one time axis,
// in dollars and % at the home account's risk. One crosshair drives both.

const W = 800;
const PAD = { l: 56, r: 12 };
const TOP_H = 210, GAP = 14, BOT_H = 110, AXIS_H = 20;
const H = TOP_H + GAP + BOT_H + AXIS_H;

const usd = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString()}`;
const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function niceStep(range: number, target: number) {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  return ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
}

export default function BalanceChart({ points, riskPct, size, maxLossPct, accountName }: { points: TimelinePoint[]; riskPct: number; size: number; maxLossPct: number; accountName: string }) {
  const [hover, setHover] = useState<number | null>(null);

  const g = useMemo(() => {
    const t0 = points[0].t, t1 = points[points.length - 1].t;
    const bal = (r: number) => size * (1 + (r * riskPct) / 100);
    const dd = (p: TimelinePoint) => -p.ddR * riskPct; // % of the starting balance, ≤ 0
    const balances = points.map((p) => bal(p.r));
    const lo = Math.min(size, ...balances), hi = Math.max(size, ...balances);
    const ddLo = Math.min(-maxLossPct * 1.08, ...points.map(dd));
    const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0 || 1)) * (W - PAD.l - PAD.r);
    const yB = (v: number) => 6 + (1 - (v - lo) / (hi - lo || 1)) * (TOP_H - 12);
    const yD = (v: number) => TOP_H + GAP + (v / ddLo) * BOT_H;
    const bStep = niceStep(hi - lo, 4);
    const bTicks: number[] = [];
    for (let v = Math.ceil(lo / bStep) * bStep; v <= hi; v += bStep) bTicks.push(v);
    const dStep = niceStep(-ddLo, 3);
    const dTicks: number[] = [];
    for (let v = 0; v >= ddLo; v -= dStep) dTicks.push(v);
    const years: number[] = [];
    for (let y = new Date(t0).getUTCFullYear() + 1; Date.UTC(y, 0, 1) <= t1; y++) years.push(y);
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${yB(bal(p.r)).toFixed(1)}`).join("");
    const area = `M${x(t0).toFixed(1)},${yD(0)}` + points.map((p) => `L${x(p.t).toFixed(1)},${yD(dd(p)).toFixed(1)}`).join("") + `L${x(t1).toFixed(1)},${yD(0)}Z`;
    const worst = points.reduce((a, b) => (b.ddR > a.ddR ? b : a));
    return { x, yB, yD, bal, dd, bTicks, dTicks, years, line, area, worst };
  }, [points, riskPct, size, maxLossPct]);

  const nearest = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(g.x(points[i].t) - px) < Math.abs(g.x(points[best].t) - px)) best = i;
    return best;
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => setHover(nearest(e.clientX, e.currentTarget.getBoundingClientRect()));
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = Math.max(1, Math.round(points.length / 50));
    setHover((h) => Math.min(points.length - 1, Math.max(0, (h ?? points.length - 1) + (e.key === "ArrowRight" ? step : -step))));
  };

  const p = hover !== null ? points[hover] : null;
  const end = points[points.length - 1];
  const floorY = g.yD(-maxLossPct);

  return (
    <figure className="relative m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-signal"
        role="img"
        tabIndex={0}
        aria-label={`Balance on the ${accountName} at ${riskPct}% a trade: from ${usd(size)} to ${usd(g.bal(end.r))} over ${end.i} trades; deepest drawdown ${(g.worst.ddR * riskPct).toFixed(1)}% against a ${maxLossPct}% limit. Use the arrow keys to step through.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
      >
        {/* balance grid */}
        {g.bTicks.map((v) => (
          <g key={`b${v}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={g.yB(v)} y2={g.yB(v)} className={v === size ? "stroke-mist" : "stroke-rule"} strokeDasharray={v === size ? "3 3" : undefined} />
            <text x={PAD.l - 6} y={g.yB(v) + 4} textAnchor="end" className="fill-mist text-[11px]">{usd(v)}</text>
          </g>
        ))}
        {/* drawdown grid and the firm's max loss */}
        {g.dTicks.map((v) => (
          <g key={`d${v}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={g.yD(v)} y2={g.yD(v)} className="stroke-rule" />
            <text x={PAD.l - 6} y={g.yD(v) + 4} textAnchor="end" className="fill-mist text-[11px]">{v === 0 ? "0%" : `${v.toFixed(v % 1 ? 1 : 0)}%`}</text>
          </g>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={floorY} y2={floorY} className="stroke-loss-ink" strokeDasharray="5 4" />
        <text x={W - PAD.r} y={floorY - 5} textAnchor="end" className="fill-loss-ink text-[11px]">Max loss −{maxLossPct}%</text>
        <text x={W - PAD.r} y={TOP_H + GAP - 3} textAnchor="end" className="fill-mist text-[11px]">Drawdown, below the high ↓</text>
        {/* year marks */}
        {g.years.map((y) => {
          const xx = g.x(Date.UTC(y, 0, 1));
          return (
            <g key={y}>
              <line x1={xx} x2={xx} y1={0} y2={TOP_H + GAP + BOT_H} className="stroke-rule" strokeDasharray="2 4" />
              <text x={xx} y={H - 5} textAnchor="middle" className="fill-mist text-[11px]">{y}</text>
            </g>
          );
        })}
        <path d={g.area} className="fill-loss/35" />
        <path d={g.line} fill="none" className="stroke-gain" strokeWidth={2} strokeLinejoin="round" />
        {/* crosshair */}
        {p && (
          <g pointerEvents="none">
            <line x1={g.x(p.t)} x2={g.x(p.t)} y1={0} y2={TOP_H + GAP + BOT_H} className="stroke-fog" />
            <circle cx={g.x(p.t)} cy={g.yB(g.bal(p.r))} r={4} className="fill-gain stroke-deck" strokeWidth={2} />
            <circle cx={g.x(p.t)} cy={g.yD(g.dd(p))} r={4} className="fill-loss stroke-deck" strokeWidth={2} />
          </g>
        )}
      </svg>
      {p && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-[8px] border border-rule bg-deck-2 px-3 py-2 text-[12px] shadow-lg"
          style={g.x(p.t) > W / 2 ? { right: `${((W - g.x(p.t)) / W) * 100 + 2}%` } : { left: `${(g.x(p.t) / W) * 100 + 2}%` }}
          aria-hidden="true"
        >
          <p className="text-mist">{fmtDate(p.t)} · trade {p.i}</p>
          <p className="mt-1 flex items-center gap-2"><span className="h-0.5 w-3 bg-gain" /><span className="font-semibold tabular-nums text-paper">{usd(g.bal(p.r))}</span><span className="text-fog">balance ({p.r >= 0 ? "+" : ""}{p.r.toFixed(1)}R)</span></p>
          <p className="mt-0.5 flex items-center gap-2"><span className="h-0.5 w-3 bg-loss" /><span className="font-semibold tabular-nums text-paper">{p.ddR ? `−${(p.ddR * riskPct).toFixed(2)}%` : "0%"}</span><span className="text-fog">below the high</span></p>
        </div>
      )}
      <figcaption className="mt-2 text-xs text-mist">
        Balance and drawdown on the {accountName} at {riskPct}% a trade, starting from {usd(size)}. The red band is how far the balance sat below its highest point.
      </figcaption>
    </figure>
  );
}
