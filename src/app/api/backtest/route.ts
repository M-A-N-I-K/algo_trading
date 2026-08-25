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
} from "@/strategies";
import { runBacktest } from "@/backtest/engine";
import { fetchCandlestickHistory } from "@/backtest/fetchHistory";
import { authenticateRequest, authChallengeResponse } from "@/lib/auth";

const STRATEGIES: Record<string, (opts?: any) => any> = {
  "ema-rsi-bollinger": createEmaRsiBollingerStrategy,
  "macd-sma-atr": createMacdSmaAtrStrategy,
  "trend-following": createTrendFollowingStrategy,
  "supply-demand": createSupplyDemandStrategy,
  "macd-200ema-sr": createMacd200EmaSrStrategy,
  "smc": createSmartMoneyConceptsStrategy,
  "smart-money-concepts": createSmartMoneyConceptsStrategy,
  "vwap": createVwapStrategy,
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

      const candles = await fetchCandlestickHistory(sym, runInterval, limitNum);
      if (!candles || candles.length === 0) {
        continue;
      }

      const ohlc = parseCandlesticks(candles);
      const strategyInstance = strategyKey === "supply-demand"
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

    return NextResponse.json({ results });
  } catch (e: any) {
    console.error("Backtest API execution failed:", e);
    return NextResponse.json({ error: "Backtest simulation failed: " + e.message }, { status: 500 });
  }
}
