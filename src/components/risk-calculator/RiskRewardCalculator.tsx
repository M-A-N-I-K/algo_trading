"use client";

import { useState } from "react";
import { Crosshair } from "lucide-react";
import { PositionSide, computeRiskReward, formatPercent, formatRR } from "@/lib/riskCalculator";
import { ExpandableFormula, NumberField, SectionCard, StatBlock } from "./shared";

export default function RiskRewardCalculator() {
  const [side, setSide] = useState<PositionSide>("LONG");
  const [entry, setEntry] = useState<number | null>(100);
  const [stop, setStop] = useState<number | null>(95);
  const [target, setTarget] = useState<number | null>(115);

  const result = computeRiskReward({
    entryPrice: entry ?? 0,
    stopLossPrice: stop ?? 0,
    takeProfitPrice: target ?? 0,
    side,
  });

  const low = Math.min(entry ?? 0, stop ?? 0, target ?? 0);
  const high = Math.max(entry ?? 0, stop ?? 0, target ?? 0);
  const span = Math.max(1e-9, high - low);
  const pos = (v: number) => ((v - low) / span) * 100;

  return (
    <SectionCard title="Risk / Reward Calculator" icon={<Crosshair size={16} className="text-primary" />}>
      <div className="flex items-center rounded-xl border border-border bg-muted/40 p-1 text-xs font-semibold w-fit">
        {(["LONG", "SHORT"] as PositionSide[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSide(s)}
            className={`px-4 py-1.5 rounded-lg transition-all ${
              side === s
                ? s === "LONG"
                  ? "bg-emerald-500/20 text-emerald-500"
                  : "bg-rose-500/20 text-rose-500"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <NumberField label="Entry" value={entry} onChange={setEntry} step={0.01} />
        <NumberField label="Stop-Loss" value={stop} onChange={setStop} step={0.01} />
        <NumberField label="Take-Profit" value={target} onChange={setTarget} step={0.01} />
      </div>

      {result.error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-xs font-semibold text-destructive">
          ⚠️ {result.error}
        </div>
      )}

      {result.valid && entry !== null && stop !== null && target !== null && (
        <>
          {/* Entry -> Stop -> Take-Profit visualization */}
          <div className="relative h-14 mt-2 mb-4">
            <div className="absolute top-1/2 left-0 right-0 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
            <div
              className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-rose-500/60"
              style={{ left: `${Math.min(pos(entry), pos(stop))}%`, width: `${Math.abs(pos(entry) - pos(stop))}%` }}
            />
            <div
              className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-emerald-500/60"
              style={{ left: `${Math.min(pos(entry), pos(target))}%`, width: `${Math.abs(pos(entry) - pos(target))}%` }}
            />
            {[
              { label: "SL", value: stop, color: "text-rose-500" },
              { label: "Entry", value: entry, color: "text-foreground" },
              { label: "TP", value: target, color: "text-emerald-500" },
            ].map((p) => (
              <div key={p.label} className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center" style={{ left: `${pos(p.value)}%` }}>
                <div className={`w-3 h-3 rounded-full -translate-x-1/2 ring-2 ring-background ${p.label === "SL" ? "bg-rose-500" : p.label === "TP" ? "bg-emerald-500" : "bg-primary"}`} />
                <span className={`text-[10px] font-bold mt-1.5 -translate-x-1/2 whitespace-nowrap ${p.color}`}>{p.label}: {p.value}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatBlock label="Risk / Unit" value={result.riskPerUnit.toString()} tone="negative" />
            <StatBlock label="Reward / Unit" value={result.rewardPerUnit.toString()} tone="positive" />
            <StatBlock label="Risk %" value={formatPercent(result.riskPct)} />
            <StatBlock label="R:R" value={formatRR(result.rrRatio)} tone="accent" />
          </div>
        </>
      )}

      <ExpandableFormula formula={`Long:  Risk = Entry − Stop   ·  Reward = Target − Entry\nShort: Risk = Stop − Entry   ·  Reward = Entry − Target\nR:R = Reward / Risk`} />
    </SectionCard>
  );
}
