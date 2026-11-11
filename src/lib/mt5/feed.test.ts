import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { feedFile, feedLive, readFeedCandles } from "./feed";

// A PlaybookFeed folder as PB_BarFeed writes it: hourly bars in server time
// (Europe/Athens, UTC+2 in November), tab-separated, closed bars only.
const dir = mkdtempSync(join(tmpdir(), "pbfeed-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const HEAD = "<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>";
const rows: string[] = [HEAD];
// 2026-11-10 02:00 → 2026-11-11 01:00 server = 00:00 → 23:00 UTC on the 10th.
for (let h = 0; h < 24; h++) {
  const server = new Date(Date.UTC(2026, 10, 10, h + 2));
  const date = `${server.getUTCFullYear()}.${String(server.getUTCMonth() + 1).padStart(2, "0")}.${String(server.getUTCDate()).padStart(2, "0")}`;
  const time = `${String(server.getUTCHours()).padStart(2, "0")}:00:00`;
  rows.push([date, time, 100 + h, 101 + h, 99 + h, 100.5 + h, 10, 0, 1].join("\t"));
}
writeFileSync(join(dir, "NDX100_H1.csv"), rows.join("\r\n") + "\r\n");
writeFileSync(join(dir, "heartbeat.txt"), "0\n");

describe("MT5 bar feed", () => {
  it("maps app symbols and intervals to the service's files", () => {
    expect(feedFile("NAS100", "1h", dir)).toBe(join(dir, "NDX100_H1.csv"));
    expect(feedFile("XAUUSDT", "15m", dir)).toBe(join(dir, "XAUUSD_M15.csv"));
    expect(feedFile("NAS100", "4h", dir)).toBe(join(dir, "NDX100_H1.csv"));
    expect(feedFile("NAS100", "1d", dir)).toBeNull();
  });

  it("reads hourly bars in UTC", async () => {
    const bars = (await readFeedCandles("NAS100", "1h", dir))!;
    expect(bars).toHaveLength(24);
    expect(bars[0].openTime).toBe(Date.UTC(2026, 10, 10, 0));
    expect(bars[0].closeTime).toBe(Date.UTC(2026, 10, 10, 1) - 1);
    expect(bars[23].close).toBe(123.5);
  });

  it("builds 4h candles from H1 on the UTC grid, like the backtests", async () => {
    const bars = (await readFeedCandles("NAS100", "4h", dir))!;
    expect(bars).toHaveLength(6);
    expect(bars[1]).toMatchObject({ openTime: Date.UTC(2026, 10, 10, 4), open: 104, high: 108, low: 103, close: 107.5, volume: 40 });
  });

  it("returns null for a market the feed doesn't carry", async () => {
    expect(await readFeedCandles("EURUSD", "1h", dir)).toBeNull();
  });

  it("is live only while the heartbeat is under two minutes old", async () => {
    const now = Date.now();
    utimesSync(join(dir, "heartbeat.txt"), new Date(now - 30_000), new Date(now - 30_000));
    expect(await feedLive(now, dir)).toBe(true);
    utimesSync(join(dir, "heartbeat.txt"), new Date(now - 5 * 60_000), new Date(now - 5 * 60_000));
    expect(await feedLive(now, dir)).toBe(false);
    expect(await feedLive(now, join(dir, "missing"))).toBe(false);
  });
});
