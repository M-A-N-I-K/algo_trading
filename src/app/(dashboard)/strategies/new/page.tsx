"use client";

import { useState } from "react";
import StrategyBuilder from "@/components/strategy-builder/StrategyBuilder";
import { emptyStrategyDefinition } from "@/components/strategy-builder/useStrategyBuilder";

export default function NewStrategyPage() {
  const [initialDefinition] = useState(emptyStrategyDefinition);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100">New Strategy</h1>
        <p className="text-sm text-slate-500">Build a strategy visually — the underlying definition is what actually gets validated, saved, and (later) backtested.</p>
      </div>
      <StrategyBuilder initialDefinition={initialDefinition} />
    </div>
  );
}
