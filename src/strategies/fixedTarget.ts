import { OHLC } from "../indicators/utils";
import { Strategy, TradeTarget } from "../types";

// A strategy with its own entries and stops but a fixed target: `rr` times
// the risk from the signal candle's close to the stop. Partial exits and
// trailing stops are dropped, so a trade ends at the stop or the target.
// Used for Playbook setups whose target was picked by testing 1–4R on the
// broker's MT5 bars (src/lib/playbook/config.ts).
export function withFixedTarget(strategy: Strategy, rr: number): Strategy {
  if (!(rr > 0)) throw new Error(`Target must be above 0R, got ${rr}`);
  let targets: (TradeTarget | null)[] = [];
  return {
    name: `${strategy.name} (${rr}R target)`,
    generateSignals(candles: OHLC[]) {
      const signals = strategy.generateSignals(candles);
      const own = strategy.getTradeTargets?.(candles) ?? [];
      targets = signals.map((s, t) => {
        const stop = own[t]?.stopLoss;
        if ((s !== "BUY" && s !== "SELL") || stop === undefined) return null;
        const entry = candles[t].close;
        const risk = s === "BUY" ? entry - stop : stop - entry;
        if (!(risk > 0)) return null;
        return { stopLoss: stop, takeProfit: entry + (s === "BUY" ? 1 : -1) * rr * risk };
      });
      // A signal left without a valid stop can't be traded.
      return signals.map((s, t) => (targets[t] ? s : "HOLD"));
    },
    getTradeTargets() {
      return targets;
    },
  };
}
