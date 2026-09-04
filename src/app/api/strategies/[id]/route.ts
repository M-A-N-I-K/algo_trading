import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { appError, toErrorResponse } from "@/lib/errors";
import { UpdateStrategyStatusSchema, validateStrategyDefinition } from "@/domain/strategies";
import { deleteStrategy, getLatestStrategyVersion, getStrategy, updateStrategyStatus } from "@/db/repositories/strategyRepository";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const { id } = await context.params;
    const strategy = await getStrategy(id, user.id);
    if (!strategy) throw appError("NOT_FOUND", "Strategy not found.");

    const version = await getLatestStrategyVersion(id, user.id);
    return NextResponse.json({ strategy, version });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

// Status transitions are re-validated server-side — never trust a client
// claim that a strategy is complete enough to be READY.
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = UpdateStrategyStatusSchema.safeParse(body);
    if (!parsed.success) {
      throw appError("INVALID_INPUT", "Invalid status update.", parsed.error.issues);
    }

    if (parsed.data.status === "READY") {
      const version = await getLatestStrategyVersion(id, user.id);
      if (!version) throw appError("NOT_FOUND", "Strategy not found.");

      const validation = validateStrategyDefinition(version.definition);
      if (!validation.isReady) {
        return NextResponse.json(
          { code: "INVALID_INPUT", message: "Strategy is not ready — resolve the validation issues first.", issues: validation.issues },
          { status: 422 },
        );
      }
    }

    const strategy = await updateStrategyStatus(id, user.id, parsed.data.status);
    if (!strategy) throw appError("NOT_FOUND", "Strategy not found.");
    return NextResponse.json({ strategy });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const { id } = await context.params;
    const deleted = await deleteStrategy(id, user.id);
    if (!deleted) throw appError("NOT_FOUND", "Strategy not found.");
    return NextResponse.json({ success: true });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
