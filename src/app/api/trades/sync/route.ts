import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authChallengeResponse } from "@/lib/auth";
import { syncCoindcxTrades } from "@/lib/coindcxSync";

export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) {
    return authChallengeResponse();
  }

  if (!process.env.COINDCX_API_KEY || !process.env.COINDCX_SECRET_KEY) {
    return NextResponse.json(
      { error: "CoinDCX API credentials are not configured on the server." },
      { status: 400 },
    );
  }

  try {
    const result = await syncCoindcxTrades(user.id);
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    console.error("CoinDCX sync error:", e);
    return NextResponse.json({ error: "Failed to sync CoinDCX trades: " + e.message }, { status: 500 });
  }
}
