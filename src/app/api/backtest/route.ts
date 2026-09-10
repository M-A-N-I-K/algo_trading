import { NextRequest, NextResponse } from "next/server";
import { parseCandlesticks } from "@/indicators/utils";
import {
  createEmaRsiBollingerStrategy,
  createMacdSmaAtrStrategy,
  createTrendFollowingStrategy,
  createSupplyDemandStrategy,
  createMacd200EmaSrStrategy,
  createSmartMoneyConceptsStrategy,
  createVwapStrategy,
  createOrderBlockStrategy,
  createFourHourRangeStrategy,
  createCmfMacdSwingStopStrategy,
  createEmaVwapTrendReclaimStrategy,
  createFibonacciRetracementContinuationStrategy,
  createIchimokuCloudLongOnlySwingStrategy,
  createGoldLondonLiquiditySweepStrategy,
  createSessionLondonOpenBosStrategy,
  createTrendRsiEngulfingScalpStrategy,
} from "@/strategies";
import { runBacktest } from "@/backtest/engine";
import { fetchCandlestickHistory, intervalToMs } from "@/backtest/fetchHistory";
import { authenticateRequest, authChallengeResponse } from "@/lib/auth";
import { createBacktestRun } from "@/db/repositories/backtestRunRepository";

const STRATEGIES: Record<string, (opts?: any) => any> = {
  "ema-rsi-bollinger": createEmaRsiBollingerStrategy,
  "macd-sma-atr": createMacdSmaAtrStrategy,
  "trend-following": createTrendFollowingStrategy,
  "supply-demand": createSupplyDemandStrategy,
  "macd-200ema-sr": createMacd200EmaSrStrategy,
  "smc": createSmartMoneyConceptsStrategy,
  "smart-money-concepts": createSmartMoneyConceptsStrategy,
  "vwap": createVwapStrategy,
  "order-block": createOrderBlockStrategy,
  "4h-range": createFourHourRangeStrategy,
  "cmf-macd-swing-stop": createCmfMacdSwingStopStrategy,
  "ema-vwap-trend-reclaim": createEmaVwapTrendReclaimStrategy,
  "fib-retracement-continuation": createFibonacciRetracementContinuationStrategy,
  "ichimoku-long-swing": createIchimokuCloudLongOnlySwingStrategy,
  "gold-london-sweep": createGoldLondonLiquiditySweepStrategy,
  "session-london-bos": createSessionLondonOpenBosStrategy,
  "trend-rsi-engulfing-scalp": createTrendRsiEngulfingScalpStrategy,
};

export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) {
    return authChallengeResponse();
  }

  try {
    const { strategy: strategyKey, symbol, interval, limit, initialBalance, minRiskRewardRatio } = await request.json();
    
    if (!strategyKey || !symbol || !interval || !limit) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    const createStrategy = STRATEGIES[strategyKey];
    if (!createStrategy) {
      return NextResponse.json({ error: `Unknown strategy key: ${strategyKey}` }, { status: 400 });
    }

    const symbols = symbol.split(",").map((s: string) => s.trim().toUpperCase());
    const limitNum = Number(limit) || 1000;
    const balanceNum = Number(initialBalance) || 10000;
    const minRrNum = minRiskRewardRatio !== undefined && minRiskRewardRatio !== "" ? Number(minRiskRewardRatio) : undefined;

    const results = [];

    for (const sym of symbols) {
      let runInterval = interval;
      let htfCandles = undefined;

      if (strategyKey === "supply-demand") {
        runInterval = "15m";
        const htfLimit = Math.ceil(limitNum / 16) + 50;
        const rawHtf = await fetchCandlestickHistory(sym, "4h", htfLimit);
        if (rawHtf && rawHtf.length > 0) {
          htfCandles = parseCandlesticks(rawHtf);
        }
      }

      if (strategyKey === "order-block") {
        // Order blocks are drawn on 1h structure; `interval` is the
        // lower-timeframe trigger (e.g. 1m/5m) used only for entries.
        const candlesPerHtfBar = intervalToMs("1h") / intervalToMs(runInterval);
        const htfLimit = Math.ceil(limitNum / candlesPerHtfBar) + 50;
        const rawHtf = await fetchCandlestickHistory(sym, "1h", htfLimit);
        if (rawHtf && rawHtf.length > 0) {
          htfCandles = parseCandlesticks(rawHtf);
        }
      }

      if (strategyKey === "session-london-bos") {
        // Bias comes from a 4h EMA; `interval` is the execution timeframe
        // the break-of-structure entry is triggered on.
        const candlesPerHtfBar = intervalToMs("4h") / intervalToMs(runInterval);
        const htfLimit = Math.ceil(limitNum / candlesPerHtfBar) + 50;
        const rawHtf = await fetchCandlestickHistory(sym, "4h", htfLimit);
        if (rawHtf && rawHtf.length > 0) {
          htfCandles = parseCandlesticks(rawHtf);
        }
      }

      const candles = await fetchCandlestickHistory(sym, runInterval, limitNum);
      if (!candles || candles.length === 0) {
        continue;
      }

      const ohlc = parseCandlesticks(candles);
      const strategyInstance = strategyKey === "supply-demand" || strategyKey === "order-block" || strategyKey === "session-london-bos"
        ? createStrategy({ htfCandles })
        : createStrategy();

      const simResult = runBacktest(ohlc, strategyInstance, {
        initialBalance: balanceNum,
        positionSizePercent: 1,
        minRiskRewardRatio: minRrNum
      });

      // Format trade logs to return to the front-end dashboard
      const formattedTrades = simResult.trades.map((trade) => ({
        side: trade.side,
        entryTime: new Date(trade.entryTime).toISOString().replace("T", " ").slice(0, 19),
        entryPrice: trade.entryPrice,
        exitTime: new Date(trade.exitTime).toISOString().replace("T", " ").slice(0, 19),
        exitPrice: trade.exitPrice,
        quantity: trade.quantity,
        pnl: trade.pnl,
        pnlPercent: trade.pnlPercent
      }));

      results.push({
        symbol: sym,
        strategyName: strategyInstance.name,
        totalTrades: simResult.trades.length,
        winRate: simResult.winRate,
        finalBalance: simResult.finalBalance,
        totalReturnPercent: simResult.totalReturnPercent,
        maxDrawdownPercent: simResult.maxDrawdownPercent,
        trades: formattedTrades.slice(-100), // Return last 100 simulation records
        equityCurve: simResult.equityCurve.slice(-500) // Return last 500 points for graphing
      });
    }

    // Persist every completed run (with at least one symbol's results) so
    // it can be compared against later from the History panel — never
    // block the response on this, but do surface the saved run's id so the
    // UI can refresh its history list without a second round trip.
    let savedRunId: string | null = null;
    if (results.length > 0) {
      try {
        const saved = await createBacktestRun({
          userId: user.id,
          strategyKey,
          strategyName: results[0].strategyName,
          symbols: symbols.join(","),
          interval,
          candleLimit: limitNum,
          initialBalance: balanceNum,
          minRiskRewardRatio: minRrNum,
          results,
        });
        savedRunId = saved.id;
      } catch (persistErr) {
        console.error("Failed to persist backtest run:", persistErr);
      }
    }

    return NextResponse.json({ results, savedRunId });
  } catch (e: any) {
    console.error("Backtest API execution failed:", e);
    return NextResponse.json({ error: "Backtest simulation failed: " + e.message }, { status: 500 });
  }
}
