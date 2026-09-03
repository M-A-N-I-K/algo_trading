"use client";

import { AlertOctagon, Wallet2 } from "lucide-react";
import { Currency, DailyRiskBudget, formatCurrency } from "@/lib/riskCalculator";
import { ExpandableFormula, SectionCard, StatBlock } from "./shared";

export default function DailyRiskBudgetCard({ currency, budget }: { currency: Currency; budget: DailyRiskBudget }) {
  return (
    <SectionCard title="Daily Risk Budget" icon={<Wallet2 size={16} className="text-primary" />}>
      <div className="grid grid-cols-2 gap-4">
        <StatBlock label="Max Daily Loss" value={formatCurrency(budget.maxDailyLoss.value, currency)} tone="negative" />
        <StatBlock label="Risk / Trade" value={formatCurrency(budget.riskPerTrade, currency)} />
        <StatBlock label="Loss-Based Max Trades" value={String(budget.lossBasedTrades)} tooltip="How many full-risk losses in a row would hit your daily loss limit." />
        <StatBlock label="Configured Max Trades" value={String(budget.configuredMaxTrades)} />
        <StatBlock label="Final Max Trades Allowed" value={String(budget.finalMaxTrades)} tone="accent" />
        <StatBlock label="Remaining Daily Risk" value={formatCurrency(budget.remainingDailyRisk, currency)} tone={budget.remainingDailyRisk > 0 ? "positive" : "negative"} />
      </div>

      <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Why {budget.finalMaxTrades}: </span>
        {budget.reason}
      </div>

      <StatBlock label="Remaining Full-Risk Trades Today" value={String(budget.remainingFullRiskTrades)} />

      {budget.isLocked && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive">
          <AlertOctagon size={16} /> Trading locked for today — daily loss limit reached.
        </div>
      )}

      <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-border pt-3">
        This is a <span className="font-semibold text-foreground">risk limit, not a trading target</span>. Taking the maximum number of trades every day is not the goal.
      </p>

      <ExpandableFormula formula={`Loss-Based Max Trades = floor(Max Daily Loss / Risk per Trade)\nFinal Max Trades = MIN(Loss-Based, Configured Max, Max Consecutive Losses)\nRemaining Daily Risk = Max Daily Loss − Losses Today`} />
    </SectionCard>
  );
}
