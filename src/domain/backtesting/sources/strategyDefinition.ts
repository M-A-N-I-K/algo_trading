import { StrategyDefinition } from "@/domain/strategies/definition";
import { createEvaluationContext, evaluateConditionNode } from "@/domain/strategies/evaluation";
import { getStrategyInterpreter } from "@/domain/strategies/interpreter";
import { BacktestConfigError, Decision, EntryIntent, Side, SignalSource, TradeLevels } from "../types";

const DAY_MS = 86_400_000;

// Signal source for a Strategy Builder definition. Entries, the signal exit
// and stop/target rules come from the existing StrategyInterpreter; the
// simulation owns fills. Relative stops and targets (points, %, ATR, R) are
// computed from the actual fill price, with indicator inputs taken from the
// signal bar — the last bar fully known when the order is placed.
export function fromStrategyDefinition(definition: StrategyDefinition): SignalSource {
  for (const [side, rule] of [["long", definition.entry.long], ["short", definition.entry.short]] as const) {
    if (rule && rule.order.type !== "MARKET") {
      throw new BacktestConfigError(
        `The ${side} entry uses a ${rule.order.type} order. Backtests only simulate MARKET entries for now.`,
      );
    }
  }

  const { exit, risk } = definition;

  return {
    name: definition.metadata.name || "(unnamed strategy)",
    sizing: definition.positionSizing,
    guardrails: {
      maxRiskPerTradePercent: risk.maxRiskPerTradePercent,
      maxPositionSizeCapital: risk.maxPositionSizeCapital,
      maxDailyLossPercent: risk.maxDailyLossPercent,
    },

    prepare(candles) {
      const ctx = createEvaluationContext([...candles]);
      const interpreter = getStrategyInterpreter();

      const levelsFor = (side: Side, fill: number, t: number): TradeLevels | null => {
        const stop = exit.stopLoss ? interpreter.calculateStop(exit.stopLoss, ctx, t, fill, side) : undefined;
        if (stop !== undefined && !Number.isFinite(stop)) return null; // e.g. no swing point yet
        if (exit.takeProfit?.type === "R_MULTIPLE" && stop === undefined) return null;
        const target = exit.takeProfit ? interpreter.calculateTarget(exit.takeProfit, fill, stop ?? fill, side) : undefined;
        return { stop, target };
      };

      const entryAt = (t: number): EntryIntent | undefined => {
        const signal = interpreter.evaluateEntry(definition, ctx, t);
        if (signal.long === signal.short) return undefined; // neither, or ambiguous
        const side: Side = signal.long ? "LONG" : "SHORT";
        return { side, levels: (fill) => levelsFor(side, fill, t) };
      };

      return {
        decide(t, position): Decision {
          const enter = entryAt(t);
          if (!position) return { enter };
          const signalExit = !!exit.signalExit && evaluateConditionNode(exit.signalExit.conditions, ctx, t);
          return { exit: signalExit, enter };
        },

        exitAtOpen: exit.timeExit
          ? (t, position) => candles[t].openTime >= nextClockTime(position.entryTime, exit.timeExit!.time)
          : undefined,
      };
    },
  };
}

// The first HH:MM (UTC) strictly after `afterMs`.
function nextClockTime(afterMs: number, hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  const sameDay = Math.floor(afterMs / DAY_MS) * DAY_MS + (h * 60 + m) * 60_000;
  return sameDay > afterMs ? sameDay : sameDay + DAY_MS;
}
