import { describe, expect, it } from "vitest";
import { feeRatePerSide, roundTripCostPerUnitUsd, usdPerUnitMove } from "@/lib/costs/fundingpips";
import { lotUnits } from "@/lib/playbook/config";
import { sizePosition } from "@/lib/playbook/rules";
import { parseSpecs, registerSpecs, specFor } from "./specs";

// symbols.csv as PB_BarFeed writes it. Made-up FTSE spec: 1 lot = 10 units,
// tick 0.01 worth $0.13 a lot (£1 = $1.30), lots in steps of 0.1.
const CSV = [
  "SYMBOL\tDIGITS\tCONTRACT\tTICKSIZE\tTICKVALUE\tVOLUMEMIN\tVOLUMESTEP\tPROFITCCY\tACCOUNTCCY",
  "FTSE100\t2\t10.00000000\t0.0100000000\t0.1300000000\t0.1000\t0.1000\tGBP\tUSD",
  "UKOIL\t3\t1000.00000000\t0.0010000000\t0.0010000000\t0.0100\t0.0100\tUSD\tUSD",
  "EURJPY\t3\t100000.00000000\t0.0010000000\t0.6500000000\t0.0100\t0.0100\tJPY\tUSD",
].join("\r\n");

describe("MT5 symbol specs", () => {
  it("parses symbols.csv", () => {
    expect(parseSpecs(CSV).FTSE100).toEqual({ digits: 2, contract: 10, tickSize: 0.01, tickValue: 0.13, volumeMin: 0.1, volumeStep: 0.1, profitCurrency: "GBP", accountCurrency: "USD" });
  });

  it("can't size FTSE 100 before the terminal has sent its spec", () => {
    expect(specFor("FTSE100")).toBeUndefined();
    expect(Number.isNaN(usdPerUnitMove("FTSE100", 8000))).toBe(true);
    expect(sizePosition("FTSE100", 8000, 7980, 100)).toBeNull();
    // Scanning doesn't need it: the cost is charged in price units.
    expect(feeRatePerSide("FTSE100", 8000)).toBeCloseTo(1.2 / 8000 / 2, 12);
  });

  it("sizes from the spec once it has: pounds converted, MT5's lot steps", () => {
    registerSpecs(parseSpecs(CSV));
    expect(lotUnits("FTSE100")).toBe(10);
    expect(usdPerUnitMove("FTSE100", 8000)).toBeCloseTo(1.3, 10);
    // $100 risk, 20-point stop: $13 a point per lot → 0.38 lots → 0.3 in 0.1 steps.
    const s = sizePosition("FTSE100", 8000, 7980, 100)!;
    expect(s.lots).toBe(0.3);
    expect(s.riskAtLots).toBeCloseTo(0.3 * 10 * 20 * 1.3, 6);
    // The 1.2-point round trip, in dollars.
    expect(roundTripCostPerUnitUsd("FTSE100", 8000).total).toBeCloseTo(1.2 * 1.3, 10);
    // EUR/JPY: yen converted with MT5's tick value, $5 a lot on top of the spread.
    const c = roundTripCostPerUnitUsd("EURJPY", 170);
    expect(c.total).toBeCloseTo(0.018 * 0.0065, 10);
    expect(c.spread).toBeCloseTo(0.01 * 0.0065, 10);
  });

  it("ignores MT5's tick value on dollar-quoted CFDs (wrong on this terminal: Brent says $1 a point per 1000-barrel lot)", () => {
    registerSpecs(parseSpecs(CSV));
    expect(lotUnits("UKOIL")).toBe(1000);
    expect(usdPerUnitMove("UKOIL", 90)).toBe(1);
  });

  it("leaves the measured sizes of the other markets alone", () => {
    expect(lotUnits("NAS100")).toBe(20);
    expect(usdPerUnitMove("USDJPY", 150)).toBeCloseTo(1 / 150, 12);
    expect(usdPerUnitMove("XAUUSDT", 4000)).toBe(1);
  });
});
