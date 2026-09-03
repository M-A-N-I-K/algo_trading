"use client";

import { ShieldAlert } from "lucide-react";
import { Currency, DrawdownProtection, formatCurrency, formatPercent } from "@/lib/riskCalculator";
import { ExpandableFormula, SectionCard, StatBlock } from "./shared";

export default function DrawdownProtectionCard({ currency, drawdown }: { currency: Currency; drawdown: DrawdownProtection }) {
  if (!drawdown.enabled) {
    return (
      <SectionCard title="Drawdown Protection" icon={<ShieldAlert size={16} className="text-primary" />}>
        <p className="text-xs text-muted-foreground">
          Set a maximum account drawdown % in Account &amp; Trading Style to enable drawdown tracking.
        </p>
      </SectionCard>
    );
  }

  const usedPct = drawdown.maxDrawdownAmount > 0 ? (drawdown.currentDrawdownAmount / drawdown.maxDrawdownAmount) * 100 : 0;

  return (
    <SectionCard title="Drawdown Protection" icon={<ShieldAlert size={16} className="text-primary" />}>
      <div className="grid grid-cols-2 gap-4">
        <StatBlock label="Max Permitted Drawdown" value={formatCurrency(drawdown.maxDrawdownAmount, currency)} />
        <StatBlock label="Current Drawdown" value={formatCurrency(drawdown.currentDrawdownAmount, currency)} tone="negative" />
        <StatBlock label="Remaining Drawdown" value={formatCurrency(drawdown.remainingDrawdown, currency)} tone={drawdown.remainingDrawdown > 0 ? "positive" : "negative"} />
        <StatBlock label="Approx. Full-Risk Losses Remaining" value={String(drawdown.approxRemainingLosses)} tone="accent" />
      </div>

      <div className="relative h-2.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${drawdown.isAtLimit ? "bg-destructive" : drawdown.isApproachingLimit ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${Math.min(100, Math.max(0, usedPct))}%` }}
        />
      </div>
      <span className="text-[11px] text-muted-foreground">{formatPercent(usedPct)} of drawdown limit used</span>

      {drawdown.isAtLimit && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive">
          🛑 Maximum drawdown reached. Stop trading and review your setup.
        </div>
      )}
      {!drawdown.isAtLimit && drawdown.isApproachingLimit && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-500">
          ⚠️ You are approaching your maximum account drawdown.
        </div>
      )}

      <ExpandableFormula formula={`Max Drawdown Amount = Capital × Max Drawdown %\nRemaining Drawdown = Max Drawdown Amount − Current Drawdown\nApprox. Remaining Losses = floor(Remaining Drawdown / Risk per Trade)`} />
    </SectionCard>
  );
}
