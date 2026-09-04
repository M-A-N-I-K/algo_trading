"use client";

import { Copy, Trash2 } from "lucide-react";
import { Condition, getOperatorDefinition } from "@/domain/strategies";
import ExpressionBuilder, { defaultExpressionForKind } from "./ExpressionBuilder";
import OperatorSelector from "./OperatorSelector";

interface ConditionRowProps {
  condition: Condition;
  onChange: (condition: Condition) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

export default function ConditionRow({ condition, onChange, onDelete, onDuplicate }: ConditionRowProps) {
  const opDef = getOperatorDefinition(condition.operator);

  return (
    <div className="flex flex-wrap items-center gap-2 bg-slate-900/40 border border-slate-800 rounded-xl px-3 py-2.5">
      <button
        type="button"
        onClick={() => onChange({ ...condition, negate: !condition.negate })}
        title="Toggle NOT"
        className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-all shrink-0 ${
          condition.negate ? "bg-rose-500/15 border-rose-500/40 text-rose-400" : "bg-slate-900 border-slate-800 text-slate-500"
        }`}
      >
        NOT
      </button>

      <ExpressionBuilder
        value={condition.left}
        onChange={(left) => {
          // If the new left-hand kind no longer supports the current
          // operator, fall back to the first operator that does.
          const stillValid = getOperatorDefinition(condition.operator).supportedLeftKinds;
          const valid = stillValid === "all" || stillValid.includes(left.type);
          onChange({ ...condition, left, operator: valid ? condition.operator : "GREATER_THAN" });
        }}
      />

      <OperatorSelector leftKind={condition.left.type} value={condition.operator} onChange={(operator) => onChange({ ...condition, operator })} />

      {opDef.arity === "binary" && (
        <ExpressionBuilder value={condition.right ?? defaultExpressionForKind("constant")} onChange={(right) => onChange({ ...condition, right })} />
      )}

      <div className="flex items-center gap-1 ml-auto shrink-0">
        <button type="button" onClick={onDuplicate} title="Duplicate condition" className="text-slate-500 hover:text-slate-200 transition-colors p-1.5">
          <Copy size={14} />
        </button>
        <button type="button" onClick={onDelete} title="Delete condition" className="text-slate-500 hover:text-rose-400 transition-colors p-1.5">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
