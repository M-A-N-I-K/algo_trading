import { StrategyDefinition } from "./definition";
import { describeConditionNode, describePositionSizing, describeStopLoss, describeTakeProfit } from "./preview";

export interface StrategyDiffEntry {
  label: string;
  path: string;
  before: string | null;
  after: string | null;
}

// Diffs two StrategyDefinitions field-by-field using the same
// human-readable descriptions the preview panel uses (see preview.ts) —
// never a raw JSON string comparison, which would produce noisy,
// unreadable diffs for something like a reordered condition array that
// means the same thing.
export function diffStrategyDefinitions(before: StrategyDefinition, after: StrategyDefinition): StrategyDiffEntry[] {
  const entries: StrategyDiffEntry[] = [];
  const push = (label: string, path: string, beforeVal: string | null, afterVal: string | null) => {
    if (beforeVal !== afterVal) entries.push({ label, path, before: beforeVal, after: afterVal });
  };

  push("Name", "metadata.name", before.metadata.name, after.metadata.name);
  push("Description", "metadata.description", before.metadata.description || null, after.metadata.description || null);
  push("Strategy Type", "metadata.strategyType", before.metadata.strategyType, after.metadata.strategyType);
  push("Symbol", "market.symbol", before.market.symbol, after.market.symbol);
  push("Timeframe", "timeframe", before.timeframe, after.timeframe);
  push("Direction", "direction", before.direction, after.direction);

  push(
    "Entry Long",
    "entry.long",
    before.entry.long ? describeConditionNode(before.entry.long.conditions) : null,
    after.entry.long ? describeConditionNode(after.entry.long.conditions) : null,
  );
  push(
    "Entry Short",
    "entry.short",
    before.entry.short ? describeConditionNode(before.entry.short.conditions) : null,
    after.entry.short ? describeConditionNode(after.entry.short.conditions) : null,
  );

  push(
    "Stop Loss",
    "exit.stopLoss",
    before.exit.stopLoss ? describeStopLoss(before.exit.stopLoss) : null,
    after.exit.stopLoss ? describeStopLoss(after.exit.stopLoss) : null,
  );
  push(
    "Take Profit",
    "exit.takeProfit",
    before.exit.takeProfit ? describeTakeProfit(before.exit.takeProfit) : null,
    after.exit.takeProfit ? describeTakeProfit(after.exit.takeProfit) : null,
  );
  push("Time Exit", "exit.timeExit", before.exit.timeExit?.time ?? null, after.exit.timeExit?.time ?? null);
  push(
    "Signal Exit",
    "exit.signalExit",
    before.exit.signalExit ? describeConditionNode(before.exit.signalExit.conditions) : null,
    after.exit.signalExit ? describeConditionNode(after.exit.signalExit.conditions) : null,
  );

  push("Position Sizing", "positionSizing", describePositionSizing(before.positionSizing), describePositionSizing(after.positionSizing));

  push(
    "Max Risk / Trade",
    "risk.maxRiskPerTradePercent",
    before.risk.maxRiskPerTradePercent !== undefined ? `${before.risk.maxRiskPerTradePercent}%` : null,
    after.risk.maxRiskPerTradePercent !== undefined ? `${after.risk.maxRiskPerTradePercent}%` : null,
  );
  push(
    "Max Daily Loss",
    "risk.maxDailyLossPercent",
    before.risk.maxDailyLossPercent !== undefined ? `${before.risk.maxDailyLossPercent}%` : null,
    after.risk.maxDailyLossPercent !== undefined ? `${after.risk.maxDailyLossPercent}%` : null,
  );
  push(
    "Max Portfolio Risk",
    "risk.maxPortfolioRiskPercent",
    before.risk.maxPortfolioRiskPercent !== undefined ? `${before.risk.maxPortfolioRiskPercent}%` : null,
    after.risk.maxPortfolioRiskPercent !== undefined ? `${after.risk.maxPortfolioRiskPercent}%` : null,
  );

  const sessionLabel = (s: StrategyDefinition["session"]) => (s ? `${s.startTime ?? "open"}–${s.endTime ?? "close"}, ${s.days.join("/")}` : null);
  push("Session", "session", sessionLabel(before.session), sessionLabel(after.session));

  push(
    "Filters",
    "filters",
    before.filters ? describeConditionNode(before.filters) : null,
    after.filters ? describeConditionNode(after.filters) : null,
  );

  return entries;
}
