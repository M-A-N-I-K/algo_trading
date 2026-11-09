import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { pickAccount, playbookView, setPlatformBalance } from "@/lib/playbook/store";

// GET /api/playbook?account=<id> → the playbook's setups and one account's
// rules, its status against the firm's limits, open and closed trades and
// per-setup scorecard, plus every account's status for the switcher.
// Without ?account, the first account.
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();
  try {
    const account = pickAccount(request.nextUrl.searchParams.get("account"));
    return NextResponse.json(await playbookView(user.id, account.id));
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

// PATCH /api/playbook { accountId, balance } → match that account's balance
// to the platform's closed balance. Returns the updated view.
export async function PATCH(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();
  try {
    const account = await setPlatformBalance(user.id, await request.json());
    return NextResponse.json(await playbookView(user.id, account.id));
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
