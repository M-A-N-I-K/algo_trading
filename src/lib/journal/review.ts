import { chronological, holdMinutesOf, isWin, rMultipleOf, summarize, grossOf, type JournalTrade } from "./metrics";

// A blunt review of the trader's own closed trades: what is costing money,
// with the numbers behind each claim and one concrete fix. Pure and
// deterministic, so every sentence can be traced back to the trades.
//
// Every check needs a minimum sample before it says anything, and states
// its numbers, so a finding is never just an opinion.

export interface ReviewTrade extends JournalTrade {
  notes?: string | null;
  tags?: string[] | null;
  checklist?: unknown;
  stopLoss?: number | null;
}

export interface ReviewInput {
  trades: ReviewTrade[];
  startingBalance: number;
  currentBalance?: number | null;
  dailyLossLimit?: number | null;
  weeklyLossLimit?: number | null;
  now?: number;
  // Local calendar day and hour of a timestamp. Default: the runtime's zone.
  dayOf?: (ms: number) => string;
  hourOf?: (ms: number) => number;
}

export type Severity = "critical" | "warning" | "good";

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  evidence: string;
  fix: string;
  // A short rule for the trader's plan, when the finding implies one.
  rule?: string;
  // Money this behaviour cost (positive), used to rank findings.
  cost: number;
}

export interface Review {
  count: number;
  verdict: { profitable: boolean; headline: string; detail: string };
  numbers: {
    net: number;
    gross: number;
    fees: number;
    funding: number;
    winRate: number | null;
    avgWinR: number | null;
    avgLossR: number | null;
    breakevenWinRate: number | null;
    expectancy: number | null;
    expectancyR: number | null;
    accountChangePct: number;
  };
  findings: Finding[];
  rules: string[];
}

export const MIN_TRADES_FOR_REVIEW = 20;
export const MAX_RULES = 7;

const ms = (d: string | Date) => (d instanceof Date ? d.getTime() : new Date(d).getTime());
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : null);
const usd = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;
const pct = (n: number, d = 0) => `${n.toFixed(d)}%`;
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const net = (ts: ReviewTrade[]) => sum(ts.map((t) => t.pnl));
const pf = (ts: ReviewTrade[]) => {
  const won = sum(ts.filter(isWin).map((t) => t.pnl));
  const lost = -sum(ts.filter((t) => !isWin(t)).map((t) => t.pnl));
  return lost > 0 ? won / lost : won > 0 ? Infinity : 0;
};
const fmtPf = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "∞");
const openMs = (t: ReviewTrade) => ms(t.openedAt ?? t.time);

function defaultDayOf(t: number) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function reviewTrades(input: ReviewInput): Review {
  const trades = chronological(input.trades);
  const dayOf = input.dayOf ?? defaultDayOf;
  const hourOf = input.hourOf ?? ((t: number) => new Date(t).getHours());
  const now = input.now ?? Date.now();
  const s = summarize(trades);
  const findings: Finding[] = [];
  const add = (f: Finding) => findings.push(f);

  const gross = sum(trades.map(grossOf));
  const fees = sum(trades.map((t) => t.fees ?? 0));
  const funding = sum(trades.map((t) => t.funding ?? 0));
  const total = net(trades);
  const losses = Math.max(0, -total);

  const rs = trades.map(rMultipleOf).filter((r): r is number => r != null);
  const winRs = rs.filter((r) => r > 0);
  const lossRs = rs.filter((r) => r <= 0).map((r) => -r);
  const avgWinR = avg(winRs);
  const avgLossR = avg(lossRs);
  const rWinRate = rs.length ? winRs.length / rs.length : null;
  const breakevenWinRate = avgWinR != null && avgLossR != null && avgWinR + avgLossR > 0 ? avgLossR / (avgWinR + avgLossR) : null;

  // ---- 1. Fees ---------------------------------------------------------------
  if (fees > 0 && trades.length >= 10 && (gross <= 0 || fees / gross >= 0.4)) {
    const be = s.breakevenMovePct;
    add({
      id: "fees",
      severity: gross <= fees ? "critical" : "warning",
      title: gross <= 0 ? "Fees turned a small loss into a big one" : "Fees are eating most of your edge",
      evidence:
        gross <= 0
          ? `The market itself cost you ${usd(gross)}; fees cost you ${usd(fees)} on top (${trades.length} trades, ${usd(fees / trades.length)} each).${be != null ? ` Every trade has to move ${be.toFixed(3)}% just to pay its fees.` : ""}`
          : `Price made you ${usd(gross)}; fees took ${usd(fees)} of it (${pct((fees / gross) * 100)}).${be != null ? ` Every trade has to move ${be.toFixed(3)}% just to pay its fees.` : ""}`,
      fix: "Take fewer trades and only ones aiming for a move many times the fee. Enter with limit orders where you can (lower maker fee), and skip setups whose target is close to entry.",
      rule: be != null ? `Skip any trade whose target is less than ${(be * 10).toFixed(1)}% away (10× the fee).` : undefined,
      cost: fees,
    });
  }

  // ---- 2. Win rate vs payoff --------------------------------------------------
  if (rs.length >= MIN_TRADES_FOR_REVIEW && breakevenWinRate != null && rWinRate != null && avgWinR != null && avgLossR != null) {
    const short = rWinRate < breakevenWinRate;
    add({
      id: "payoff",
      severity: short ? "critical" : "good",
      title: short ? "Your winners are too small for how often you lose" : "Your win rate covers your losses",
      evidence: `You win ${pct(rWinRate * 100)} of the trades that had a stop. Winners average ${avgWinR.toFixed(2)}R, losers ${avgLossR.toFixed(2)}R, so you need to win ${pct(breakevenWinRate * 100)} just to break even${short ? `. You're ${pct((breakevenWinRate - rWinRate) * 100)} short, every trade.` : "."}`,
      fix: short
        ? `Pick one: let winners run to 2R+ (then ${pct((avgLossR / (2 + avgLossR)) * 100)} wins is enough), or cut the weakest setups so your win rate rises. Don't close winners early and let losers hit the full stop.`
        : "Keep the same discipline on exits; don't start cutting winners short.",
      rule: short ? "Target at least 2R on every trade; don't close winners before 1R without a written reason." : undefined,
      cost: short ? (breakevenWinRate - rWinRate) * rs.length * (avg(trades.map((t) => t.initialRiskAmount ?? 0).filter((x) => x > 0)) ?? 0) : 0,
    });
  }

  // ---- 3. Overtrading ---------------------------------------------------------
  const byDay = new Map<string, ReviewTrade[]>();
  for (const t of trades) {
    const k = dayOf(openMs(t));
    byDay.set(k, [...(byDay.get(k) ?? []), t]);
  }
  const days = [...byDay.values()];
  const heavy = days.filter((d) => d.length >= 4);
  const light = days.filter((d) => d.length <= 2);
  if (heavy.length >= 2 && net(heavy.flat()) < 0 && net(heavy.flat()) < net(light.flat())) {
    // The cap: the most trades a day that has paid. Start at 1 and allow
    // one more only while days with exactly that many trades made money.
    let cap = 1;
    for (const k of [2, 3]) {
      const exact = days.filter((d) => d.length === k);
      if (exact.length && net(exact.flat()) > 0) cap = k;
      else break;
    }
    add({
      id: "overtrading",
      severity: "critical",
      title: "You lose money on busy days",
      evidence: `On ${heavy.length} days with 4+ trades (${heavy.flat().length} trades) you lost ${usd(net(heavy.flat()))}. On ${light.length} days with 1–2 trades you made ${usd(net(light.flat()))}. The most you've taken in a day is ${Math.max(...days.map((d) => d.length))}.`,
      fix: `Set a hard cap of ${cap} trade${cap > 1 ? "s" : ""} a day. After the cap, close the app. The extra trades are where the account goes.`,
      rule: `Maximum ${cap} trade${cap > 1 ? "s" : ""} a day.`,
      cost: -net(heavy.flat()),
    });
  }

  // ---- 4. Recent burst ----------------------------------------------------------
  const weekAgo = now - 7 * 86_400_000;
  const recent = trades.filter((t) => ms(t.time) >= weekAgo);
  // "Usual" pace: the four weeks before this one, or the whole history if
  // those were empty.
  const prior4 = trades.filter((t) => ms(t.time) < weekAgo && ms(t.time) >= weekAgo - 28 * 86_400_000);
  const spanWeeks = trades.length ? Math.max(1, (ms(trades[trades.length - 1].time) - ms(trades[0].time)) / (7 * 86_400_000)) : 1;
  const usualPerWeek = prior4.length ? prior4.length / 4 : (trades.length - recent.length) / Math.max(1, spanWeeks - 1);
  if (recent.length >= 10 && recent.length >= 2 * usualPerWeek && net(recent) < 0) {
    const bal = input.currentBalance ?? input.startingBalance;
    add({
      id: "burst",
      severity: "critical",
      title: "The last week is a blow-up in progress",
      evidence: `${recent.length} trades in the last 7 days (you usually take about ${Math.round(usualPerWeek)} a week) for ${usd(net(recent))}${bal > 0 ? `, ${pct((-net(recent) / (bal - net(recent))) * 100)} of the account` : ""}, with ${usd(sum(recent.map((t) => t.fees ?? 0)))} in fees.`,
      fix: "Stop trading for at least 48 hours. Then come back at half size with the daily cap below. Trading faster to win it back is how small accounts go to zero.",
      rule: "After a losing week, take 2 days off and come back at half size.",
      cost: -net(recent),
    });
  }

  // ---- 5. Loss limits -------------------------------------------------------------
  const dailyLimit = input.dailyLossLimit ?? null;
  if (dailyLimit && dailyLimit > 0) {
    let breachedDays = 0;
    const afterLimit: ReviewTrade[] = [];
    for (const d of days) {
      let running = 0;
      let hit = false;
      for (const t of chronological(d)) {
        if (hit) afterLimit.push(t);
        running += t.pnl;
        if (!hit && running <= -dailyLimit) {
          hit = true;
          breachedDays += 1;
        }
      }
    }
    if (breachedDays > 0) {
      add({
        id: "daily-limit",
        severity: "critical",
        title: "You ignore your own daily loss limit",
        evidence: `You set a ${usd(dailyLimit)} daily limit and went past it on ${breachedDays} day${breachedDays > 1 ? "s" : ""}.${afterLimit.length ? ` You kept trading after hitting it ${afterLimit.length} times, for ${usd(net(afterLimit))}.` : ""}`,
        fix: "When the day's loss reaches the limit, you are done until tomorrow. No exceptions, no 'one more to get it back'.",
        rule: `Stop for the day once you're down ${usd(dailyLimit)}.`,
        cost: Math.max(0, -net(afterLimit)),
      });
    }
  }
  const weeklyLimit = input.weeklyLossLimit ?? null;
  if (weeklyLimit && weeklyLimit > 0 && net(recent) <= -weeklyLimit) {
    add({
      id: "weekly-limit",
      severity: "critical",
      title: "You're past your weekly loss limit",
      evidence: `The last 7 days are at ${usd(net(recent))} against a ${usd(weeklyLimit)} weekly limit.`,
      fix: "You're done for this week. Review the trades instead of taking new ones.",
      cost: 0,
    });
  }

  // ---- 6. Hold time -------------------------------------------------------------------
  const withHold = trades.filter((t) => holdMinutesOf(t) != null);
  const quick = withHold.filter((t) => (holdMinutesOf(t) as number) < 30);
  const patient = withHold.filter((t) => (holdMinutesOf(t) as number) >= 120);
  if (quick.length >= 10 && patient.length >= 10 && net(quick) < 0 && net(patient) > net(quick)) {
    add({
      id: "hold",
      severity: net(patient) > 0 ? "critical" : "warning",
      title: "Your quick trades lose; your patient ones don't",
      evidence: `${quick.length} trades closed within 30 minutes: ${usd(net(quick))}, ${pct((quick.filter(isWin).length / quick.length) * 100)} won (profit factor ${fmtPf(pf(quick))}). ${patient.length} trades held 2 hours or more: ${usd(net(patient))}, ${pct((patient.filter(isWin).length / patient.length) * 100)} won (profit factor ${fmtPf(pf(patient))}).`,
      fix: "Stop scalping. Plan trades on the 1h chart or higher with a stop and target, and let them play out. Under 30 minutes you're mostly paying fees to trade noise.",
      rule: "No trades planned on charts below 1h.",
      cost: -net(quick),
    });
  }

  // ---- 7. Losses bigger than planned ---------------------------------------------------
  const blown = trades.filter((t) => {
    const r = rMultipleOf(t);
    return r != null && r < -1.2;
  });
  if (blown.length >= 3) {
    const extra = sum(blown.map((t) => -t.pnl - (t.initialRiskAmount as number)));
    add({
      id: "blown-stops",
      severity: "warning",
      title: "Your losses are bigger than you planned",
      evidence: `${blown.length} losses went past −1.2R (worst ${Math.min(...blown.map((t) => rMultipleOf(t) as number)).toFixed(2)}R), costing ${usd(extra)} more than the risk you planned. Slippage on stop-market orders and the fees on both sides add up.`,
      fix: "Size every trade so the stop plus fees is your 1R, not just the stop. Avoid stops right at obvious levels where price spikes through.",
      cost: extra,
    });
  }

  // ---- 8. Position size ------------------------------------------------------------------
  let balance = input.startingBalance;
  const riskPct: number[] = [];
  for (const t of trades) {
    if (t.initialRiskAmount && t.initialRiskAmount > 0 && balance > 0) riskPct.push((t.initialRiskAmount / balance) * 100);
    balance += t.pnl;
  }
  const medRisk = median(riskPct);
  if (riskPct.length >= 10 && medRisk != null) {
    const big = riskPct.filter((r) => r > 2).length;
    const maxRisk = Math.max(...riskPct);
    const bal = input.currentBalance ?? balance;
    if (medRisk > 2 || maxRisk > 5 || big / riskPct.length > 0.25) {
      add({
        id: "size",
        severity: medRisk > 2 || maxRisk > 8 ? "critical" : "warning",
        title: medRisk > 2 ? "You risk too much per trade" : "Your risk per trade is all over the place",
        evidence: `Typical risk was ${pct(medRisk, 1)} of the account per trade, but ${big} trades risked more than 2% and the biggest ${pct(maxRisk, 1)}. Uneven size means a few big losers wipe out many small winners.`,
        fix: `Risk the same 1% on every trade: about ${usd(bal * 0.01)} at your ${usd(bal)} balance. Work out the quantity from the stop (Position size page) before you enter.`,
        rule: `Risk exactly 1% (${usd(bal * 0.01)}) per trade, sized from the stop.`,
        cost: 0,
      });
    }
  }

  // ---- 9. No stop / liquidation ----------------------------------------------------------
  const liquidated = trades.filter((t) => t.exitType === "liquidation");
  const noStop = trades.filter((t) => t.stopLoss == null && !(t.initialRiskAmount && t.initialRiskAmount > 0));
  if (liquidated.length || noStop.length >= 3) {
    const worst = [...noStop, ...liquidated].sort((a, b) => a.pnl - b.pnl)[0];
    add({
      id: "no-stop",
      severity: liquidated.length ? "critical" : "warning",
      title: liquidated.length ? "You've been liquidated" : "You trade without a stop",
      evidence: `${noStop.length} trades had no stop${liquidated.length ? ` and ${liquidated.length} ended in liquidation (${usd(net(liquidated))})` : ""}.${worst ? ` Your worst one: ${worst.symbol} ${worst.side.toLowerCase()} for ${usd(worst.pnl)}.` : ""}`,
      fix: "Place the stop on the exchange the moment you enter, every time. A trade without a stop has unlimited risk, and liquidation is the exchange's stop, at the worst price.",
      rule: "A stop order on the exchange before anything else.",
      cost: Math.max(0, -net(liquidated)) + Math.max(0, -(worst?.pnl ?? 0)),
    });
  }

  // ---- 10. Symbols --------------------------------------------------------------------------
  const bySymbol = new Map<string, ReviewTrade[]>();
  for (const t of trades) bySymbol.set(t.symbol, [...(bySymbol.get(t.symbol) ?? []), t]);
  const symbolRows = [...bySymbol].map(([symbol, ts]) => ({ symbol, ts, net: net(ts) })).filter((r) => r.ts.length >= 5);
  const worstSym = [...symbolRows].sort((a, b) => a.net - b.net)[0];
  const bestSym = [...symbolRows].sort((a, b) => b.net - a.net)[0];
  if (worstSym && worstSym.net < 0 && losses > 0) {
    add({
      id: "symbol",
      severity: -worstSym.net >= losses * 0.4 ? "critical" : "warning",
      title: `${worstSym.symbol} is where your money goes`,
      evidence: `${worstSym.ts.length} trades on ${worstSym.symbol} for ${usd(worstSym.net)}, ${pct((worstSym.ts.filter(isWin).length / worstSym.ts.length) * 100)} won, profit factor ${fmtPf(pf(worstSym.ts))}.${-worstSym.net >= losses ? " That's more than your entire net loss." : ""}`,
      fix: `Stop trading ${worstSym.symbol} until you can write down a specific setup for it and paper-trade 20 of them.${bestSym && bestSym.net > 0 && bestSym.symbol !== worstSym.symbol ? ` ${bestSym.symbol} has been better (${usd(bestSym.net)} over ${bestSym.ts.length} trades).` : ""}`,
      rule: `No ${worstSym.symbol} trades for the next 30 trades.`,
      cost: -worstSym.net,
    });
  }
  if (bestSym && bestSym.net > 0 && pf(bestSym.ts) > 1.2) {
    add({
      id: "best-symbol",
      severity: "good",
      title: `${bestSym.symbol} works for you`,
      evidence: `${bestSym.ts.length} trades for ${usd(bestSym.net)}, profit factor ${fmtPf(pf(bestSym.ts))}.`,
      fix: "Make it your main market, and note what you do differently on it.",
      cost: 0,
    });
  }

  // ---- 11. Long vs short -------------------------------------------------------------------
  const longs = trades.filter((t) => t.side === "LONG");
  const shorts = trades.filter((t) => t.side === "SHORT");
  if (longs.length >= 10 && shorts.length >= 10) {
    const [worse, better, worseName, betterName] =
      net(shorts) < net(longs) ? [shorts, longs, "shorts", "longs"] : [longs, shorts, "longs", "shorts"];
    if (net(worse) < 0 && pf(worse) < 0.75 && pf(better) > pf(worse) + 0.2) {
      add({
        id: "side",
        severity: "warning",
        title: `Your ${worseName} are much worse than your ${betterName}`,
        evidence: `${worse.length} ${worseName}: ${usd(net(worse))}, profit factor ${fmtPf(pf(worse))}. ${better.length} ${betterName}: ${usd(net(better))}, profit factor ${fmtPf(pf(better))}.`,
        fix: `Only take ${worseName} when the higher-timeframe trend is clearly ${worseName === "shorts" ? "down" : "up"}. If you can't say why it's down, don't short it.`,
        rule: `${worseName === "shorts" ? "Shorts" : "Longs"} only with the 4h trend.`,
        cost: -net(worse),
      });
    }
  }

  // ---- 12. Time of day -------------------------------------------------------------------------
  const blocks = [
    { name: "midnight–6am", from: 0, to: 6 },
    { name: "6am–noon", from: 6, to: 12 },
    { name: "noon–6pm", from: 12, to: 18 },
    { name: "6pm–midnight", from: 18, to: 24 },
  ].map((b) => ({ ...b, ts: trades.filter((t) => hourOf(openMs(t)) >= b.from && hourOf(openMs(t)) < b.to) }));
  const worstBlock = blocks.filter((b) => b.ts.length >= 8).sort((a, b) => net(a.ts) - net(b.ts))[0];
  if (worstBlock && net(worstBlock.ts) < 0 && pf(worstBlock.ts) < 0.6) {
    add({
      id: "time",
      severity: "warning",
      title: `Trades opened ${worstBlock.name} lose`,
      evidence: `${worstBlock.ts.length} trades opened ${worstBlock.name} (your local time): ${usd(net(worstBlock.ts))}, ${pct((worstBlock.ts.filter(isWin).length / worstBlock.ts.length) * 100)} won, profit factor ${fmtPf(pf(worstBlock.ts))}.`,
      fix: `Don't open trades ${worstBlock.name} for the next month and see if the results change.`,
      rule: `No new trades ${worstBlock.name}.`,
      cost: -net(worstBlock.ts),
    });
  }

  // ---- 13. Tilt --------------------------------------------------------------------------------
  const byOpen = [...trades].sort((a, b) => openMs(a) - openMs(b));
  const revenge: ReviewTrade[] = [];
  for (const t of byOpen) {
    const prev = trades.filter((p) => p !== t && ms(p.time) <= openMs(t)).sort((a, b) => ms(b.time) - ms(a.time))[0];
    if (prev && !isWin(prev) && openMs(t) - ms(prev.time) < 30 * 60_000) revenge.push(t);
  }
  if (revenge.length >= 8 && net(revenge) < 0) {
    add({
      id: "tilt",
      severity: "warning",
      title: "You jump straight back in after a loss",
      evidence: `${revenge.length} trades were opened within 30 minutes of closing a loser: ${usd(net(revenge))}, ${pct((revenge.filter(isWin).length / revenge.length) * 100)} won.`,
      fix: "After any loss, wait 30 minutes before the next trade. A new trade should come from a setup, not from wanting the money back.",
      rule: "30-minute break after every loss.",
      cost: -net(revenge),
    });
  }

  // ---- 14. Trend -------------------------------------------------------------------------------
  if (trades.length >= 60) {
    const last = trades.slice(-30);
    const before = trades.slice(0, -30);
    const lastPerTrade = net(last) / last.length;
    const beforePerTrade = net(before) / before.length;
    if (lastPerTrade < beforePerTrade && lastPerTrade < 0) {
      add({
        id: "trend",
        severity: "warning",
        title: "You're getting worse, not better",
        evidence: `Your last 30 trades averaged ${usd(lastPerTrade)} each; the ${before.length} before them averaged ${usd(beforePerTrade)}.`,
        fix: "More screen time isn't fixing it. Cut the number of trades and review each one before taking the next.",
        cost: 0,
      });
    } else if (lastPerTrade > beforePerTrade && lastPerTrade > 0) {
      add({
        id: "trend",
        severity: "good",
        title: "Your recent trades are better",
        evidence: `Your last 30 trades averaged ${usd(lastPerTrade)} each, up from ${usd(beforePerTrade)}.`,
        fix: "Keep doing what changed, and write down what it was.",
        cost: 0,
      });
    }
  }

  // ---- 15. Journaling --------------------------------------------------------------------------
  const journaled = trades.filter((t) => (t.notes && t.notes.trim()) || (t.tags && t.tags.length) || t.checklist).length;
  if (trades.length >= MIN_TRADES_FOR_REVIEW && journaled / trades.length < 0.2) {
    add({
      id: "journal",
      severity: "warning",
      title: "You don't record why you take trades",
      evidence: `${journaled} of ${trades.length} trades have a note, tag or checklist. Without them there's no way to tell your good setups from impulse trades.`,
      fix: "Tag every trade with its setup (e.g. the strategy from the Guides page) and one line on why. In 30 trades you'll see which setups pay.",
      rule: "Tag every trade with its setup before entering.",
      cost: 0,
    });
  }

  // ---- 16. Patient trades work -----------------------------------------------------------------
  if (patient.length >= 10 && net(patient) > 0 && pf(patient) > 1.2) {
    add({
      id: "patient-good",
      severity: "good",
      title: "When you're patient, you make money",
      evidence: `Trades held 2 hours or more made ${usd(net(patient))} over ${patient.length} trades (profit factor ${fmtPf(pf(patient))}).`,
      fix: "This is your edge. Build the plan around fewer, longer trades.",
      cost: 0,
    });
  }

  const order: Record<Severity, number> = { critical: 0, warning: 1, good: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || b.cost - a.cost);

  const profitable = total > 0;
  const accountChangePct = input.startingBalance > 0 ? (total / input.startingBalance) * 100 : 0;
  const verdict = profitable
    ? {
        profitable,
        headline: `You're up ${usd(total)} over ${trades.length} trades.`,
        detail: `That's ${pct(accountChangePct, 1)} on your ${usd(input.startingBalance)} starting balance. Below is what's still costing you.`,
      }
    : {
        profitable,
        headline: `You're not profitable yet: ${usd(total)} over ${trades.length} trades.`,
        detail: `That's ${pct(Math.abs(accountChangePct), 1)} of your ${usd(input.startingBalance)} starting balance gone. ${
          gross > total && fees > 0
            ? `The market alone took ${usd(gross)}; fees${funding < 0 ? " and funding" : ""} took ${usd(gross - total)}.`
            : ""
        } Each trade loses ${usd(Math.abs(total / Math.max(1, trades.length)))} on average. The problems below are ranked by what they cost you.`,
      };

  return {
    count: trades.length,
    verdict,
    numbers: {
      net: total,
      gross,
      fees,
      funding,
      winRate: s.winRate,
      avgWinR,
      avgLossR,
      breakevenWinRate,
      expectancy: s.expectancy,
      expectancyR: avg(rs),
      accountChangePct,
    },
    findings,
    // The few rules that would have saved the most; a long list gets ignored.
    rules: [...new Set(findings.filter((f) => f.severity !== "good" && f.rule).map((f) => f.rule as string))].slice(0, MAX_RULES),
  };
}
