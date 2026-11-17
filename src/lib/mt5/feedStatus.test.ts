import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { feedStatus } from "./feed";

const NOW = Date.UTC(2026, 10, 17, 12);

function dirWithBeat(line: string, writtenAt: number) {
  const dir = mkdtempSync(join(tmpdir(), "beat-"));
  writeFileSync(join(dir, "heartbeat.txt"), line);
  utimesSync(join(dir, "heartbeat.txt"), new Date(writtenAt), new Date(writtenAt));
  return dir;
}

describe("feedStatus", () => {
  it("is live while the heartbeat is fresh, and reads the expert's line", async () => {
    const dir = dirWithBeat(`${NOW / 1000 - 5}\t2026.11.17 14:00:00\t17\r\n`, NOW - 5_000);
    expect(await feedStatus(NOW, dir)).toMatchObject({ live: true, lastBeat: NOW - 5_000, serverTime: "2026.11.17 14:00:00", markets: 17 });
  });

  it("reports stale prices when the terminal beats but writes old bars", async () => {
    const dir = dirWithBeat(`${NOW / 1000}\t2026.11.17 12:00:00\t17`, NOW);
    const head = "<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>\r\n";
    // Server time is Athens (UTC+2): 13:50 server = 11:50 UTC, 10 min before NOW.
    writeFileSync(join(dir, "BTCUSD_M5.csv"), head + "2026.11.17\t13:50:00\t1\t1\t1\t1\t1\t0\t1\r\n");
    writeFileSync(join(dir, "XAUUSD_M5.csv"), head + "2026.11.13\t23:40:00\t1\t1\t1\t1\t1\t0\t1\r\n");
    expect(await feedStatus(NOW, dir)).toMatchObject({ live: true, newestBar: NOW - 10 * 60_000, pricesFresh: true });
    writeFileSync(join(dir, "BTCUSD_M5.csv"), head + "2026.11.16\t02:00:00\t1\t1\t1\t1\t1\t0\t1\r\n");
    expect(await feedStatus(NOW, dir)).toMatchObject({ live: true, newestBar: Date.UTC(2026, 10, 16, 0), pricesFresh: false });
  });

  it("is off once the heartbeat is over two minutes old", async () => {
    const dir = dirWithBeat(`${NOW / 1000 - 3600}\t2026.11.17 13:00:00\t17`, NOW - 3_600_000);
    expect(await feedStatus(NOW, dir)).toMatchObject({ live: false, lastBeat: NOW - 3_600_000 });
  });

  it("falls back to the file time for a garbled line, and reports a missing file", async () => {
    const dir = dirWithBeat("garbage", NOW - 10_000);
    expect(await feedStatus(NOW, dir)).toEqual({ live: true, lastBeat: NOW - 10_000, serverTime: null, markets: null, newestBar: null, pricesFresh: false });
    expect(await feedStatus(NOW, join(dir, "nope"))).toEqual({ live: false, lastBeat: null, serverTime: null, markets: null, newestBar: null, pricesFresh: false });
  });
});
