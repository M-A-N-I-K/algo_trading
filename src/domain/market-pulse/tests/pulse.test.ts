import { describe, expect, it } from "vitest";
import { computePulse, PulseInput, PulseKline } from "../pulse";
import { PULSE_MARKETS, getPulseMarket } from "../markets";

const MIN = 60_000;
const NOW = Date.UTC(2026, 10, 3, 12, 0, 30); // 12:00:30 UTC
const gold = getPulseMarket("XAUUSDT")!;
const btc = getPulseMarket("BTCUSDT")!;

function kline(openTime: number, step: number, o: number, h: number, l: number, c: number, volume = 10, takerBuyVolume = 5): PulseKline {
  return { openTime, closeTime: openTime + step - 1, open: o, high: h, low: l, close: c, volume, takerBuyVolume };
}

// 62 one-minute candles ending with the one forming at NOW, flat at `price`.
function minutes(price: number, takerBuy: (i: number) => number = () => 5): PulseKline[] {
  const last = Math.floor(NOW / MIN) * MIN;
  return Array.from({ length: 62 }, (_, i) => kline(last - (61 - i) * MIN, MIN, price, price, price, price, 10, takerBuy(i)));
}

// 15m candles for the last 24h: flat at 3,930 except the high and low candles.
function quarterHours(): PulseKline[] {
  const step = 15 * MIN;
  const last = Math.floor(NOW / step) * step;
  const out: PulseKline[] = [];
  for (let i = 0; i < 97; i++) out.push(kline(last - (96 - i) * step, step, 3930, 3931, 3929, 3930));
  out[20] = kline(out[20].openTime, step, 3962, 3970.4, 3958, 3965.9); // made the 24h high: body top 3,965.9
  out[60] = kline(out[60].openTime, step, 3898.8, 3901, 3894.3, 3897); // made the 24h low: body bottom 3,897
  return out;
}

// 15 daily candles: 14 closed days with a 50-dollar range, then today.
function days(range = 50): PulseKline[] {
  const step = 1440 * MIN;
  const today = Math.floor(NOW / step) * step;
  return Array.from({ length: 15 }, (_, i) => kline(today - (14 - i) * step, step, 3900, 3900 + range, 3900, 3920));
}

function input(overrides: Partial<PulseInput> = {}): PulseInput {
  return {
    market: gold,
    now: NOW,
    ticker: { last: 3924.3, high: 3970.4, low: 3894.3 },
    minute: minutes(3924.3),
    quarterHour: quarterHours(),
    daily: days(),
    ...overrides,
  };
}

describe("market pulse: last hour", () => {
  it("measures the 1h change from the price an hour ago", () => {
    const m = minutes(3924.3);
    // The candle that closed an hour ago (11:00 UTC) closed at 3,926.5.
    const hourAgo = m.findLast((k) => k.closeTime <= NOW - 60 * MIN)!;
    hourAgo.close = 3926.5;
    const pulse = computePulse(input({ minute: m }));
    expect(pulse.change1h).toBeCloseTo(-2.2, 10);
    expect(pulse.change1hPct).toBeCloseTo((-2.2 / 3926.5) * 100, 10);
  });

  it("splits the last hour's volume into aggressive buyers and sellers", () => {
    // Every candle trades 10; buyers take 3 of it in the last hour, 9 before.
    const m = minutes(3924.3, (i) => (i < 2 ? 9 : 3));
    const pulse = computePulse(input({ minute: m }));
    expect(pulse.bullPct).toBe(30);
    expect(pulse.bearPct).toBe(70);
  });
});

describe("market pulse: 24h range", () => {
  it("places price within the 24h range", () => {
    const pulse = computePulse(input({ ticker: { last: 3925.94, high: 3970.4, low: 3894.3 } }));
    expect(pulse.rangePosPct).toBeCloseTo(41.58, 1);
  });

  it("draws supply from the candle that made the 24h high and demand from the one that made the low", () => {
    const pulse = computePulse(input());
    expect(pulse.supply).toEqual({ low: 3965.9, high: 3970.4, distance: 3965.9 - 3924.3 });
    expect(pulse.demand).toEqual({ low: 3894.3, high: 3897, distance: 3924.3 - 3897 });
  });

  it("ignores candles older than 24 hours", () => {
    const q = quarterHours();
    q[0] = { ...q[0], high: 4100, low: 3700 }; // opened 24h+ ago
    const pulse = computePulse(input({ quarterHour: q }));
    expect(pulse.supply?.high).toBe(3970.4);
    expect(pulse.demand?.low).toBe(3894.3);
  });
});

describe("market pulse: bias", () => {
  it("calls it buyers in control when buyers take 55%+ of the hour and price rose", () => {
    const m = minutes(3930, () => 6);
    m.findLast((k) => k.closeTime <= NOW - 60 * MIN)!.close = 3920;
    const pulse = computePulse(input({ minute: m, ticker: { last: 3930, high: 3970.4, low: 3894.3 } }));
    expect(pulse.bias).toBe("buyers");
  });

  it("calls it sellers in control when sellers take 55%+ and price fell", () => {
    const m = minutes(3920, () => 4);
    m.findLast((k) => k.closeTime <= NOW - 60 * MIN)!.close = 3930;
    const pulse = computePulse(input({ minute: m, ticker: { last: 3920, high: 3970.4, low: 3894.3 } }));
    expect(pulse.bias).toBe("sellers");
  });

  it("calls it two-way when flow and price disagree or flow is even", () => {
    const m = minutes(3920, () => 6); // buyers 60%, but price fell
    m.findLast((k) => k.closeTime <= NOW - 60 * MIN)!.close = 3930;
    expect(computePulse(input({ minute: m, ticker: { last: 3920, high: 3970.4, low: 3894.3 } })).bias).toBe("balanced");
    expect(computePulse(input()).bias).toBe("balanced");
  });
});

describe("market pulse: volatility", () => {
  it("compares the 24h span with the average daily range of the last 14 days", () => {
    const pulse = computePulse(input({ daily: days(50) })); // span 76.1 vs 50
    expect(pulse.volatility.span).toBeCloseTo(76.1, 10);
    expect(pulse.volatility.ratio).toBeCloseTo(76.1 / 50, 10);
    expect(pulse.volatility.regime).toBe("expanding");
    expect(computePulse(input({ daily: days(76) })).volatility.regime).toBe("normal");
    expect(computePulse(input({ daily: days(120) })).volatility.regime).toBe("quiet");
  });

  it("counts pips only for markets that quote them", () => {
    expect(computePulse(input()).volatility.pips).toBeCloseTo(761, 6); // gold: 0.1 per pip
    const crypto = computePulse(input({ market: btc }));
    expect(crypto.volatility.pips).toBeNull();
    expect(crypto.volatility.spanPct).toBeCloseTo((76.1 / 3924.3) * 100, 6);
  });
});

describe("pulse markets", () => {
  it("lists crypto and commodities with unique symbols", () => {
    const symbols = PULSE_MARKETS.map((m) => m.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
    expect(PULSE_MARKETS.some((m) => m.category === "Crypto")).toBe(true);
    expect(PULSE_MARKETS.some((m) => m.category === "Commodity")).toBe(true);
  });
});
