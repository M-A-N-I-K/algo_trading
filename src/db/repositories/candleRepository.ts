import { prisma } from "@/db/client";
import { Candle, CandleQuery, Timeframe } from "@/domain/market-data/types";
import { Candle as PrismaCandle, Timeframe as PrismaTimeframe } from "@prisma/client";
import type { CandleStore } from "@/domain/market-data/historicalCandles";

// The domain layer uses lowercase timeframe strings ("5m", "1h") for
// readability in the UI/URLs; Prisma's enum uses uppercase identifiers
// (M5, H1) since Postgres enum values can't start with a digit.
const TIMEFRAME_TO_DB: Record<Timeframe, PrismaTimeframe> = {
  "1m": "M1",
  "5m": "M5",
  "15m": "M15",
  "30m": "M30",
  "1h": "H1",
  "4h": "H4",
  "1d": "D1",
};
const TIMEFRAME_FROM_DB: Record<PrismaTimeframe, Timeframe> = {
  M1: "1m",
  M5: "5m",
  M15: "15m",
  M30: "30m",
  H1: "1h",
  H4: "4h",
  D1: "1d",
};

function toDomain(row: PrismaCandle): Candle {
  return {
    instrumentId: row.instrumentId,
    timestamp: row.timestamp.toISOString(),
    timeframe: TIMEFRAME_FROM_DB[row.timeframe],
    open: row.open.toNumber(),
    high: row.high.toNumber(),
    low: row.low.toNumber(),
    close: row.close.toNumber(),
    volume: row.volume.toNumber(),
    isDemo: row.isDemo,
  };
}

export async function queryCandles(query: CandleQuery): Promise<Candle[]> {
  const rows = await prisma.candle.findMany({
    where: {
      instrumentId: query.instrumentId,
      timeframe: TIMEFRAME_TO_DB[query.timeframe],
      timestamp: {
        gte: query.from,
        lte: query.to,
      },
    },
    orderBy: { timestamp: "asc" },
    take: query.limit,
  });
  return rows.map(toDomain);
}

export async function findLatestCandle(instrumentId: string, timeframe: Timeframe): Promise<Candle | null> {
  const row = await prisma.candle.findFirst({
    where: { instrumentId, timeframe: TIMEFRAME_TO_DB[timeframe] },
    orderBy: { timestamp: "desc" },
  });
  return row ? toDomain(row) : null;
}

export async function findHistoricalCandles(
  instrumentId: string,
  timeframe: Timeframe,
  from: Date,
  to: Date,
): Promise<Candle[]> {
  const rows = await prisma.candle.findMany({
    where: {
      instrumentId,
      timeframe: TIMEFRAME_TO_DB[timeframe],
      timestamp: { gte: from, lte: to },
    },
    orderBy: { timestamp: "asc" },
  });
  return rows.map(toDomain);
}

export { TIMEFRAME_TO_DB, TIMEFRAME_FROM_DB };

// CandleStore for the historical candle source (src/domain/market-data/historicalCandles.ts).
// Closed candles never change, so a row that already exists is left as is.
export const prismaCandleStore: CandleStore = {
  find: (instrumentId, timeframe, from, to) => findHistoricalCandles(instrumentId, timeframe, from, to),
  async save(candles) {
    const BATCH = 1000;
    for (let i = 0; i < candles.length; i += BATCH) {
      await prisma.candle.createMany({
        data: candles.slice(i, i + BATCH).map((c) => ({
          instrumentId: c.instrumentId,
          timeframe: TIMEFRAME_TO_DB[c.timeframe],
          timestamp: new Date(c.timestamp),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          isDemo: c.isDemo,
        })),
        skipDuplicates: true,
      });
    }
  },
};
