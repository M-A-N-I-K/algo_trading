import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { appError, toErrorResponse } from "@/lib/errors";
import { InstrumentQuerySchema } from "@/domain/market-data/schemas";
import { getMarketDataProvider } from "@/domain/market-data/demoProvider";

export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const url = new URL(request.url);
    const parsed = InstrumentQuerySchema.safeParse({
      assetType: url.searchParams.get("assetType") || undefined,
      isActive: url.searchParams.has("isActive") ? url.searchParams.get("isActive") === "true" : undefined,
      search: url.searchParams.get("search") || undefined,
    });
    if (!parsed.success) {
      throw appError("INVALID_INPUT", "Invalid query parameters.", parsed.error.issues);
    }

    const provider = getMarketDataProvider();
    const instruments = await provider.listInstruments(parsed.data);
    return NextResponse.json({ instruments });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
