// What an MT5 Strategy Tester report says about a setup, in R, and what it
// means for a prop challenge: the numbers, the losing streaks to expect, the
// worst day and week, and a Monte Carlo of Phase 1 under the account's
// target, static max loss and daily loss limit. Pure: trades in, numbers out.

export interface ReportTrade {
  open: string; // server time "YYYY-MM-DD HH:MM:SS"
  close: string;
  side: "LONG" | "SHORT";
  r: number;
  exit: "sl" | "tp" | "end" | "other";
}

const DAY = 86_400_000;
const dayOf = (t: string) => t.slice(0, 10);
const ms = (day: string) => Date.parse(`${day}T00:00:00Z`);
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/** The p-th percentile (0–100) of a sorted array, nearest rank. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

/** Small seeded generator (mulberry32), so a page shows the same simulation every time. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 1. the numbers ---------- */

export interface Numbers {
  trades: number;
  winRatePct: number;
  profitFactor: number | null; // null with no losses
  avgR: number;
  netR: number;
  avgWinR: number;
  avgLossR: number;
  bestR: number;
  worstR: number;
  maxDrawdownR: number;
  weeks: number;
  perWeek: number;
  from: string;
  to: string;
  equity: number[]; // cumulative R after each trade, starting at 0
  years: { year: string; trades: number; netR: number }[];
  halves: [number, number]; // net R of the first and second half of the trades
}

export function numbers(trades: ReportTrade[], from?: string, to?: string): Numbers {
  const rs = trades.map((t) => t.r);
  const wins = rs.filter((r) => r > 0), losses = rs.filter((r) => r <= 0);
  const gw = wins.reduce((a, b) => a + b, 0), gl = -losses.reduce((a, b) => a + b, 0);
  const equity = [0];
  let peak = 0, dd = 0;
  for (const r of rs) {
    const e = equity[equity.length - 1] + r;
    equity.push(e);
    peak = Math.max(peak, e);
    dd = Math.max(dd, peak - e);
  }
  const start = from ?? (trades[0] ? dayOf(trades[0].open) : "");
  const end = to ?? (trades.length ? dayOf(trades[trades.length - 1].close) : "");
  const weeks = start && end ? Math.max(1, (ms(end) - ms(start)) / DAY / 7) : 0;
  const byYear = new Map<string, { trades: number; netR: number }>();
  for (const t of trades) {
    const y = t.close.slice(0, 4);
    const v = byYear.get(y) ?? { trades: 0, netR: 0 };
    v.trades++;
    v.netR += t.r;
    byYear.set(y, v);
  }
  const half = Math.floor(rs.length / 2);
  const sum = (x: number[]) => x.reduce((a, b) => a + b, 0);
  const n = rs.length;
  return {
    trades: n,
    winRatePct: n ? (wins.length / n) * 100 : 0,
    profitFactor: gl > 0 ? gw / gl : null,
    avgR: n ? sum(rs) / n : 0,
    netR: sum(rs),
    avgWinR: wins.length ? gw / wins.length : 0,
    avgLossR: losses.length ? -gl / losses.length : 0,
    bestR: n ? Math.max(...rs) : 0,
    worstR: n ? Math.min(...rs) : 0,
    maxDrawdownR: dd,
    weeks,
    perWeek: weeks ? n / weeks : 0,
    from: start,
    to: end,
    equity,
    years: [...byYear.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([year, v]) => ({ year, ...v })),
    halves: [sum(rs.slice(0, half)), sum(rs.slice(half))],
  };
}

/* ---------- 2. losing streaks ---------- */

export interface Streaks {
  longestLoss: number;
  longestWin: number;
  lossRuns: { length: number; count: number }[]; // how often each length of losing run happened
  // Longest losing run in a stretch of `window` trades drawn from the report.
  window: number;
  typical: number; // median
  bad: number; // 1 in 10 stretches are this long or longer
  worst: number; // 1 in 100
}

export function streaks(trades: ReportTrade[], window = 50, sims = 4000, seed = 1): Streaks {
  const rs = trades.map((t) => t.r);
  const runs = new Map<number, number>();
  let run = 0, longestLoss = 0, win = 0, longestWin = 0;
  const close = () => {
    if (run > 0) runs.set(run, (runs.get(run) ?? 0) + 1);
    run = 0;
  };
  for (const r of rs) {
    if (r <= 0) { run++; win = 0; } else { close(); win++; }
    longestLoss = Math.max(longestLoss, run);
    longestWin = Math.max(longestWin, win);
  }
  close();
  const lossRate = rs.length ? rs.filter((r) => r <= 0).length / rs.length : 0;
  const rand = rng(seed);
  const worst: number[] = [];
  for (let s = 0; s < sims; s++) {
    let cur = 0, max = 0;
    for (let i = 0; i < window; i++) {
      if (rand() < lossRate) { cur++; max = Math.max(max, cur); } else cur = 0;
    }
    worst.push(max);
  }
  worst.sort((a, b) => a - b);
  return {
    longestLoss,
    longestWin,
    lossRuns: [...runs.entries()].sort(([a], [b]) => a - b).map(([length, count]) => ({ length, count })),
    window,
    typical: percentile(worst, 50),
    bad: percentile(worst, 90),
    worst: percentile(worst, 99),
  };
}

/* ---------- 4. worst day and week ---------- */

export interface Days {
  tradingDays: number; // days with at least one trade closing
  worstDay: { day: string; r: number; trades: number };
  worstWeek: { start: string; r: number; trades: number };
  multiTradeDays: number; // days on which two or more trades closed
  dayResults: number[]; // R of every trading day
}

const mondayOf = (day: string) => {
  const t = ms(day);
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - dow * DAY).toISOString().slice(0, 10);
};

export function days(trades: ReportTrade[]): Days {
  const byDay = new Map<string, { r: number; trades: number }>();
  const byWeek = new Map<string, { r: number; trades: number }>();
  for (const t of trades) {
    const d = dayOf(t.close);
    for (const [map, key] of [[byDay, d], [byWeek, mondayOf(d)]] as const) {
      const v = map.get(key) ?? { r: 0, trades: 0 };
      v.r += t.r;
      v.trades++;
      map.set(key, v);
    }
  }
  const worst = <K extends string>(m: Map<string, { r: number; trades: number }>, k: K) => {
    let best: { key: string; r: number; trades: number } = { key: "", r: 0, trades: 0 };
    for (const [key, v] of m) if (v.r < best.r) best = { key, ...v };
    return { [k]: best.key, r: best.r, trades: best.trades } as { r: number; trades: number } & Record<K, string>;
  };
  const dayResults = [...byDay.values()].map((v) => v.r);
  return {
    tradingDays: byDay.size,
    worstDay: worst(byDay, "day"),
    worstWeek: worst(byWeek, "start"),
    multiTradeDays: [...byDay.values()].filter((v) => v.trades > 1).length,
    dayResults,
  };
}

/* ---------- 3 and 5. the challenge ---------- */

export interface ChallengeRules {
  riskPct: number; // % of the starting balance risked per trade (1R)
  targetPct: number;
  maxLossPct: number; // static, from the starting balance
  dailyLossPct: number; // of the day's starting balance
}

export interface ChallengeResult {
  sims: number;
  targetR: number;
  passPct: number;
  breachMaxPct: number;
  breachDailyPct: number;
  unfinishedPct: number; // neither within the horizon
  tradesToPass: { median: number; p75: number; p90: number } | null;
  weeksToPass: { median: number; p75: number; p90: number } | null;
  attempts: { expected: number | null; for90: number | null }; // null when it never passes
}

/**
 * Phase 1 replayed `sims` times by drawing calendar days at random from the
 * report (days with no trade included, so time is real). Each trade moves the
 * balance by r × riskPct; it fails on touching the static floor or losing the
 * daily limit from the day's start, and passes on reaching the target. Only
 * closed results are counted: an open trade's floating loss can't exceed its
 * stop, 1R. `edge` scales each trade's R toward zero average: 1 is the report
 * as it is, 0.5 halves the average R.
 */
export function simulateChallenge(trades: ReportTrade[], rules: ChallengeRules, opts: { sims?: number; seed?: number; edge?: number; horizonDays?: number } = {}): ChallengeResult {
  const sims = opts.sims ?? 4000;
  const edge = opts.edge ?? 1;
  const horizon = opts.horizonDays ?? 3 * 365;
  const avg = trades.length ? trades.reduce((a, t) => a + t.r, 0) / trades.length : 0;
  const shift = (1 - edge) * avg;
  // Every calendar day of the report, each with the R of the trades that closed on it.
  const byDay = new Map<string, number[]>();
  for (const t of trades) {
    const d = dayOf(t.close);
    const list = byDay.get(d) ?? [];
    list.push(t.r - shift);
    byDay.set(d, list);
  }
  const first = trades.length ? ms(dayOf(trades[0].open)) : 0;
  const last = trades.length ? ms(dayOf(trades[trades.length - 1].close)) : 0;
  const calendar: number[][] = [];
  for (let t = first; t <= last; t += DAY) calendar.push(byDay.get(new Date(t).toISOString().slice(0, 10)) ?? []);

  const rand = rng(opts.seed ?? 7);
  let pass = 0, max = 0, daily = 0, open = 0;
  const tradesNeeded: number[] = [], daysNeeded: number[] = [];
  for (let s = 0; s < sims; s++) {
    let eq = 0, n = 0, done = false;
    for (let d = 0; d < horizon && !done && calendar.length; d++) {
      const day = calendar[Math.floor(rand() * calendar.length)];
      const dayStart = eq;
      const limit = rules.dailyLossPct * (1 + dayStart / 100);
      for (const r of day) {
        eq += r * rules.riskPct;
        n++;
        if (eq <= -rules.maxLossPct) { max++; done = true; break; }
        if (dayStart - eq >= limit) { daily++; done = true; break; }
        if (eq >= rules.targetPct) { pass++; tradesNeeded.push(n); daysNeeded.push(d + 1); done = true; break; }
      }
    }
    if (!done) open++;
  }
  const p = pass / sims;
  const spread = (x: number[], scale = 1) => {
    if (!x.length) return null;
    const s = [...x].sort((a, b) => a - b);
    return { median: round(percentile(s, 50) * scale, 1), p75: round(percentile(s, 75) * scale, 1), p90: round(percentile(s, 90) * scale, 1) };
  };
  return {
    sims,
    targetR: rules.targetPct / rules.riskPct,
    passPct: p * 100,
    breachMaxPct: (max / sims) * 100,
    breachDailyPct: (daily / sims) * 100,
    unfinishedPct: (open / sims) * 100,
    tradesToPass: spread(tradesNeeded),
    weeksToPass: spread(daysNeeded, 1 / 7),
    attempts: {
      expected: p > 0 ? round(1 / p, 1) : null,
      for90: p >= 1 ? 1 : p > 0 ? Math.ceil(Math.log(0.1) / Math.log(1 - p)) : null,
    },
  };
}

/* ---------- the verdict ---------- */

export type Verdict = "buy" | "slow" | "skip";

/**
 * Whether to buy a challenge for this setup, judged on the cautious case
 * (half the tested edge), because live results usually trail a backtest.
 * "slow": rarely breaches, but on its own it seldom reaches the target
 * within the 3 years simulated, so it needs the account's other setups.
 */
export function verdict(n: Numbers, cautious: ChallengeResult): { verdict: Verdict; reason: string } {
  const pf = n.profitFactor;
  const small = n.trades < 30 ? ` Only ${n.trades} trades, so the real edge is uncertain.` : "";
  if (n.netR <= 0 || (pf !== null && pf < 1.2))
    return { verdict: "skip", reason: `Profit factor ${pf?.toFixed(2) ?? "—"} over ${n.trades} trades: too thin an edge to pay a challenge fee for.` };
  const breach = cautious.breachMaxPct + cautious.breachDailyPct;
  if (breach >= 20) return { verdict: "skip", reason: `At half its edge it breaches the account ${Math.round(breach)}% of the time.${small}` };
  if (cautious.passPct >= 50) return { verdict: "buy", reason: `Passes ${Math.round(cautious.passPct)}% of the time even at half its tested edge, and breaches ${Math.round(breach)}%.${small}` };
  const weeks = cautious.weeksToPass ? ` When it does pass, it takes a median ${Math.round(cautious.weeksToPass.median)} weeks.` : "";
  return {
    verdict: "slow",
    reason: `Safe but slow: at half its edge it breaches only ${Math.round(breach)}% of the time, but alone it reaches the target in 3 years just ${Math.round(cautious.passPct)}% of the time.${weeks} Trade it with the account's other setups.${small}`,
  };
}
