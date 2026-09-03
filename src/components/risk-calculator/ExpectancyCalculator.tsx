"use client";

import { useEffect, useState } from "react";
import { Calculator } from "lucide-react";
import { Currency, computeExpectancy, formatCurrency } from "@/lib/riskCalculator";
import { ExpandableFormula, NumberField, SectionCard, StatBlock } from "./shared";

export default function ExpectancyCalculator({ currency, defaultRiskAmount }: { currency: Currency; defaultRiskAmount: number }) {
  const [winRate, setWinRate] = useState<number | null>(40);
  const [avgWinR, setAvgWinR] = useState<number | null>(3);
  const [avgLossR, setAvgLossR] = useState<number | null>(1);
  const [numTrades, setNumTrades] = useState<number | null>(10);
  const [riskAmount, setRiskAmount] = useState<number | null>(defaultRiskAmount || null);

  useEffect(() => {
    setRiskAmount((prev) => (prev === null ? defaultRiskAmount || null : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const result = computeExpectancy({
    winRatePct: winRate ?? 0,
    avgWinR: avgWinR ?? 0,
    avgLossR: avgLossR ?? 0,
    numTrades: numTrades ?? 0,
    riskAmount: riskAmount ?? 0,
  });

  return (
    <SectionCard title="Strategy Expectancy Calculator" icon={<Calculator size={16} className="text-primary" />}>
      <div className="grid grid-cols-2 gap-4">
        <NumberField label="Win Rate" value={winRate} onChange={setWinRate} step={1} suffix="%" />
        <NumberField label="Number of Trades" value={numTrades} onChange={setNumTrades} step={1} />
        <NumberField label="Average Win" value={avgWinR} onChange={setAvgWinR} step={0.1} suffix="R" />
        <NumberField label="Average Loss" value={avgLossR} onChange={setAvgLossR} step={0.1} suffix="R" />
        <NumberField
          label="Risk Amount (for $ conversion)"
          value={riskAmount}
          onChange={setRiskAmount}
          step={10}
          prefix={currency === "INR" ? "₹" : undefined}
          suffix={currency === "USDT" ? "USDT" : undefined}
        />
      </div>

      {result.error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-xs font-semibold text-destructive">
          ⚠️ {result.error}
        </div>
      )}

      {result.valid && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <StatBlock label="Expected R / Trade" value={`${result.expectancyR >= 0 ? "+" : ""}${result.expectancyR.toFixed(2)}R`} tone={result.expectancyR >= 0 ? "positive" : "negative"} />
            <StatBlock label="Expected Value / Trade" value={formatCurrency(result.expectedValuePerTrade, currency)} tone={result.expectedValuePerTrade >= 0 ? "positive" : "negative"} />
            <StatBlock label={`Estimated Result Over ${numTrades ?? 0} Trades`} value={formatCurrency(result.estimatedResultOverN, currency)} tone={result.estimatedResultOverN >= 0 ? "positive" : "negative"} />
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-border pt-3">
            This is a <span className="font-semibold text-foreground">statistical estimate</span> based on your inputs, not a prediction of actual results.
          </p>
        </>
      )}

      <ExpandableFormula formula={`Expectancy (R) = (Win Rate × Avg Win) − (Loss Rate × Avg Loss)\nExpected Value / Trade = Expectancy (R) × Risk Amount\nEstimated Result = Expected Value / Trade × Number of Trades`} />
    </SectionCard>
  );
}
