import { z } from "zod";
import { SUPPORTED_TIMEFRAMES } from "@/domain/market-data/types";
import { ConditionNodeSchema } from "./conditions";
import { EntryConfigurationSchema, ExitConfigurationSchema } from "./entryExit";
import { PositionSizingConfigSchema, DEFAULT_POSITION_SIZING } from "./positionSizing";
import { RiskConfigurationSchema } from "./riskConfig";
import { TradingSessionSchema } from "./session";

export const StrategyTypeSchema = z.enum(["TREND_FOLLOWING", "MOMENTUM", "MEAN_REVERSION", "BREAKOUT", "REVERSAL", "CUSTOM"]);
export type StrategyType = z.infer<typeof StrategyTypeSchema>;

export const StrategyDirectionSchema = z.enum(["LONG_ONLY", "SHORT_ONLY", "LONG_AND_SHORT"]);
export type StrategyDirection = z.infer<typeof StrategyDirectionSchema>;

export const StrategyMetadataSchema = z.object({
  name: z.string(),
  description: z.string().default(""),
  // Optional: users aren't forced to categorize a strategy that doesn't
  // fit neatly — "CUSTOM" is always available and is the schema default.
  strategyType: StrategyTypeSchema.default("CUSTOM"),
});
export type StrategyMetadata = z.infer<typeof StrategyMetadataSchema>;

export const StrategyMarketSchema = z.object({
  // `symbol` is always present (denormalized) so an exported strategy
  // stays portable even without the originating Instrument row.
  symbol: z.string(),
  instrumentId: z.string().optional(),
});
export type StrategyMarket = z.infer<typeof StrategyMarketSchema>;

export const TimeframeSchema = z.enum(SUPPORTED_TIMEFRAMES);

// The complete Strategy Definition — the single source of truth. The UI is
// only ever an editor for this structure; nothing about a strategy's
// meaning lives anywhere else. This is what gets Zod-validated, persisted
// as JSON, exported/imported, and eventually handed to the backtesting
// engine alongside market data.
export const StrategyDefinitionSchema = z.object({
  metadata: StrategyMetadataSchema,
  market: StrategyMarketSchema,
  timeframe: TimeframeSchema,
  direction: StrategyDirectionSchema.default("LONG_ONLY"),
  entry: EntryConfigurationSchema,
  exit: ExitConfigurationSchema,
  positionSizing: PositionSizingConfigSchema.default(DEFAULT_POSITION_SIZING),
  risk: RiskConfigurationSchema.default({}),
  session: TradingSessionSchema.optional(),
  // Additional generic filters (RSI range, volume threshold, day-of-week,
  // ...) reusing the same condition tree as entry/exit — deliberately not
  // a separate hardcoded filter system (see conditions.ts).
  filters: ConditionNodeSchema.optional(),
});
export type StrategyDefinition = z.infer<typeof StrategyDefinitionSchema>;
