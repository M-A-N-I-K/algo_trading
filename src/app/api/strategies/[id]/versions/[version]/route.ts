import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { appError, toErrorResponse } from "@/lib/errors";
import { getStrategyVersion } from "@/db/repositories/strategyRepository";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; version: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const { id, version } = await context.params;
    const versionNumber = Number(version);
    if (!Number.isInteger(versionNumber) || versionNumber < 1) {
      throw appError("INVALID_INPUT", "Version must be a positive integer.");
    }

    const record = await getStrategyVersion(id, versionNumber, user.id);
    if (!record) throw appError("NOT_FOUND", "Strategy version not found.");
    return NextResponse.json({ version: record });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
