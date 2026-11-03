import { describe, expect, it } from "vitest";
import { OHLC } from "@/indicators/utils";
import { CODED_STRATEGIES, createCodedStrategy } from "@/strategies/registry";
import { fromCodedStrategy } from "../sources/codedStrategy";
import { detectLookAhead } from "../lookAhead";

// Deterministic 15m random walk with slow regime drift, starting on a Monday.
function fixture(n: number): OHLC[] {
  let seed = 42;
  const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const start = Date.UTC(2026, 0, 5);
  const out: OHLC[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = Math.max(1, open * (1 + (Math.sin(i / 120) * 0.15 + (rand() - 0.5) * 1.2) / 100));
    const high = Math.max(open, close) * (1 + rand() * 0.004);
    const low = Math.min(open, close) * (1 - rand() * 0.004);
    out.push({ openTime: start + i * 900_000, closeTime: start + (i + 1) * 900_000 - 1, open, high, low, close, volume: 100 + rand() * 900 });
    price = close;
  }
  return out;
}

// Coded strategies known to use future bars. Keep empty.
const KNOWN_LOOK_AHEAD = new Set<string>([]);

// Higher-timeframe strategies run here on execution candles only; peeking
// through an unfinished higher-timeframe bar is not covered by this check.
describe("coded strategies: look-ahead", () => {
  const candles = fixture(1500);

  for (const key of Object.keys(CODED_STRATEGIES)) {
    const expected = KNOWN_LOOK_AHEAD.has(key) ? "uses future bars (known)" : "decides from past bars only";
    it(`${key} ${expected}`, () => {
      const report = detectLookAhead(fromCodedStrategy(createCodedStrategy(key)!), candles, { from: 300, every: 50 });
      expect(report.clean).toBe(!KNOWN_LOOK_AHEAD.has(key));
    });
  }
});
