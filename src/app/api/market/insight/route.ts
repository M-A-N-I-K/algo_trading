import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authChallengeResponse } from "@/lib/auth";
import { fetchCandlestickHistory } from "@/backtest/fetchHistory";
import { parseCandlesticks } from "@/indicators/utils";
import { ema } from "@/indicators/ema";
import { rsi } from "@/indicators/rsi";
import { atr } from "@/indicators/atr";
import { sma } from "@/indicators/sma";

// Fixed watchlist of liquid USDT pairs — good enough for a "market mood"
// read without needing a symbol-picker UI yet.
const WATCHLIST = ["BTCUSDT", "ETHUSDT", "XRPUSDT", "SOLUSDT", "BNBUSDT", "ADAUSDT", "DOGEUSDT"];
const INTERVAL = "1h";
const CANDLE_COUNT = 100;

// Heuristic cutoffs for typical crypto 1h ATR-as-%-of-price — not derived
// from any percentile ranking, just reasonable buckets for a quick read.
const HIGH_VOLATILITY_ATR_PCT = 1.2;
const LOW_VOLATILITY_ATR_PCT = 0.5;

interface SymbolReading {
  symbol: string;
  price: number;
  ema20: number;
  ema50: number;
  rsi: number;
  atrPercent: number;
  relativeVolume: number;
  trend: "BULLISH" | "BEARISH" | "NEUTRAL";
}

async function readSymbol(symbol: string): Promise<SymbolReading | null> {
  const raw = await fetchCandlestickHistory(symbol, INTERVAL, CANDLE_COUNT);
  if (!raw || raw.length < 55) return null;

  // Binance's klines endpoint returns the still-forming current candle last
  // when no endTime is given — its volume (and technically its OHLC) are
  // incomplete, which would make "relative volume" look artificially low
  // every single time. Drop it so every reading is based on closed candles.
  const candles = parseCandlesticks(raw).slice(0, -1);
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);

  const ema20Line = ema(closes, 20);
  const ema50Line = ema(closes, 50);
  const rsiLine = rsi(closes, 14);
  const atrLine = atr(candles, 14);
  const volumeSmaLine = sma(volumes, 20);

  const last = candles.length - 1;
  const price = closes[last];
  const ema20Last = ema20Line[last];
  const ema50Last = ema50Line[last];
  const rsiLast = rsiLine[last];
  const atrLast = atrLine[last];
  const volumeSmaLast = volumeSmaLine[last];

  if ([ema20Last, ema50Last, rsiLast, atrLast, volumeSmaLast].some((v) => isNaN(v))) return null;

  const atrPercent = (atrLast / price) * 100;
  const relativeVolume = volumeSmaLast > 0 ? volumes[last] / volumeSmaLast : 1;

  let trend: SymbolReading["trend"] = "NEUTRAL";
  if (price > ema20Last && ema20Last > ema50Last && rsiLast > 55) trend = "BULLISH";
  else if (price < ema20Last && ema20Last < ema50Last && rsiLast < 45) trend = "BEARISH";

  return { symbol, price, ema20: ema20Last, ema50: ema50Last, rsi: rsiLast, atrPercent, relativeVolume, trend };
}

export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();

  try {
    const readings = (await Promise.all(WATCHLIST.map(readSymbol))).filter((r): r is SymbolReading => r !== null);

    if (readings.length === 0) {
      return NextResponse.json({ error: "No market data available right now." }, { status: 502 });
    }

    const bullishCount = readings.filter((r) => r.trend === "BULLISH").length;
    const bearishCount = readings.filter((r) => r.trend === "BEARISH").length;
    const avgAtrPercent = readings.reduce((s, r) => s + r.atrPercent, 0) / readings.length;

    let mood: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
    if (bearishCount > bullishCount && bearishCount * 2 >= readings.length) mood = "BEARISH";
    else if (bullishCount > bearishCount && bullishCount * 2 >= readings.length) mood = "BULLISH";

    const moodLabel = mood === "BEARISH" ? "Defensive" : mood === "BULLISH" ? "Constructive" : "Balanced";

    const volatilityLabel =
      avgAtrPercent >= HIGH_VOLATILITY_ATR_PCT ? "High" : avgAtrPercent <= LOW_VOLATILITY_ATR_PCT ? "Low" : "Moderate";

    const bullets: string[] = [];

    if (mood === "BEARISH") {
      bullets.push(`${bearishCount} of ${readings.length} liquid pairs show a 1h bearish trend`);
    } else if (mood === "BULLISH") {
      bullets.push(`${bullishCount} of ${readings.length} liquid pairs show a 1h bullish trend`);
    } else {
      bullets.push(`Trend is mixed: ${bullishCount} bullish, ${bearishCount} bearish, ${readings.length - bullishCount - bearishCount} neutral`);
    }

    bullets.push(`Average 1h trading range is ${avgAtrPercent.toFixed(1)}% (${volatilityLabel.toLowerCase()} volatility)`);

    const lowVolume = readings.filter((r) => r.relativeVolume < 0.7);
    if (lowVolume.length > 0) {
      bullets.push(`${lowVolume.map((r) => r.symbol).join(", ")} trading below average 1h volume`);
    }

    // Call out the single most extreme reading matching the overall mood.
    if (mood === "BEARISH") {
      const weakest = readings.filter((r) => r.trend === "BEARISH").reduce((a, b) => (a.rsi < b.rsi ? a : b));
      bullets.push(`${weakest.symbol} is below its 20/50 EMA structure (RSI ${weakest.rsi.toFixed(0)})`);
    } else if (mood === "BULLISH") {
      const strongest = readings.filter((r) => r.trend === "BULLISH").reduce((a, b) => (a.rsi > b.rsi ? a : b));
      bullets.push(`${strongest.symbol} is above its 20/50 EMA structure (RSI ${strongest.rsi.toFixed(0)})`);
    }

    return NextResponse.json({
      mood,
      moodLabel,
      volatilityLabel,
      avgAtrPercent,
      bullets,
      symbolCount: readings.length,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Failed to compute market insight:", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Failed to compute market insight: " + message }, { status: 500 });
  }
}
