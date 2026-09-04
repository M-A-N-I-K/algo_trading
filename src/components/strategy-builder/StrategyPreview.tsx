"use client";

import { useMemo } from "react";
import { StrategyDefinition, renderStrategyPreviewText } from "@/domain/strategies";

interface StrategyPreviewProps {
  definition: StrategyDefinition;
}

// Pure rendering of `renderStrategyPreviewText` — this component never
// computes or displays anything about historical performance; only the
// configured rules, since that text is entirely derived from the
// StrategyDefinition and nothing else.
export default function StrategyPreview({ definition }: StrategyPreviewProps) {
  const text = useMemo(() => renderStrategyPreviewText(definition), [definition]);

  return (
    <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-300 bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-x-auto">
      {text}
    </pre>
  );
}
