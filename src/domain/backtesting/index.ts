// Backtesting: simulate() a signal source over candles. Two adapters plug a
// strategy into the seam: fromStrategyDefinition (Strategy Builder) and
// fromCodedStrategy (src/strategies). See GLOSSARY.md, "Backtesting".
export { simulate } from "./simulate";
export { fromStrategyDefinition } from "./sources/strategyDefinition";
export { fromCodedStrategy } from "./sources/codedStrategy";
export { detectLookAhead } from "./lookAhead";
export type { LookAheadReport } from "./lookAhead";
export * from "./types";
