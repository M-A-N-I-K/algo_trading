// Backtesting: simulate() a signal source over candles. fromCodedStrategy
// plugs a strategy from src/strategies into the seam. See GLOSSARY.md, "Backtesting".
export { simulate } from "./simulate";
export { fromCodedStrategy } from "./sources/codedStrategy";
export { detectLookAhead } from "./lookAhead";
export type { LookAheadReport } from "./lookAhead";
export * from "./types";
