import { describe, expect, it } from "vitest";
import { CODED_STRATEGIES } from "@/strategies/registry";
import { STRATEGY_CATALOG } from "@/lib/strategyCatalog";
import { STRATEGY_GUIDES, getGuide } from "..";

// Every strategy ships with a guide. Adding a strategy to the registry
// without one fails here.
describe("strategy guides", () => {
  for (const key of Object.keys(CODED_STRATEGIES)) {
    describe(key, () => {
      const guide = getGuide(key);

      it("has a guide", () => {
        expect(guide, `add a guide for "${key}" in src/guides`).toBeDefined();
      });

      it("covers every section a beginner needs", () => {
        if (!guide) return;
        expect(guide.summary.length).toBeGreaterThan(0);
        expect(guide.terms.length).toBeGreaterThan(0);
        expect(guide.chartSetup.length).toBeGreaterThan(0);
        expect(guide.long.length).toBeGreaterThanOrEqual(3);
        expect(guide.short.length).toBeGreaterThanOrEqual(3);
        for (const text of [guide.entry, guide.stop, guide.target, guide.tagline]) expect(text.trim()).not.toBe("");
        expect(guide.manage.length).toBeGreaterThan(0);
        expect(guide.skip.length).toBeGreaterThan(0);
        expect(guide.mistakes.length).toBeGreaterThan(0);
        expect(guide.example.steps.length).toBeGreaterThan(0);
        expect(guide.checklist.length).toBeGreaterThanOrEqual(3);
        expect(guide.diagram.price.length).toBeGreaterThan(2);
        expect(guide.backtest.rows.length).toBeGreaterThan(0);
      });

      it("uses the strategy's name from the catalog", () => {
        if (!guide) return;
        expect(guide.name).toBe(STRATEGY_CATALOG.find((s) => s.value === key)?.label);
      });
    });
  }

  it("has no guides for strategies that don't exist", () => {
    for (const guide of STRATEGY_GUIDES) expect(Object.keys(CODED_STRATEGIES)).toContain(guide.key);
  });
});
