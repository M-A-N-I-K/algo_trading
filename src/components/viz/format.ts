// Pure formatters, kept out of the "use client" modules so Server Components
// can call them too (a function imported through a client module is only a
// client reference on the server and throws when invoked).

const MINUS = "−";

/** +$7.50 / −$62.64, with a true minus sign. */
export function money(value: number, { sign = true, digits = 2 }: { sign?: boolean; digits?: number } = {}): string {
  const abs = Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (value < 0 && Math.abs(value) >= 0.5 * 10 ** -digits) return `${MINUS}$${abs}`;
  return `${sign && value > 0 ? "+" : ""}$${abs}`;
}

export function pct(value: number, digits = 1): string {
  return `${value < 0 ? MINUS : ""}${Math.abs(value * 100).toFixed(digits)}%`;
}

export function signedNumber(value: number, digits = 2, suffix = ""): string {
  return `${value > 0 ? "+" : value < 0 ? MINUS : ""}${Math.abs(value).toFixed(digits)}${suffix}`;
}

export function duration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 60 * 24) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(minutes / (60 * 24));
  const h = Math.round((minutes % (60 * 24)) / 60);
  return h ? `${d}d ${h}h` : `${d}d`;
}

/** Text class for a signed money value: gain/loss ink, neutral at zero. */
export function toneClass(value: number): string {
  if (value > 0) return "text-gain-ink";
  if (value < 0) return "text-loss-ink";
  return "text-fog";
}
