import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { runSignalScan } from "@/lib/signals/scanner";
import { QUALIFY_RULE } from "@/lib/signals/scan";

// GET /api/signals → every coded strategy on the watchlist with its
// long-window backtest; the latest signal only for qualified ones. Not cached: each call
// picks up candles that closed since the last one.
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();
  try {
    const scan = await runSignalScan();
    return NextResponse.json({ ...scan, rule: QUALIFY_RULE });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
