import { atr } from "../indicators/atr";
import { sma } from "../indicators/sma";
import { OHLC } from "../indicators/utils";
import { Signal, Strategy, TradeTarget } from "../types";

export interface XrpScalpingOptions {
  // Rolling lookback (candles before the current one) used to define the
  // active micro-range's high/low.
  rangeLookback?: number;
  atrPeriod?: number;
  // Stop distance, as a multiple of ATR.
  atrStopMultiple?: number;
  // Take profit = risk * this ratio.
  rewardRiskRatio?: number;
  // A breakout must clear the range boundary by at least this fraction of
  // ATR to count as confirmed (filters noise pokes through the range edge).
  breakoutAtrBuffer?: number;
  // Require ATR above its own SMA (volatility expanding) before trading —
  // this is the "struggles in low-liquidity/choppy sessions" guard.
  atrSmaPeriod?: number;
  // Require current volume above its SMA — the "healthy volume" guard.
  volumeSmaPeriod?: number;
  // Once price moves this many multiples of initial risk in the trade's
  // favor, the stop trails behind price by `trailAtrMultiple` * ATR.
  useTrailingStop?: boolean;
  trailTriggerR?: number;
  trailAtrMultiple?: number;
}

// High-frequency intraday scalp: trades a short rolling price range two
// ways — mean-reversion (rejection wicks at the range extreme snapping
// back inside it) and confirmed breakouts (a close clearing the range edge
// by more than a small ATR buffer). Both signal types share the same
// ATR-based stop and fixed R:R target. A volatility (ATR vs. its own SMA)
// and volume (vs. its own SMA) filter keep it out of the low-liquidity,
// directionless chop it's explicitly not suited for.
//
// One caveat inherent to this candle-by-candle backtest engine (true of
// every strategy here, not specific to this one): "every tick" execution
// isn't simulated — signals are evaluated once per candle at the
// configured interval, not at intra-candle tick resolution.
//
// Fixed % risk per trade and account-equity-based position sizing are
// handled centrally by the backtest engine's `maxRiskPercent` option
// (src/backtest/engine.ts) from the stop distance this strategy sets, not
// by the strategy itself.
export function createXrpScalpingStrategy(options: XrpScalpingOptions = {}): Strategy {
  const {
    rangeLookback = 20,
    atrPeriod = 14,
    atrStopMultiple = 1.5,
    rewardRiskRatio = 1.5,
    breakoutAtrBuffer = 0.1,
    atrSmaPeriod = 20,
    volumeSmaPeriod = 20,
    useTrailingStop = true,
    trailTriggerR = 1,
    trailAtrMultiple = 1,
  } = options;

  let computedTargets: (TradeTarget | null)[] = [];

  return {
    name: "XRP Scalping",

    generateSignals(candles: OHLC[]): Signal[] {
      const n = candles.length;
      const signals: Signal[] = new Array(n).fill("HOLD");
      computedTargets = new Array(n).fill(null);

      const warmup = Math.max(rangeLookback, atrPeriod + atrSmaPeriod, volumeSmaPeriod) + 2;
      if (n < warmup) return signals;

      const atrValues = atr(candles, atrPeriod);
      const atrSmaValues = sma(atrValues, atrSmaPeriod);
      const volumeSmaValues = sma(candles.map((c) => c.volume), volumeSmaPeriod);

      for (let t = rangeLookback; t < n; t++) {
        const atrVal = atrValues[t];
        if (isNaN(atrVal) || isNaN(atrSmaValues[t]) || isNaN(volumeSmaValues[t]) || atrVal <= 0) continue;

        // Volatility expanding and volume above average — skip the
        // low-liquidity, choppy sessions this strategy isn't suited for.
        if (atrVal <= atrSmaValues[t]) continue;
        if (candles[t].volume <= volumeSmaValues[t]) continue;

        let rangeHigh = -Infinity;
        let rangeLow = Infinity;
        for (let i = t - rangeLookback; i < t; i++) {
          rangeHigh = Math.max(rangeHigh, candles[i].high);
          rangeLow = Math.min(rangeLow, candles[i].low);
        }

        const candle = candles[t];
        const breakoutBuffer = atrVal * breakoutAtrBuffer;

        const bullishBreakout = candle.close > rangeHigh + breakoutBuffer;
        const bearishBreakout = candle.close < rangeLow - breakoutBuffer;

        const bullishRejection =
          !bullishBreakout && candle.low <= rangeLow && candle.close > rangeLow && candle.close > candle.open;
        const bearishRejection =
          !bearishBreakout && candle.high >= rangeHigh && candle.close < rangeHigh && candle.close < candle.open;

        const isLong = bullishBreakout || bullishRejection;
        const isShort = bearishBreakout || bearishRejection;
        if (!isLong && !isShort) continue;

        const entry = candle.close;
        const stopDist = atrVal * atrStopMultiple;
        const stopLoss = isLong ? entry - stopDist : entry + stopDist;
        const takeProfit = isLong ? entry + stopDist * rewardRiskRatio : entry - stopDist * rewardRiskRatio;

        signals[t] = isLong ? "BUY" : "SELL";
        computedTargets[t] = {
          stopLoss,
          takeProfit,
          ...(useTrailingStop && {
            trailTriggerR,
            trailDistance: atrVal * trailAtrMultiple,
          }),
        };
      }

      return signals;
    },

    getTradeTargets(): (TradeTarget | null)[] {
      return computedTargets;
    },
  };
}
