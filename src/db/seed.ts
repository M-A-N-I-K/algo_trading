// Development seed script. Populates a handful of demo instruments and
// clearly-flagged synthetic (isDemo: true) OHLCV candles so /market and
// /risk have something realistic to work against without a live data
// vendor. Safe to re-run — instruments upsert on (symbol, exchange) and
// candles upsert on (instrumentId, timeframe, timestamp).
import { Timeframe } from "@prisma/client";
import { prisma } from "./client";

const INSTRUMENTS: {
  symbol: string;
  exchange: string;
  assetType: "STOCK" | "INDEX";
  tickSize: number;
  lotSize: number;
  basePrice: number;
}[] = [
  { symbol: "NIFTY", exchange: "NSE", assetType: "INDEX", tickSize: 0.05, lotSize: 1, basePrice: 24850 },
  { symbol: "BANKNIFTY", exchange: "NSE", assetType: "INDEX", tickSize: 0.05, lotSize: 1, basePrice: 51200 },
  { symbol: "RELIANCE", exchange: "NSE", assetType: "STOCK", tickSize: 0.05, lotSize: 1, basePrice: 2940 },
  { symbol: "TCS", exchange: "NSE", assetType: "STOCK", tickSize: 0.05, lotSize: 1, basePrice: 4120 },
  { symbol: "INFY", exchange: "NSE", assetType: "STOCK", tickSize: 0.05, lotSize: 1, basePrice: 1850 },
];

// Deterministic PRNG (mulberry32) — same seed always produces the same
// demo candle series, so re-seeding a dev DB is reproducible.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DemoCandle {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function generateRandomWalk(basePrice: number, count: number, stepMs: number, endTime: number, seed: number): DemoCandle[] {
  const rand = mulberry32(seed);
  const candles: DemoCandle[] = [];
  let price = basePrice;

  for (let i = count - 1; i >= 0; i--) {
    const timestamp = new Date(endTime - i * stepMs);
    const drift = (rand() - 0.5) * basePrice * 0.006;
    const open = price;
    const close = Math.max(0.01, open + drift);
    const high = Math.max(open, close) + rand() * basePrice * 0.002;
    const low = Math.min(open, close) - rand() * basePrice * 0.002;
    const volume = Math.floor(50000 + rand() * 200000);
    candles.push({ timestamp, open, high, low, close, volume });
    price = close;
  }

  return candles;
}

async function seedInstrument(spec: (typeof INSTRUMENTS)[number], seedOffset: number) {
  const instrument = await prisma.instrument.upsert({
    where: { symbol_exchange: { symbol: spec.symbol, exchange: spec.exchange } },
    update: {},
    create: {
      symbol: spec.symbol,
      exchange: spec.exchange,
      assetType: spec.assetType,
      currency: "INR",
      tickSize: spec.tickSize,
      lotSize: spec.lotSize,
      isActive: true,
    },
  });

  const now = Date.now();

  const series: { timeframe: Timeframe; count: number; stepMs: number }[] = [
    { timeframe: "D1", count: 300, stepMs: 24 * 60 * 60 * 1000 },
    { timeframe: "M5", count: 500, stepMs: 5 * 60 * 1000 },
  ];

  // Bulk-insert in batches via createMany({ skipDuplicates: true }) rather
  // than one upsert() round-trip per candle — thousands of sequential
  // individual queries risk outliving a pooled serverless Postgres
  // connection's lifetime (this is what failed on the first seed attempt).
  const BATCH_SIZE = 500;
  for (const s of series) {
    const candles = generateRandomWalk(spec.basePrice, s.count, s.stepMs, now, seedOffset + s.stepMs);
    for (let i = 0; i < candles.length; i += BATCH_SIZE) {
      const batch = candles.slice(i, i + BATCH_SIZE);
      await prisma.candle.createMany({
        data: batch.map((c) => ({
          instrumentId: instrument.id,
          timeframe: s.timeframe,
          timestamp: c.timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          isDemo: true,
        })),
        skipDuplicates: true,
      });
    }
  }

  console.log(`Seeded ${spec.symbol} (${spec.exchange}): ${series.map((s) => `${s.count} x ${s.timeframe}`).join(", ")}`);
}

async function main() {
  console.log("Seeding demo instruments and candles (all candles flagged isDemo=true)...\n");
  let i = 0;
  for (const spec of INSTRUMENTS) {
    await seedInstrument(spec, i * 7919);
    i++;
  }
  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
