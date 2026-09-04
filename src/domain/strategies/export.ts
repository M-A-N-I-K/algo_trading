import { StrategyDefinition, StrategyDefinitionSchema } from "./definition";

export interface StrategyExportPayload {
  formatVersion: 1;
  exportedAt: string;
  name: string;
  definition: StrategyDefinition;
}

export function exportStrategy(name: string, definition: StrategyDefinition): StrategyExportPayload {
  return { formatVersion: 1, exportedAt: new Date().toISOString(), name, definition };
}

export function serializeStrategyExport(payload: StrategyExportPayload): string {
  return JSON.stringify(payload, null, 2);
}

export type StrategyImportResult = { success: true; definition: StrategyDefinition; name?: string } | { success: false; error: string };

// Imported strategy JSON is untrusted input: parsed with JSON.parse (never
// eval or the Function constructor) and validated with Zod before it is
// ever treated as a real StrategyDefinition. Invalid input is rejected
// with a specific error, not silently coerced.
export function parseStrategyImport(raw: string): StrategyImportResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { success: false, error: "The file is not valid JSON." };
  }

  // Accept either a full export payload ({ definition, name, ... }) or a
  // bare StrategyDefinition, so hand-authored JSON also works.
  const isPayloadShape = json !== null && typeof json === "object" && "definition" in (json as Record<string, unknown>);
  const candidateDefinition = isPayloadShape ? (json as { definition: unknown }).definition : json;
  const candidateName = isPayloadShape ? (json as { name?: unknown }).name : undefined;

  const parsed = StrategyDefinitionSchema.safeParse(candidateDefinition);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; ") };
  }

  return { success: true, definition: parsed.data, name: typeof candidateName === "string" ? candidateName : undefined };
}
