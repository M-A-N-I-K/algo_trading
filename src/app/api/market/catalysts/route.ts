import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { selectCatalysts } from "@/lib/news/catalysts";
import { loadCalendar } from "@/lib/economicCalendar";

// GET /api/market/catalysts → { catalysts, source }: this week's high and
// medium impact events for every currency, from 12 hours ago on. The
// Playbook picks out the ones that touch each market.
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();
  try {
    const catalysts = selectCatalysts(await loadCalendar(), null, Date.now());
    return NextResponse.json({ catalysts, source: "ForexFactory weekly calendar" });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
