import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { appError, toErrorResponse } from "@/lib/errors";
import { calculateRiskProfileFromValidated } from "@/domain/risk/calculations";
import { isRiskCalculationFailure } from "@/domain/risk/types";
import { RiskCalculationInputSchema } from "@/domain/risk/schemas";
import { createRiskProfile, listRiskProfilesForUser } from "@/db/repositories/riskProfileRepository";

export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const profiles = await listRiskProfilesForUser(user.id);
    return NextResponse.json({ profiles });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

const SaveRiskProfileSchema = z.object({
  name: z.string().min(1),
  tradingAccountId: z.string().optional(),
  instrumentId: z.string().optional(),
  input: RiskCalculationInputSchema,
});

export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const body = await request.json();
    const parsed = SaveRiskProfileSchema.safeParse(body);
    if (!parsed.success) {
      throw appError("INVALID_INPUT", "Invalid risk profile payload.", parsed.error.issues);
    }

    // Recompute server-side rather than trusting a client-supplied result —
    // the saved snapshot must reflect what the validated inputs actually produce.
    const outcome = calculateRiskProfileFromValidated(parsed.data.input);
    if (isRiskCalculationFailure(outcome)) {
      return NextResponse.json({ code: "INVALID_INPUT", message: "Risk calculation failed validation.", errors: outcome.errors }, { status: 422 });
    }

    const profile = await createRiskProfile({
      userId: user.id,
      tradingAccountId: parsed.data.tradingAccountId,
      instrumentId: parsed.data.instrumentId,
      name: parsed.data.name,
      symbol: parsed.data.input.trade.symbol,
      direction: parsed.data.input.trade.direction,
      entryPrice: parsed.data.input.trade.entryPrice,
      stopLoss: parsed.data.input.trade.stopLoss,
      takeProfit: parsed.data.input.trade.takeProfit ?? null,
      riskPercent: parsed.data.input.account.riskPerTradePercent,
      result: outcome.data,
    });

    return NextResponse.json({ profile }, { status: 201 });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
