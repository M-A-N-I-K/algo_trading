import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CODED_STRATEGIES } from "@/strategies/registry";
import { INDICATORS } from "./catalog";

describe("indicator catalog", () => {
  it.each(INDICATORS)("$id points at a Pine v6 script and a coded strategy", (info) => {
    const file = path.join(process.cwd(), "tradingview", info.file);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf8").startsWith("//@version=6")).toBe(true);
    expect(CODED_STRATEGIES[info.strategy]).toBeDefined();
    if (info.mt5File) expect(existsSync(path.join(process.cwd(), "mt5", info.mt5File))).toBe(true);
  });

  it("gives every active Playbook indicator an MT5 version", () => {
    for (const info of INDICATORS.filter((x) => x.status === "playbook")) expect(info.mt5File).toBeTruthy();
  });
});
