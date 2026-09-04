import { z } from "zod";

// Strategy-level risk guardrails — distinct from PositionSizingConfig
// (which determines *how* quantity is calculated). These are ceilings the
// chosen sizing must respect, validated in validation.ts (e.g. "Risk per
// trade cannot exceed the account risk limit").
export const RiskConfigurationSchema = z.object({
  maxRiskPerTradePercent: z.number().positive().max(100).optional(),
  maxDailyLossPercent: z.number().positive().max(100).optional(),
  maxPortfolioRiskPercent: z.number().positive().max(100).optional(),
  maxOpenPositions: z.number().int().positive().optional(),
  maxPositionSizeCapital: z.number().positive().optional(),
  maxCapitalAllocationPercent: z.number().positive().max(100).optional(),
});
export type RiskConfiguration = z.infer<typeof RiskConfigurationSchema>;
