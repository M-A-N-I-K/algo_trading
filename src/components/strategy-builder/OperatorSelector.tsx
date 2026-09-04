"use client";

import { ExpressionKind, OperatorId, operatorsSupportingLeft } from "@/domain/strategies";

interface OperatorSelectorProps {
  leftKind: ExpressionKind;
  value: OperatorId;
  onChange: (operator: OperatorId) => void;
}

// Only offers operators that make sense for the selected left-hand
// expression kind (e.g. "is rising" is hidden for a Constant) — reads from
// the operator registry rather than a hardcoded list, per the
// extensibility requirement.
export default function OperatorSelector({ leftKind, value, onChange }: OperatorSelectorProps) {
  const options = operatorsSupportingLeft(leftKind);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as OperatorId)}
      className="bg-slate-900 border border-slate-800 text-slate-200 px-3 py-2 rounded-lg outline-none text-sm transition-all focus:border-violet-500"
    >
      {options.map((op) => (
        <option key={op.id} value={op.id}>
          {op.label}
        </option>
      ))}
    </select>
  );
}
