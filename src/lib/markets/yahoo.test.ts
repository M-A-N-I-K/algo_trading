import { afterEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import { assetClass, fetchYahooCandles, isForex, isIndex, marketLabel, priceDecimals } from "./yahoo";

const H = 3_600_000;
const T0 = Date.UTC(2026, 9, 5); // Mon 5 Oct 2026 00:00 UTC

function chart(times: number[], rows: (number | null)[][]) {
  return {
    data: {
      chart: {
        result: [{ timestamp: times.map((t) => t / 1000), indicators: { quote: [{ open: rows.map((r) => r[0]), high: rows.map((r) => r[1]), low: rows.map((r) => r[2]), close: rows.map((r) => r[3]) }] } }],
      },
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("forex symbols", () => {
  it("recognises the majors and labels them", () => {
    expect(isForex("EURUSD")).toBe(true);
    expect(isForex("eurusd")).toBe(true);
    expect(isForex("BTCUSDT")).toBe(false);
    expect(marketLabel("USDJPY")).toBe("USD/JPY");
    expect(marketLabel("XAUUSDT")).toBe("XAU");
  });
  it("quotes to the pipette", () => {
    expect(priceDecimals(1.1, "EURUSD")).toBe(5);
    expect(priceDecimals(158, "USDJPY")).toBe(3);
    expect(priceDecimals(4000)).toBe(2);
    expect(priceDecimals(0.07)).toBe(5);
  });
});

describe("index symbols", () => {
  it("recognises the indices and labels them", () => {
    expect(isIndex("NAS100")).toBe(true);
    expect(isForex("NAS100")).toBe(false);
    expect(assetClass("SPX500")).toBe("index");
    expect(assetClass("EURUSD")).toBe("forex");
    expect(assetClass("BTCUSDT")).toBe("crypto");
    expect(marketLabel("NAS100")).toBe("Nasdaq 100");
    expect(marketLabel("SPX500")).toBe("S&P 500");
    expect(priceDecimals(27000.25, "NAS100")).toBe(2);
  });
});

describe("fetchYahooCandles", () => {
  it("returns Binance-shaped 1h klines, skipping empty bars and ones before the start", async () => {
    const get = vi.spyOn(axios, "get").mockResolvedValue(
      chart([T0 - H, T0, T0 + H, T0 + 2 * H], [[1, 1, 1, 1], [1.1, 1.2, 1.0, 1.15], [null, null, null, null], [1.15, 1.3, 1.1, 1.25]]),
    );
    const k = await fetchYahooCandles("EURUSD", "1h", T0, T0 + 3 * H);
    expect(get.mock.calls[0][0]).toContain("EURUSD%3DX");
    expect(get.mock.calls[0][1]?.params).toMatchObject({ interval: "60m" });
    expect(k).toEqual([
      [T0, "1.1", "1.2", "1", "1.15", "0", T0 + H - 1, "0", 0, "0", "0", "0"],
      [T0 + 2 * H, "1.15", "1.3", "1.1", "1.25", "0", T0 + 3 * H - 1, "0", 0, "0", "0", "0"],
    ]);
  });

  it("builds 4h candles on the UTC grid from 1h", async () => {
    const times = [0, 1, 2, 3, 4].map((i) => T0 + i * H);
    vi.spyOn(axios, "get").mockResolvedValue(chart(times, [[1, 2, 0.5, 1.5], [1.5, 3, 1, 2], [2, 2.5, 0.2, 1], [1, 1.1, 0.9, 1.05], [1.05, 1.2, 1, 1.1]]));
    const k = await fetchYahooCandles("GBPUSD", "4h", T0, T0 + 5 * H);
    expect(k.map((c) => [c[0], c[1], c[2], c[3], c[4], c[6]])).toEqual([
      [T0, "1", "3", "0.2", "1.05", T0 + 4 * H - 1],
      [T0 + 4 * H, "1.05", "1.2", "1", "1.1", T0 + 8 * H - 1],
    ]);
  });

  it("fetches the indices from their futures", async () => {
    const get = vi.spyOn(axios, "get").mockResolvedValue(chart([T0], [[27000, 27010, 26990, 27005]]));
    await fetchYahooCandles("NAS100", "1h", T0, T0 + H);
    expect(get.mock.calls[0][0]).toContain("NQ%3DF");
  });

  it("rejects pairs and intervals it can't serve", async () => {
    await expect(fetchYahooCandles("BTCUSDT", "1h", T0)).rejects.toThrow(/not a supported currency pair or index/);
    await expect(fetchYahooCandles("EURUSD", "1m", T0)).rejects.toThrow(/isn't available/);
  });
});
