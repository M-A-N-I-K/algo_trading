// UTC time-of-day helpers for session-based strategies (ported from Pine's
// `time(timeframe.period, "HHMM-HHMM", "UTC")` session-string checks).

export function minutesOfDayUTC(epochMs: number): number {
  const date = new Date(epochMs);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

// Parses a Pine-style "HHMM-HHMM" session string, e.g. "0700-0800".
export function parseSessionWindow(session: string): { startMinutes: number; endMinutes: number } {
  const [start, end] = session.split("-");
  const startMinutes = parseInt(start.slice(0, 2), 10) * 60 + parseInt(start.slice(2, 4), 10);
  const endMinutes = parseInt(end.slice(0, 2), 10) * 60 + parseInt(end.slice(2, 4), 10);
  return { startMinutes, endMinutes };
}

// Whether `epochMs` falls within a "HHMM-HHMM" UTC session window.
// Handles windows that wrap past midnight (start > end).
export function inSessionWindow(epochMs: number, session: string): boolean {
  const { startMinutes, endMinutes } = parseSessionWindow(session);
  const nowMinutes = minutesOfDayUTC(epochMs);
  if (startMinutes <= endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}
