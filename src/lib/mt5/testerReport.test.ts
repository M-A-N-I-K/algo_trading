import { describe, expect, it } from "vitest";
import { parseTesterRows } from "./testerReport";

// The shape of MT5's Strategy Tester Excel export, cut down to what's read.
const rows = (deals: string[][], orders: string[][] = []): string[][] => [
  ["Strategy Tester Report"],
  ["Expert:", "", "PB_SMC_EA"],
  ["Symbol:", "", "XAUUSD"],
  ["Period:", "", "H4 (2020.01.01 - 2026.11.11)"],
  ["Inputs:", "", "InpRR=2.0"],
  ["", "", "InpFixedRR=3.0"],
  ["Initial Deposit:", "", "10000.000000"],
  ["History Quality:", "", "97%"],
  ["Orders"],
  ["Open Time", "Order", "Symbol", "Type", "Volume", "", "Price", "S / L", "T / P", "Time", "", "State", "Comment"],
  ...orders,
  ["Deals"],
  ["Time", "Deal", "Symbol", "Type", "Direction", "Volume", "Price", "Order", "Commission", "Swap", "Profit", "Balance", "Comment"],
  ["2020.01.01 00:00:00", "1", "", "balance", "", "", "", "", "0", "0", "10000.00", "10000.00", ""],
  ...deals,
];

describe("Strategy Tester report", () => {
  it("reads the settings", () => {
    const { meta } = parseTesterRows(rows([]));
    expect(meta).toMatchObject({ expert: "PB_SMC_EA", symbol: "XAUUSD", deposit: 10000, historyQuality: "97%" });
    expect(meta.inputs).toEqual({ InpRR: "2.0", InpFixedRR: "3.0" });
  });

  it("pairs in and out deals into trades with costs, and measures R from the order's stop", () => {
    const { trades } = parseTesterRows(
      rows(
        [
          ["2020.01.21 06:00:00", "2", "XAUUSD", "sell", "in", "0.05", "1566.98", "2", "-0.25", "0.00", "0.00", "9999.75", "PB SMC"],
          ["2020.01.27 02:07:40", "3", "XAUUSD", "buy", "out", "0.05", "1585.72", "3", "0.00", "6.49", "-93.70", "9912.54", "sl 1585.72"],
          ["2020.05.11 15:00:00", "4", "XAUUSD", "buy", "in", "0.05", "1699.82", "4", "-0.25", "0.00", "0.00", "9912.29", "PB SMC"],
          ["2020.05.12 10:00:00", "5", "XAUUSD", "sell", "out", "0.05", "1737.30", "5", "0.00", "0.00", "187.40", "10099.69", "tp 1737.30"],
        ],
        [
          ["2020.01.21 06:00:00", "2", "XAUUSD", "sell", "0.05 / 0.05", "", "0.00", "1585.72", "1510.77", "2020.01.21 06:00:00", "", "filled", "PB SMC"],
          ["2020.05.11 15:00:00", "4", "XAUUSD", "buy", "0.05 / 0.05", "", "0.00", "1681.08", "1737.30", "2020.05.11 15:00:00", "", "filled", "PB SMC"],
        ],
      ),
    );
    expect(trades).toHaveLength(2);
    expect(trades[0]).toMatchObject({ open: "2020-01-21 06:00:00", side: "SHORT", entry: 1566.98, exit: 1585.72, pnl: -87.46, stop: 1585.72, exitReason: "sl", balanceBefore: 10000 });
    // The stop was hit: -1R, less the commission, plus the swap it earned.
    expect(trades[0].r).toBeCloseTo(-87.46 / 93.7, 3);
    expect(trades[1]).toMatchObject({ side: "LONG", exitReason: "tp", target: 1737.3, balanceBefore: 9912.54 });
    expect(trades[1].r).toBeCloseTo((187.4 - 0.25) / ((1699.82 - 1681.08) * 5), 2);
  });

  it("rejects a file that isn't a tester report", () => {
    expect(() => parseTesterRows([["Trade History Report"]])).toThrow(/Strategy Tester/);
  });
});
