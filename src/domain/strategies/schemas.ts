import { z } from "zod";
import { StrategyDefinitionSchema } from "./definition";

// Request-level schemas for the API layer (Route -> Validation -> Service).
// These wrap StrategyDefinitionSchema with the extra fields a create/update
// request carries but the definition itself doesn't need to know about.

export const CreateStrategySchema = z.object({
  definition: StrategyDefinitionSchema,
});
export type CreateStrategyInput = z.infer<typeof CreateStrategySchema>;

// Saving a new version of an existing strategy. `changeNote` is optional —
// if omitted, the API derives one from the structured diff (see diff.ts).
export const CreateStrategyVersionSchema = z.object({
  definition: StrategyDefinitionSchema,
  changeNote: z.string().optional(),
});
export type CreateStrategyVersionInput = z.infer<typeof CreateStrategyVersionSchema>;

export const UpdateStrategyStatusSchema = z.object({
  status: z.enum(["DRAFT", "READY", "ARCHIVED"]),
});
export type UpdateStrategyStatusInput = z.infer<typeof UpdateStrategyStatusSchema>;

// Import: the same shape as export (see export.ts), validated before it's
// ever treated as a trusted StrategyDefinition — never executed, only data.
export const ImportStrategySchema = z.object({
  name: z.string().optional(),
  definition: StrategyDefinitionSchema,
});
export type ImportStrategyInput = z.infer<typeof ImportStrategySchema>;
