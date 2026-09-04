import { z } from "zod";

// The preferred default is RISK_PERCENT — the platform is designed to
// encourage consistent risk management, per product direction.
export const PositionSizingConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("FIXED_QUANTITY"), quantity: z.number().positive() }),
  z.object({ type: z.literal("FIXED_CAPITAL"), capital: z.number().positive() }),
  z.object({ type: z.literal("RISK_PERCENT"), percent: z.number().positive() }),
  z.object({ type: z.literal("RISK_AMOUNT"), amount: z.number().positive() }),
]);
export type PositionSizingConfig = z.infer<typeof PositionSizingConfigSchema>;

export const DEFAULT_POSITION_SIZING: PositionSizingConfig = { type: "RISK_PERCENT", percent: 1 };
