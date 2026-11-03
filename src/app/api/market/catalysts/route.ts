import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { appError, toErrorResponse } from "@/lib/errors";
import { DEFAULT_PULSE_SYMBOL, getPulseMarket } from "@/domain/market-pulse/markets";
import { selectCatalysts } from "@/domain/market-pulse/catalysts";
import { loadCalendar } from "@/lib/economicCalendar";

// GET /api/market/catalysts?symbol=XAUUSDT → { catalysts, source }
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();
  try {
    const symbol = new URL(request.url).searchParams.get("symbol") || DEFAULT_PULSE_SYMBOL;
    const market = getPulseMarket(symbol);
    if (!market) throw appError("NOT_FOUND", `Live Pulse doesn't cover ${symbol}.`);
    const catalysts = selectCatalysts(await loadCalendar(), market.currencies, Date.now());
    return NextResponse.json({ catalysts, source: "ForexFactory weekly calendar" });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
