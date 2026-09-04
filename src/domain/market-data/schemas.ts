import { z } from "zod";
import { SUPPORTED_TIMEFRAMES } from "./types";

export const AssetTypeSchema = z.enum(["STOCK", "INDEX", "FUTURE", "OPTION", "ETF", "CRYPTO", "FOREX"]);
export const TimeframeSchema = z.enum(SUPPORTED_TIMEFRAMES);

export const InstrumentQuerySchema = z.object({
  assetType: AssetTypeSchema.optional(),
  isActive: z.boolean().optional(),
  search: z.string().optional(),
});
export type InstrumentQuery = z.infer<typeof InstrumentQuerySchema>;

export const CandleQuerySchema = z.object({
  instrumentId: z.string().min(1),
  timeframe: TimeframeSchema,
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().positive().max(5000).default(500),
});
export type CandleQueryInput = z.infer<typeof CandleQuerySchema>;
