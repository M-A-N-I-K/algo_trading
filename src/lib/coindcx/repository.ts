import { prisma } from "@/lib/db";
import type { ReconcileResult, RoundTrip } from "./reconcile";

export const COINDCX_FUTURES_EXCHANGE = "COINDCX_FUTURES";
const SYNCED_EXCHANGES = ["COINDCX", COINDCX_FUTURES_EXCHANGE];
const SYNC_STRATEGY = "coindcx-futures-sync";

// Field ownership on re-sync:
// - exchange-owned (always refreshed): everything in exchangeFields()
// - user-owned (set on create only): notes, strategy, tags, checklist
// - stopLoss / initialRiskAmount: filled from the exchange only while the
//   trade has no stop, so a stop corrected by hand is never overwritten.
function exchangeFields(rt: RoundTrip) {
  return {
    time: rt.closedAt,
    openedAt: rt.openedAt,
    symbol: rt.symbol,
    side: rt.side,
    quantity: rt.quantity,
    entryPrice: rt.entryPrice,
    exitPrice: rt.exitPrice,
    pnl: rt.netPnl,
    grossPnl: rt.grossPnl,
    fees: rt.fees,
    funding: rt.funding,
    netPnlNative: rt.netPnlNative,
    marginCurrency: rt.marginCurrency,
    currency: "USDT",
    exitType: rt.exitType,
  };
}

type ExchangeData = ReturnType<typeof exchangeFields>;

function sameExchangeData(current: Record<string, unknown>, next: ExchangeData): boolean {
  return (Object.keys(next) as (keyof ExchangeData)[]).every((key) => {
    const a = current[key];
    const b = next[key];
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
    return a === b;
  });
}

// Synced trades from before round trips existed (one row per exit fill,
// externalId "coindcx:..." / "coindcx-futures:...") — removed once, unless
// the user has annotated them.
function isLegacyExternalId(externalId: string | null) {
  return externalId != null && !externalId.startsWith("rt:");
}

export async function saveCoindcxFuturesSync(userId: string, result: ReconcileResult) {
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.trade.findMany({
        where: { userId, exchange: { in: SYNCED_EXCHANGES } },
        select: {
          id: true,
          externalId: true,
          notes: true,
          tags: true,
          checklist: true,
          stopLoss: true,
          initialRiskAmount: true,
          time: true,
          openedAt: true,
          symbol: true,
          side: true,
          quantity: true,
          entryPrice: true,
          exitPrice: true,
          pnl: true,
          grossPnl: true,
          fees: true,
          funding: true,
          netPnlNative: true,
          marginCurrency: true,
          currency: true,
          exitType: true,
        },
      });

      const legacy = existing.filter((t) => isLegacyExternalId(t.externalId));
      const legacyRemovable = legacy.filter(
        (t) => t.notes === "" && t.tags.length === 0 && t.checklist == null,
      );
      if (legacyRemovable.length) {
        await tx.trade.deleteMany({ where: { id: { in: legacyRemovable.map((t) => t.id) } } });
      }

      // Each statement is a network round trip to the database, so new trades
      // go in one createMany and only trades whose exchange data changed are
      // updated — a routine re-sync touches a handful of rows.
      const byExternalId = new Map(existing.map((t) => [t.externalId, t]));
      const toCreate: RoundTrip[] = [];
      let updatedCount = 0;

      for (const rt of result.roundTrips) {
        const current = byExternalId.get(rt.externalId);
        if (!current) {
          toCreate.push(rt);
          continue;
        }
        const exchangeData = exchangeFields(rt);
        const fillStop = current.stopLoss == null && rt.stopLoss != null;
        if (sameExchangeData(current, exchangeData) && !fillStop) continue;
        updatedCount += 1;
        await tx.trade.update({
          where: { id: current.id },
          data: {
            ...exchangeData,
            ...(fillStop && { stopLoss: rt.stopLoss, initialRiskAmount: rt.initialRiskAmount }),
          },
        });
      }

      if (toCreate.length) {
        await tx.trade.createMany({
          data: toCreate.map((rt) => ({
            ...exchangeFields(rt),
            userId,
            exchange: COINDCX_FUTURES_EXCHANGE,
            externalId: rt.externalId,
            strategy: SYNC_STRATEGY,
            notes: "",
            stopLoss: rt.stopLoss,
            initialRiskAmount: rt.initialRiskAmount,
          })),
        });
      }

      // The ledger is refetched in full every sync, so replace it wholesale:
      // attributions change as positions close.
      await tx.coindcxWalletTransaction.deleteMany({ where: { userId } });
      await tx.coindcxWalletTransaction.createMany({
        data: result.ledger.map((row) => ({
          userId,
          externalId: row.id,
          stage: row.stage,
          parentType: row.parentType,
          symbol: row.symbol,
          positionId: row.positionId,
          marginCurrency: row.marginCurrency,
          amount: row.amount * row.priceInUsdt,
          feeAmount: row.feeAmount * row.priceInUsdt,
          nativeAmount: row.amount,
          nativeFeeAmount: row.feeAmount,
          currency: "USDT",
          occurredAt: new Date(row.createdAt),
          attribution: row.attribution,
          tradeExternalId: row.tradeExternalId,
        })),
        skipDuplicates: true,
      });

      return {
        importedCount: toCreate.length,
        updatedCount,
        unchangedCount: result.roundTrips.length - toCreate.length - updatedCount,
        removedLegacyCount: legacyRemovable.length,
        keptLegacyCount: legacy.length - legacyRemovable.length,
      };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}

// Funding split for the dashboard. Funding inside closed trades already
// lives on Trade.funding (and is netted into pnl); this reports the parts
// that are not in any trade yet, so totals still reconcile with CoinDCX.
export async function getFundingStats(userId: string) {
  const [byAttribution, unattributedOrderRows] = await Promise.all([
    prisma.coindcxWalletTransaction.groupBy({
      by: ["attribution"],
      where: { userId, stage: "funding" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.coindcxWalletTransaction.aggregate({
      where: { userId, attribution: "unattributed", NOT: { stage: "funding" } },
      _sum: { amount: true, feeAmount: true },
    }),
  ]);

  const funding = (a: string) => byAttribution.find((g) => g.attribution === a)?._sum.amount ?? 0;
  return {
    tradeFunding: funding("trade"),
    openFunding: funding("open"),
    unattributedFunding: funding("unattributed"),
    unattributedGrossPnl: unattributedOrderRows._sum.amount ?? 0,
    unattributedFees: unattributedOrderRows._sum.feeAmount ?? 0,
    eventCount: byAttribution.reduce((n, g) => n + g._count, 0),
  };
}

export async function saveCoindcxBalance(userId: string, balance: number) {
  const syncedAt = new Date();
  await prisma.user.update({
    where: { id: userId },
    data: { coindcxBalance: balance, coindcxBalanceSyncedAt: syncedAt },
  });
  return syncedAt;
}
