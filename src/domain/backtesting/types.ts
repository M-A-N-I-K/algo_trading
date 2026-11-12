import { OHLC } from "@/indicators/utils";
import { Summary } from "@/lib/journal/metrics";
import { PositionSizingConfig } from "@/domain/strategies/positionSizing";

// Vocabulary follows GLOSSARY.md ("Backtesting" section): a backtest yields
// round trips with legs, exactly like exchange sync, so every journal stat
// means the same thing for a backtest as for live trading.

export type Side = "LONG" | "SHORT";

export type ExitType = "stop" | "trailing-stop" | "target" | "signal" | "time" | "end-of-data";

// --- Signal source: the seam ------------------------------------------------

export interface PartialExit {
  price: number;
  // Fraction (0-1] of the ORIGINAL quantity closed at this price.
  portion: number;
}

export interface TrailingStop {
  // Start trailing once price has moved this many multiples of initial risk in favour.
  triggerR: number;
  // Distance (price units) the stop trails behind the best price of each bar.
  distance: number;
}

// Absolute price levels for one position, known once the entry fill price is.
export interface TradeLevels {
  stop?: number;
  target?: number;
  partials?: PartialExit[];
  trailing?: TrailingStop;
  // Close at the open of the first bar that starts at or after this time (ms).
  exitAt?: number;
}

// A stop order for the next bar only, instead of a fill at its open: a buy
// fills when the bar's high reaches `price` (at the open if it gaps past it),
// a sell when its low does. If the bar opens at or past `cancelPrice` (the
// other side of a bracket) the order is gone. A bar that reaches both prices
// later fills: which traded first is unknown, and counting the fill is the
// cautious reading (most such fills reverse; MT5's tester confirms).
export interface EntryTrigger {
  price: number;
  cancelPrice?: number;
}

export interface EntryIntent {
  side: Side;
  // Called with the actual entry fill (next bar's open, or the trigger,
  // after slippage). Return null to abandon the entry.
  levels(fillPrice: number): TradeLevels | null;
  // Set for a stop order: fill only if the next bar trades through it.
  trigger?: EntryTrigger;
}

export interface PositionView {
  side: Side;
  entryIndex: number;
  entryTime: number;
  entryPrice: number;
}

export interface Decision {
  // Open a position at the next bar's open. Ignored while a position is open,
  // unless it is opposite-side and reverseOnOppositeSignal is on.
  enter?: EntryIntent;
  // Close the open position at the next bar's open.
  exit?: boolean;
}

export interface PreparedSignalSource {
  // Called once bar `t` has closed. Must only depend on bars 0..t
  // (detectLookAhead checks this).
  decide(t: number, position: PositionView | null): Decision;
  // Checked at the open of bar `t`, for exits that happen at a clock time.
  exitAtOpen?(t: number, position: PositionView): boolean;
}

export interface Guardrails {
  maxRiskPerTradePercent?: number;
  maxPositionSizeCapital?: number;
  maxDailyLossPercent?: number;
}

export type BacktestPositionSizing = PositionSizingConfig | { type: "EQUITY_PERCENT"; percent: number };

export interface SignalSource {
  name: string;
  // Defaults the source brings with it; execution settings override them.
  sizing?: BacktestPositionSizing;
  guardrails?: Guardrails;
  reverseOnOppositeSignal?: boolean;
  prepare(candles: readonly OHLC[]): PreparedSignalSource;
}

// --- Execution settings -------------------------------------------------------

export interface ExecutionSettings {
  initialCapital?: number; // default 10 000
  feeRate?: number; // per side, on each leg's notional. default 0.0004
  slippagePercent?: number; // fraction of price, always adverse. default 0
  maxLeverage?: number; // notional cap = equity × maxLeverage. default 1
  sizing?: BacktestPositionSizing; // overrides the source's; final default EQUITY_PERCENT 100
  lotSize?: number;
  minRiskReward?: number; // skip entries whose target/stop R:R is below this
  reverseOnOppositeSignal?: boolean; // overrides the source's
  guardrails?: Guardrails; // merged over the source's
  // Leading bars that only feed indicators: no entries are decided before the
  // last of them, and the equity curve and metrics start after them.
  warmupBars?: number;
}

// --- Backtest result ------------------------------------------------------------

export interface Leg {
  barIndex: number;
  time: number;
  price: number; // fill, after slippage
  quantity: number;
  exitType: ExitType | "partial";
  grossPnl: number;
  fee: number;
}

export interface RoundTrip {
  side: Side;
  entryIndex: number;
  entryTime: number;
  entryPrice: number;
  entryFee: number;
  quantity: number; // original size
  exitIndex: number;
  exitTime: number;
  exitPrice: number; // quantity-weighted average of the legs
  exitType: ExitType; // how the final leg closed
  legs: Leg[];
  grossPnl: number;
  fees: number; // entry fee + every leg's fee
  slippage: number; // what slippage cost, across the entry and every leg (≥ 0)
  funding: number; // always 0 in a backtest
  netPnl: number; // gross − fees + funding
  initialStop: number | null;
  initialRisk: number | null; // |entry − stop| × quantity
  rMultiple: number | null;
  mae: number; // worst adverse move × quantity (≥ 0)
  mfe: number; // best favourable move × quantity (≥ 0)
}

export interface EquityPoint {
  time: number;
  equity: number; // marked to market at the bar's close
}

export interface BacktestMetrics extends Summary {
  initialCapital: number;
  finalEquity: number;
  netPnl: number;
  totalFees: number;
  totalReturnPercent: number;
  maxDrawdownPercent: number; // from the mark-to-market equity curve, ≥ 0
  exposurePercent: number; // share of bars with a position open
  testPeriodDays: number;
  endOfDataExits: number;
}

export interface BacktestResult {
  strategyName: string;
  roundTrips: RoundTrip[];
  equityCurve: EquityPoint[];
  metrics: BacktestMetrics;
}

export class BacktestConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BacktestConfigError";
  }
}
