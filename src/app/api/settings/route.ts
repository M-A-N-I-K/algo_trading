import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateRequest, authChallengeResponse } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) {
    return authChallengeResponse();
  }

  return NextResponse.json({ startingBalance: user.startingBalance });
}

export async function PATCH(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) {
    return authChallengeResponse();
  }

  try {
    const data = await request.json();
    const startingBalance = parseFloat(data.startingBalance);

    if (isNaN(startingBalance) || startingBalance <= 0) {
      return NextResponse.json({ error: "Starting balance must be a positive number" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { startingBalance },
    });

    return NextResponse.json({ startingBalance: updated.startingBalance });
  } catch (e: any) {
    console.error("PATCH settings error:", e);
    return NextResponse.json({ error: "Failed to update settings: " + e.message }, { status: 500 });
  }
}
