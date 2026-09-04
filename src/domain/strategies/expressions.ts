import { z } from "zod";

// The expression system is the foundation of the whole builder: every
// comparable value in a strategy (a price, an indicator reading, a fixed
// number, the time of day, a reference level like "opening range high") is
// represented as one of these discriminated-union nodes — never as a
// string like "EMA(20)". The UI only ever *displays* a formatted string
// (see preview.ts); it never stores one.

export const PriceFieldSchema = z.enum(["OPEN", "HIGH", "LOW", "CLOSE", "TYPICAL"]);
export type PriceField = z.infer<typeof PriceFieldSchema>;

export const IndicatorIdSchema = z.enum(["SMA", "EMA", "RSI", "ATR", "VWAP", "MACD", "BOLLINGER_BANDS"]);
export type IndicatorId = z.infer<typeof IndicatorIdSchema>;

export const ReferenceIdSchema = z.enum([
  "OPENING_RANGE_HIGH",
  "OPENING_RANGE_LOW",
  "PREVIOUS_DAY_HIGH",
  "PREVIOUS_DAY_LOW",
  "PREVIOUS_DAY_CLOSE",
  "PREVIOUS_SWING_HIGH",
  "PREVIOUS_SWING_LOW",
]);
export type ReferenceId = z.infer<typeof ReferenceIdSchema>;

const PriceExpressionSchema = z.object({
  type: z.literal("price"),
  field: PriceFieldSchema,
});

const VolumeExpressionSchema = z.object({
  type: z.literal("volume"),
});

const ConstantExpressionSchema = z.object({
  type: z.literal("constant"),
  value: z.number(),
});

// The current bar's time of day, in minutes since midnight (exchange-local
// time) — comparable against a ConstantExpression to build time-of-day
// filters generically, without a separate hardcoded "time filter" system.
const TimeExpressionSchema = z.object({
  type: z.literal("time"),
});

// The current bar's day of week (0 = Sunday … 6 = Saturday) — same
// rationale as TimeExpression, for day-of-week filters.
const DayOfWeekExpressionSchema = z.object({
  type: z.literal("dayOfWeek"),
});

// IndicatorExpression is recursive: `source` is itself an Expression,
// defaulting to Close when omitted. This is what lets "Volume > SMA(Volume,
// 20)" be expressed without a special-cased "average volume" primitive —
// it's just an SMA whose source is a VolumeExpression instead of Close.
const IndicatorExpressionSchema: z.ZodType<{
  type: "indicator";
  indicator: IndicatorId;
  parameters: Record<string, number>;
  source?: Expression;
  output?: string;
}> = z.lazy(() =>
  z.object({
    type: z.literal("indicator"),
    indicator: IndicatorIdSchema,
    parameters: z.record(z.string(), z.number()),
    // Omitted for indicators that don't take a source series (ATR, VWAP).
    source: ExpressionSchema.optional(),
    // For multi-output indicators (MACD, Bollinger Bands) — which output
    // line this expression refers to. Defaults to the indicator's primary
    // output when omitted (see indicators.ts).
    output: z.string().optional(),
  }),
);

const ReferenceExpressionSchema = z.object({
  type: z.literal("reference"),
  reference: ReferenceIdSchema,
  // e.g. { minutes: 15 } for OPENING_RANGE_*, { lookback: 10 } for PREVIOUS_SWING_*.
  parameters: z.record(z.string(), z.number()).default({}),
});

// A plain z.union (not discriminatedUnion) — Zod v4's discriminated-union
// optimization requires statically-discriminable members, which a
// recursive z.lazy() schema (IndicatorExpressionSchema, whose `source` can
// itself be an Expression) doesn't satisfy. Runtime validation is
// equivalent either way.
export const ExpressionSchema: z.ZodType<Expression> = z.lazy(() =>
  z.union([
    PriceExpressionSchema,
    VolumeExpressionSchema,
    ConstantExpressionSchema,
    TimeExpressionSchema,
    DayOfWeekExpressionSchema,
    IndicatorExpressionSchema,
    ReferenceExpressionSchema,
  ]),
);

export type PriceExpression = z.infer<typeof PriceExpressionSchema>;
export type VolumeExpression = z.infer<typeof VolumeExpressionSchema>;
export type ConstantExpression = z.infer<typeof ConstantExpressionSchema>;
export type TimeExpression = z.infer<typeof TimeExpressionSchema>;
export type DayOfWeekExpression = z.infer<typeof DayOfWeekExpressionSchema>;
export type ReferenceExpression = z.infer<typeof ReferenceExpressionSchema>;
export interface IndicatorExpression {
  type: "indicator";
  indicator: IndicatorId;
  parameters: Record<string, number>;
  source?: Expression;
  output?: string;
}

export type Expression =
  | PriceExpression
  | VolumeExpression
  | ConstantExpression
  | TimeExpression
  | DayOfWeekExpression
  | IndicatorExpression
  | ReferenceExpression;

export type ExpressionKind = Expression["type"];
