"use client";

import { ConditionGroup, EntryConfiguration, EntryRule, StrategyDirection, emptyGroup } from "@/domain/strategies";
import { generateId } from "@/domain/strategies/ids";
import ConditionBuilder from "./ConditionBuilder";

interface EntryRuleEditorProps {
  direction: StrategyDirection;
  value: EntryConfiguration;
  onChange: (value: EntryConfiguration) => void;
}

function defaultEntryRule(): EntryRule {
  return { conditions: emptyGroup(generateId()), order: { type: "MARKET" } };
}

export default function EntryRuleEditor({ direction, value, onChange }: EntryRuleEditorProps) {
  const showLong = direction === "LONG_ONLY" || direction === "LONG_AND_SHORT";
  const showShort = direction === "SHORT_ONLY" || direction === "LONG_AND_SHORT";

  return (
    <div className="flex flex-col gap-5">
      {showLong && (
        <EntrySide
          label="Entry — Long"
          accent="text-emerald-400"
          rule={value.long}
          onChange={(long) => onChange({ ...value, long })}
        />
      )}
      {showShort && (
        <EntrySide
          label="Entry — Short"
          accent="text-rose-400"
          rule={value.short}
          onChange={(short) => onChange({ ...value, short })}
        />
      )}
    </div>
  );
}

function EntrySide({
  label,
  accent,
  rule,
  onChange,
}: {
  label: string;
  accent: string;
  rule?: EntryRule;
  onChange: (rule: EntryRule) => void;
}) {
  const current = rule ?? defaultEntryRule();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className={`text-xs font-bold uppercase tracking-wider ${accent}`}>{label}</h4>
        <div className="flex items-center rounded-lg border border-slate-800 bg-slate-900 p-0.5 text-[11px] font-semibold">
          <span className="px-2.5 py-1 rounded-md bg-violet-600 text-white">Market</span>
          <span title="Coming soon" className="px-2.5 py-1 rounded-md text-slate-600 cursor-not-allowed">
            Stop
          </span>
          <span title="Coming soon" className="px-2.5 py-1 rounded-md text-slate-600 cursor-not-allowed">
            Limit
          </span>
        </div>
      </div>
      {/* Entry rule roots are always constructed as a group (see templates.ts / defaultEntryRule) */}
      <ConditionBuilder group={current.conditions as ConditionGroup} onChange={(conditions) => onChange({ ...current, conditions })} />
    </div>
  );
}
