"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import { StrategyValidationResult } from "@/domain/strategies";

interface StrategyValidationPanelProps {
  result: StrategyValidationResult;
}

// Shows exactly what's blocking READY status — required checks that fail
// stop the strategy from going READY; recommended-but-not-required checks
// (take profit, session) are shown too but don't affect `isReady`.
export default function StrategyValidationPanel({ result }: StrategyValidationPanelProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className={`text-xs font-bold uppercase tracking-wider ${result.isReady ? "text-emerald-400" : "text-amber-400"}`}>
        {result.isReady ? "Ready to trade" : "Not ready yet"}
      </div>
      <ul className="flex flex-col gap-1.5">
        {result.checks.map((check) => (
          <li key={check.id} className="flex items-center gap-2 text-sm">
            {check.passed ? <CheckCircle2 size={15} className="text-emerald-500 shrink-0" /> : <CircleAlert size={15} className="text-amber-500 shrink-0" />}
            <span className={check.passed ? "text-slate-300" : "text-slate-400"}>{check.label}</span>
          </li>
        ))}
      </ul>
      {result.issues.length > 0 && (
        <ul className="flex flex-col gap-1 mt-1 border-t border-slate-800 pt-2">
          {result.issues.map((issue, i) => (
            <li key={i} className="text-xs text-amber-400/90">
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
