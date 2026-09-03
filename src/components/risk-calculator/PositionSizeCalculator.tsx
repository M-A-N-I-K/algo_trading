"use client";

import { useEffect, useState } from "react";
import { Ruler } from "lucide-react";
import { Currency, PositionSide, computePositionSize, formatCurrency, formatPercent, formatQuantity } from "@/lib/riskCalculator";
import { ExpandableFormula, NumberField, SectionCard, StatBlock } from "./shared";

export default function PositionSizeCalculator({ currency, defaultRiskAmount }: { currency: Currency; defaultRiskAmount: number }) {
  const [side, setSide] = useState<PositionSide>("LONG");
  const [entry, setEntry] = useState<number | null>(null);
  const [stop, setStop] = useState<number | null>(null);
  const [riskAmount, setRiskAmount] = useState<number | null>(defaultRiskAmount || null);
  const [leverage, setLeverage] = useState<number | null>(null);
  const [feePct, setFeePct] = useState<number | null>(null);

  useEffect(() => {
    setRiskAmount((prev) => (prev === null ? defaultRiskAmount || null : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const result = computePositionSize({
    entryPrice: entry ?? 0,
    stopLossPrice: stop ?? 0,
    riskAmount: riskAmount ?? 0,
    leverage,
    feePct,
    side,
  });

  return (
    <SectionCard title="Risk-Based Position Size" icon={<Ruler size={16} className="text-primary" />}>
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

      <div className="grid grid-cols-2 gap-4">
        <NumberField label="Entry Price" value={entry} onChange={setEntry} step={0.01} placeholder="100.00" />
        <NumberField label="Stop-Loss Price" value={stop} onChange={setStop} step={0.01} placeholder="95.00" />
        <NumberField label="Risk Amount" value={riskAmount} onChange={setRiskAmount} step={10} prefix={currency === "INR" ? "₹" : undefined} suffix={currency === "USDT" ? "USDT" : undefined} tooltip="Defaults to your recommended risk per trade from Risk Settings — override freely." />
        <NumberField label="Leverage" value={leverage} onChange={setLeverage} step={1} suffix="x" optional />
        <NumberField label="Fees / Slippage" value={feePct} onChange={setFeePct} step={0.01} suffix="%" optional tooltip="Estimated round-trip fee/slippage %, for informational purposes only." />
      </div>

      {result.error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-xs font-semibold text-destructive">
          ⚠️ {result.error}
        </div>
      )}

      {result.valid && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <StatBlock label="Position Size" value={`${formatQuantity(result.positionSizeUnits)} units`} tone="accent" />
            <StatBlock label="Position Value" value={formatCurrency(result.positionValue, currency)} />
            <StatBlock label="Risk Amount" value={formatCurrency(result.riskAmount, currency)} tone="negative" />
            <StatBlock label="Stop Distance" value={formatPercent(result.stopDistancePct)} />
            {result.marginRequired !== null && <StatBlock label="Margin Required (Leveraged)" value={formatCurrency(result.marginRequired, currency)} />}
            {result.estimatedFeeCost !== null && <StatBlock label="Est. Round-Trip Fees" value={formatCurrency(result.estimatedFeeCost, currency)} />}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-border pt-3">
            Leverage does not increase how much you should risk — it only changes the margin required to hold this position. Your risk stays fixed at {formatCurrency(result.riskAmount, currency)}.
          </p>
        </>
      )}

      <ExpandableFormula formula={`Stop Distance = |Entry − Stop Loss|\nPosition Size = Risk Amount / Stop Distance\nMargin Required = Position Value / Leverage`} />
    </SectionCard>
  );
}
