import { ConditionNode } from "./conditions";

// crypto.randomUUID() is available in both the browser (Web Crypto) and
// Node — used instead of node:crypto so this module works unmodified in
// client components too.
export function generateId(): string {
  return crypto.randomUUID();
}

// Deep-clones a condition tree with fresh ids on every node. Used when
// instantiating a template (so two strategies created from the same
// template never share condition ids) and when duplicating a strategy
// (section 39 — the duplicate must not share the original's ids).
export function regenerateConditionIds(node: ConditionNode): ConditionNode {
  if (node.type === "condition") {
    return { ...node, id: generateId() };
  }
  return { ...node, id: generateId(), conditions: node.conditions.map(regenerateConditionIds) };
}
