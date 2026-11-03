import { Strategy } from "../types/strategy";
import { OHLC } from "../indicators/utils";
import {
  createMacdSmaAtrStrategy,
  createMacd200EmaSrStrategy,
  createSmartMoneyConceptsStrategy,
  createSessionLondonOpenBosStrategy,
  createExtremeOrderBlockStrategy,
} from "./index";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each factory takes its own options shape
type StrategyFactory = (options?: any) => Strategy;

// The one registry of hand-coded strategies, keyed as in STRATEGY_CATALOG
// (src/lib/strategyCatalog.ts). The API route and every CLI script look
// strategies up here.
export const CODED_STRATEGIES: Record<string, StrategyFactory> = {
  "macd-sma-atr": createMacdSmaAtrStrategy,
  "macd-200ema-sr": createMacd200EmaSrStrategy,
  smc: createSmartMoneyConceptsStrategy,
  "session-london-bos": createSessionLondonOpenBosStrategy,
  "extreme-order-block": createExtremeOrderBlockStrategy,
};

// Strategies whose bias comes from a real higher-timeframe series, fetched
// separately and passed as { htfCandles }. `executionInterval` forces the
// timeframe the strategy trades on, regardless of the request.
export const HIGHER_TIMEFRAME: Record<string, { interval: string; executionInterval?: string }> = {
  "session-london-bos": { interval: "4h" },
  "extreme-order-block": { interval: "1h", executionInterval: "15m" },
};

export function createCodedStrategy(key: string, htfCandles?: OHLC[]): Strategy | null {
  const factory = CODED_STRATEGIES[key];
  if (!factory) return null;
  return HIGHER_TIMEFRAME[key] ? factory({ htfCandles }) : factory();
}
