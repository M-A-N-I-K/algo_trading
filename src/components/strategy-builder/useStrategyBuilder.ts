"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_POSITION_SIZING, StrategyDefinition, validateStrategyDefinition } from "@/domain/strategies";

export function emptyStrategyDefinition(): StrategyDefinition {
  return {
    metadata: { name: "", description: "", strategyType: "CUSTOM" },
    market: { symbol: "" },
    timeframe: "5m",
    direction: "LONG_ONLY",
    entry: {},
    exit: {},
    positionSizing: DEFAULT_POSITION_SIZING,
    risk: {},
    session: undefined,
    filters: undefined,
  };
}

// Single top-level state container for the builder — deliberately a plain
// useState rather than a state-management library (per the "don't
// prematurely introduce complexity" guidance). `isDirty` compares against
// a JSON snapshot taken at the last successful save, so the unsaved-changes
// warning and the Save button states stay in sync with what's actually on
// the server.
export function useStrategyBuilder(initial: StrategyDefinition) {
  const [definition, setDefinition] = useState<StrategyDefinition>(initial);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initial));

  const isDirty = useMemo(() => JSON.stringify(definition) !== savedSnapshot, [definition, savedSnapshot]);
  const validation = useMemo(() => validateStrategyDefinition(definition), [definition]);

  const markSaved = useCallback((saved: StrategyDefinition) => {
    setDefinition(saved);
    setSavedSnapshot(JSON.stringify(saved));
  }, []);

  const loadDefinition = useCallback((next: StrategyDefinition) => {
    setDefinition(next);
    setSavedSnapshot(JSON.stringify(next));
  }, []);

  // Covers tab close / refresh / external navigation. In-app <Link> clicks
  // aren't intercepted by this (App Router has no stable route-change-guard
  // API yet) — callers should confirm explicitly before navigating away.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  return { definition, setDefinition, isDirty, validation, markSaved, loadDefinition };
}
