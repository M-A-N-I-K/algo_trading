import { describe, expect, it } from "vitest";
import { parseMt5Bars, resampleBars } from "./mt5Bars";

const EXPORT = [
  "<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>",
  "2026.07.01\t16:31:00\t20010.5\t20015.0\t20008.0\t20012.0\t40\t0\t10",
  "2026.07.01\t16:30:00\t20000.0\t20011.0\t19995.0\t20010.5\t55\t0\t10",
  "2026.07.01\t16:32:00\t20012.0\t20020.0\t20011.0\t20018.0\t30\t0\t10",
  "2026.07.01\t16:35:00\t20018.0\t20019.0\t20001.0\t20005.0\t25\t0\t10",
].join("\r\n");

describe("parseMt5Bars", () => {
  it("converts Athens summer time (UTC+3) to UTC, sorts, and uses tick volume when VOL is 0", () => {
    const { bars, barMs } = parseMt5Bars(EXPORT);
    expect(barMs).toBe(60_000);
    expect(bars).toHaveLength(4);
    expect(new Date(bars[0].openTime).toISOString()).toBe("2026-07-01T13:30:00.000Z");
    expect(bars[0]).toMatchObject({ open: 20000, high: 20011, low: 19995, close: 20010.5, volume: 55 });
    expect(bars[0].closeTime).toBe(bars[0].openTime + 59_999);
  });

  it("uses UTC+2 in winter", () => {
    const { bars } = parseMt5Bars("<DATE>,<TIME>,<OPEN>,<HIGH>,<LOW>,<CLOSE>\n2026.01.15,09:00,1,2,0.5,1.5\n2026.01.15,09:01,1,2,0.5,1.5");
    expect(new Date(bars[0].openTime).toISOString()).toBe("2026-01-15T07:00:00.000Z");
  });

  it("reads UTF-16 exports", () => {
    const bytes = new Uint8Array([0xff, 0xfe, ...new Uint8Array(new Uint16Array([...EXPORT].map((c) => c.charCodeAt(0))).buffer)]);
    expect(parseMt5Bars(bytes).bars).toHaveLength(4);
  });

  it("rejects files without the bar columns", () => {
    expect(() => parseMt5Bars("a,b\n1,2")).toThrow(/Not an MT5 bar export/);
  });
});

describe("resampleBars", () => {
  it("builds 5m candles on the UTC grid, skipping gaps", () => {
    const five = resampleBars(parseMt5Bars(EXPORT).bars, "5m");
    expect(five).toHaveLength(2);
    expect(five[0]).toMatchObject({ open: 20000, high: 20020, low: 19995, close: 20018, volume: 125 });
    expect(new Date(five[1].openTime).toISOString()).toBe("2026-07-01T13:35:00.000Z");
    expect(five[1].closeTime).toBe(five[1].openTime + 5 * 60_000 - 1);
  });
});
