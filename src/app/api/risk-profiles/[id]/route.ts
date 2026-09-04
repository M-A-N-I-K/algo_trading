import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { appError, toErrorResponse } from "@/lib/errors";
import { deleteRiskProfile } from "@/db/repositories/riskProfileRepository";

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const { id } = await context.params;
    // Ownership is enforced inside the repository (WHERE id AND userId) —
    // never trust the id alone to identify the record to delete.
    const deleted = await deleteRiskProfile(id, user.id);
    if (!deleted) {
      throw appError("NOT_FOUND", "Risk profile not found.");
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
