import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { openTrade } from "@/lib/playbook/store";

// POST /api/playbook/trades { accountId, ... } → log a trade taken from the
// playbook on that account. The
// checks are rerun on the server. 201 with the trade when logged; 422 with
// the checks when a rule would break and no override reason is given.
export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();
  try {
    const result = await openTrade(user.id, await request.json());
    if (!result.trade) {
      return NextResponse.json(
        { code: "INVALID_INPUT", message: "This trade breaks a playbook rule. Give a reason to log it anyway.", details: result },
        { status: 422 },
      );
    }
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
