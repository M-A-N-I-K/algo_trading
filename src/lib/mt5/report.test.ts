import { describe, expect, it } from "vitest";
import { decodeReport, num, parseMt5Report, parseServerTime } from "./report";

// A cut-down report in MT5's layout: headings as one-cell rows, an empty cell
// after Type in Positions, thousands written with spaces. Made-up account.
const td = (cells: string[]) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
const HTML = `<html><body><table>
${td(["Trade History Report"])}
${td(["Name:", "Test Trader"])}
${td(["Account:", "12345 (USD, Demo-Server, demo, Hedge)"])}
${td(["Date:", "2026.11.09 07:48"])}
${td(["Positions"])}
${td(["Time", "Position", "Symbol", "Type", "", "Volume", "Price", "S / L", "T / P", "Time", "Price", "Commission", "Swap", "Profit"])}
${td(["2026.11.04 21:17:29", "1001", "XAUUSD", "sell", "", "0.05", "4061.97", "4063.45", "4059.06", "2026.11.04 21:31:25", "4059.06", "-0.25", "0.00", "14.55"])}
${td(["2026.11.06 22:45:13", "1002", "XAUUSD", "buy", "", "0.02", "4065.41", "4059.72", "4075.94", "2026.11.09 01:01:00", "4059.72", "-0.10", "-1.86", "-11.38"])}
${td(["2026.11.05 15:36:14", "1003", "XAUUSD", "buy", "", "0.12", "4118.98", "", "", "2026.11.05 15:43:29", "4120.85", "-0.60", "0.00", "22.44"])}
${td(["Orders"])}
${td(["Open Time", "Order", "Symbol", "Type", "Volume", "Price", "S / L", "T / P", "Time", "State", "Comment"])}
${td(["Deals"])}
${td(["Time", "Deal", "Symbol", "Type", "Direction", "Volume", "Price", "Order", "Cost", "Commission", "Fee", "Swap", "Profit", "Balance", "Comment"])}
${td(["2026.11.03 14:07:33", "1", "", "balance", "", "", "", "", "", "0.00", "0.00", "0.00", "5 000.00", "5 000.00", "Initial deposit"])}
${td(["2026.11.04 21:31:25", "2", "XAUUSD", "buy", "out", "0.05", "4059.06", "2001", "", "0.00", "0.00", "0.00", "14.55", "5 014.30", "[tp 4059.06]"])}
${td(["2026.11.09 01:01:00", "3", "XAUUSD", "sell", "out", "0.02", "4059.72", "2002", "", "0.00", "0.00", "-1.86", "-11.38", "5 001.06", "[sl 4059.72]"])}
${td(["2026.11.09 03:18:12", "4", "ETHUSD", "buy", "in", "1", "2132.94", "1004", "", "-0.85", "0.00", "0.00", "0.00", "5 000.21", ""])}
${td(["Open Positions"])}
${td(["Time", "Position", "Symbol", "Type", "Volume", "Price", "S / L", "T / P", "Market Price", "Swap", "Profit", "Comment"])}
${td(["2026.11.09 03:18:12", "1004", "ETHUSD", "buy", "1", "2132.94", "2117.29", "2168.42", "2149.17", "0.00", "16.23", ""])}
${td(["Balance:", "5 000.21", "", "Free Margin:", "3 675.80"])}
${td(["Equity:", "5 016.44"])}
</table></body></html>`;

const utf16 = (s: string) => {
  const bytes = new Uint8Array(2 + s.length * 2);
  bytes[0] = 0xff;
  bytes[1] = 0xfe;
  for (let i = 0; i < s.length; i++) {
    bytes[2 + i * 2] = s.charCodeAt(i) & 0xff;
    bytes[3 + i * 2] = s.charCodeAt(i) >> 8;
  }
  return bytes;
};

describe("MT5 report parser", () => {
  it("reads numbers with space thousands", () => {
    expect(num("5 000.00")).toBe(5000);
    expect(num("")).toBeNull();
  });

  it("converts server (Athens) time to UTC across DST", () => {
    expect(parseServerTime("2026.11.04 21:17:29")!.toISOString()).toBe("2026-11-04T19:17:29.000Z"); // UTC+2
    expect(parseServerTime("2026.07.01 12:00:00")!.toISOString()).toBe("2026-07-01T09:00:00.000Z"); // UTC+3
  });

  const report = parseMt5Report(decodeReport(utf16(HTML)));

  it("reads the account line and summary", () => {
    expect(report).toMatchObject({ login: "12345", server: "Demo-Server", currency: "USD", accountType: "demo", balance: 5000.21, equity: 5016.44 });
  });

  it("reads closed positions with net P&L and exit reason", () => {
    const [a, b, c] = report.positions;
    expect(a).toMatchObject({ positionId: "1001", side: "SHORT", volume: 0.05, status: "CLOSED", commission: -0.25, profit: 14.55, netPnl: 14.3, exitReason: "target" });
    expect(b).toMatchObject({ side: "LONG", swap: -1.86, netPnl: -13.34, exitReason: "stop" });
    expect(c).toMatchObject({ stopLoss: null, takeProfit: null, exitReason: "manual" });
  });

  it("reads open positions, taking commission from the opening deal", () => {
    const open = report.positions.find((p) => p.status === "OPEN")!;
    expect(open).toMatchObject({ positionId: "1004", symbol: "ETHUSD", commission: -0.85, profit: 16.23, netPnl: 15.38, closeTime: null });
  });

  it("rejects a file that isn't a report", () => {
    expect(() => parseMt5Report("<html><table><tr><td>hello</td></tr></table></html>")).toThrow(/Account/);
  });
});
