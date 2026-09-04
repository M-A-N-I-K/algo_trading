"use client";

import { PositionSizingConfig } from "@/domain/strategies";

interface PositionSizingEditorProps {
  value: PositionSizingConfig;
  onChange: (value: PositionSizingConfig) => void;
}

const TYPE_LABELS: Record<PositionSizingConfig["type"], string> = {
  FIXED_QUANTITY: "Fixed quantity",
  FIXED_CAPITAL: "Fixed capital",
  RISK_PERCENT: "Risk % of account",
  RISK_AMOUNT: "Risk amount",
};

function defaultForType(type: PositionSizingConfig["type"]): PositionSizingConfig {
  switch (type) {
    case "FIXED_QUANTITY":
      return { type, quantity: 1 };
    case "FIXED_CAPITAL":
      return { type, capital: 10000 };
    case "RISK_PERCENT":
      return { type, percent: 1 };
    case "RISK_AMOUNT":
      return { type, amount: 1000 };
  }
}

const selectClass = "bg-slate-900 border border-slate-800 text-slate-200 px-3 py-2 rounded-lg outline-none text-sm transition-all focus:border-violet-500";
const inputClass = selectClass + " w-28";

// RISK_PERCENT is the schema's default and the recommended choice — the
// platform steers users toward consistent risk management rather than
// arbitrary fixed sizes.
export default function PositionSizingEditor({ value, onChange }: PositionSizingEditorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={value.type} onChange={(e) => onChange(defaultForType(e.target.value as PositionSizingConfig["type"]))} className={selectClass}>
        {(Object.keys(TYPE_LABELS) as PositionSizingConfig["type"][]).map((t) => (
          <option key={t} value={t}>
            {TYPE_LABELS[t]}
          </option>
        ))}
      </select>

      {value.type === "FIXED_QUANTITY" && (
        <input type="number" min={0} value={value.quantity} onChange={(e) => onChange({ ...value, quantity: Number(e.target.value) })} className={inputClass} />
      )}
      {value.type === "FIXED_CAPITAL" && (
        <input type="number" min={0} value={value.capital} onChange={(e) => onChange({ ...value, capital: Number(e.target.value) })} className={inputClass} />
      )}
      {value.type === "RISK_PERCENT" && (
        <div className="flex items-center gap-1">
          <input type="number" min={0} step={0.1} value={value.percent} onChange={(e) => onChange({ ...value, percent: Number(e.target.value) })} className={inputClass} />
          <span className="text-xs text-slate-500">% of account, risked per trade</span>
        </div>
      )}
      {value.type === "RISK_AMOUNT" && (
        <input type="number" min={0} value={value.amount} onChange={(e) => onChange({ ...value, amount: Number(e.target.value) })} className={inputClass} />
      )}
    </div>
  );
}
