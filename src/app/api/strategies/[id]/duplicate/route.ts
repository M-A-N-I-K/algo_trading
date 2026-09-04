import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { appError, toErrorResponse } from "@/lib/errors";
import { duplicateStrategy } from "@/db/repositories/strategyRepository";

const DuplicateSchema = z.object({ name: z.string().optional() });

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = DuplicateSchema.safeParse(body);
    if (!parsed.success) throw appError("INVALID_INPUT", "Invalid duplicate request.", parsed.error.issues);

    const result = await duplicateStrategy(id, user.id, parsed.data.name);
    if (!result) throw appError("NOT_FOUND", "Strategy not found.");
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
