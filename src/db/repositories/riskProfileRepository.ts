import { prisma } from "@/db/client";
import { RiskCalculationResult } from "@/domain/risk";

export interface SavedRiskProfile {
  id: string;
  userId: string;
  name: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number | null;
  riskPercent: number;
  result: RiskCalculationResult;
  createdAt: string;
}

export interface CreateRiskProfileInput {
  userId: string;
  tradingAccountId?: string | null;
  instrumentId?: string | null;
  name: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  stopLoss: number;
  takeProfit?: number | null;
  riskPercent: number;
  result: RiskCalculationResult;
}

export async function createRiskProfile(input: CreateRiskProfileInput): Promise<SavedRiskProfile> {
  const row = await prisma.riskProfile.create({
    data: {
      userId: input.userId,
      tradingAccountId: input.tradingAccountId ?? undefined,
      instrumentId: input.instrumentId ?? undefined,
      name: input.name,
      symbol: input.symbol,
      direction: input.direction,
      entryPrice: input.entryPrice,
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit ?? undefined,
      riskPercent: input.riskPercent,
      result: input.result as object,
    },
  });
  return toDomain(row);
}

export async function listRiskProfilesForUser(userId: string): Promise<SavedRiskProfile[]> {
  const rows = await prisma.riskProfile.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toDomain);
}

// Ownership is always verified via the `userId` filter, not just the
// record id — never trust a caller-supplied id alone.
export async function deleteRiskProfile(id: string, userId: string): Promise<boolean> {
  const result = await prisma.riskProfile.deleteMany({ where: { id, userId } });
  return result.count > 0;
}

function toDomain(row: {
  id: string;
  userId: string;
  name: string;
  symbol: string;
  direction: string;
  entryPrice: { toNumber(): number };
  stopLoss: { toNumber(): number };
  takeProfit: { toNumber(): number } | null;
  riskPercent: { toNumber(): number };
  result: unknown;
  createdAt: Date;
}): SavedRiskProfile {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    symbol: row.symbol,
    direction: row.direction as "LONG" | "SHORT",
    entryPrice: row.entryPrice.toNumber(),
    stopLoss: row.stopLoss.toNumber(),
    takeProfit: row.takeProfit ? row.takeProfit.toNumber() : null,
    riskPercent: row.riskPercent.toNumber(),
    result: row.result as RiskCalculationResult,
    createdAt: row.createdAt.toISOString(),
  };
}
