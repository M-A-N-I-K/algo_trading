import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { appError, toErrorResponse } from "@/lib/errors";
import { CandleQuerySchema } from "@/domain/market-data/schemas";
import { getMarketDataProvider } from "@/domain/market-data/demoProvider";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const { id } = await context.params;
    const url = new URL(request.url);
    const parsed = CandleQuerySchema.safeParse({
      instrumentId: id,
      timeframe: url.searchParams.get("timeframe") || undefined,
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
      limit: url.searchParams.get("limit") || undefined,
    });
    if (!parsed.success) {
      throw appError("INVALID_INPUT", "Invalid candle query parameters.", parsed.error.issues);
    }

    const provider = getMarketDataProvider();
    const instrument = await provider.getInstrumentById(id);
    if (!instrument) {
      throw appError("INSTRUMENT_NOT_FOUND", `No instrument found with id "${id}".`);
    }

    const candles = await provider.getCandles(parsed.data);
    return NextResponse.json({ instrument, candles });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
