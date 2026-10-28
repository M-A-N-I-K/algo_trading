import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateRequest, authChallengeResponse } from "@/lib/auth";
import { STRATEGY_CATALOG } from "@/lib/strategyCatalog";

function toSettingsPayload(user: {
  startingBalance: number;
  dailyLossLimit: number | null;
  weeklyLossLimit: number | null;
  defaultStrategy: string;
  hiddenKpiCards: string[];
  coindcxBalance: number | null;
  coindcxBalanceSyncedAt: Date | null;
}) {
  return {
    startingBalance: user.startingBalance,
    dailyLossLimit: user.dailyLossLimit,
    weeklyLossLimit: user.weeklyLossLimit,
    defaultStrategy: user.defaultStrategy,
    hiddenKpiCards: user.hiddenKpiCards,
    // Read-only here — set via POST /api/coindcx/sync-balance, not PATCH.
    coindcxBalance: user.coindcxBalance,
    coindcxBalanceSyncedAt: user.coindcxBalanceSyncedAt ? user.coindcxBalanceSyncedAt.toISOString() : null,
  };
}

export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) {
    return authChallengeResponse();
  }

  return NextResponse.json(toSettingsPayload(user));
}

export async function PATCH(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) {
    return authChallengeResponse();
  }

  try {
    const data = await request.json();
    const update: Record<string, unknown> = {};

    if (data.startingBalance !== undefined) {
      const startingBalance = parseFloat(data.startingBalance);
      if (isNaN(startingBalance) || startingBalance <= 0) {
        return NextResponse.json({ error: "Starting balance must be a positive number" }, { status: 400 });
      }
      update.startingBalance = startingBalance;
    }

    if (data.dailyLossLimit !== undefined) {
      if (data.dailyLossLimit === null) {
        update.dailyLossLimit = null;
      } else {
        const dailyLossLimit = parseFloat(data.dailyLossLimit);
        if (isNaN(dailyLossLimit) || dailyLossLimit < 0) {
          return NextResponse.json({ error: "Daily loss limit must be a non-negative number" }, { status: 400 });
        }
        update.dailyLossLimit = dailyLossLimit;
      }
    }

    if (data.weeklyLossLimit !== undefined) {
      if (data.weeklyLossLimit === null) {
        update.weeklyLossLimit = null;
      } else {
        const weeklyLossLimit = parseFloat(data.weeklyLossLimit);
        if (isNaN(weeklyLossLimit) || weeklyLossLimit < 0) {
          return NextResponse.json({ error: "Weekly loss limit must be a non-negative number" }, { status: 400 });
        }
        update.weeklyLossLimit = weeklyLossLimit;
      }
    }

    if (data.defaultStrategy !== undefined) {
      if (typeof data.defaultStrategy !== "string" || !STRATEGY_CATALOG.some((s) => s.value === data.defaultStrategy)) {
        return NextResponse.json({ error: "Unknown strategy key" }, { status: 400 });
      }
      update.defaultStrategy = data.defaultStrategy;
    }

    if (data.hiddenKpiCards !== undefined) {
      if (!Array.isArray(data.hiddenKpiCards) || !data.hiddenKpiCards.every((k: unknown) => typeof k === "string")) {
        return NextResponse.json({ error: "hiddenKpiCards must be an array of strings" }, { status: 400 });
      }
      update.hiddenKpiCards = data.hiddenKpiCards;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No valid settings fields provided" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: update,
    });

    return NextResponse.json(toSettingsPayload(updated));
  } catch (e: any) {
    console.error("PATCH settings error:", e);
    return NextResponse.json({ error: "Failed to update settings: " + e.message }, { status: 500 });
  }
}
