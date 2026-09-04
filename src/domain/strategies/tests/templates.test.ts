import { describe, expect, it } from "vitest";
import { StrategyDefinitionSchema } from "../definition";
import { STRATEGY_TEMPLATES } from "../templates";
import { validateStrategyDefinition } from "../validation";

describe("templates", () => {
  it.each(STRATEGY_TEMPLATES.map((t) => [t.id, t] as const))("%s is schema-valid and READY out of the box", (_id, template) => {
    const definition = template.build();

    expect(() => StrategyDefinitionSchema.parse(definition)).not.toThrow();

    const validation = validateStrategyDefinition(definition);
    expect(validation.issues).toEqual([]);
    expect(validation.isReady).toBe(true);
  });

  it("every template has a unique id", () => {
    const ids = STRATEGY_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("building the same template twice produces independent condition ids", () => {
    const template = STRATEGY_TEMPLATES[0];
    const a = template.build();
    const b = template.build();
    const idA = a.entry.long?.conditions.id;
    const idB = b.entry.long?.conditions.id;
    expect(idA).toBeDefined();
    expect(idA).not.toBe(idB);
  });
});
