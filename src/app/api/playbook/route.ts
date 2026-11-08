import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { playbookView, setPlatformBalance } from "@/lib/playbook/store";

// GET /api/playbook → the playbook's setups and rules, the account against
// the firm's limits, open and closed trades, and the per-setup scorecard.
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();
  try {
    return NextResponse.json(await playbookView(user.id));
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

// PATCH /api/playbook { balance } → match the playbook's balance to the
// platform's closed balance. Returns the updated view.
export async function PATCH(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();
  try {
    await setPlatformBalance(user.id, await request.json());
    return NextResponse.json(await playbookView(user.id));
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
