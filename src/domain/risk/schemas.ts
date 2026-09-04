import { z } from "zod";

export const DirectionSchema = z.enum(["LONG", "SHORT"]);
export type Direction = z.infer<typeof DirectionSchema>;

export const InstrumentSpecSchema = z.object({
  tickSize: z.number().positive(),
  lotSize: z.number().positive(),
  // Value multiplier per point of price movement — 1 for stocks/indices,
  // >1 for instruments like futures where one point of price != one
  // currency unit of P&L per unit.
  contractMultiplier: z.number().positive().default(1),
});
export type InstrumentSpec = z.infer<typeof InstrumentSpecSchema>;

export const CostsSchema = z.object({
  // FLAT: fixed currency amount per round trip. PERCENT: % of notional
  // position value per round trip.
  commissionType: z.enum(["FLAT", "PERCENT"]).default("FLAT"),
  commissionValue: z.number().nonnegative().default(0),
  // Adverse slippage assumed per fill, expressed in instrument ticks (not a
  // vague %) — applied once at entry and once at exit.
  slippageTicks: z.number().nonnegative().default(0),
});
export type Costs = z.infer<typeof CostsSchema>;

export const AccountRiskSchema = z.object({
  accountSize: z.number(),
  riskPerTradePercent: z.number(),
  maxDailyLossPercent: z.number().positive().max(100).optional(),
  maxPortfolioRiskPercent: z.number().positive().max(100).optional(),
});
export type AccountRisk = z.infer<typeof AccountRiskSchema>;

export const TradeSetupSchema = z.object({
  symbol: z.string().min(1),
  direction: DirectionSchema,
  entryPrice: z.number(),
  stopLoss: z.number(),
  takeProfit: z.number().optional(),
});
export type TradeSetup = z.infer<typeof TradeSetupSchema>;

export const RiskCalculationInputSchema = z.object({
  account: AccountRiskSchema,
  trade: TradeSetupSchema,
  instrument: InstrumentSpecSchema,
  costs: CostsSchema.default({ commissionType: "FLAT", commissionValue: 0, slippageTicks: 0 }),
  // Risk already committed to other open positions, for portfolio-risk aggregation.
  existingOpenRiskAmount: z.number().nonnegative().default(0),
  // Realized loss so far today, for daily risk utilization.
  todaysRealizedLoss: z.number().nonnegative().default(0),
});
export type RiskCalculationInput = z.infer<typeof RiskCalculationInputSchema>;
