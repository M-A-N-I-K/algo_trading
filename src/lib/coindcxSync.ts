import { prisma } from "@/lib/db";
import { coindcxSignedPost } from "@/tools/coindcxSignedRequest";

interface CoinDcxFill {
  id: string | number;
  order_id: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  symbol: string;
  timestamp: number;
  fee_amount?: number;
}

interface RawFuturesFill {
  fill_id: string;
  order_id: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  pair: string; // e.g. "B-ETH_USDT"
  timestamp: number;
  fee_amount?: number;
}

interface ClosedTrade {
  externalId: string;
  time: Date;
  symbol: string;
  side: "LONG" | "SHORT";
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
}

const SPOT_PAGE_LIMIT = 500;
const FUTURES_PAGE_SIZE = 100;

async function fetchAllSpotFills(): Promise<CoinDcxFill[]> {
  const fills: CoinDcxFill[] = [];
  let fromId: string | number | undefined;

  while (true) {
    const params: Record<string, unknown> = { limit: SPOT_PAGE_LIMIT, sort: "asc" };
    if (fromId !== undefined) params.from_id = fromId;

    const page = await coindcxSignedPost<CoinDcxFill[]>(
      "/exchange/v1/orders/trade_history",
      params,
    );
    if (!page.length) break;

    fills.push(...page);
    if (page.length < SPOT_PAGE_LIMIT) break;
    fromId = page[page.length - 1].id;
  }

  return fills;
}

// CoinDCX futures pairs look like "B-ETH_USDT" — strip the liquidity-source
// prefix and underscore so the symbol reads the same as spot ("ETHUSDT").
function normalizeFuturesPair(pair: string): string {
  return pair.replace(/^[A-Za-z]+-/, "").replace("_", "");
}

async function fetchAllFuturesFills(): Promise<CoinDcxFill[]> {
  const fills: CoinDcxFill[] = [];
  let page = 1;

  while (true) {
    const raw = await coindcxSignedPost<RawFuturesFill[]>(
      "/exchange/v1/derivatives/futures/trades",
      { page: String(page), size: String(FUTURES_PAGE_SIZE) },
    );
    if (!raw.length) break;

    fills.push(
      ...raw.map((f) => ({
        id: f.fill_id,
        order_id: f.order_id,
        side: f.side,
        quantity: f.quantity,
        price: f.price,
        symbol: normalizeFuturesPair(f.pair),
        timestamp: f.timestamp,
        fee_amount: f.fee_amount,
      })),
    );

    if (raw.length < FUTURES_PAGE_SIZE) break;
    page += 1;
  }

  return fills;
}

const QUOTE_ASSETS = ["USDT", "INR", "USDC", "BTC", "ETH"];

function inferQuoteCurrency(symbol: string): string {
  return QUOTE_ASSETS.find((q) => symbol.endsWith(q)) ?? "USD";
}

// CoinDCX's trade history returns individual fills (one row per buy/sell
// execution), not closed round-trip trades. We rebuild round-trip trades by
// running a FIFO inventory match per symbol: each fill either extends the
// open position (pushed as a new lot) or closes against the oldest opposing
// lot(s) first. This mirrors standard FIFO trade accounting and is what lets
// a sell fill split across several earlier buy lots produce multiple
// correctly-priced closed trades instead of one averaged one.
//
// `idPrefix` namespaces the externalId per fill source (spot vs futures)
// so the two never collide, even though callers must run this separately
// per source — spot and futures positions are independent books and must
// not be netted against each other in one FIFO pass.
export function matchFillsFifo(fills: CoinDcxFill[], idPrefix: string): ClosedTrade[] {
  const bySymbol = new Map<string, CoinDcxFill[]>();
  for (const fill of fills) {
    const arr = bySymbol.get(fill.symbol) ?? [];
    arr.push(fill);
    bySymbol.set(fill.symbol, arr);
  }

  const closedTrades: ClosedTrade[] = [];

  for (const [symbol, symbolFills] of bySymbol) {
    symbolFills.sort(
      (a, b) => a.timestamp - b.timestamp || String(a.id).localeCompare(String(b.id)),
    );

    const lots: {
      id: string;
      side: "buy" | "sell";
      remaining: number;
      price: number;
      feePerUnit: number;
    }[] = [];

    for (const fill of symbolFills) {
      let remainingFillQty = fill.quantity;
      const fillFeePerUnit = (fill.fee_amount ?? 0) / fill.quantity;

      while (remainingFillQty > 1e-12 && lots.length > 0 && lots[0].side !== fill.side) {
        const lot = lots[0];
        const matchedQty = Math.min(lot.remaining, remainingFillQty);
        const matchedFee = matchedQty * (lot.feePerUnit + fillFeePerUnit);

        const side: "LONG" | "SHORT" = lot.side === "buy" ? "LONG" : "SHORT";
        const pnl =
          side === "LONG"
            ? (fill.price - lot.price) * matchedQty - matchedFee
            : (lot.price - fill.price) * matchedQty - matchedFee;

        closedTrades.push({
          externalId: `${idPrefix}:${lot.id}:${fill.id}`,
          time: new Date(fill.timestamp),
          symbol,
          side,
          quantity: matchedQty,
          entryPrice: lot.price,
          exitPrice: fill.price,
          pnl,
        });

        lot.remaining -= matchedQty;
        remainingFillQty -= matchedQty;
        if (lot.remaining <= 1e-12) lots.shift();
      }

      if (remainingFillQty > 1e-12) {
        lots.push({
          id: String(fill.id),
          side: fill.side,
          remaining: remainingFillQty,
          price: fill.price,
          feePerUnit: fillFeePerUnit,
        });
      }
    }
  }

  return closedTrades;
}

function toTradeRecord(t: ClosedTrade, exchange: string, strategy: string, userId: string) {
  return {
    time: t.time,
    pnl: t.pnl,
    currency: inferQuoteCurrency(t.symbol),
    symbol: t.symbol,
    exchange,
    side: t.side,
    quantity: t.quantity,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    strategy,
    notes: "",
    externalId: t.externalId,
    userId,
  };
}

export async function syncCoindcxTrades(userId: string) {
  const [spotFills, futuresFills] = await Promise.all([
    fetchAllSpotFills(),
    fetchAllFuturesFills(),
  ]);

  const spotClosed = matchFillsFifo(spotFills, "coindcx");
  const futuresClosed = matchFillsFifo(futuresFills, "coindcx-futures");

  const records = [
    ...spotClosed.map((t) => toTradeRecord(t, "COINDCX", "coindcx-sync", userId)),
    ...futuresClosed.map((t) => toTradeRecord(t, "COINDCX_FUTURES", "coindcx-futures-sync", userId)),
  ];

  const fetchedFillCount = spotFills.length + futuresFills.length;
  if (records.length === 0) {
    return { fetchedFillCount, importedCount: 0 };
  }

  const result = await prisma.trade.createMany({
    data: records,
    skipDuplicates: true,
  });

  return { fetchedFillCount, importedCount: result.count };
}
