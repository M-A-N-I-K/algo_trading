import { Candle } from "@/domain/market-data/types";
import { StrategyDefinition } from "@/domain/strategies/types";
import { BacktestEngine, BacktestResult, BacktestRunConfiguration } from "./types";

// P0 placeholder only. Deliberately throws rather than fabricating a
// result — per the product principle that backtest results must never be
// faked and presented as real. A future phase implements this against the
// strategy configuration DSL (see src/domain/strategies/schemas.ts).
//
// Note: this repo separately has a genuinely working backtest engine at
// src/backtest/engine.ts with real, tested strategies — that one predates
// and is independent of this P0 foundation interface, and continues to
// power the existing /backtest page unchanged.
export class NotImplementedBacktestEngine implements BacktestEngine {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- parameters are part of the BacktestEngine contract; this implementation intentionally doesn't use them yet.
  async run(strategy: StrategyDefinition, marketData: Candle[], configuration: BacktestRunConfiguration): Promise<BacktestResult> {
    throw new Error(
      "BacktestEngine.run() is not implemented in P0. This is a foundation interface only — " +
        "see src/domain/backtesting/types.ts for the contract a future phase will implement.",
    );
  }
}

export function getBacktestEngine(): BacktestEngine {
  return new NotImplementedBacktestEngine();
}
