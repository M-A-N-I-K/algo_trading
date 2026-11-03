import { coindcxSignedRequest } from "@/tools/coindcxSignedRequest";

// The seam between CoinDCX futures and everything that reasons about it.
// Two adapters: the live HTTP one below (signed, IPv4-pinned, paginated)
// and `createInMemoryCoinDcxClient` for tests and offline reconciliation.
// Adapters hand back normalized rows — pagination, raw field names and
// pair formats ("B-ETH_USDT") never cross this seam.

export interface FuturesFill {
  id: string;
  orderId: string;
  side: "buy" | "sell";
  quantity: number;
  price: number; // quote (USDT) price
  symbol: string; // "ETHUSDT"
  timestamp: number; // ms
  feeAmount: number; // margin currency
  marginCurrency: string; // "USDT" | "INR"
}

// One row of CoinDCX's futures position ledger (/positions/transactions).
// Order rows carry the exchange's own realized P&L (`amount`, average-cost
// basis) and the fee for one fill; funding rows carry a funding settlement.
// Amounts are in the position's margin currency; `priceInUsdt` converts.
export interface LedgerRow {
  id: string; // CoinDCX fill_id of the ledger row (not the trade fill id)
  stage: string; // "funding" | "default" | "exit" | "tpsl_exit" | "liquidate" | ...
  parentType: string; // "...::FundingSnapshot" | "...::Order"
  parentId: string; // order id for order rows — joins to FuturesFill.orderId
  positionId: string;
  symbol: string;
  amount: number;
  feeAmount: number;
  priceInUsdt: number;
  marginCurrency: string;
  createdAt: number; // ms
}

export interface CoinDcxClient {
  futuresFills(): Promise<FuturesFill[]>;
  futuresLedger(): Promise<LedgerRow[]>;
  /** order id -> stop-loss price attached to that order (bracket-style). */
  futuresStopLosses(): Promise<Map<string, number>>;
  /** USDT futures wallet equity: free + locked margin. */
  futuresUsdtBalance(): Promise<number>;
}

const PAGE_SIZE = 100;

// "B-ETH_USDT" -> "ETHUSDT", so futures symbols read the same as elsewhere.
export function normalizeFuturesPair(pair: string): string {
  return pair.replace(/^[A-Za-z]+-/, "").replace("_", "");
}

const MAX_PAGINATION_ATTEMPTS = 3;

// CoinDCX paginates newest-first by page number, so a row arriving (or an
// unstable sort among equal timestamps) mid-walk shifts rows between pages:
// one row shows up twice and another is silently skipped, with the total
// count unchanged. A duplicate id is the only visible symptom, so on any
// duplicate the whole walk is retried; reconciling a set with a hole in it
// would corrupt round trips.
//
// Retrying alone can't fix rows that tie on the sort key, though: one
// market order often fills as a dozen fills in the same millisecond, and
// CoinDCX's order among them isn't stable between page queries, so a page
// boundary inside that group duplicates and drops rows the same way on
// every walk. `repair` gets the duplicated rows and returns their full tie
// groups (fetched some other way); the walk is accepted once nothing is
// missing — every page was full, so the walked row count is the true total.
async function fetchAllPages<T>(
  path: string,
  params: Record<string, unknown>,
  idOf: (row: T) => string,
  repair?: (duplicated: T[]) => Promise<T[]>,
): Promise<T[]> {
  for (let attempt = 1; attempt <= MAX_PAGINATION_ATTEMPTS; attempt++) {
    const rows = await walkPages<T>(path, params);
    const unique = new Map<string, T>();
    const duplicated: T[] = [];
    for (const row of rows) {
      if (unique.has(idOf(row))) duplicated.push(row);
      else unique.set(idOf(row), row);
    }
    if (duplicated.length && repair) {
      for (const row of await repair(duplicated)) {
        if (!unique.has(idOf(row))) unique.set(idOf(row), row);
      }
    }
    if (unique.size >= rows.length) return [...unique.values()];
  }
  throw new Error(
    `CoinDCX ${path} returned shifting pages ${MAX_PAGINATION_ATTEMPTS} times in a row; try the sync again.`,
  );
}

async function walkPages<T>(path: string, params: Record<string, unknown>): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; ; page++) {
    const raw = await coindcxSignedRequest<T[]>("POST", path, {
      ...params,
      page: String(page),
      size: String(PAGE_SIZE),
    });
    if (!raw.length) break;
    rows.push(...raw);
    if (raw.length < PAGE_SIZE) break;
  }
  return rows;
}

interface RawFuturesFill {
  fill_id: string;
  order_id: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  pair: string;
  timestamp: number;
  fee_amount?: number;
  margin_currency_short_name?: string;
}

interface RawLedgerRow {
  fill_id: string;
  pair: string;
  stage: string;
  parent_type: string;
  parent_id: string;
  position_id: string;
  amount: number;
  fee_amount: number;
  price_in_usdt: number;
  margin_currency_short_name: string;
  created_at: number;
}

interface RawFuturesOrder {
  id: string;
  stop_loss_price: number | null;
}

interface RawFuturesWallet {
  currency_short_name: string;
  balance: string;
  locked_balance: string;
}

export function createHttpCoinDcxClient(): CoinDcxClient {
  return {
    async futuresFills() {
      const path = "/exchange/v1/derivatives/futures/trades";
      // Same-millisecond fills tie per order, so refetch each affected
      // order's fills in full via the endpoint's order_id filter.
      const raw = await fetchAllPages<RawFuturesFill>(path, {}, (f) => f.fill_id, async (duplicated) => {
        const orderIds = [...new Set(duplicated.map((f) => f.order_id))];
        const groups = [];
        for (const orderId of orderIds) groups.push(await walkPages<RawFuturesFill>(path, { order_id: orderId }));
        return groups.flat();
      });
      return raw.map((f) => ({
        id: f.fill_id,
        orderId: f.order_id,
        side: f.side,
        quantity: Number(f.quantity),
        price: Number(f.price),
        symbol: normalizeFuturesPair(f.pair),
        timestamp: Number(f.timestamp),
        feeAmount: Number(f.fee_amount ?? 0),
        marginCurrency: f.margin_currency_short_name ?? "USDT",
      }));
    },

    async futuresLedger() {
      const raw = await fetchAllPages<RawLedgerRow>(
        "/exchange/v1/derivatives/futures/positions/transactions",
        // Defaults to ["USDT"] if omitted — INR-margined rows would vanish.
        { stage: "all", margin_currency_short_name: ["INR", "USDT"] },
        (r) => r.fill_id,
      );
      return raw.map((r) => ({
        id: r.fill_id,
        stage: r.stage,
        parentType: r.parent_type,
        parentId: r.parent_id,
        positionId: r.position_id,
        symbol: normalizeFuturesPair(r.pair),
        amount: Number(r.amount),
        feeAmount: Number(r.fee_amount),
        priceInUsdt: Number(r.price_in_usdt),
        marginCurrency: r.margin_currency_short_name,
        createdAt: Number(r.created_at),
      }));
    },

    async futuresStopLosses() {
      const raw = await fetchAllPages<RawFuturesOrder>(
        "/exchange/v1/derivatives/futures/orders",
        { status: "filled" },
        (o) => o.id,
      );
      const stops = new Map<string, number>();
      for (const order of raw) {
        if (order.stop_loss_price != null) stops.set(order.id, Number(order.stop_loss_price));
      }
      return stops;
    },

    async futuresUsdtBalance() {
      const wallets = await coindcxSignedRequest<RawFuturesWallet[]>(
        "GET",
        "/exchange/v1/derivatives/futures/wallets",
      );
      const usdt = wallets.find((w) => w.currency_short_name === "USDT");
      if (!usdt) return 0;
      return parseFloat(usdt.balance) + parseFloat(usdt.locked_balance);
    },
  };
}

export function createInMemoryCoinDcxClient(data: {
  fills?: FuturesFill[];
  ledger?: LedgerRow[];
  stopLosses?: Record<string, number>;
  usdtBalance?: number;
}): CoinDcxClient {
  return {
    futuresFills: async () => data.fills ?? [],
    futuresLedger: async () => data.ledger ?? [],
    futuresStopLosses: async () => new Map(Object.entries(data.stopLosses ?? {})),
    futuresUsdtBalance: async () => data.usdtBalance ?? 0,
  };
}
