"use client";

import { Gauge } from "lucide-react";
import { Currency, RewardRange, RiskRange, RiskSettings, formatCurrency, formatRR } from "@/lib/riskCalculator";
import { ExpandableFormula, SectionCard } from "./shared";

interface RiskRewardRangeCardProps {
  currency: Currency;
  riskRange: RiskRange;
  rewardRange: RewardRange;
  risk: RiskSettings;
}

export default function RiskRewardRangeCard({ currency, riskRange, rewardRange, risk }: RiskRewardRangeCardProps) {
  const riskSpan = Math.max(1, riskRange.maxRisk - riskRange.minRisk);
  const riskPosition = Math.min(100, Math.max(0, ((riskRange.recommendedRisk - riskRange.minRisk) / riskSpan) * 100));

  return (
    <SectionCard title="Risk & Reward Range" icon={<Gauge size={16} className="text-primary" />}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Risk Range</span>
            <span className="text-sm font-bold">
              {formatCurrency(riskRange.minRisk, currency)} – {formatCurrency(riskRange.maxRisk, currency)}
            </span>
          </div>
          <div className="relative h-2.5 rounded-full bg-muted overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500/40 to-primary/60 w-full" />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary ring-2 ring-background shadow"
              style={{ left: `calc(${riskPosition}% - 6px)` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Min ({risk.minRiskPct}%)</span>
            <span className="text-primary font-bold">Recommended: {formatCurrency(riskRange.recommendedRisk, currency)} ({risk.riskPerTradePct}%)</span>
            <span>Max ({risk.maxRiskPct}%)</span>
          </div>
          <ExpandableFormula formula={`Risk = Capital × Risk %\nMin: ${risk.minRiskPct}%  ·  Recommended: ${risk.riskPerTradePct}%  ·  Max: ${risk.maxRiskPct}%`} />
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Target Reward Range</span>
            <span className="text-sm font-bold">
              {formatCurrency(rewardRange.minReward, currency)} – {formatCurrency(rewardRange.maxReward, currency)}
            </span>
          </div>
          <div className="relative h-2.5 rounded-full bg-muted overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500/40 to-emerald-500/70 w-full" />
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Min ({formatRR(risk.minRR)})</span>
            <span className="text-emerald-500 font-bold">Target: {formatCurrency(rewardRange.recommendedReward, currency)}</span>
            <span>Max ({formatRR(risk.maxRR)})</span>
          </div>
          <ExpandableFormula formula={`Reward = Risk × R:R\nMin: Min Risk × Min R:R  ·  Target: Recommended Risk × Target R:R  ·  Max: Max Risk × Max R:R`} />
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-border pt-3">
        These are <span className="font-semibold text-foreground">target rewards</span>, not guaranteed outcomes. Actual results depend on execution, market conditions, and slippage.
      </p>
    </SectionCard>
  );
}
