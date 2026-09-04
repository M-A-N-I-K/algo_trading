import { prisma } from "@/db/client";
import { StrategyDefinition, StrategyStatus, StrategyVersionRecord, regenerateConditionIds } from "@/domain/strategies";
import { TIMEFRAME_TO_DB } from "./candleRepository";
import { Prisma, Strategy as PrismaStrategy, StrategyVersion as PrismaStrategyVersion } from "@prisma/client";

export interface StrategyRecord {
  id: string;
  userId: string;
  name: string;
  description: string;
  market: string;
  timeframe: string;
  status: StrategyStatus;
  createdAt: string;
  updatedAt: string;
}

function strategyToDomain(row: PrismaStrategy): StrategyRecord {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    market: row.market,
    timeframe: row.timeframe,
    status: row.status as StrategyStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function versionToDomain(row: PrismaStrategyVersion): StrategyVersionRecord {
  return {
    id: row.id,
    strategyId: row.strategyId,
    version: row.version,
    definition: row.configuration as unknown as StrategyDefinition,
    createdAt: row.createdAt.toISOString(),
    changeNote: row.changeNote ?? undefined,
  };
}

// Every function below either takes `userId` and filters by it directly,
// or (for version-level operations) joins through the parent Strategy's
// userId — never trusting a client-supplied strategyId/versionId alone to
// authorize access. See section 29 of the P1 spec.

export async function createStrategy(
  userId: string,
  definition: StrategyDefinition,
): Promise<{ strategy: StrategyRecord; version: StrategyVersionRecord }> {
  const result = await prisma.$transaction(async (tx) => {
    const strategy = await tx.strategy.create({
      data: {
        userId,
        name: definition.metadata.name,
        description: definition.metadata.description,
        market: definition.market.symbol,
        timeframe: TIMEFRAME_TO_DB[definition.timeframe],
        status: "DRAFT",
      },
    });
    const version = await tx.strategyVersion.create({
      data: { strategyId: strategy.id, version: 1, configuration: definition as unknown as Prisma.InputJsonValue },
    });
    return { strategy, version };
  });

  return { strategy: strategyToDomain(result.strategy), version: versionToDomain(result.version) };
}

export async function listStrategiesForUser(userId: string): Promise<StrategyRecord[]> {
  const rows = await prisma.strategy.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
  return rows.map(strategyToDomain);
}

export async function getStrategy(id: string, userId: string): Promise<StrategyRecord | null> {
  const row = await prisma.strategy.findFirst({ where: { id, userId } });
  return row ? strategyToDomain(row) : null;
}

export async function getLatestStrategyVersion(strategyId: string, userId: string): Promise<StrategyVersionRecord | null> {
  const row = await prisma.strategyVersion.findFirst({
    where: { strategyId, strategy: { userId } },
    orderBy: { version: "desc" },
  });
  return row ? versionToDomain(row) : null;
}

export async function listStrategyVersions(strategyId: string, userId: string): Promise<StrategyVersionRecord[]> {
  const rows = await prisma.strategyVersion.findMany({
    where: { strategyId, strategy: { userId } },
    orderBy: { version: "desc" },
  });
  return rows.map(versionToDomain);
}

export async function getStrategyVersion(strategyId: string, version: number, userId: string): Promise<StrategyVersionRecord | null> {
  const row = await prisma.strategyVersion.findFirst({ where: { strategyId, version, strategy: { userId } } });
  return row ? versionToDomain(row) : null;
}

// Never overwrites a prior version — always inserts a new row, per the
// immutable-versioning requirement. Also refreshes the Strategy's
// denormalized listing fields (name/market/timeframe) from the new
// definition, since those exist for fast listing, not as a second
// authoritative copy.
export async function createStrategyVersion(
  strategyId: string,
  userId: string,
  definition: StrategyDefinition,
  changeNote?: string,
): Promise<StrategyVersionRecord | null> {
  const owned = await prisma.strategy.findFirst({ where: { id: strategyId, userId } });
  if (!owned) return null;

  const latest = await prisma.strategyVersion.findFirst({ where: { strategyId }, orderBy: { version: "desc" } });
  const nextVersion = (latest?.version ?? 0) + 1;

  const [, version] = await prisma.$transaction([
    prisma.strategy.update({
      where: { id: strategyId },
      data: {
        name: definition.metadata.name,
        description: definition.metadata.description,
        market: definition.market.symbol,
        timeframe: TIMEFRAME_TO_DB[definition.timeframe],
      },
    }),
    prisma.strategyVersion.create({
      data: { strategyId, version: nextVersion, configuration: definition as unknown as Prisma.InputJsonValue, changeNote },
    }),
  ]);

  return versionToDomain(version);
}

export async function updateStrategyStatus(strategyId: string, userId: string, status: StrategyStatus): Promise<StrategyRecord | null> {
  const result = await prisma.strategy.updateMany({ where: { id: strategyId, userId }, data: { status } });
  if (result.count === 0) return null;
  return getStrategy(strategyId, userId);
}

export async function deleteStrategy(strategyId: string, userId: string): Promise<boolean> {
  const result = await prisma.strategy.deleteMany({ where: { id: strategyId, userId } });
  return result.count > 0;
}

// Creates an entirely new strategy (new id, new version history starting
// at v1) with a fresh copy of the latest version's definition — condition
// ids are regenerated so the duplicate never shares tree-node ids with the
// original (see ids.ts).
export async function duplicateStrategy(
  strategyId: string,
  userId: string,
  newName?: string,
): Promise<{ strategy: StrategyRecord; version: StrategyVersionRecord } | null> {
  const source = await getLatestStrategyVersion(strategyId, userId);
  if (!source) return null;

  const cloned: StrategyDefinition = {
    ...source.definition,
    metadata: {
      ...source.definition.metadata,
      name: newName ?? `${source.definition.metadata.name} (Copy)`,
    },
    entry: {
      long: source.definition.entry.long
        ? { ...source.definition.entry.long, conditions: regenerateConditionIds(source.definition.entry.long.conditions) }
        : undefined,
      short: source.definition.entry.short
        ? { ...source.definition.entry.short, conditions: regenerateConditionIds(source.definition.entry.short.conditions) }
        : undefined,
    },
    exit: {
      ...source.definition.exit,
      signalExit: source.definition.exit.signalExit
        ? { ...source.definition.exit.signalExit, conditions: regenerateConditionIds(source.definition.exit.signalExit.conditions) }
        : undefined,
    },
    filters: source.definition.filters ? regenerateConditionIds(source.definition.filters) : undefined,
  };

  return createStrategy(userId, cloned);
}
