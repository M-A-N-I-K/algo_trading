import { mkdir, mkdtemp, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanTerminal, isOldHistory, isOldLog, terminalRoot } from "./housekeeping";

const now = Date.UTC(2026, 10, 23, 12);

describe("MT5 housekeeping rules", () => {
  it("finds the terminal from the standard feed folder only", () => {
    expect(terminalRoot("/x/MetaTrader 5/MQL5/Files/PlaybookFeed")).toBe("/x/MetaTrader 5");
    expect(terminalRoot("/x/MetaTrader 5/MQL5/Files/PlaybookFeed/")).toBe("/x/MetaTrader 5");
    expect(terminalRoot("/somewhere/feed")).toBeNull();
  });

  it("drops daily logs older than the cutoff, nothing else", () => {
    expect(isOldLog("20261001.log", now, 30)).toBe(true);
    expect(isOldLog("20261101.log", now, 30)).toBe(false);
    expect(isOldLog("metaeditor.log", now, 30)).toBe(false);
    expect(isOldLog("20261001.txt", now, 30)).toBe(false);
  });

  it("keeps this year and the previous years asked for", () => {
    expect(isOldHistory("2021.hcc", now, 5)).toBe(true);
    expect(isOldHistory("2022.hcc", now, 5)).toBe(false);
    expect(isOldHistory("202112.tkc", now, 5)).toBe(true);
    expect(isOldHistory("202601.tkc", now, 5)).toBe(false);
    expect(isOldHistory("ticks.dat", now, 5)).toBe(false);
    expect(isOldHistory("2011.hcc", now, 0)).toBe(false);
  });
});

describe("cleanTerminal", () => {
  it("deletes only old logs and history files inside the terminal", async () => {
    const root = await mkdtemp(join(tmpdir(), "mt5-hk-"));
    const logs = join(root, "MQL5", "Logs");
    const hist = join(root, "bases", "Broker-Live", "history", "XAUUSD");
    const ticks = join(root, "bases", "Broker-Live", "ticks", "XAUUSD");
    const cache = join(hist, "cache");
    for (const d of [logs, hist, ticks, cache]) await mkdir(d, { recursive: true });
    await writeFile(join(logs, "20260101.log"), "old");
    await writeFile(join(logs, "20261122.log"), "new");
    await writeFile(join(hist, "2015.hcc"), "x".repeat(100));
    await writeFile(join(hist, "2025.hcc"), "keep");
    await writeFile(join(ticks, "201901.tkc"), "old");
    await writeFile(join(ticks, "ticks.dat"), "keep");
    await writeFile(join(cache, "2015.hcc"), "a cache folder file isn't scanned");
    const outside = await mkdtemp(join(tmpdir(), "mt5-out-"));
    await writeFile(join(outside, "2010.hcc"), "outside");
    await symlink(join(outside, "2010.hcc"), join(hist, "2010.hcc"));

    const freed = await cleanTerminal(root, now, { logDays: 30, historyYears: 5 });
    expect(freed.files).toBe(3);
    expect((await readdir(logs)).sort()).toEqual(["20261122.log"]);
    expect((await readdir(hist)).sort()).toEqual(["2010.hcc", "2025.hcc", "cache"]);
    expect(await readdir(ticks)).toEqual(["ticks.dat"]);
    expect(await readdir(outside)).toEqual(["2010.hcc"]);
  });
});
