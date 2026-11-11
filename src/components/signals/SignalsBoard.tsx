"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bell, BellOff } from "lucide-react";
import { Button, Callout, EmptyState, Panel, SelectInput, Tag, tableClass, tdClass, thClass } from "@/components/kit";
import { assetClass, isForex, isIndex, marketLabel, priceDecimals } from "@/lib/markets/yahoo";
import { useDashboard } from "@/components/trading-journal/DashboardContext";
import { fetchJson } from "@/lib/apiClient";
import { getPulseMarket } from "@/domain/market-pulse/markets";
import { STRATEGY_GUIDES } from "@/guides";
import type { CandleSource, SignalScan } from "@/lib/signals/scanner";
import type { LatestSignal, QUALIFY_RULE, SignalRow } from "@/lib/signals/scan";

const REFRESH_MS = 60_000;
const NOTIFY_KEY = "signals-notify";
const SEEN_KEY = "signals-seen";

type MarketCost = { feeRate: number; leverage: number };
type ScanResponse = SignalScan & { rule: typeof QUALIFY_RULE; feeRate: number; costs: Record<"crypto" | "forex" | "index", MarketCost> };

const INTERVAL_MS: Record<string, number> = { "5m": 5 * 60_000, "15m": 15 * 60_000, "1h": 60 * 60_000, "4h": 4 * 60 * 60_000 };
const clock = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dayClock = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });

// Markets without a Market Pulse entry get their label from the symbol
// ("EURUSD" → "EUR/USD") and their decimals from the price or the pair.
function marketOf(symbol: string) {
  const m = getPulseMarket(symbol);
  return { label: m?.label ?? marketLabel(symbol), decimals: m?.decimals ?? null };
}
function px(n: number | null, symbol: string) {
  if (n === null) return "—";
  const d = marketOf(symbol).decimals ?? priceDecimals(n, symbol);
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function distPct(from: number, to: number | null) {
  return to === null ? "" : `${(Math.abs(to - from) / from * 100).toFixed(2)}%`;
}
function ago(ms: number) {
  const mins = Math.max(0, Math.round(ms / 60_000));
  return mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.floor(mins / 60)}h ${mins % 60}m ago` : `${Math.floor(mins / 1440)}d ago`;
}
// The execution timeframe the strategy's guide teaches ("4h / 15m" → "15m", "5m (1h setup)" → "5m").
function guideInterval(key: string) {
  const tf = STRATEGY_GUIDES.find((g) => g.key === key)?.backtest.rows[0]?.timeframe;
  return tf?.split("/").pop()?.trim().split(" ")[0] ?? null;
}
const signalKey = (row: SignalRow) => `${row.id}:${row.signal?.signalTime}`;

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeStorage(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode etc.: just not remembered.
  }
}

const STATUS: Record<LatestSignal["status"], { label: string; tone: "gain" | "loss" | "fees" | "signal" | "neutral" }> = {
  new: { label: "New", tone: "signal" },
  open: { label: "Running", tone: "fees" },
  target: { label: "Hit target", tone: "gain" },
  stop: { label: "Stopped out", tone: "loss" },
  closed: { label: "Closed", tone: "neutral" },
};

function SideTag({ side }: { side: "LONG" | "SHORT" }) {
  return (
    <span className="whitespace-nowrap">
      <Tag tone={side === "LONG" ? "gain" : "loss"}>{side === "LONG" ? "Buy / long" : "Sell / short"}</Tag>
    </span>
  );
}

// Grade from the weekly plan: A = with last week's premium/discount, full size.
// On forex, B-grade trades lost money outright in testing, so skip them.
function GradeTag({ grade, symbol }: { grade: "A" | "B" | null | undefined; symbol: string }) {
  if (!grade) return null;
  const b = isForex(symbol) ? "skip" : "half size";
  return (
    <Link href="/plan" title={grade === "A" ? "With last week's location: full size (1% risk)" : `Against last week's location: ${b}`}>
      <Tag tone={grade === "A" ? "signal" : "fees"}>{grade === "A" ? "A-grade · full size" : `B-grade · ${b}`}</Tag>
    </Link>
  );
}

function Level({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-fog">{label}</p>
      <p className={`font-display text-[17px] font-semibold tabular-nums ${tone ?? "text-paper"}`}>{value}</p>
      {note && <p className="text-xs text-mist">{note}</p>}
    </div>
  );
}

const signed = (n: number, digits = 1) => `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
// How often a strategy traded in its backtest, per week and per month.
const tradeRate = (s: SignalRow["stats"]) => {
  const perWeek = s.days > 0 ? s.trades / (s.days / 7) : 0;
  return { perWeek, perMonth: s.days > 0 ? s.trades / (s.days / 30.44) : 0 };
};
const rate = (n: number) => (n >= 10 ? n.toFixed(0) : n.toFixed(1));

const history = (days: number) => (days >= 700 ? `${(days / 365).toFixed(0)} years` : `${Math.round(days / 30)} months`);

function BacktestLine({ row }: { row: SignalRow }) {
  const s = row.stats;
  return (
    <p className="text-xs text-mist">
      Backtest over {history(s.days)} on {row.symbol}: {s.trades} trades (about {rate(tradeRate(s).perMonth)} a month), {s.winRatePct.toFixed(0)}% won, profit factor{" "}
      {s.profitFactor === null ? "—" : s.profitFactor.toFixed(2)}, {signed(s.returnPct)} ({signed(s.annualReturnPct)} a year) vs{" "}
      {signed(s.buyHoldPct)} holding {marketOf(row.symbol).label}, worst drawdown {s.maxDrawdownPct.toFixed(1)}%.
    </p>
  );
}

function NewSignalCard({ row, now }: { row: SignalRow; now: number }) {
  const s = row.signal!;
  const validUntil = row.lastCloseTime + 1 + (INTERVAL_MS[row.interval] ?? 0);
  const expired = now > validUntil;
  return (
    <article className={`flex flex-col gap-3 rounded-[10px] border border-l-[3px] border-rule bg-ink/40 p-4 ${s.side === "LONG" ? "border-l-gain" : "border-l-loss"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SideTag side={s.side} />
          <span className="font-display text-[17px] font-semibold text-paper">{marketOf(row.symbol).label}</span>
          <span className="text-xs text-fog">{row.symbol}</span>
          <GradeTag grade={s.grade} symbol={row.symbol} />
        </div>
        <Tag tone="signal">{row.interval} chart only</Tag>
      </div>
      <p className="text-sm text-fog">
        <Link href={`/guides/${row.strategyKey}`} className="text-paper underline decoration-rule underline-offset-4 hover:decoration-paper">
          {row.strategyName}
        </Link>{" "}
        · signal candle closed {clock.format(s.signalTime)} ({ago(now - s.signalTime)})
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Level label="Entry (next open)" value={`≈ ${px(s.entry, row.symbol)}`} />
        <Level label="Stop" value={px(s.stop, row.symbol)} note={s.stop === null ? "Exits on the opposite signal" : distPct(s.entry, s.stop)} tone="text-loss-ink" />
        <Level label="Target" value={px(s.target, row.symbol)} note={distPct(s.entry, s.target)} tone="text-gain-ink" />
        <Level label="Reward : risk" value={s.rr === null ? "—" : `${s.rr.toFixed(1)}R`} />
      </div>
      <p className={`text-xs ${expired ? "text-fees-ink" : "text-fog"}`}>
        {expired
          ? `The next candle has opened since (${clock.format(validUntil)}). The backtest entered there; check price is still near the entry before acting.`
          : `The backtest enters at the open of the next candle and the signal is fresh until ${clock.format(validUntil)}.`}
      </p>
      <p className="text-xs text-fog">
        Trade this on the {row.interval} chart. This strategy only qualified on {marketOf(row.symbol).label} on the {row.interval}
        {guideInterval(row.strategyKey) && guideInterval(row.strategyKey) !== row.interval
          ? `, not on the ${guideInterval(row.strategyKey)} chart its guide uses`
          : ""}
        ; on other timeframes it loses or doesn&apos;t pass the bar.
      </p>
      <BacktestLine row={row} />
    </article>
  );
}

function OpenTradeRow({ row }: { row: SignalRow }) {
  const s = row.signal!;
  // In R when there's a stop, otherwise the % move in the trade's favour.
  const move = ((row.lastClose - s.entry) / s.entry) * 100 * (s.side === "LONG" ? 1 : -1);
  return (
    <tr>
      <td className={tdClass}>
        <span className="font-medium">{marketOf(row.symbol).label}</span> <span className="text-xs text-fog">{row.interval}</span>
      </td>
      <td className={tdClass}>
        <Link href={`/guides/${row.strategyKey}`} className="hover:underline">{row.strategyName}</Link>
      </td>
      <td className={tdClass}>
        <span className="flex flex-wrap gap-1.5"><SideTag side={s.side} /><GradeTag grade={s.grade} symbol={row.symbol} /></span>
      </td>
      <td className={`${tdClass} tabular-nums`}>{px(s.entry, row.symbol)}</td>
      <td className={`${tdClass} tabular-nums text-loss-ink`}>{px(s.stop, row.symbol)}</td>
      <td className={`${tdClass} tabular-nums text-gain-ink`}>{px(s.target, row.symbol)}</td>
      <td className={`${tdClass} tabular-nums`}>{px(row.lastClose, row.symbol)}</td>
      <td className={`${tdClass} tabular-nums ${move >= 0 ? "text-gain-ink" : "text-loss-ink"}`}>
        {s.rMultiple !== null
          ? `${s.rMultiple >= 0 ? "+" : ""}${s.rMultiple.toFixed(2)}R`
          : `${move >= 0 ? "+" : ""}${move.toFixed(2)}%`}
      </td>
      <td className={`${tdClass} text-fog`}>{dayClock.format(s.signalTime)}</td>
    </tr>
  );
}

function LatestCell({ row }: { row: SignalRow }) {
  const s = row.signal;
  if (!s) return <span className="text-mist">None in the last 3 days</span>;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Tag tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Tag>
      <span className="text-xs text-fog">
        {s.side === "LONG" ? "long" : "short"} · {dayClock.format(s.signalTime)}
        {s.rMultiple !== null && s.status !== "new" && ` · ${s.rMultiple >= 0 ? "+" : ""}${s.rMultiple.toFixed(2)}R`}
      </span>
    </span>
  );
}

// Live signals, rechecked every minute, from only the strategies that pass
// QUALIFY_RULE on a market over the long backtest window. The server sends
// no signals for the rest; they're listed, collapsed, with the reasons.
export default function SignalsBoard() {
  const { addNotification } = useDashboard();
  const [market, setMarket] = useState<string>("all");
  const [notify, setNotify] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    setNotify(readStorage(NOTIFY_KEY, false) && typeof Notification !== "undefined" && Notification.permission === "granted");
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const query = useQuery({
    queryKey: ["signals"],
    queryFn: () => fetchJson<ScanResponse>("/api/signals"),
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: true,
  });
  const data = query.data;

  // Announce qualified signals that weren't on the board before. The first
  // load only records what's already there.
  useEffect(() => {
    if (!data) return;
    const fresh = data.rows.filter((r) => r.qualified && r.signal?.status === "new");
    if (seen.current === null) {
      seen.current = new Set(readStorage<string[]>(SEEN_KEY, []));
      fresh.forEach((r) => seen.current!.add(signalKey(r)));
    } else {
      for (const r of fresh) {
        const key = signalKey(r);
        if (seen.current.has(key)) continue;
        seen.current.add(key);
        const s = r.signal!;
        const text = `${s.side === "LONG" ? "BUY" : "SELL"} ${marketOf(r.symbol).label} on the ${r.interval} chart · ${r.strategyName} · entry ≈ ${px(s.entry, r.symbol)}, stop ${px(s.stop, r.symbol)}, target ${px(s.target, r.symbol)}`;
        addNotification(`New signal: ${text}`, "success");
        if (notify && typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("New trading signal", { body: text, tag: key });
        }
      }
    }
    writeStorage(SEEN_KEY, [...seen.current].slice(-200));
  }, [data, notify, addNotification]);

  const toggleNotify = async () => {
    if (notify) {
      setNotify(false);
      writeStorage(NOTIFY_KEY, false);
      return;
    }
    if (typeof Notification === "undefined") {
      addNotification("This browser doesn't support notifications.", "error");
      return;
    }
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") {
      addNotification("Notifications are blocked for this site in your browser settings.", "error");
      return;
    }
    setNotify(true);
    writeStorage(NOTIFY_KEY, true);
  };

  const inMarket = useMemo(() => (data?.rows ?? []).filter((r) => market === "all" || r.symbol === market), [data, market]);
  const board = inMarket.filter((r) => r.qualified).sort((a, b) => b.stats.annualReturnPct - a.stats.annualReturnPct);
  const hidden = inMarket.filter((r) => !r.qualified).sort((a, b) => b.stats.annualReturnPct - a.stats.annualReturnPct);
  const total = board.reduce(
    (acc, r) => {
      const t = tradeRate(r.stats);
      return { perWeek: acc.perWeek + t.perWeek, perMonth: acc.perMonth + t.perMonth };
    },
    { perWeek: 0, perMonth: 0 },
  );
  const fresh = board.filter((r) => r.signal?.status === "new");
  const running = board.filter((r) => r.signal?.status === "open");
  const qualifiedCount = (data?.rows ?? []).filter((r) => r.qualified).length;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-rule bg-deck px-5 py-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm text-paper" aria-live="polite">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${query.isError ? "bg-loss" : data ? "bg-gain" : "bg-fees"}`} />
            {data
              ? `Checked at ${clock.format(data.asOf)} · rechecks every minute while this page is open`
              : query.isError
                ? "Couldn't reach the scanner. Retrying every minute."
                : "First check: downloading up to 2 years of candles for each market. This takes a few minutes…"}
          </p>
          {data && (
            <p className="mt-0.5 max-w-[80ch] text-xs leading-relaxed text-fog">
              Only {qualifiedCount} of {data.rows.length} strategy and market pairs send signals. Each one, backtested at your real CoinDCX fee
              ({(data.feeRate * 100).toFixed(3)}% per side; currency pairs at {(data.costs.forex.feeRate * 100).toFixed(2)}% per side for spread and commission
              with {data.costs.forex.leverage}× leverage, indices at {(data.costs.index.feeRate * 100).toFixed(2)}% with {data.costs.index.leverage}×) over up to{" "}
              {data.historyDays / 365} years (at least {Math.round(data.rule.minDays / 30)} months), took {data.rule.minTrades}+ trades,
              made {data.rule.minAnnualReturnPct}%+ a year with a profit factor of {data.rule.minProfitFactor}+, beat holding the market,
              made money in both halves of the period and never fell more than {data.rule.maxDrawdownPct}%.
            </p>
          )}
          {data && <FeedNote sources={data.sources ?? {}} />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SelectInput aria-label="Market" value={market} onChange={(e) => setMarket(e.target.value)} className="w-auto py-1.5 text-[13px]">
            <option value="all">All markets</option>
            {[
              { label: "Crypto and metals", symbols: (data?.symbols ?? []).filter((s) => assetClass(s) === "crypto") },
              { label: "Currency pairs", symbols: (data?.symbols ?? []).filter(isForex) },
              { label: "Indices", symbols: (data?.symbols ?? []).filter(isIndex) },
              { label: "Commodities", symbols: (data?.symbols ?? []).filter((s) => assetClass(s) === "commodity") },
            ].map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.symbols.map((s) => (
                  <option key={s} value={s}>{marketOf(s).label}</option>
                ))}
              </optgroup>
            ))}
          </SelectInput>
          <Button size="sm" variant={notify ? "primary" : "secondary"} onClick={toggleNotify} aria-pressed={notify}>
            {notify ? <Bell size={14} aria-hidden="true" /> : <BellOff size={14} aria-hidden="true" />}
            {notify ? "Alerts on" : "Alert me"}
          </Button>
        </div>
      </section>

      {data && data.errors.length > 0 && (
        <Callout tone="warning" title="Some data couldn't be refreshed">
          {data.errors.slice(0, 3).join(" · ")}
        </Callout>
      )}

      <Panel
        title="Take now"
        note="A signal fired on the candle that just closed. The backtest buys or sells at the next candle's open with this stop and target. Check the guide's checklist, size it from the stop, then decide."
      >
        {!data ? (
          <EmptyState>{query.isError ? "No data yet." : "Scanning…"}</EmptyState>
        ) : fresh.length === 0 ? (
          <EmptyState>No fresh signals from the qualified strategies right now. Good setups are rare: this page checks every minute, and alerts tell you when one fires even with the tab in the background.</EmptyState>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {fresh.map((r) => (
              <NewSignalCard key={r.id} row={r} now={now} />
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Running"
        note="Trades the backtest is in right now. Already past their entry: for reference, not for entering late."
      >
        {running.length === 0 ? (
          <EmptyState>Nothing running.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  {["Market", "Strategy", "Side", "Entry", "Stop", "Target", "Last close", "Now", "Signal"].map((h) => (
                    <th key={h} className={thClass}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {running.map((r) => (
                  <OpenTradeRow key={r.id} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Qualified strategies"
        note="The only strategies that can send you signals. Each one is tested on 15m, 1h and 4h and only signals on the market and timeframe listed here, where it made money; other timeframes stay silent. Re-judged daily. Past results don't promise future ones."
      >
        {board.length === 0 ? (
          <EmptyState>{data ? "No strategy qualifies on this market right now." : "Scanning…"}</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  {["Market", "Strategy", "TF", "Tested over", "Trades", "Per week", "Per month", "Won", "Profit factor", "Per year", "Strategy vs holding", "Max DD", "Latest signal"].map((h) => (
                    <th key={h} className={thClass}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {board.map((r) => (
                  <tr key={r.id}>
                    <td className={tdClass}>{marketOf(r.symbol).label}</td>
                    <td className={tdClass}>
                      <Link href={`/guides/${r.strategyKey}`} className="hover:underline">{r.strategyName}</Link>
                    </td>
                    <td className={tdClass}><Tag tone="signal">{r.interval}</Tag></td>
                    <td className={`${tdClass} text-fog`}>{history(r.stats.days)}</td>
                    <td className={`${tdClass} tabular-nums`}>{r.stats.trades}</td>
                    <td className={`${tdClass} tabular-nums`}>{rate(tradeRate(r.stats).perWeek)}</td>
                    <td className={`${tdClass} tabular-nums`}>{rate(tradeRate(r.stats).perMonth)}</td>
                    <td className={`${tdClass} tabular-nums`}>{r.stats.winRatePct.toFixed(0)}%</td>
                    <td className={`${tdClass} tabular-nums`}>{r.stats.profitFactor === null ? "—" : r.stats.profitFactor.toFixed(2)}</td>
                    <td className={`${tdClass} tabular-nums text-gain-ink`}>{signed(r.stats.annualReturnPct)}</td>
                    <td className={`${tdClass} tabular-nums`}>
                      <span className="text-gain-ink">{signed(r.stats.returnPct)}</span>
                      <span className="text-fog"> vs {signed(r.stats.buyHoldPct)}</span>
                    </td>
                    <td className={`${tdClass} tabular-nums text-fog`}>{r.stats.maxDrawdownPct.toFixed(1)}%</td>
                    <td className={tdClass}><LatestCell row={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-mist">
              Taking every signal above: about {rate(total.perWeek)} trades a week, {rate(total.perMonth)} a month (backtest average; real weeks vary,
              and many have none).
            </p>
          </div>
        )}
      </Panel>

      {hidden.length > 0 && (
        <details className="rounded-[10px] border border-rule bg-deck px-5 py-4">
          <summary className="cursor-pointer text-sm text-fog hover:text-paper">
            {hidden.length} strategy and market pairs don&apos;t qualify and send no signals. Why?
          </summary>
          <ul className="mt-3 flex flex-col divide-y divide-rule text-sm">
            {hidden.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-2">
                <span className="text-paper">
                  {marketOf(r.symbol).label} · {r.strategyName} <span className="text-fog">({r.interval})</span>
                </span>
                <span className="text-xs text-fog">
                  {r.reasons.join(" · ")} · {rate(tradeRate(r.stats).perWeek)} trades a week
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// Which markets are priced off the MT5 terminal's own feed (PB_BarFeed
// service running) and which off Binance/Yahoo.
function FeedNote({ sources }: { sources: Record<string, CandleSource> }) {
  const mt5 = Object.keys(sources).filter((s) => sources[s] === "mt5");
  return (
    <p className="mt-1 max-w-[80ch] text-xs leading-relaxed text-fog">
      {mt5.length > 0
        ? `Candles from your MT5 terminal for ${mt5.map((s) => marketOf(s).label).join(", ")}; the rest from Binance and Yahoo Finance.`
        : "Candles from Binance and Yahoo Finance. Attach the PB_BarFeed expert to a chart in MT5 to use your broker's own prices."}
    </p>
  );
}
