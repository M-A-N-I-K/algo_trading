"use client";

import { ConditionGroup, ExitConfiguration, emptyGroup } from "@/domain/strategies";
import { generateId } from "@/domain/strategies/ids";
import ConditionBuilder from "./ConditionBuilder";
import StopLossEditor from "./StopLossEditor";
import TakeProfitEditor from "./TakeProfitEditor";

interface ExitRuleEditorProps {
  value: ExitConfiguration;
  onChange: (value: ExitConfiguration) => void;
}

const inputClass = "bg-slate-900 border border-slate-800 text-slate-200 px-3 py-2 rounded-lg outline-none text-sm transition-all focus:border-violet-500";

// A strategy can combine any subset of stop loss / take profit / time exit /
// signal exit — whichever fires first on a given bar closes the position.
export default function ExitRuleEditor({ value, onChange }: ExitRuleEditorProps) {
  return (
    <div className="flex flex-col gap-4">
      <StopLossEditor value={value.stopLoss} onChange={(stopLoss) => onChange({ ...value, stopLoss })} />
      <TakeProfitEditor value={value.takeProfit} onChange={(takeProfit) => onChange({ ...value, takeProfit })} />

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
          <input
            type="checkbox"
            checked={!!value.timeExit}
            onChange={(e) => onChange({ ...value, timeExit: e.target.checked ? { type: "TIME", time: "15:15" } : undefined })}
          />
          Time Exit
        </label>
        {value.timeExit && (
          <input
            type="time"
            value={value.timeExit.time}
            onChange={(e) => onChange({ ...value, timeExit: { type: "TIME", time: e.target.value } })}
            className={inputClass}
          />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
          <input
            type="checkbox"
            checked={!!value.signalExit}
            onChange={(e) =>
              onChange({ ...value, signalExit: e.target.checked ? { type: "SIGNAL", conditions: emptyGroup(generateId()) } : undefined })
            }
          />
          Signal Exit
        </label>
        {value.signalExit && (
          <ConditionBuilder
            group={value.signalExit.conditions as ConditionGroup}
            onChange={(conditions) => onChange({ ...value, signalExit: { type: "SIGNAL", conditions } })}
          />
        )}
      </div>
    </div>
  );
}
