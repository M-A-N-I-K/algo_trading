// Domain types are intentionally decoupled from Prisma's generated types —
// consumers (UI, API routes) depend on these, never on `@prisma/client`
// directly, so the persistence layer can change without touching callers.

export type AssetType = "STOCK" | "INDEX" | "FUTURE" | "OPTION" | "ETF" | "CRYPTO" | "FOREX";

// Only STOCK/INDEX are exercised end-to-end in P0; the remaining asset
// types exist on the type/schema so later phases don't need a rewrite.
export const P0_SUPPORTED_ASSET_TYPES: AssetType[] = ["STOCK", "INDEX"];

// `Timeframe` derives from the const tuple (rather than the tuple being
// typed as `Timeframe[]`) so Zod's `z.enum(SUPPORTED_TIMEFRAMES)` infers
// the literal union instead of widening to `string`.
export const SUPPORTED_TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "1d"] as const;
export type Timeframe = (typeof SUPPORTED_TIMEFRAMES)[number];

export interface Instrument {
  id: string;
  symbol: string;
  exchange: string;
  assetType: AssetType;
  currency: string;
  tickSize: number;
  lotSize: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Candle {
  instrumentId: string;
  timestamp: string; // ISO 8601
  timeframe: Timeframe;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  // Demo/seeded candles must never be presented as live market data — the
  // UI is required to surface this flag rather than hide it.
  isDemo: boolean;
}

export interface CandleQuery {
  instrumentId: string;
  timeframe: Timeframe;
  from?: Date;
  to?: Date;
  limit?: number;
}
