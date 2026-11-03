import { OHLC } from "@/indicators/utils";
import { Decision, SignalSource } from "./types";

export interface LookAheadMismatch {
  t: number;
  withFullHistory: string;
  withHistoryUpToT: string;
}

export interface LookAheadReport {
  clean: boolean;
  checkedBars: number;
  mismatches: LookAheadMismatch[];
}

// A signal source must decide bar t from bars 0..t only. This replays the
// source on history truncated at t and compares its decision with the one it
// makes when it can see the whole series. Any difference means the source
// used the future. Cost is one prepare() per checked bar.
export function detectLookAhead(
  source: SignalSource,
  candles: readonly OHLC[],
  { from = 0, every = 25 }: { from?: number; every?: number } = {},
): LookAheadReport {
  const full = source.prepare(candles);
  const mismatches: LookAheadMismatch[] = [];
  let checkedBars = 0;

  // Every bar where the full-history run acts is checked (a peeking source
  // usually *invents* signals), plus every `every`-th bar for suppressed ones.
  for (let t = from; t < candles.length - 1; t++) {
    const reference = candles[t + 1].open;
    const a = describe(full.decide(t, null), reference);
    if (a === "none" && (t - from) % every !== 0) continue;
    checkedBars++;
    const b = describe(source.prepare(candles.slice(0, t + 1)).decide(t, null), reference);
    if (a !== b) mismatches.push({ t, withFullHistory: a, withHistoryUpToT: b });
  }

  return { clean: mismatches.length === 0, checkedBars, mismatches };
}

function describe(decision: Decision, fill: number): string {
  if (!decision.enter) return decision.exit ? "exit" : "none";
  return JSON.stringify({ side: decision.enter.side, levels: decision.enter.levels(fill) });
}
