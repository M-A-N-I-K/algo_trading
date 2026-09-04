import { z } from "zod";
import { ConditionNodeSchema } from "./conditions";

// --- Entry order types -----------------------------------------------------
// P1 fully implements MARKET entries. STOP/LIMIT are modeled now so the
// interpreter interface and schema don't need to change shape later — but
// the interpreter only evaluates MARKET orders in this phase.
export const EntryOrderSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("MARKET") }),
  z.object({ type: z.literal("STOP"), stopPrice: z.number() }),
  z.object({ type: z.literal("LIMIT"), limitPrice: z.number() }),
]);
export type EntryOrder = z.infer<typeof EntryOrderSchema>;

export const EntryRuleSchema = z.object({
  conditions: ConditionNodeSchema,
  order: EntryOrderSchema.default({ type: "MARKET" }),
});
export type EntryRule = z.infer<typeof EntryRuleSchema>;

export const EntryConfigurationSchema = z.object({
  long: EntryRuleSchema.optional(),
  short: EntryRuleSchema.optional(),
});
export type EntryConfiguration = z.infer<typeof EntryConfigurationSchema>;

// --- Stop loss --------------------------------------------------------------
// Structured, never a string like "1.5 ATR" — the future backtesting
// engine interprets these programmatically.
export const StopLossRuleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("FIXED_POINTS"), points: z.number().positive() }),
  z.object({ type: z.literal("PERCENTAGE"), percent: z.number().positive() }),
  z.object({ type: z.literal("ATR_MULTIPLE"), indicator: z.literal("ATR"), period: z.number().int().positive(), multiplier: z.number().positive() }),
  z.object({ type: z.literal("PREVIOUS_SWING"), lookback: z.number().int().positive() }),
  z.object({ type: z.literal("FIXED_PRICE"), price: z.number().positive() }),
]);
export type StopLossRule = z.infer<typeof StopLossRuleSchema>;

// --- Take profit -------------------------------------------------------------
export const TakeProfitRuleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("FIXED_POINTS"), points: z.number().positive() }),
  z.object({ type: z.literal("PERCENTAGE"), percent: z.number().positive() }),
  z.object({ type: z.literal("R_MULTIPLE"), multiple: z.number().positive() }),
  z.object({ type: z.literal("FIXED_PRICE"), price: z.number().positive() }),
]);
export type TakeProfitRule = z.infer<typeof TakeProfitRuleSchema>;

// --- Time / signal exit -------------------------------------------------------
export const TimeExitRuleSchema = z.object({
  type: z.literal("TIME"),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Time must be in HH:MM 24-hour format."),
});
export type TimeExitRule = z.infer<typeof TimeExitRuleSchema>;

export const SignalExitRuleSchema = z.object({
  type: z.literal("SIGNAL"),
  conditions: ConditionNodeSchema,
});
export type SignalExitRule = z.infer<typeof SignalExitRuleSchema>;

// A strategy can combine any subset of these — whichever triggers first,
// on a given bar, closes the position.
export const ExitConfigurationSchema = z.object({
  stopLoss: StopLossRuleSchema.optional(),
  takeProfit: TakeProfitRuleSchema.optional(),
  timeExit: TimeExitRuleSchema.optional(),
  signalExit: SignalExitRuleSchema.optional(),
});
export type ExitConfiguration = z.infer<typeof ExitConfigurationSchema>;
