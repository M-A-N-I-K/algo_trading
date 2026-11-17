import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { feedStatus } from "@/lib/mt5/feed";

// GET /api/mt5/feed → is the PB_BarFeed expert in MT5 writing bars right
// now, when it last did, and how many markets it carries.
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();
  return NextResponse.json(await feedStatus(), { headers: { "Cache-Control": "no-store" } });
}
