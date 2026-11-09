import { describe, expect, it } from "vitest";
import { scanTargets } from "./scanner";

describe("scanTargets", () => {
  const targets = scanTargets();

  it("never scans 1m strategies live (too many candles for Binance's rate limit)", () => {
    expect(targets.some((t) => t.interval === "1m")).toBe(false);
    expect(targets.some((t) => t.strategyKey === "ny-open-fvg")).toBe(false);
  });

  it("still scans the 5m and higher-timeframe strategies", () => {
    expect(targets).toContainEqual({ strategyKey: "liquidity-reversal-mtf", interval: "5m" });
    expect(targets).toContainEqual({ strategyKey: "liquidity-reversal", interval: "1h" });
  });
});
