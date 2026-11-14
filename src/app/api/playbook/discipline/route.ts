import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { closeOutDay, disciplineView } from "@/lib/playbook/disciplineStore";

// GET /api/playbook/discipline → this week's goals, the daily rules checked
// against the journal, each weekday's result and the streak.
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();
  try {
    return NextResponse.json(await disciplineView(user.id));
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/playbook/discipline { day?, kept: string[] } → close out a day
// with the manual rules that were kept. Returns the updated view.
export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();
  try {
    return NextResponse.json(await closeOutDay(user.id, await request.json()));
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
