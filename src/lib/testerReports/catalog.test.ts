import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { setupById } from "@/lib/playbook/config";
import { TESTER_REPORTS } from "./catalog";

describe("tester report catalog", () => {
  it("has imported data and a known setup for every report", () => {
    const slugs = new Set<string>();
    for (const r of TESTER_REPORTS) {
      expect(slugs.has(r.slug), r.slug).toBe(false);
      slugs.add(r.slug);
      if (r.research) expect(setupById(r.setupId), r.setupId).toBeUndefined();
      else expect(setupById(r.setupId), r.setupId).toBeDefined();
      const file = path.join(process.cwd(), "src/data/tester-reports", `${r.slug}.json`);
      expect(existsSync(file), file).toBe(true);
      const data = JSON.parse(readFileSync(file, "utf8"));
      expect(data.trades.length).toBeGreaterThan(0);
      expect(data.trades.every((t: { r: number }) => Number.isFinite(t.r))).toBe(true);
    }
  });
});
