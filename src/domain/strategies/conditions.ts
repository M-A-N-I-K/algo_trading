import { z } from "zod";
import { ExpressionSchema } from "./expressions";
import { OperatorIdSchema } from "./operators";

// A single comparison: left OPERATOR right. `right` is omitted for unary
// operators (IS_RISING / IS_FALLING) — see operators.ts for arity.
// `negate` implements NOT on an individual condition without a separate
// node kind.
export const ConditionSchema = z.object({
  type: z.literal("condition"),
  id: z.string(),
  negate: z.boolean().default(false),
  left: ExpressionSchema,
  operator: OperatorIdSchema,
  right: ExpressionSchema.optional(),
});
export type Condition = z.infer<typeof ConditionSchema>;

// A group is a recursive tree: its children are either individual
// conditions or nested groups, combined with AND/OR. `negate` wraps the
// group's evaluated result in a logical NOT.
export interface ConditionGroup {
  type: "group";
  id: string;
  operator: "AND" | "OR";
  negate: boolean;
  conditions: ConditionNode[];
}

export const ConditionGroupSchema: z.ZodType<ConditionGroup> = z.lazy(() =>
  z.object({
    type: z.literal("group"),
    id: z.string(),
    operator: z.enum(["AND", "OR"]),
    negate: z.boolean().default(false),
    conditions: z.array(ConditionNodeSchema),
  }),
);

export type ConditionNode = Condition | ConditionGroup;

// Plain z.union for the same reason as ExpressionSchema (see expressions.ts)
// — ConditionGroupSchema is itself a recursive z.lazy() schema, which
// isn't statically discriminable in Zod v4's discriminatedUnion.
export const ConditionNodeSchema: z.ZodType<ConditionNode> = z.lazy(() => z.union([ConditionSchema, ConditionGroupSchema]));

export function emptyGroup(id: string, operator: "AND" | "OR" = "AND"): ConditionGroup {
  return { type: "group", id, operator, negate: false, conditions: [] };
}
