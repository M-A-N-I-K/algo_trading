import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { appError, toErrorResponse } from "@/lib/errors";
import { CreateStrategySchema } from "@/domain/strategies";
import { createStrategy, listStrategiesForUser } from "@/db/repositories/strategyRepository";

export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const strategies = await listStrategiesForUser(user.id);
    return NextResponse.json({ strategies });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const body = await request.json();
    const parsed = CreateStrategySchema.safeParse(body);
    if (!parsed.success) {
      throw appError("INVALID_INPUT", "Invalid strategy definition.", parsed.error.issues);
    }

    const { strategy, version } = await createStrategy(user.id, parsed.data.definition);
    return NextResponse.json({ strategy, version }, { status: 201 });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
