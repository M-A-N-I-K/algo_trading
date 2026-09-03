"use client";

import { useEffect, useMemo, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  AccountSettings,
  DailyState,
  RiskCalculatorState,
  RiskSettings,
  TradingStyle,
  computeDailyRiskBudget,
  computeDrawdownProtection,
  computeRewardRange,
  computeRiskLevel,
  computeRiskRange,
  generateWarnings,
  getPresetForStyle,
  validateState,
} from "@/lib/riskCalculator";
import RiskCalcHeader from "@/components/risk-calculator/Header";
import AccountStyleSection from "@/components/risk-calculator/AccountStyleSection";
import RiskSettingsSection from "@/components/risk-calculator/RiskSettingsSection";
import TradePlanSummary from "@/components/risk-calculator/TradePlanSummary";
import RiskRewardRangeCard from "@/components/risk-calculator/RiskRewardRangeCard";
import DailyRiskBudgetCard from "@/components/risk-calculator/DailyRiskBudgetCard";
import ConsecutiveLossCard from "@/components/risk-calculator/ConsecutiveLossCard";
import DrawdownProtectionCard from "@/components/risk-calculator/DrawdownProtectionCard";
import PositionSizeCalculator from "@/components/risk-calculator/PositionSizeCalculator";
import RiskRewardCalculator from "@/components/risk-calculator/RiskRewardCalculator";
import ExpectancyCalculator from "@/components/risk-calculator/ExpectancyCalculator";
import WhatIfSimulator from "@/components/risk-calculator/WhatIfSimulator";
import WarningsPanel from "@/components/risk-calculator/WarningsPanel";
import Disclaimer from "@/components/risk-calculator/Disclaimer";

const STORAGE_KEY = "riskCalculator.state.v1";

function defaultState(): RiskCalculatorState {
  const preset = getPresetForStyle("day");
  const account: AccountSettings = {
    currency: "INR",
    capital: 100000,
    currentEquity: 100000,
    maxDrawdownPct: 10,
    currentDrawdownAmount: 0,
  };
  const risk: RiskSettings = { tradingStyle: "day", ...preset };
  const daily: DailyState = { lossesToday: 0, tradesTakenToday: 0 };
  return { account, risk, daily };
}

export default function RiskCalculatorPage() {
  const [state, setState] = useState<RiskCalculatorState>(defaultState);
  const [hydrated, setHydrated] = useState(false);

  // Load persisted state on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState(JSON.parse(raw));
    } catch {
      // Ignore corrupt/unavailable localStorage — fall back to defaults.
    } finally {
      setHydrated(true);
    }
  }, []);

  // Persist on every change, once hydrated (avoids clobbering saved state
  // with defaults before the initial load completes).
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  const updateAccount = (patch: Partial<AccountSettings>) =>
    setState((prev) => ({ ...prev, account: { ...prev.account, ...patch } }));
  const updateRisk = (patch: Partial<RiskSettings>) =>
    setState((prev) => ({ ...prev, risk: { ...prev.risk, ...patch } }));
  const updateDaily = (patch: Partial<DailyState>) =>
    setState((prev) => ({ ...prev, daily: { ...prev.daily, ...patch } }));

  const applyPreset = (style: TradingStyle) => {
    const preset = getPresetForStyle(style);
    setState((prev) => ({ ...prev, risk: { tradingStyle: style, ...preset } }));
  };

  const resetAll = () => {
    setState(defaultState());
  };

  const issues = useMemo(() => validateState(state), [state]);
  const riskRange = useMemo(() => computeRiskRange(state.account.capital, state.risk), [state.account.capital, state.risk]);
  const rewardRange = useMemo(() => computeRewardRange(riskRange, state.risk), [riskRange, state.risk]);
  const dailyBudget = useMemo(() => computeDailyRiskBudget(state), [state]);
  const drawdown = useMemo(() => computeDrawdownProtection(state.account, dailyBudget.riskPerTrade), [state.account, dailyBudget.riskPerTrade]);
  const riskLevel = useMemo(() => computeRiskLevel(state), [state]);
  const warnings = useMemo(() => generateWarnings(state), [state]);

  return (
    <TooltipProvider>
      <div className="min-h-screen w-full font-sans antialiased bg-background text-foreground">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 flex flex-col gap-6">
          <RiskCalcHeader
            currency={state.account.currency}
            onCurrencyChange={(currency) => updateAccount({ currency })}
            onReset={resetAll}
          />

          {issues.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-500 font-medium flex flex-col gap-1">
              {issues.map((issue) => (
                <span key={issue.field}>⚠️ {issue.message}</span>
              ))}
            </div>
          )}

          <TradePlanSummary state={state} riskRange={riskRange} rewardRange={rewardRange} dailyBudget={dailyBudget} riskLevel={riskLevel} />

          <WarningsPanel warnings={warnings} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AccountStyleSection account={state.account} tradingStyle={state.risk.tradingStyle} onAccountChange={updateAccount} onApplyPreset={applyPreset} />
            <RiskSettingsSection risk={state.risk} daily={state.daily} capital={state.account.capital} onRiskChange={updateRisk} onDailyChange={updateDaily} />
          </div>

          <RiskRewardRangeCard currency={state.account.currency} riskRange={riskRange} rewardRange={rewardRange} risk={state.risk} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DailyRiskBudgetCard currency={state.account.currency} budget={dailyBudget} />
            <DrawdownProtectionCard currency={state.account.currency} drawdown={drawdown} />
          </div>

          <ConsecutiveLossCard currency={state.account.currency} capital={state.account.capital} riskAmount={dailyBudget.riskPerTrade} maxConsecutiveLosses={state.risk.maxConsecutiveLosses} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PositionSizeCalculator currency={state.account.currency} defaultRiskAmount={riskRange.recommendedRisk} />
            <RiskRewardCalculator />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ExpectancyCalculator currency={state.account.currency} defaultRiskAmount={riskRange.recommendedRisk} />
            <WhatIfSimulator currency={state.account.currency} defaultCapital={state.account.capital} defaultRiskPct={state.risk.riskPerTradePct} defaultRR={state.risk.targetRR} />
          </div>

          <Disclaimer />
        </div>
      </div>
    </TooltipProvider>
  );
}
