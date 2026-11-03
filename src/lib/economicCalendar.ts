import axios from "axios";
import { CalendarEvent } from "@/domain/market-pulse/catalysts";

// ForexFactory's public weekly calendar feed. Unofficial: no API key, and
// its shape could change without notice, so callers should tolerate failure.
const CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const CALENDAR_TTL_MS = 30 * 60_000;

let calendarCache: { at: number; value: CalendarEvent[] } | null = null;

// This week's economic calendar, cached for 30 minutes. On failure, serves
// the last good copy if there is one.
export async function loadCalendar(): Promise<CalendarEvent[]> {
  if (calendarCache && Date.now() - calendarCache.at < CALENDAR_TTL_MS) return calendarCache.value;
  try {
    const { data } = await axios.get<CalendarEvent[]>(CALENDAR_URL, { timeout: 10_000 });
    if (!Array.isArray(data)) throw new Error("Calendar feed returned an unexpected shape.");
    calendarCache = { at: Date.now(), value: data };
    return data;
  } catch (e) {
    if (calendarCache) return calendarCache.value;
    throw e;
  }
}
