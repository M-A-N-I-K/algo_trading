"use client";

import { TakeProfitRule } from "@/domain/strategies";

interface TakeProfitEditorProps {
  value?: TakeProfitRule;
  onChange: (value: TakeProfitRule | undefined) => void;
}

const TYPE_LABELS: Record<TakeProfitRule["type"], string> = {
  FIXED_POINTS: "Fixed points",
  PERCENTAGE: "Percentage",
  R_MULTIPLE: "R multiple",
  FIXED_PRICE: "Fixed price",
};

function defaultForType(type: TakeProfitRule["type"]): TakeProfitRule {
  switch (type) {
    case "FIXED_POINTS":
      return { type, points: 20 };
    case "PERCENTAGE":
      return { type, percent: 2 };
    case "R_MULTIPLE":
      return { type, multiple: 2 };
    case "FIXED_PRICE":
      return { type, price: 0 };
  }
}

const selectClass = "bg-slate-900 border border-slate-800 text-slate-200 px-3 py-2 rounded-lg outline-none text-sm transition-all focus:border-violet-500";
const inputClass = selectClass + " w-24";

export default function TakeProfitEditor({ value, onChange }: TakeProfitEditorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked ? defaultForType("R_MULTIPLE") : undefined)} />
        Take Profit
      </label>

      {value && (
        <>
          <select value={value.type} onChange={(e) => onChange(defaultForType(e.target.value as TakeProfitRule["type"]))} className={selectClass}>
            {(Object.keys(TYPE_LABELS) as TakeProfitRule["type"][]).map((t) => (
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
          {value.type === "R_MULTIPLE" && (
            <div className="flex items-center gap-1">
              <input type="number" min={0} step={0.1} value={value.multiple} onChange={(e) => onChange({ ...value, multiple: Number(e.target.value) })} className={inputClass} />
              <span className="text-xs text-slate-500">R</span>
            </div>
          )}
          {value.type === "FIXED_PRICE" && (
            <input type="number" min={0} value={value.price} onChange={(e) => onChange({ ...value, price: Number(e.target.value) })} className={inputClass} />
          )}
        </>
      )}
    </div>
  );
}
