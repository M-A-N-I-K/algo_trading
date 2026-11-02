import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authChallengeResponse } from "@/lib/auth";
import { syncCoindcxBalance } from "@/lib/coindcx/sync";
import { hasCoindcxCredentials } from "@/tools/coindcxSignedRequest";

export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  if (!hasCoindcxCredentials()) {
    return NextResponse.json(
      { error: "CoinDCX API credentials are not configured on the server." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await syncCoindcxBalance(user.id));
  } catch (e) {
    console.error("CoinDCX balance sync error:", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Failed to sync CoinDCX balance: " + message }, { status: 500 });
  }
}
