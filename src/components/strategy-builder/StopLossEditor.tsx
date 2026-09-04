"use client";

import { StopLossRule } from "@/domain/strategies";

interface StopLossEditorProps {
  value?: StopLossRule;
  onChange: (value: StopLossRule | undefined) => void;
}

const TYPE_LABELS: Record<StopLossRule["type"], string> = {
  FIXED_POINTS: "Fixed points",
  PERCENTAGE: "Percentage",
  ATR_MULTIPLE: "ATR multiple",
  PREVIOUS_SWING: "Previous swing",
  FIXED_PRICE: "Fixed price",
};

function defaultForType(type: StopLossRule["type"]): StopLossRule {
  switch (type) {
    case "FIXED_POINTS":
      return { type, points: 10 };
    case "PERCENTAGE":
      return { type, percent: 1 };
    case "ATR_MULTIPLE":
      return { type, indicator: "ATR", period: 14, multiplier: 1.5 };
    case "PREVIOUS_SWING":
      return { type, lookback: 5 };
    case "FIXED_PRICE":
      return { type, price: 0 };
  }
}

const selectClass = "bg-slate-900 border border-slate-800 text-slate-200 px-3 py-2 rounded-lg outline-none text-sm transition-all focus:border-violet-500";
const inputClass = selectClass + " w-24";

export default function StopLossEditor({ value, onChange }: StopLossEditorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked ? defaultForType("FIXED_POINTS") : undefined)} />
        Stop Loss
      </label>

      {value && (
        <>
          <select value={value.type} onChange={(e) => onChange(defaultForType(e.target.value as StopLossRule["type"]))} className={selectClass}>
            {(Object.keys(TYPE_LABELS) as StopLossRule["type"][]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>

          {value.type === "FIXED_POINTS" && (
            <input type="number" min={0} value={value.points} onChange={(e) => onChange({ ...value, points: Number(e.target.value) })} className={inputClass} />
          )}
          {value.type === "PERCENTAGE" && (
            <div className="flex items-center gap-1">
              <input type="number" min={0} step={0.1} value={value.percent} onChange={(e) => onChange({ ...value, percent: Number(e.target.value) })} className={inputClass} />
              <span className="text-xs text-slate-500">%</span>
            </div>
          )}
          {value.type === "ATR_MULTIPLE" && (
            <>
              <input
                type="number"
                min={1}
                title="ATR period"
                value={value.period}
                onChange={(e) => onChange({ ...value, period: Number(e.target.value) })}
                className={inputClass + " w-16"}
              />
              <span className="text-xs text-slate-500">period ×</span>
              <input
                type="number"
                min={0}
                step={0.1}
                title="Multiplier"
                value={value.multiplier}
                onChange={(e) => onChange({ ...value, multiplier: Number(e.target.value) })}
                className={inputClass + " w-16"}
              />
            </>
          )}
          {value.type === "PREVIOUS_SWING" && (
            <input
              type="number"
              min={1}
              title="Lookback bars"
              value={value.lookback}
              onChange={(e) => onChange({ ...value, lookback: Number(e.target.value) })}
              className={inputClass}
            />
          )}
          {value.type === "FIXED_PRICE" && (
            <input type="number" min={0} value={value.price} onChange={(e) => onChange({ ...value, price: Number(e.target.value) })} className={inputClass} />
          )}
        </>
      )}
    </div>
  );
}
