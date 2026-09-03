import { Currency } from "./types";

// Rounds using a scale-multiply-round-divide pass to avoid the classic
// floating point artifacts (e.g. 1.005 -> 1.00 instead of 1.01) that show up
// when rounding money values directly with Math.round(x * 100) / 100.
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

// Never let NaN/Infinity leak into a calculation chain.
export function safeNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : fallback;
}

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const usdtFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

// INR renders as "₹1,00,000" (Indian digit grouping); USDT renders as
// "10,000 USDT" (Western grouping, suffixed) since it isn't ISO-4217.
export function formatCurrency(value: number, currency: Currency): string {
  const safe = Number.isFinite(value) ? value : 0;
  if (currency === "INR") {
    return inrFormatter.format(safe);
  }
  return `${usdtFormatter.format(safe)} USDT`;
}

// For quantities that may need more precision (e.g. crypto position size in units).
export function formatQuantity(value: number, decimals = 6): string {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: decimals }).format(safe);
}

export function formatPercent(value: number, decimals = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toFixed(decimals)}%`;
}

export function formatRR(value: number, decimals = 2): string {
  const safe = Number.isFinite(value) && value > 0 ? value : 0;
  return `1 : ${safe.toFixed(decimals)}`;
}
