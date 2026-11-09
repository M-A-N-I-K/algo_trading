import { describe, expect, it } from "vitest";
import { analyseCommission, commissionRule, coveredByPlatform, feeRatePerSide, lotUnits, platformSymbol, roundTripCostPerUnitUsd, roundTripCostUsd } from "./fundingpips";

describe("FundingPips cost model", () => {
  it("maps app symbols to the platform's", () => {
    expect(platformSymbol("XAUUSDT")).toBe("XAUUSD");
    expect(platformSymbol("NAS100")).toBe("NDX100");
    expect(coveredByPlatform("ETHUSDT")).toBe(true);
    expect(coveredByPlatform("EURUSD")).toBe(true);
    expect(coveredByPlatform("SOLUSDT")).toBe(false); // six letters, but not a currency pair
    expect(coveredByPlatform("DOGEUSDT")).toBe(false);
  });

  it("reproduces the commission on the report's fills", () => {
    // Fills from the MT5 report: (symbol, lots, open price) → commission paid.
    const fills = [
      { symbol: "XAUUSD", volume: 0.05, openPrice: 4061.97, commission: -0.25 },
      { symbol: "XAUUSD", volume: 0.25, openPrice: 4058.51, commission: -1.25 },
      { symbol: "XAUUSD", volume: 0.1, openPrice: 4119.71, commission: -0.5 },
      { symbol: "XAGUSD", volume: 0.05, openPrice: 51.227, commission: -0.25 },
      { symbol: "ETHUSD", volume: 1, openPrice: 2219.39, commission: -0.89 },
      { symbol: "ETHUSD", volume: 1, openPrice: 2135.21, commission: -0.85 },
      { symbol: "NDX100", volume: 0.01, openPrice: 27045.13, commission: 0 },
    ];
    const found = analyseCommission(fills);
    expect(found.every((f) => f.matches)).toBe(true);
    expect(found.find((f) => f.symbol === "XAUUSD")!.usdPerLot).toBeCloseTo(5);
    expect(found.find((f) => f.symbol === "ETHUSD")!.pctOfValue).toBeCloseTo(0.0004, 5);
    expect(commissionRule("NDX100").kind).toBe("none");
  });

  it("flags a fill the rule doesn't explain", () => {
    const [f] = analyseCommission([{ symbol: "XAUUSD", volume: 1, openPrice: 4000, commission: -7 }]);
    expect(f.matches).toBe(false);
  });

  it("uses the index contract sizes implied by the report's P&L", () => {
    expect(lotUnits("NDX100")).toBe(20);
    expect(lotUnits("SPX500")).toBe(50);
    expect(lotUnits("XAUUSDT")).toBe(100);
  });

  it("adds commission and spread per unit", () => {
    // Gold: $5 per 100 oz lot = $0.05/oz, plus a $0.30 spread.
    const c = roundTripCostPerUnitUsd("XAUUSD", 4000);
    expect(c.commission).toBeCloseTo(0.05);
    expect(c.total).toBeCloseTo(0.35);
    expect(roundTripCostUsd("XAUUSD", 0.1, 4000)).toBeCloseTo(3.5);
    // ETH: 0.04% of 2000 = $0.80 a coin, plus a $2 spread.
    expect(roundTripCostPerUnitUsd("ETHUSDT", 2000).total).toBeCloseTo(2.8);
  });

  it("turns the round trip into the backtester's per-side fee", () => {
    // Two sides of the fee add back up to the round-trip cost.
    expect(2 * feeRatePerSide("XAUUSD", 4000) * 4000).toBeCloseTo(0.35);
    // Yen pair: cost is in yen per unit; the rate is still a fraction of notional.
    const yen = roundTripCostPerUnitUsd("USDJPY", 150).total * 150; // ¥ per unit
    expect(2 * feeRatePerSide("USDJPY", 150) * 150).toBeCloseTo(yen);
    expect(feeRatePerSide("XAUUSD", 0)).toBe(0);
  });
});
