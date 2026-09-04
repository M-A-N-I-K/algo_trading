"use client";

import { ConditionGroup } from "@/domain/strategies";
import ConditionGroupEditor from "./ConditionGroupEditor";

interface ConditionBuilderProps {
  label?: string;
  group: ConditionGroup;
  onChange: (group: ConditionGroup) => void;
}

// Thin wrapper around the recursive ConditionGroupEditor for a single root
// group — used anywhere the spec calls for a standalone condition tree
// (entry long/short, signal exit, strategy filters) so those call sites
// don't need to know about ConditionGroupEditor's internals.
export default function ConditionBuilder({ label, group, onChange }: ConditionBuilderProps) {
  return (
    <div className="flex flex-col gap-2">
      {label && <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</h4>}
      <ConditionGroupEditor group={group} onChange={onChange} />
    </div>
  );
}
