import { describe, expect, it } from "vitest";
import { StrategyDefinitionSchema } from "../definition";
import { STRATEGY_TEMPLATES } from "../templates";

describe("serialization — StrategyDefinition -> JSON -> StrategyDefinition", () => {
  it.each(STRATEGY_TEMPLATES.map((t) => [t.id, t] as const))("%s round-trips with semantic equality", (_id, template) => {
    const original = template.build();
    const json = JSON.stringify(original);
    const revived: unknown = JSON.parse(json);

    // Parsing through the schema is the real round-trip test: it proves
    // the JSON is not just textually identical but still a *valid*,
    // semantically equivalent StrategyDefinition per the schema — the
    // property that actually matters for persistence/export/import.
    const parsed = StrategyDefinitionSchema.parse(revived);
    expect(parsed).toEqual(original);
  });
});
