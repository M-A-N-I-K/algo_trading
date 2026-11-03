// Scheduled economic events for the Live Pulse Catalysts tab, from a weekly
// calendar feed (ForexFactory's public JSON: title, country, date with UTC
// offset, impact, forecast, previous).

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

// High and medium impact events for `currencies`, from 12 hours ago on,
// oldest first.
export function selectCatalysts(events: CalendarEvent[], currencies: string[], now: number): Catalyst[] {
  const wanted = new Set(currencies);
  return events
    .filter((e) => wanted.has(e.country) && (e.impact === "High" || e.impact === "Medium"))
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
