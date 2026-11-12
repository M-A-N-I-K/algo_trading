import { OHLC } from "@/indicators/utils";
import { computeMetrics } from "./metrics";
import {
  BacktestPositionSizing,
  BacktestResult,
  Decision,
  EquityPoint,
  ExecutionSettings,
  ExitType,
  Guardrails,
  Leg,
  PositionView,
  RoundTrip,
  PartialExit,
  Side,
  SignalSource,
  TradeLevels,
  TrailingStop,
} from "./types";

interface OpenPosition {
  side: Side;
  entryIndex: number;
  entryTime: number;
  entryPrice: number;
  entryFee: number;
  slippage: number;
  quantity: number; // original
  remaining: number;
  stop?: number;
  target?: number;
  initialStop?: number;
  partials: (PartialExit & { filled: boolean })[];
  trailing?: TrailingStop;
  trailingActive: boolean;
  exitAt?: number;
  legs: Leg[];
  worstPrice: number;
  bestPrice: number;
}

// Bar-by-bar simulation of one signal source over one candle series.
//
// Timing (per bar t):
//   1. at the open: exits and entries decided at bar t-1's close fill here
//      (a time exit too). A stop-order entry (EntryIntent.trigger) fills
//      during this bar instead, if its price trades, and the position then
//      goes through this bar's intrabar checks like any other.
//   2. intrabar: stop, then partial exits in order, then target. If one bar
//      touches several levels, the stop wins. A gap through a level fills at
//      the open instead of the level. The trailing stop then ratchets on this
//      bar's extreme, ready for the next bar.
//   3. at the close: equity is marked to market, then the source decides.
// A position still open after the last bar closes at its close ("end-of-data").
export function simulate(candles: readonly OHLC[], source: SignalSource, execution: ExecutionSettings = {}): BacktestResult {
  const initialCapital = execution.initialCapital ?? 10_000;
  const feeRate = execution.feeRate ?? 0.0004;
  const slippage = execution.slippagePercent ?? 0;
  const sizing = execution.sizing ?? source.sizing ?? { type: "EQUITY_PERCENT" as const, percent: 100 };
  const maxLeverage = execution.maxLeverage ?? 1;
  const guardrails = { ...source.guardrails, ...execution.guardrails };
  const reverse = execution.reverseOnOppositeSignal ?? source.reverseOnOppositeSignal ?? false;
  const warmup = Math.min(Math.max(0, Math.floor(execution.warmupBars ?? 0)), candles.length);

  const prepared = source.prepare(candles);

  let cash = initialCapital;
  let position: OpenPosition | null = null;
  let pending: Decision = {};
  // Daily loss guardrail: realized net P&L per UTC day vs equity at the day's start.
  let day = -1;
  let dayStartEquity = initialCapital;
  let dayRealized = 0;
  const roundTrips: RoundTrip[] = [];
  const equityCurve: EquityPoint[] = [];

  const fee = (price: number, qty: number) => price * qty * feeRate;
  const dir = (side: Side) => (side === "LONG" ? 1 : -1);
  // Slippage always moves the fill against the trader.
  const slipEntry = (price: number, side: Side) => price * (1 + dir(side) * slippage);
  const slipExit = (price: number, side: Side) => price * (1 - dir(side) * slippage);

  const closeLeg = (t: number, level: number, qty: number, exitType: ExitType | "partial") => {
    const p = position!;
    const price = slipExit(level, p.side);
    p.slippage += Math.abs(price - level) * qty;
    const legFee = fee(price, qty);
    const grossPnl = dir(p.side) * (price - p.entryPrice) * qty;
    cash += grossPnl - legFee;
    dayRealized += grossPnl - legFee - (p.legs.length === 0 ? p.entryFee : 0);
    p.legs.push({ barIndex: t, time: candles[t].openTime, price, quantity: qty, exitType, grossPnl, fee: legFee });
    p.remaining -= qty;
    if (p.remaining <= p.quantity * 1e-9) {
      roundTrips.push(toRoundTrip(p, exitType === "partial" ? "target" : exitType));
      position = null;
    }
  };

  const open = (t: number, side: Side, fillPrice: number, levels: TradeLevels, nominal: number) => {
    const isLong = side === "LONG";
    // A fill already past its stop (or target) means the setup no longer exists.
    if (levels.stop !== undefined && (isLong ? fillPrice <= levels.stop : fillPrice >= levels.stop)) return;
    if (levels.target !== undefined && (isLong ? fillPrice >= levels.target : fillPrice <= levels.target)) return;
    if (execution.minRiskReward !== undefined && levels.stop !== undefined && levels.target !== undefined) {
      const rr = Math.abs(levels.target - fillPrice) / Math.abs(fillPrice - levels.stop);
      // Relative epsilon: a target built as entry + risk × 1.5 can land a hair under 1.5.
      if (rr < execution.minRiskReward * (1 - 1e-9)) return;
    }
    const quantity = positionSize({ sizing, equity: cash, fillPrice, stop: levels.stop, maxLeverage, guardrails, lotSize: execution.lotSize });
    if (!(quantity > 0)) return;
    const entryFee = fee(fillPrice, quantity);
    cash -= entryFee;
    position = {
      side,
      entryIndex: t,
      entryTime: candles[t].openTime,
      entryPrice: fillPrice,
      entryFee,
      slippage: Math.abs(fillPrice - nominal) * quantity,
      quantity,
      remaining: quantity,
      stop: levels.stop,
      target: levels.target,
      initialStop: levels.stop,
      partials: (levels.partials ?? []).map((l) => ({ ...l, filled: false })),
      trailing: levels.trailing,
      trailingActive: false,
      exitAt: levels.exitAt,
      legs: [],
      worstPrice: fillPrice,
      bestPrice: fillPrice,
    };
  };

  for (let t = 0; t < candles.length; t++) {
    const bar = candles[t];
    const barDay = Math.floor(bar.openTime / DAY_MS);
    if (barDay !== day) {
      day = barDay;
      dayStartEquity = markToMarket(cash, position, bar.open);
      dayRealized = 0;
    }
    const dailyLossHit =
      guardrails.maxDailyLossPercent !== undefined && dayRealized <= -(dayStartEquity * guardrails.maxDailyLossPercent) / 100;

    // 1. At the open.
    if (position && (prepared.exitAtOpen?.(t, view(position)) || (position.exitAt !== undefined && bar.openTime >= position.exitAt))) {
      closeLeg(t, bar.open, position.remaining, "time");
    } else if (position && pending.exit) closeLeg(t, bar.open, position.remaining, "signal");
    if (!position && pending.enter && !dailyLossHit) {
      const { side, trigger } = pending.enter;
      const nominal = trigger ? triggerFill(bar, side, trigger) : bar.open;
      if (nominal !== null) {
        const fillPrice = slipEntry(nominal, side);
        const levels = pending.enter.levels(fillPrice);
        if (levels) open(t, side, fillPrice, levels, nominal);
      }
    }
    pending = {};

    // 2. Intrabar.
    if (position) {
      const p: OpenPosition = position;
      const isLong = p.side === "LONG";
      p.worstPrice = isLong ? Math.min(p.worstPrice, bar.low) : Math.max(p.worstPrice, bar.high);
      p.bestPrice = isLong ? Math.max(p.bestPrice, bar.high) : Math.min(p.bestPrice, bar.low);

      const touchedAdverse = (level: number) => (isLong ? bar.low <= level : bar.high >= level);
      const touchedFavourable = (level: number) => (isLong ? bar.high >= level : bar.low <= level);
      const adverseFill = (level: number) => (isLong ? Math.min(bar.open, level) : Math.max(bar.open, level));
      const favourableFill = (level: number) => (isLong ? Math.max(bar.open, level) : Math.min(bar.open, level));

      if (p.stop !== undefined && touchedAdverse(p.stop)) {
        closeLeg(t, adverseFill(p.stop), p.remaining, p.trailingActive ? "trailing-stop" : "stop");
      }
      for (const level of p.partials) {
        if (!position || level.filled || !touchedFavourable(level.price)) continue;
        level.filled = true;
        closeLeg(t, favourableFill(level.price), Math.min(p.quantity * level.portion, p.remaining), "partial");
      }
      if (position && p.target !== undefined && touchedFavourable(p.target)) {
        closeLeg(t, favourableFill(p.target), p.remaining, "target");
      }

      // Trailing stop: only ever tightens.
      if (position && p.trailing && p.initialStop !== undefined) {
        const risk = Math.abs(p.entryPrice - p.initialStop);
        const favourableMove = isLong ? bar.high - p.entryPrice : p.entryPrice - bar.low;
        if (p.trailingActive || (risk > 0 && favourableMove >= p.trailing.triggerR * risk)) {
          p.trailingActive = true;
          const d = isLong ? 1 : -1;
          const candidate = p.trailing.step
            ? p.entryPrice + d * (Math.floor(((p.bestPrice - p.entryPrice) * d) / risk) - 1) * risk
            : isLong ? bar.high - p.trailing.distance : bar.low + p.trailing.distance;
          p.stop = isLong ? Math.max(p.stop ?? -Infinity, candidate) : Math.min(p.stop ?? Infinity, candidate);
        }
      }
    }

    // 3. At the close.
    if (t >= warmup) equityCurve.push({ time: bar.closeTime, equity: markToMarket(cash, position, bar.close) });
    if (t < candles.length - 1 && t >= warmup - 1) {
      const decision = prepared.decide(t, position ? view(position) : null);
      if (!position) pending = { enter: decision.enter };
      else if (decision.enter && decision.enter.side !== position.side && reverse) pending = { exit: true, enter: decision.enter };
      else pending = { exit: decision.exit };
    }
  }

  if (position && candles.length > 0) {
    const last = candles.length - 1;
    closeLeg(last, candles[last].close, (position as OpenPosition).remaining, "end-of-data");
    equityCurve[equityCurve.length - 1] = { time: candles[last].closeTime, equity: cash };
  }

  return {
    strategyName: source.name,
    roundTrips,
    equityCurve,
    metrics: computeMetrics({ candles: candles.slice(warmup), roundTrips, equityCurve, initialCapital, exposedBars: countExposedBars(roundTrips) }),
  };
}

const DAY_MS = 86_400_000;

// Where a stop-order entry fills on this bar, or null if it doesn't.
function triggerFill(bar: OHLC, side: Side, trigger: { price: number; cancelPrice?: number }): number | null {
  const isLong = side === "LONG";
  const hit = isLong ? bar.high >= trigger.price : bar.low <= trigger.price;
  // Cancelled only if the bar opens at or past the cancel price. A bar that
  // reaches both prices later counts as a fill: a live stop order fills when
  // the trigger trades first, and assuming the cancel always came first
  // skipped exactly the fills that reverse (checked against MT5's tester).
  const cancelled = trigger.cancelPrice !== undefined && (isLong ? bar.open <= trigger.cancelPrice : bar.open >= trigger.cancelPrice);
  if (!hit || cancelled) return null;
  return isLong ? Math.max(bar.open, trigger.price) : Math.min(bar.open, trigger.price);
}

// Quantity for a new position: the sizing rule, then every cap, then lot rounding.
// Returns 0 when the entry can't be sized (e.g. risk sizing without a stop).
function positionSize(input: {
  sizing: BacktestPositionSizing;
  equity: number;
  fillPrice: number;
  stop?: number;
  maxLeverage: number;
  guardrails: Guardrails;
  lotSize?: number;
}): number {
  const { sizing, equity, fillPrice, stop, maxLeverage, guardrails, lotSize } = input;
  const riskPerUnit = stop !== undefined ? Math.abs(fillPrice - stop) : NaN;

  let qty: number;
  switch (sizing.type) {
    case "EQUITY_PERCENT":
      qty = (equity * sizing.percent) / 100 / fillPrice;
      break;
    case "FIXED_QUANTITY":
      qty = sizing.quantity;
      break;
    case "FIXED_CAPITAL":
      qty = sizing.capital / fillPrice;
      break;
    case "RISK_PERCENT":
      qty = (equity * sizing.percent) / 100 / riskPerUnit;
      break;
    case "RISK_AMOUNT":
      qty = sizing.amount / riskPerUnit;
      break;
  }

  qty = Math.min(qty, (equity * maxLeverage) / fillPrice);
  if (guardrails.maxPositionSizeCapital !== undefined) qty = Math.min(qty, guardrails.maxPositionSizeCapital / fillPrice);
  if (guardrails.maxRiskPerTradePercent !== undefined && riskPerUnit > 0) {
    qty = Math.min(qty, (equity * guardrails.maxRiskPerTradePercent) / 100 / riskPerUnit);
  }
  if (lotSize !== undefined && lotSize > 0) qty = Math.floor(qty / lotSize + 1e-9) * lotSize;
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

function view(p: OpenPosition): PositionView {
  return { side: p.side, entryIndex: p.entryIndex, entryTime: p.entryTime, entryPrice: p.entryPrice };
}

function markToMarket(cash: number, p: OpenPosition | null, price: number): number {
  if (!p) return cash;
  return cash + (p.side === "LONG" ? 1 : -1) * (price - p.entryPrice) * p.remaining;
}

function countExposedBars(roundTrips: RoundTrip[]): number {
  return roundTrips.reduce((n, rt) => n + (rt.exitIndex - rt.entryIndex + 1), 0);
}

function toRoundTrip(p: OpenPosition, exitType: ExitType): RoundTrip {
  const last = p.legs[p.legs.length - 1];
  const grossPnl = p.legs.reduce((s, l) => s + l.grossPnl, 0);
  const fees = p.entryFee + p.legs.reduce((s, l) => s + l.fee, 0);
  const netPnl = grossPnl - fees;
  const initialRisk = p.initialStop !== undefined ? Math.abs(p.entryPrice - p.initialStop) * p.quantity : null;
  const sign = p.side === "LONG" ? 1 : -1;
  return {
    side: p.side,
    entryIndex: p.entryIndex,
    entryTime: p.entryTime,
    entryPrice: p.entryPrice,
    entryFee: p.entryFee,
    quantity: p.quantity,
    exitIndex: last.barIndex,
    exitTime: last.time,
    exitPrice: p.legs.reduce((s, l) => s + l.price * l.quantity, 0) / p.quantity,
    exitType,
    legs: p.legs,
    grossPnl,
    fees,
    slippage: p.slippage,
    funding: 0,
    netPnl,
    initialStop: p.initialStop ?? null,
    initialRisk,
    rMultiple: initialRisk && initialRisk > 0 ? netPnl / initialRisk : null,
    mae: Math.max(0, -sign * (p.worstPrice - p.entryPrice)) * p.quantity,
    mfe: Math.max(0, sign * (p.bestPrice - p.entryPrice)) * p.quantity,
  };
}
