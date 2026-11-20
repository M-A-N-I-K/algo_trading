// Scheduled economic events from a weekly calendar feed (ForexFactory's
// public JSON: title, country, date with UTC offset, impact, forecast,
// previous), and which of them a market should stay out of. The Playbook
// shows them next to its "No high-impact news" check.

export interface CalendarEvent {
  title: string;
  country: string; // currency code, e.g. USD
  date: string; // ISO 8601 with offset
  impact: string; // High | Medium | Low | Holiday | Non-Economic
  forecast: string;
  previous: string;
}

export interface Catalyst {
  title: string;
  currency: string;
  time: number; // epoch ms
  impact: "High" | "Medium";
  forecast: string;
  previous: string;
}

const LOOKBACK_MS = 12 * 3_600_000;

// High and medium impact events for `currencies` (all of them when omitted),
// from 12 hours ago on, oldest first.
export function selectCatalysts(events: CalendarEvent[], currencies: string[] | null, now: number): Catalyst[] {
  const wanted = currencies && new Set(currencies);
  return events
    .filter((e) => (!wanted || wanted.has(e.country)) && (e.impact === "High" || e.impact === "Medium"))
    .map((e) => ({ e, time: Date.parse(e.date) }))
    .filter(({ time }) => Number.isFinite(time) && time >= now - LOOKBACK_MS)
    .sort((a, b) => a.time - b.time)
    .map(({ e, time }) => ({
      title: e.title,
      currency: e.country,
      time,
      impact: e.impact as "High" | "Medium",
      forecast: e.forecast,
      previous: e.previous,
    }));
}

/** The Playbook's rule: no trades within this long of high-impact news. */
export const NEWS_WINDOW_MS = 30 * 60_000;

const INDEX_CURRENCY: Record<string, string> = { NAS100: "USD", SPX500: "USD", US30: "USD", FTSE100: "GBP", GER40: "EUR", JP225: "JPY" };

/**
 * The currencies whose news moves a market: both sides of a currency pair,
 * the home currency of an index, and USD for gold, silver, crypto and oil
 * (plus CAD for oil).
 */
export function newsCurrencies(symbol: string): string[] {
  const s = symbol.toUpperCase();
  if (INDEX_CURRENCY[s]) return [INDEX_CURRENCY[s]];
  if (/OIL|^CL|WTI|BRENT/.test(s)) return ["USD", "CAD"];
  if (/^[A-Z]{6}$/.test(s) && !/^(XAU|XAG|BTC|ETH)/.test(s)) return [s.slice(0, 3), s.slice(3)];
  return ["USD"];
}

/** The high-impact events for `symbol` within the news window of `at`, soonest first. */
export function newsClash(catalysts: Catalyst[], symbol: string, at: number): Catalyst[] {
  const wanted = new Set(newsCurrencies(symbol));
  return catalysts.filter((c) => c.impact === "High" && wanted.has(c.currency) && Math.abs(c.time - at) <= NEWS_WINDOW_MS);
}

/** The next high-impact event for `symbol` after `at`, if the feed has one. */
export function nextHighImpact(catalysts: Catalyst[], symbol: string, at: number): Catalyst | undefined {
  const wanted = new Set(newsCurrencies(symbol));
  return catalysts.find((c) => c.impact === "High" && wanted.has(c.currency) && c.time > at);
}
