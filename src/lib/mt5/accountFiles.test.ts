import { describe, expect, it } from "vitest";
import { firstDeposit, parseAccountInfo, parseDeals, parseOpenPositions, positionsFromDeals } from "./accountFiles";

const HEAD = "TICKET\tPOSITION\tTIME\tTYPE\tENTRY\tSYMBOL\tVOLUME\tPRICE\tSL\tTP\tCOMMISSION\tSWAP\tFEE\tPROFIT\tREASON\tCOMMENT";
const deals = [
  HEAD,
  "1\t0\t2026.11.10 09:00:00\tbalance\tin\t\t0.00\t\t\t\t0.00\t0.00\t0.00\t10000.00\tclient\tInitial deposit",
  // Gold long, closed in two parts, the second at the stop.
  "2\t100\t2026.11.17 10:00:00\tbuy\tin\tXAUUSD\t0.10\t4000.00\t3990.00\t4030.00\t-0.30\t0.00\t0.00\t0.00\tclient\t",
  "3\t100\t2026.11.17 11:00:00\tsell\tout\tXAUUSD\t0.05\t4010.00\t3990.00\t4030.00\t-0.15\t0.00\t0.00\t5.00\tclient\t",
  "4\t100\t2026.11.17 12:00:00\tsell\tout\tXAUUSD\t0.05\t4020.00\t3990.00\t4030.00\t-0.15\t-1.00\t0.00\t10.00\tsl\t[sl 4020.00]",
  // NDX short, still open.
  "5\t200\t2026.11.18 15:00:00\tsell\tin\tNDX100\t0.02\t25000.0\t\t\t0.00\t0.00\t0.00\t0.00\tmobile\t",
].join("\r\n");
const open = ["POSITION\tSYMBOL\tTYPE\tTIME\tVOLUME\tPRICE\tSL\tTP\tSWAP\tPROFIT\tCURRENT", "200\tNDX100\tsell\t2026.11.18 15:00:00\t0.02\t25000.0\t25100.0\t\t-0.50\t4.00\t24980.0"].join("\r\n");

describe("MT5 account export", () => {
  it("reads the account file", () => {
    const info = parseAccountInfo("login\t12345\r\nserver\tBroker-SIM1\r\nbalance\t10012.50\r\nequity\t10016.00\r\nutc\t1795413397\r\n");
    expect(info).toMatchObject({ login: "12345", server: "Broker-SIM1", balance: 10012.5, equity: 10016 });
    expect(info?.writtenAt).toBe(1795413397000);
    expect(parseAccountInfo("login\t../x\r\n")).toBeNull();
  });

  it("builds positions from deals: partial closes, costs, stop exits and open positions", () => {
    const d = parseDeals(deals);
    expect(d).toHaveLength(5);
    expect(firstDeposit(d)).toBe(10000);
    const [gold, ndx] = positionsFromDeals(d, parseOpenPositions(open));
    expect(gold).toMatchObject({ positionId: "100", symbol: "XAUUSD", side: "LONG", status: "CLOSED", volume: 0.1, openPrice: 4000, stopLoss: 3990, takeProfit: 4030, closePrice: 4015, commission: -0.6, swap: -1, profit: 15, netPnl: 13.4, exitReason: "stop" });
    // Server time is Athens (UTC+2 in November).
    expect(gold.openTime.toISOString()).toBe("2026-11-17T08:00:00.000Z");
    expect(gold.closeTime?.toISOString()).toBe("2026-11-17T10:00:00.000Z");
    expect(ndx).toMatchObject({ positionId: "200", side: "SHORT", status: "OPEN", stopLoss: 25100, takeProfit: null, profit: 4, swap: -0.5, netPnl: 3.5 });
  });

  it("keeps a partly closed position open", () => {
    const d = parseDeals(deals).filter((x) => x.ticket !== "4");
    const gold = positionsFromDeals(d, [])[0];
    expect(gold.status).toBe("OPEN");
  });
});
