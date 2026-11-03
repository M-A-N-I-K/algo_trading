import { Strategy, TradeTarget } from "@/types/strategy";
import { Decision, EntryIntent, Side, SignalSource, TradeLevels } from "../types";

// Signal source for the hand-coded strategies in src/strategies. They compute
// signals for the whole history at once, so this adapter precomputes and
// answers per bar; detectLookAhead is what verifies they don't peek forward.
//
// Strategies with targets enter only when a signal carries a stop and target
// (absolute prices). Strategies without targets are "always in market": an
// opposite signal closes and reverses the position.
export function fromCodedStrategy(strategy: Strategy): SignalSource {
  const hasTargets = typeof strategy.getTradeTargets === "function";

  return {
    name: strategy.name,
    reverseOnOppositeSignal: !hasTargets,

    prepare(candles) {
      const series = [...candles];
      const signals = strategy.generateSignals(series);
      const targets = hasTargets ? strategy.getTradeTargets!(series) : undefined;

      return {
        decide(t): Decision {
          const signal = signals[t];
          if (signal !== "BUY" && signal !== "SELL") return {};
          const side: Side = signal === "BUY" ? "LONG" : "SHORT";

          if (!targets) return { enter: { side, levels: () => ({}) } };

          const target = targets[t];
          if (!target || target.stopLoss === undefined || target.takeProfit === undefined) return {};
          const enter: EntryIntent = { side, levels: () => toLevels(target) };
          return { enter };
        },
      };
    },
  };
}

function toLevels(target: TradeTarget): TradeLevels {
  return {
    stop: target.stopLoss,
    target: target.takeProfit,
    partials: target.partialExits,
    trailing:
      target.trailTriggerR !== undefined && target.trailDistance !== undefined
        ? { triggerR: target.trailTriggerR, distance: target.trailDistance }
        : undefined,
  };
}
