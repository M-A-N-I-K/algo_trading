import { platformSymbol } from "@/lib/costs/fundingpips";

// Contract specifications as the MT5 terminal reports them (PB_BarFeed
// writes MQL5/Files/PlaybookFeed/symbols.csv). Used to size markets whose lot
// size and $ value the app has no measured figure for: FTSE100 (quoted in
// pounds), UKOIL, EURJPY, GBPAUD. Shared by server and browser, so it holds
// no file access: the server reads the file (src/lib/mt5/feed.ts) and passes
// the specs along with the playbook's signals.

export interface SymbolSpec {
  digits: number;
  contract: number; // units of the base asset in one lot
  tickSize: number; // smallest price step
  tickValue: number; // account currency (USD) one lot makes on a one-tick move, at today's exchange rate
  volumeMin: number;
  volumeStep: number;
  profitCurrency: string;
  accountCurrency?: string;
}

const g = globalThis as typeof globalThis & { __mt5Specs?: Map<string, SymbolSpec> };
const specs = (g.__mt5Specs ??= new Map());

/** Remember specs, keyed by platform symbol ("FTSE100"). */
export function registerSpecs(record: Record<string, SymbolSpec> | null | undefined): void {
  for (const [sym, s] of Object.entries(record ?? {})) {
    if (s && s.contract > 0 && s.tickSize > 0 && s.tickValue > 0) specs.set(platformSymbol(sym), s);
  }
}

export const specFor = (symbol: string): SymbolSpec | undefined => specs.get(platformSymbol(symbol));

/** Dollars one unit of the base asset makes on a 1.0 price move, from the spec. */
// Only the exchange rate is taken from MT5's tick value. On this terminal the
// tick value of dollar-quoted CFDs is wrong (gold reports $0.01 a tick per
// 100-oz lot; the account's real trades paid $1), so a market quoted in the
// account's own currency is simply $1 per unit per point.
export function specUsdPerUnitMove(symbol: string): number | undefined {
  const s = specFor(symbol);
  if (!s) return undefined;
  if (s.profitCurrency && s.profitCurrency === (s.accountCurrency || "USD")) return 1;
  return s.tickValue / s.tickSize / s.contract;
}

/** Parse symbols.csv (tab-separated, with a header row). */
export function parseSpecs(text: string): Record<string, SymbolSpec> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return {};
  const head = lines[0].split("\t").map((h) => h.trim().toUpperCase());
  const at = (cells: string[], name: string) => cells[head.indexOf(name)]?.trim() ?? "";
  const out: Record<string, SymbolSpec> = {};
  for (const line of lines.slice(1)) {
    const c = line.split("\t");
    const sym = at(c, "SYMBOL");
    if (!sym) continue;
    out[sym] = {
      digits: Number(at(c, "DIGITS")),
      contract: Number(at(c, "CONTRACT")),
      tickSize: Number(at(c, "TICKSIZE")),
      tickValue: Number(at(c, "TICKVALUE")),
      volumeMin: Number(at(c, "VOLUMEMIN")),
      volumeStep: Number(at(c, "VOLUMESTEP")),
      profitCurrency: at(c, "PROFITCCY"),
      accountCurrency: at(c, "ACCOUNTCCY") || undefined,
    };
  }
  return out;
}
