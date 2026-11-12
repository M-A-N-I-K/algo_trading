import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CODED_STRATEGIES } from "@/strategies/registry";
import { INDICATORS } from "./catalog";

describe("indicator catalog", () => {
  it.each(INDICATORS)("$id points at Pine v6 scripts and a coded strategy", (info) => {
    const pine = [info.file, info.strategyFile].filter((f): f is string => !!f);
    expect(pine.length).toBeGreaterThan(0);
    for (const f of pine) {
      const file = path.join(process.cwd(), "tradingview", f);
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file, "utf8").startsWith("//@version=6")).toBe(true);
    }
    if (info.strategyFile) expect(readFileSync(path.join(process.cwd(), "tradingview", info.strategyFile), "utf8")).toMatch(/^strategy\(/m);
    expect(CODED_STRATEGIES[info.strategy]).toBeDefined();
    if (info.mt5File) expect(existsSync(path.join(process.cwd(), "mt5", info.mt5File))).toBe(true);
    if (info.mt5EaFile) expect(readFileSync(path.join(process.cwd(), "mt5", info.mt5EaFile), "utf8")).toMatch(/void OnTick\(\)/);
  });

  it("gives every active Playbook setup a Strategy Tester script, and every Playbook indicator an MT5 version", () => {
    for (const info of INDICATORS.filter((x) => x.status === "playbook")) {
      expect(info.strategyFile).toBeTruthy();
      if (info.file) expect(info.mt5File).toBeTruthy();
    }
  });

  it("covers every strategy in the Playbook", async () => {
    const { PLAYBOOK_SETUPS } = await import("@/lib/playbook/config");
    const covered = new Set(INDICATORS.filter((x) => x.strategyFile).map((x) => x.strategy));
    for (const s of PLAYBOOK_SETUPS) expect(covered, s.id).toContain(s.strategy);
  });
});
