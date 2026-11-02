"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  DailyRiskBudget,
  RewardRange,
  RiskCalculatorState,
  RiskLevel,
  RiskRange,
  formatCurrency,
  formatRR,
} from "@/lib/riskCalculator";
import { RiskBadge, StatBlock } from "./shared";

interface TradePlanSummaryProps {
  state: RiskCalculatorState;
  riskRange: RiskRange;
  rewardRange: RewardRange;
  dailyBudget: DailyRiskBudget;
  riskLevel: RiskLevel;
}

export default function TradePlanSummary({ state, riskRange, rewardRange, dailyBudget, riskLevel }: TradePlanSummaryProps) {
  const { account, risk } = state;

  return (
    <Card className="bg-deck border-border">
      <CardContent className="p-6 flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold">Your trading risk plan</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Capital: <span className="font-semibold text-foreground">{formatCurrency(account.capital, account.currency)}</span>
            </p>
          </div>
          <RiskBadge level={riskLevel} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5">
          <StatBlock label="Risk / Trade" value={formatCurrency(riskRange.recommendedRisk, account.currency)} tone="accent" />
          <StatBlock label="Target R:R" value={formatRR(risk.targetRR)} />
          <StatBlock label="Target reward" value={formatCurrency(rewardRange.recommendedReward, account.currency)} tone="positive" />
          <StatBlock label="Max daily loss" value={formatCurrency(dailyBudget.maxDailyLoss.value, account.currency)} tone="negative" />
          <StatBlock label="Max trades today" value={String(dailyBudget.finalMaxTrades)} />
          <StatBlock label="Max consecutive losses" value={String(risk.maxConsecutiveLosses)} />
        </div>

        <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 text-xs text-muted-foreground leading-relaxed">
          Your maximum trade count is a <span className="font-semibold text-foreground">risk-management limit</span>, not a target.
          Only take trades that meet your strategy criteria.
        </div>
      </CardContent>
    </Card>
  );
}
