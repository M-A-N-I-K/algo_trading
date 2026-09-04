import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { calculateRiskProfile, isRiskCalculationFailure } from "@/domain/risk";

// Stateless risk calculation — no persistence. Save via POST /api/risk-profiles.
export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const body = await request.json();
    const outcome = calculateRiskProfile(body);

    if (isRiskCalculationFailure(outcome)) {
      return NextResponse.json({ code: "INVALID_INPUT", message: "Risk calculation failed validation.", errors: outcome.errors }, { status: 422 });
    }

    return NextResponse.json({ result: outcome.data });
  } catch (err) {
    const { body: errBody, status } = toErrorResponse(err);
    return NextResponse.json(errBody, { status });
  }
}
