import { createHttpCoinDcxClient, type CoinDcxClient } from "./client";
import { reconcileFromClient } from "./reconcile";
import { saveCoindcxBalance, saveCoindcxFuturesSync } from "./repository";

export async function syncCoindcxFutures(userId: string, client: CoinDcxClient = createHttpCoinDcxClient()) {
  const { fills, ledger, result } = await reconcileFromClient(client);
  const saved = await saveCoindcxFuturesSync(userId, result);
  return {
    fetchedFillCount: fills.length,
    ledgerRowCount: ledger.length,
    roundTripCount: result.roundTrips.length,
    ...saved,
    openFunding: result.openFunding,
    unattributed: result.unattributed,
  };
}

export async function syncCoindcxBalance(userId: string, client: CoinDcxClient = createHttpCoinDcxClient()) {
  const balance = await client.futuresUsdtBalance();
  const syncedAt = await saveCoindcxBalance(userId, balance);
  return { coindcxBalance: balance, coindcxBalanceSyncedAt: syncedAt.toISOString() };
}
