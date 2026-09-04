"use client";

import { RiskConfiguration } from "@/domain/strategies";

interface RiskConfigEditorProps {
  value: RiskConfiguration;
  onChange: (value: RiskConfiguration) => void;
}

const inputClass = "bg-slate-900 border border-slate-800 text-slate-200 px-3 py-2 rounded-lg outline-none text-sm transition-all focus:border-violet-500 w-24";

function NumberField({
  label,
  suffix,
  field,
  value,
  onChange,
}: {
  label: string;
  suffix?: string;
  field: keyof RiskConfiguration;
  value: RiskConfiguration;
  onChange: (value: RiskConfiguration) => void;
}) {
  const current = value[field];
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-500">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={0}
          value={current ?? ""}
          placeholder="—"
          onChange={(e) => {
            const raw = e.target.value;
            onChange({ ...value, [field]: raw === "" ? undefined : Number(raw) });
          }}
          className={inputClass}
        />
        {suffix && <span className="text-xs text-slate-500">{suffix}</span>}
      </div>
    </div>
  );
}

// All fields are ceilings the chosen PositionSizingConfig must respect
// (checked in validation.ts) — leaving a field blank means "no limit".
export default function RiskConfigEditor({ value, onChange }: RiskConfigEditorProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <NumberField label="Max risk / trade" suffix="%" field="maxRiskPerTradePercent" value={value} onChange={onChange} />
      <NumberField label="Max daily loss" suffix="%" field="maxDailyLossPercent" value={value} onChange={onChange} />
      <NumberField label="Max portfolio risk" suffix="%" field="maxPortfolioRiskPercent" value={value} onChange={onChange} />
      <NumberField label="Max open positions" field="maxOpenPositions" value={value} onChange={onChange} />
      <NumberField label="Max position size" suffix="capital" field="maxPositionSizeCapital" value={value} onChange={onChange} />
      <NumberField label="Max capital allocation" suffix="%" field="maxCapitalAllocationPercent" value={value} onChange={onChange} />
    </div>
  );
}
