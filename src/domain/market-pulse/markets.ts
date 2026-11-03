// Markets the Live Pulse panel can show. All are Binance USDⓈ-M perpetual
// futures, so crypto and commodities share one data source. To add one,
// add a line: the symbol must trade on fapi.binance.com.

export type PulseCategory = "Crypto" | "Commodity";

export interface PulseMarket {
  symbol: string; // Binance futures symbol
  label: string;
  category: PulseCategory;
  decimals: number; // price decimals to display
  // Price per pip, for markets traders quote in pips (gold 0.1). Others show %.
  pipSize?: number;
  // Calendar currencies whose news moves this market (Catalysts tab).
  currencies: string[];
}

export const PULSE_MARKETS: PulseMarket[] = [
  { symbol: "BTCUSDT", label: "Bitcoin", category: "Crypto", decimals: 1, currencies: ["USD"] },
  { symbol: "ETHUSDT", label: "Ethereum", category: "Crypto", decimals: 2, currencies: ["USD"] },
  { symbol: "SOLUSDT", label: "Solana", category: "Crypto", decimals: 2, currencies: ["USD"] },
  { symbol: "XRPUSDT", label: "XRP", category: "Crypto", decimals: 4, currencies: ["USD"] },
  { symbol: "XAUUSDT", label: "Gold", category: "Commodity", decimals: 2, pipSize: 0.1, currencies: ["USD"] },
  { symbol: "XAGUSDT", label: "Silver", category: "Commodity", decimals: 3, pipSize: 0.01, currencies: ["USD"] },
  { symbol: "CLUSDT", label: "WTI crude oil", category: "Commodity", decimals: 2, pipSize: 0.01, currencies: ["USD", "CAD"] },
];

export const DEFAULT_PULSE_SYMBOL = "XAUUSDT";

export function getPulseMarket(symbol: string): PulseMarket | undefined {
  return PULSE_MARKETS.find((m) => m.symbol === symbol);
}
