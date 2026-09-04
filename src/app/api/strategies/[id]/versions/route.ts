import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { appError, toErrorResponse } from "@/lib/errors";
import { CreateStrategyVersionSchema, diffStrategyDefinitions } from "@/domain/strategies";
import { createStrategyVersion, listStrategyVersions } from "@/db/repositories/strategyRepository";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const { id } = await context.params;
    const versions = await listStrategyVersions(id, user.id);
    return NextResponse.json({ versions });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

// Always inserts a new version — never overwrites a previous one (see
// strategyRepository.createStrategyVersion).
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = CreateStrategyVersionSchema.safeParse(body);
    if (!parsed.success) {
      throw appError("INVALID_INPUT", "Invalid strategy definition.", parsed.error.issues);
    }

    const versions = await listStrategyVersions(id, user.id);
    const previous = versions[0]; // most recent first
    if (!previous) throw appError("NOT_FOUND", "Strategy not found.");

    // If the caller didn't supply a change note, derive one from the
    // structured diff so every version has a meaningful description.
    const derivedNote = diffStrategyDefinitions(previous.definition, parsed.data.definition)
      .map((d) => d.label)
      .join(", ");
    const changeNote = parsed.data.changeNote ?? (derivedNote || undefined);

    const version = await createStrategyVersion(id, user.id, parsed.data.definition, changeNote);
    if (!version) throw appError("NOT_FOUND", "Strategy not found.");
    return NextResponse.json({ version }, { status: 201 });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
