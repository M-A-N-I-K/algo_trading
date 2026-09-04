import { prisma } from "@/db/client";
import { AssetType, Instrument } from "@/domain/market-data/types";
import { Instrument as PrismaInstrument } from "@prisma/client";

function toDomain(row: PrismaInstrument): Instrument {
  return {
    id: row.id,
    symbol: row.symbol,
    exchange: row.exchange,
    assetType: row.assetType as AssetType,
    currency: row.currency,
    tickSize: row.tickSize.toNumber(),
    lotSize: row.lotSize.toNumber(),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function findInstrumentById(id: string): Promise<Instrument | null> {
  const row = await prisma.instrument.findUnique({ where: { id } });
  return row ? toDomain(row) : null;
}

export async function findInstrumentBySymbol(symbol: string, exchange: string): Promise<Instrument | null> {
  const row = await prisma.instrument.findUnique({ where: { symbol_exchange: { symbol, exchange } } });
  return row ? toDomain(row) : null;
}

export async function listInstruments(filter?: {
  assetType?: AssetType;
  isActive?: boolean;
  search?: string;
}): Promise<Instrument[]> {
  const rows = await prisma.instrument.findMany({
    where: {
      assetType: filter?.assetType,
      isActive: filter?.isActive,
      symbol: filter?.search ? { contains: filter.search, mode: "insensitive" } : undefined,
    },
    orderBy: { symbol: "asc" },
  });
  return rows.map(toDomain);
}
