"use client";

import { ChevronDown, ChevronUp, FolderPlus, Plus, Trash2 } from "lucide-react";
import { ConditionGroup, ConditionNode } from "@/domain/strategies";
import { generateId } from "@/domain/strategies/ids";
import ConditionRow from "./ConditionRow";
import { defaultExpressionForKind } from "./ExpressionBuilder";

interface ConditionGroupEditorProps {
  group: ConditionGroup;
  onChange: (group: ConditionGroup) => void;
  onDelete?: () => void;
  depth?: number;
}

function newCondition() {
  return {
    type: "condition" as const,
    id: generateId(),
    negate: false,
    left: defaultExpressionForKind("price"),
    operator: "GREATER_THAN" as const,
    right: defaultExpressionForKind("indicator"),
  };
}

function newGroup(): ConditionGroup {
  return { type: "group", id: generateId(), operator: "AND", negate: false, conditions: [] };
}

export default function ConditionGroupEditor({ group, onChange, onDelete, depth = 0 }: ConditionGroupEditorProps) {
  const setChild = (index: number, child: ConditionNode) => {
    const conditions = [...group.conditions];
    conditions[index] = child;
    onChange({ ...group, conditions });
  };
  const removeChild = (index: number) => onChange({ ...group, conditions: group.conditions.filter((_, i) => i !== index) });
  const moveChild = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= group.conditions.length) return;
    const conditions = [...group.conditions];
    [conditions[index], conditions[target]] = [conditions[target], conditions[index]];
    onChange({ ...group, conditions });
  };
  const duplicateChild = (index: number) => {
    const clone = JSON.parse(JSON.stringify(group.conditions[index])) as ConditionNode;
    clone.id = generateId();
    const conditions = [...group.conditions];
    conditions.splice(index + 1, 0, clone);
    onChange({ ...group, conditions });
  };

  return (
    <div className={depth > 0 ? "border-l-2 border-slate-800 pl-4" : ""}>
      <div className="flex flex-wrap items-center gap-2 mb-2.5">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{group.operator === "AND" ? "All of:" : "Any of:"}</span>

        <div className="flex items-center rounded-lg border border-slate-800 bg-slate-900 p-0.5 text-[11px] font-bold">
          {(["AND", "OR"] as const).map((op) => (
            <button
              key={op}
              type="button"
              onClick={() => onChange({ ...group, operator: op })}
              className={`px-2.5 py-1 rounded-md transition-all ${group.operator === op ? "bg-violet-600 text-white" : "text-slate-500 hover:text-slate-300"}`}
            >
              {op}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onChange({ ...group, negate: !group.negate })}
          className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-all ${
            group.negate ? "bg-rose-500/15 border-rose-500/40 text-rose-400" : "bg-slate-900 border-slate-800 text-slate-500"
          }`}
        >
          NOT
        </button>

        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button"
            onClick={() => onChange({ ...group, conditions: [...group.conditions, newCondition()] })}
            className="flex items-center gap-1 text-[11px] font-semibold text-violet-400 hover:text-violet-300 transition-colors px-2 py-1"
          >
            <Plus size={13} /> Condition
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...group, conditions: [...group.conditions, newGroup()] })}
            className="flex items-center gap-1 text-[11px] font-semibold text-violet-400 hover:text-violet-300 transition-colors px-2 py-1"
          >
            <FolderPlus size={13} /> Group
          </button>
          {group.conditions.length > 0 && (
            <button
              type="button"
              onClick={() => onChange({ ...group, conditions: [] })}
              className="text-[11px] font-semibold text-slate-500 hover:text-rose-400 transition-colors px-2 py-1"
            >
              Clear
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={onDelete} title="Delete group" className="text-slate-500 hover:text-rose-400 transition-colors p-1.5">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {group.conditions.length === 0 && <p className="text-xs text-slate-600 italic mb-2">No conditions yet — add one above.</p>}

      <div className="flex flex-col gap-2">
        {group.conditions.map((child, i) => (
          <div key={child.id} className="flex items-start gap-1.5">
            <div className="flex flex-col shrink-0 pt-2.5">
              <button type="button" disabled={i === 0} onClick={() => moveChild(i, -1)} className="text-slate-600 hover:text-slate-300 disabled:opacity-20 disabled:hover:text-slate-600">
                <ChevronUp size={13} />
              </button>
              <button
                type="button"
                disabled={i === group.conditions.length - 1}
                onClick={() => moveChild(i, 1)}
                className="text-slate-600 hover:text-slate-300 disabled:opacity-20 disabled:hover:text-slate-600"
              >
                <ChevronDown size={13} />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              {child.type === "condition" ? (
                <ConditionRow condition={child} onChange={(c) => setChild(i, c)} onDelete={() => removeChild(i)} onDuplicate={() => duplicateChild(i)} />
              ) : (
                <ConditionGroupEditor group={child} onChange={(g) => setChild(i, g)} onDelete={() => removeChild(i)} depth={depth + 1} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
