"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Save, Trash2, Wallet, Crosshair, Package, Receipt, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { NumberField, SectionCard, StatBlock, ExpandableFormula } from "@/components/risk-calculator/shared";
import { Direction, calculateRiskProfile, isRiskCalculationFailure, isRiskCalculationSuccess } from "@/domain/risk";
import { Instrument } from "@/domain/market-data/types";
import { fetchJson } from "@/lib/apiClient";

const CURRENCY = "INR";
function fmt(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: CURRENCY, maximumFractionDigits: 2 }).format(n);
}

interface FormState {
  accountSize: number | null;
  riskPerTradePercent: number | null;
  maxDailyLossPercent: number | null;
  maxPortfolioRiskPercent: number | null;
  symbol: string;
  direction: Direction;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  instrumentId: string | null;
  tickSize: number | null;
  lotSize: number | null;
  contractMultiplier: number | null;
  commissionType: "FLAT" | "PERCENT";
  commissionValue: number | null;
  slippageTicks: number | null;
  existingOpenRiskAmount: number | null;
  todaysRealizedLoss: number | null;
}

const DEFAULT_FORM: FormState = {
  accountSize: 500000,
  riskPerTradePercent: 1,
  maxDailyLossPercent: 3,
  maxPortfolioRiskPercent: 5,
  symbol: "NIFTY",
  direction: "LONG",
  entryPrice: 24850,
  stopLoss: 24750,
  takeProfit: 25050,
  instrumentId: null,
  tickSize: 0.05,
  lotSize: 1,
  contractMultiplier: 1,
  commissionType: "FLAT",
  commissionValue: 20,
  slippageTicks: 1,
  existingOpenRiskAmount: 0,
  todaysRealizedLoss: 0,
};

function buildInput(form: FormState): unknown {
  return {
    account: {
      accountSize: form.accountSize ?? 0,
      riskPerTradePercent: form.riskPerTradePercent ?? 0,
      maxDailyLossPercent: form.maxDailyLossPercent ?? undefined,
      maxPortfolioRiskPercent: form.maxPortfolioRiskPercent ?? undefined,
    },
    trade: {
      symbol: form.symbol,
      direction: form.direction,
      entryPrice: form.entryPrice ?? 0,
      stopLoss: form.stopLoss ?? 0,
      takeProfit: form.takeProfit ?? undefined,
    },
    instrument: {
      tickSize: form.tickSize ?? 0,
      lotSize: form.lotSize ?? 0,
      contractMultiplier: form.contractMultiplier ?? 1,
    },
    costs: {
      commissionType: form.commissionType,
      commissionValue: form.commissionValue ?? 0,
      slippageTicks: form.slippageTicks ?? 0,
    },
    existingOpenRiskAmount: form.existingOpenRiskAmount ?? 0,
    todaysRealizedLoss: form.todaysRealizedLoss ?? 0,
  };
}

export default function RiskCalculatorPage() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [profileName, setProfileName] = useState("");
  const queryClient = useQueryClient();

  const patch = (p: Partial<FormState>) => setForm((prev) => ({ ...prev, ...p }));

  // Computed entirely client-side (the domain layer is a pure function, no
  // server round-trip needed) so every keystroke updates instantly.
  const outcome = useMemo(() => calculateRiskProfile(buildInput(form)), [form]);

  const instrumentsQuery = useQuery({
    queryKey: ["instruments"],
    queryFn: () => fetchJson<{ instruments: Instrument[] }>("/api/instruments"),
  });
  const instruments = instrumentsQuery.data?.instruments ?? [];

  const profilesQuery = useQuery({
    queryKey: ["risk-profiles"],
    queryFn: () => fetchJson<{ profiles: { id: string; name: string; symbol: string; direction: string; createdAt: string }[] }>("/api/risk-profiles"),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      fetchJson("/api/risk-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: profileName || `${form.symbol} ${form.direction}`, instrumentId: form.instrumentId ?? undefined, input: buildInput(form) }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["risk-profiles"] });
      setProfileName("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/risk-profiles/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["risk-profiles"] }),
  });

  const applyInstrument = (id: string) => {
    const instrument = instruments.find((i) => i.id === id);
    if (!instrument) {
      patch({ instrumentId: null });
      return;
    }
    patch({ instrumentId: id, symbol: instrument.symbol, tickSize: instrument.tickSize, lotSize: instrument.lotSize });
  };

  const result = isRiskCalculationSuccess(outcome) ? outcome.data : null;
  const errors = isRiskCalculationFailure(outcome) ? outcome.errors : [];

  return (
    <div className="flex flex-col gap-6">
      {/* Results summary — always visible, updates instantly */}
      <Card className="glass border-slate-800">
        <CardContent className="p-6">
          {errors.length > 0 ? (
            <div className="flex flex-col gap-2">
              {errors.map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-rose-400 font-medium">
                  <AlertTriangle size={14} /> {e.message}
                </div>
              ))}
            </div>
          ) : result ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5">
              <StatBlock label="Position Size" value={`${result.position.quantity} units`} tone="accent" sub={`${result.position.lots} lot(s)`} />
              <StatBlock label="Risk" value={fmt(result.riskAmount)} tone="negative" />
              <StatBlock label="Max Loss" value={fmt(result.maxLoss)} tone="negative" sub="incl. costs" />
              <StatBlock label="Target Profit" value={result.potentialProfit !== null ? fmt(result.potentialProfit) : "—"} tone="positive" sub="incl. costs" />
              <StatBlock label="Risk / Reward" value={result.riskRewardRatio !== null ? `1 : ${result.riskRewardRatio.toFixed(2)}` : "—"} />
              <StatBlock label="Capital Required" value={fmt(result.capitalRequired)} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Warnings — deterministic, rule-backed */}
      {result && result.warnings.length > 0 && (
        <div className="flex flex-col gap-2">
          {result.warnings.map((w) => (
            <div key={w.code} className="flex items-center gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-500">
              <AlertTriangle size={16} className="shrink-0" /> {w.message}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Account" icon={<Wallet size={16} className="text-primary" />}>
          <div className="grid grid-cols-2 gap-4">
            <NumberField label="Account Size" value={form.accountSize} onChange={(v) => patch({ accountSize: v })} prefix="₹" step={1000} />
            <NumberField label="Risk Per Trade" value={form.riskPerTradePercent} onChange={(v) => patch({ riskPerTradePercent: v })} suffix="%" step={0.1} />
            <NumberField label="Max Daily Loss" value={form.maxDailyLossPercent} onChange={(v) => patch({ maxDailyLossPercent: v })} suffix="%" step={0.5} optional />
            <NumberField label="Max Portfolio Risk" value={form.maxPortfolioRiskPercent} onChange={(v) => patch({ maxPortfolioRiskPercent: v })} suffix="%" step={0.5} optional />
          </div>
        </SectionCard>

        <SectionCard title="Trade" icon={<Crosshair size={16} className="text-primary" />}>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Instrument</label>
              <select
                value={form.instrumentId ?? ""}
                onChange={(e) => applyInstrument(e.target.value)}
                className="bg-input/40 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary text-foreground"
              >
                <option value="">Custom / manual</option>
                {instruments.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.symbol} · {i.exchange}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Direction</label>
              <div className="flex items-center rounded-xl border border-border bg-input/40 p-1 text-xs font-semibold h-[42px]">
                {(["LONG", "SHORT"] as Direction[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => patch({ direction: d })}
                    className={`flex-1 h-full rounded-lg transition-all ${
                      form.direction === d
                        ? d === "LONG"
                          ? "bg-emerald-500/20 text-emerald-500"
                          : "bg-rose-500/20 text-rose-500"
                        : "text-muted-foreground"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Symbol</label>
              <input
                type="text"
                value={form.symbol}
                onChange={(e) => patch({ symbol: e.target.value, instrumentId: null })}
                placeholder="e.g. NIFTY"
                className="bg-input/40 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary text-foreground placeholder:text-muted-foreground/50"
              />
            </div>
            <NumberField label="Entry Price" value={form.entryPrice} onChange={(v) => patch({ entryPrice: v })} step={0.05} />
            <NumberField label="Stop Loss" value={form.stopLoss} onChange={(v) => patch({ stopLoss: v })} step={0.05} />
            <NumberField label="Take Profit" value={form.takeProfit} onChange={(v) => patch({ takeProfit: v })} step={0.05} optional />
          </div>
        </SectionCard>

        <SectionCard title="Instrument Specification" icon={<Package size={16} className="text-primary" />}>
          <div className="grid grid-cols-3 gap-4">
            <NumberField label="Tick Size" value={form.tickSize} onChange={(v) => patch({ tickSize: v })} step={0.01} tooltip="Smallest price increment for this instrument." />
            <NumberField label="Lot Size" value={form.lotSize} onChange={(v) => patch({ lotSize: v })} step={1} tooltip="Position size must be a whole multiple of this." />
            <NumberField label="Contract Multiplier" value={form.contractMultiplier} onChange={(v) => patch({ contractMultiplier: v })} step={1} tooltip="Value per unit of price movement — 1 for stocks/indices, higher for some derivatives." />
          </div>
        </SectionCard>

        <SectionCard title="Costs" icon={<Receipt size={16} className="text-primary" />}>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-muted-foreground">Commission Type</label>
            <div className="flex items-center rounded-xl border border-border bg-input/40 p-1 text-xs font-semibold w-fit">
              {(["FLAT", "PERCENT"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => patch({ commissionType: t })}
                  className={`px-4 py-1.5 rounded-lg transition-all ${form.commissionType === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  {t === "FLAT" ? "Flat ₹" : "% of value"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <NumberField
              label={form.commissionType === "FLAT" ? "Commission (round trip)" : "Commission %"}
              value={form.commissionValue}
              onChange={(v) => patch({ commissionValue: v })}
              step={form.commissionType === "FLAT" ? 1 : 0.01}
              suffix={form.commissionType === "PERCENT" ? "%" : undefined}
            />
            <NumberField label="Slippage" value={form.slippageTicks} onChange={(v) => patch({ slippageTicks: v })} step={1} suffix="ticks" tooltip="Adverse slippage assumed per fill, applied at both entry and exit." />
          </div>
        </SectionCard>
      </div>

      {result && (
        <SectionCard title="Risk Breakdown" icon={<ShieldAlert size={16} className="text-primary" />}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatBlock label="Risk / Unit" value={result.riskPerUnit.toString()} />
            <StatBlock label="Reward / Unit" value={result.rewardPerUnit !== null ? result.rewardPerUnit.toString() : "—"} />
            <StatBlock label="Break-Even Win Rate" value={result.breakEvenWinRatePercent !== null ? `${result.breakEvenWinRatePercent.toFixed(2)}%` : "—"} />
            <StatBlock label="Position Exposure" value={`${result.positionExposurePercent.toFixed(2)}%`} tooltip="Capital required as a % of account size." />
            <StatBlock label="Commission" value={fmt(result.commissionCost)} />
            <StatBlock label="Slippage Cost" value={fmt(result.slippageCost)} />
            <StatBlock label="Portfolio Risk" value={`${result.portfolioRiskPercent.toFixed(2)}%`} tooltip="This trade's risk plus any existing open risk you entered, as a % of account size." />
            <StatBlock
              label="Daily Risk Utilization"
              value={result.dailyRiskUtilizationPercent !== null ? `${result.dailyRiskUtilizationPercent.toFixed(2)}%` : "—"}
              tooltip="Today's realized loss plus this trade's risk, as a % of your max daily loss."
            />
          </div>
          <ExpandableFormula formula={`Risk Amount = Account Size × Risk %\nRisk/Unit = |Entry − Stop|\nPosition Size = floor((Risk Amount / Risk per Unit) / Lot Size) × Lot Size\nBreak-Even Win Rate = 1 / (1 + R:R)`} />
        </SectionCard>
      )}

      {/* Save / saved profiles */}
      <SectionCard title="Save Risk Profile" icon={<Save size={16} className="text-primary" />}>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder={`e.g. ${form.symbol} ${form.direction} breakout`}
            className="flex-1 bg-input/40 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary text-foreground placeholder:text-muted-foreground/50"
          />
          <button
            type="button"
            disabled={!result || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            className="flex items-center justify-center gap-2 bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
          >
            <Save size={15} /> {saveMutation.isPending ? "Saving…" : "Save Profile"}
          </button>
        </div>

        {profilesQuery.data?.profiles && profilesQuery.data.profiles.length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            {profilesQuery.data.profiles.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-2.5">
                <div>
                  <span className="text-sm font-semibold text-foreground">{p.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {p.symbol} · {p.direction} · {new Date(p.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(p.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label="Delete profile"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
