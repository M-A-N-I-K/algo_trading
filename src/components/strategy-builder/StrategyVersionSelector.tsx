"use client";

import { useState } from "react";
import { StrategyVersionRecord, diffStrategyDefinitions } from "@/domain/strategies";

interface StrategyVersionSelectorProps {
  versions: StrategyVersionRecord[];
  selectedVersion: number;
  onSelect: (version: number) => void;
}

// Versions are listed newest-first (matches strategyRepository.listStrategyVersions).
export default function StrategyVersionSelector({ versions, selectedVersion, onSelect }: StrategyVersionSelectorProps) {
  const [compareWith, setCompareWith] = useState<number | null>(null);
  const current = versions.find((v) => v.version === selectedVersion);
  const compareTarget = compareWith !== null ? versions.find((v) => v.version === compareWith) : null;
  const diff = current && compareTarget ? diffStrategyDefinitions(compareTarget.definition, current.definition) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        {versions.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onSelect(v.version)}
            className={`flex items-center justify-between text-left px-3 py-2 rounded-lg border text-sm transition-all ${
              v.version === selectedVersion ? "bg-violet-600/15 border-violet-500/40 text-violet-200" : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
            }`}
          >
            <span className="font-semibold">v{v.version}</span>
            <span className="text-xs text-slate-500">{new Date(v.createdAt).toLocaleString()}</span>
          </button>
        ))}
      </div>

      {versions.length > 1 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Compare with</span>
          <select
            value={compareWith ?? ""}
            onChange={(e) => setCompareWith(e.target.value === "" ? null : Number(e.target.value))}
            className="bg-slate-900 border border-slate-800 text-slate-200 px-2 py-1 rounded-md outline-none"
          >
            <option value="">—</option>
            {versions
              .filter((v) => v.version !== selectedVersion)
              .map((v) => (
                <option key={v.id} value={v.version}>
                  v{v.version}
                </option>
              ))}
          </select>
        </div>
      )}

      {diff && (
        <div className="flex flex-col gap-1.5 border border-slate-800 rounded-lg p-3 bg-slate-950">
          {diff.length === 0 && <p className="text-xs text-slate-500 italic">No differences.</p>}
          {diff.map((entry) => (
            <div key={entry.path} className="text-xs">
              <span className="font-semibold text-slate-300">{entry.label}: </span>
              <span className="text-rose-400/80 line-through">{entry.before ?? "(none)"}</span>
              <span className="text-slate-600"> → </span>
              <span className="text-emerald-400">{entry.after ?? "(none)"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
