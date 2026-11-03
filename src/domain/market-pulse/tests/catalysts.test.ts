import { describe, expect, it } from "vitest";
import { selectCatalysts, CalendarEvent } from "../catalysts";

const NOW = Date.parse("2026-11-03T12:00:00Z");

const feed: CalendarEvent[] = [
  { title: "CPI m/m", country: "USD", date: "2026-11-04T08:30:00-05:00", impact: "High", forecast: "0.3%", previous: "0.4%" },
  { title: "ISM Services PMI", country: "USD", date: "2026-11-05T10:00:00-05:00", impact: "Medium", forecast: "51.0", previous: "50.2" },
  { title: "Bank Holiday", country: "USD", date: "2026-11-06T00:00:00-05:00", impact: "Holiday", forecast: "", previous: "" },
  { title: "Cash Rate", country: "AUD", date: "2026-11-04T22:30:00-05:00", impact: "High", forecast: "4.85%", previous: "4.60%" },
  { title: "Unemployment Claims", country: "USD", date: "2026-11-02T08:30:00-05:00", impact: "High", forecast: "", previous: "" }, // > 12h ago
  { title: "FOMC Member Speaks", country: "USD", date: "2026-11-03T09:00:00-05:00", impact: "Low", forecast: "", previous: "" },
  { title: "Core PCE", country: "USD", date: "2026-11-03T05:30:00-05:00", impact: "High", forecast: "0.2%", previous: "0.2%" }, // 10:30 UTC, 1.5h ago
];

describe("catalysts", () => {
  it("keeps high and medium impact events for the market's currencies, oldest first, from 12h ago on", () => {
    const out = selectCatalysts(feed, ["USD"], NOW);
    expect(out.map((e) => e.title)).toEqual(["Core PCE", "CPI m/m", "ISM Services PMI"]);
    expect(out[0]).toMatchObject({ time: Date.parse("2026-11-03T10:30:00Z"), impact: "High", currency: "USD", forecast: "0.2%", previous: "0.2%" });
  });

  it("drops events with an unreadable date", () => {
    expect(selectCatalysts([{ ...feed[0], date: "soon" }], ["USD"], NOW)).toEqual([]);
  });
});
