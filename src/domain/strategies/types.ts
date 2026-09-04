import { StrategyDefinition } from "./definition";

export type StrategyStatus = "DRAFT" | "READY" | "ARCHIVED";

// Relational metadata (fast to list/filter/index) — kept separate from the
// structured StrategyDefinition JSON stored per-version. `name`/`status`
// are denormalized from the latest version's definition at save time.
export interface Strategy {
  id: string;
  userId: string;
  name: string;
  status: StrategyStatus;
  createdAt: string;
  updatedAt: string;
}

// Immutable once created: a new version is always inserted, never
// overwritten, so a Backtest (later phase) stays reproducible against the
// exact definition that produced it.
export interface StrategyVersionRecord {
  id: string;
  strategyId: string;
  version: number;
  definition: StrategyDefinition;
  createdAt: string;
  // Optional freeform note describing what changed vs. the previous
  // version (see diff.ts for the auto-generated structured diff).
  changeNote?: string;
}

export * from "./definition";
export * from "./expressions";
export * from "./expressionRegistry";
export * from "./operators";
export * from "./indicators";
export * from "./conditions";
export * from "./entryExit";
export * from "./positionSizing";
export * from "./riskConfig";
export * from "./session";
