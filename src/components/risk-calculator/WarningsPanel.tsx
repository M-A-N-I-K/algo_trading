"use client";

import { AlertTriangle, OctagonAlert, ShieldCheck } from "lucide-react";
import { Warning } from "@/lib/riskCalculator";

export default function WarningsPanel({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-500">
        <ShieldCheck size={16} /> No risk-rule violations detected with your current configuration.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {warnings.map((w, i) => (
        <div
          key={i}
          className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-semibold ${
            w.severity === "critical"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-amber-500/40 bg-amber-500/10 text-amber-500"
          }`}
        >
          {w.severity === "critical" ? <OctagonAlert size={16} className="shrink-0" /> : <AlertTriangle size={16} className="shrink-0" />}
          {w.message}
        </div>
      ))}
    </div>
  );
}
