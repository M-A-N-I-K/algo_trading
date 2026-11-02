import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authChallengeResponse } from "@/lib/auth";
import { getFundingStats } from "@/lib/coindcx/repository";

export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    return NextResponse.json(await getFundingStats(user.id));
  } catch (e) {
    console.error("Failed to load funding stats:", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Failed to load funding stats: " + message }, { status: 500 });
  }
}
