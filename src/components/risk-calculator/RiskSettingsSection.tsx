"use client";

import { Sliders } from "lucide-react";
import { DailyState, RiskSettings, resolveAmountOrPercent } from "@/lib/riskCalculator";
import { NumberField, SectionCard, SourceBadge } from "./shared";

interface RiskSettingsSectionProps {
  risk: RiskSettings;
  daily: DailyState;
  capital: number;
  onRiskChange: (patch: Partial<RiskSettings>) => void;
  onDailyChange: (patch: Partial<DailyState>) => void;
}

export default function RiskSettingsSection({ risk, daily, capital, onRiskChange, onDailyChange }: RiskSettingsSectionProps) {
  const dailyLossSource = resolveAmountOrPercent(capital, risk.maxDailyLossPct, risk.maxDailyLossAmount);
  const profitTargetSource = resolveAmountOrPercent(capital, risk.dailyProfitTargetPct, risk.dailyProfitTargetAmount);

  return (
    <SectionCard title="Risk Settings" icon={<Sliders size={16} className="text-primary" />}>
      <div className="grid grid-cols-3 gap-3">
        <NumberField label="Min Risk" value={risk.minRiskPct} onChange={(v) => onRiskChange({ minRiskPct: v ?? 0 })} suffix="%" step={0.1} min={0} />
        <NumberField label="Risk / Trade" value={risk.riskPerTradePct} onChange={(v) => onRiskChange({ riskPerTradePct: v ?? 0 })} suffix="%" step={0.1} min={0} tooltip="Your recommended/selected risk per trade." />
        <NumberField label="Max Risk" value={risk.maxRiskPct} onChange={(v) => onRiskChange({ maxRiskPct: v ?? 0 })} suffix="%" step={0.1} min={0} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <NumberField label="Min R:R" value={risk.minRR} onChange={(v) => onRiskChange({ minRR: v ?? 0 })} step={0.1} min={0} tooltip="Minimum acceptable Risk:Reward — trades below this shouldn't be taken." />
        <NumberField label="Target R:R" value={risk.targetRR} onChange={(v) => onRiskChange({ targetRR: v ?? 0 })} step={0.1} min={0} />
        <NumberField label="Max R:R" value={risk.maxRR} onChange={(v) => onRiskChange({ maxRR: v ?? 0 })} step={0.1} min={0} tooltip="Your ceiling for planned R:R — targets far beyond this are often unrealistic." />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Max Trades / Day" value={risk.maxTradesPerDay} onChange={(v) => onRiskChange({ maxTradesPerDay: Math.max(1, Math.floor(v ?? 1)) })} step={1} min={1} />
        <NumberField label="Max Consecutive Losses" value={risk.maxConsecutiveLosses} onChange={(v) => onRiskChange({ maxConsecutiveLosses: Math.max(1, Math.floor(v ?? 1)) })} step={1} min={1} />
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-3 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground">Maximum Daily Loss</span>
          <SourceBadge source={dailyLossSource.source} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="As % of capital" value={risk.maxDailyLossPct} onChange={(v) => onRiskChange({ maxDailyLossPct: v ?? 0 })} suffix="%" step={0.25} min={0} />
          <NumberField
            label="As fixed amount"
            value={risk.maxDailyLossAmount}
            onChange={(v) => onRiskChange({ maxDailyLossAmount: v })}
            step={100}
            min={0}
            optional
            tooltip="If set, this amount overrides the % above as the source of truth."
          />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-3 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground">Daily Profit Target</span>
          {(risk.dailyProfitTargetPct || risk.dailyProfitTargetAmount) && <SourceBadge source={profitTargetSource.source} />}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="As % of capital" value={risk.dailyProfitTargetPct} onChange={(v) => onRiskChange({ dailyProfitTargetPct: v })} suffix="%" step={0.25} min={0} optional />
          <NumberField label="As fixed amount" value={risk.dailyProfitTargetAmount} onChange={(v) => onRiskChange({ dailyProfitTargetAmount: v })} step={100} min={0} optional />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-3 flex flex-col gap-3">
        <span className="text-xs font-semibold text-muted-foreground">Today (for the daily risk budget below)</span>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Losses Today" value={daily.lossesToday} onChange={(v) => onDailyChange({ lossesToday: Math.max(0, v ?? 0) })} step={50} min={0} tooltip="Realized loss amount so far today, used to calculate remaining risk budget." />
          <NumberField label="Trades Taken Today" value={daily.tradesTakenToday} onChange={(v) => onDailyChange({ tradesTakenToday: Math.max(0, Math.floor(v ?? 0)) })} step={1} min={0} />
        </div>
      </div>
    </SectionCard>
  );
}
