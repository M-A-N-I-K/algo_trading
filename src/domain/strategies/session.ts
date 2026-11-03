import { z } from "zod";

export const DayOfWeekSchema = z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]);
export const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const;
export const ALL_DAYS = [...WEEKDAYS, "SATURDAY", "SUNDAY"] as const;
export type DayOfWeek = z.infer<typeof DayOfWeekSchema>;

const TimeStringSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Time must be in HH:MM 24-hour format.");

// The common-case, ergonomic way to restrict when a strategy is allowed to
// trade. Power users needing more exotic conditions (e.g. "only on the
// third Friday") can express that instead via StrategyDefinition.filters,
// which reuses the generic condition tree (see conditions.ts) with
// TimeExpression/DayOfWeekExpression.
export const TradingSessionSchema = z.object({
  startTime: TimeStringSchema.optional(),
  endTime: TimeStringSchema.optional(),
  // Defaults to weekdays; crypto instruments trade all week (see ALL_DAYS).
  days: z.array(DayOfWeekSchema).default([...WEEKDAYS]),
  sessionType: z.enum(["REGULAR", "CUSTOM"]).default("REGULAR"),
  dateRange: z
    .object({
      from: z.string(),
      to: z.string(),
    })
    .optional(),
});
export type TradingSession = z.infer<typeof TradingSessionSchema>;
