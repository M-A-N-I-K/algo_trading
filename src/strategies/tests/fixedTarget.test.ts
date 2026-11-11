import { describe, expect, it } from "vitest";
import type { OHLC } from "../../indicators/utils";
import type { Strategy } from "../../types";
import { withFixedTarget } from "../fixedTarget";

const bar = (close: number): OHLC => ({ openTime: 0, open: close, high: close + 1, low: close - 1, close, volume: 0, closeTime: 0 });

// Buys on candle 1 (stop 95) and sells on candle 3 (stop 112), with a 1.5R target
// and a trailing stop of its own; candle 2's buy has its stop above the close.
const stub: Strategy = {
  name: "Stub",
  generateSignals: () => ["HOLD", "BUY", "BUY", "SELL"],
  getTradeTargets: () => [null, { stopLoss: 95, takeProfit: 107.5, trailTriggerR: 1, trailDistance: 2 }, { stopLoss: 101, takeProfit: 110 }, { stopLoss: 112, takeProfit: 97 }],
};

describe("withFixedTarget", () => {
  const s = withFixedTarget(stub, 2);
  const candles = [bar(100), bar(100), bar(100), bar(110)];

  it("keeps entries and stops, sets the target at 2R from the close, drops trailing", () => {
    expect(s.generateSignals(candles)).toEqual(["HOLD", "BUY", "HOLD", "SELL"]);
    const t = s.getTradeTargets!(candles);
    expect(t[1]).toEqual({ stopLoss: 95, takeProfit: 110 });
    expect(t[3]).toEqual({ stopLoss: 112, takeProfit: 106 });
  });

  it("drops a signal whose stop is on the wrong side of the close", () => {
    s.generateSignals(candles);
    expect(s.getTradeTargets!(candles)[2]).toBeNull();
  });

  it("rejects a target of 0R or less", () => {
    expect(() => withFixedTarget(stub, 0)).toThrow();
  });
});
