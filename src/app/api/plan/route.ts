import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { buildWeeklyPlan } from "@/lib/plan/planner";

// GET /api/plan → the top-down plan for every Signals market: last week's
// range and the A-grade side, today's range, trends, levels and insights.
// Not cached: each call picks up the 1h candles that closed since the last.
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();
  try {
    return NextResponse.json(await buildWeeklyPlan());
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
