import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { accountDashboardTrades } from "@/lib/playbook/dashboardTrades";
import { pickAccount } from "@/lib/playbook/store";

// GET /api/playbook/account-trades?account=<id> → that funding account's
// closed trades (Playbook-logged plus linked journal trades) in the
// dashboard's trade shape, for the dashboard's account switcher.
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();
  try {
    const account = pickAccount(request.nextUrl.searchParams.get("account"));
    return NextResponse.json(await accountDashboardTrades(user.id, account.id));
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
