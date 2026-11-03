"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Segmented, SelectInput, Tag } from "@/components/kit";
import { fetchJson } from "@/lib/apiClient";
import { DEFAULT_PULSE_SYMBOL, PULSE_MARKETS, PulseMarket, getPulseMarket } from "@/domain/market-pulse/markets";
import { BIAS_THRESHOLD_PCT, type MarketPulse, type PulseZone } from "@/domain/market-pulse/pulse";
import type { Catalyst } from "@/domain/market-pulse/catalysts";

const STORAGE_KEY = "live-pulse-symbol";
const REFRESH_MS = 15_000;

const HEADLINE = { buyers: "Buyers in control", sellers: "Sellers in control", balanced: "Two-way balance" } as const;
const REGIME = { quiet: "Quiet", normal: "Normal range", expanding: "High expansion" } as const;

const utcTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" });
const utcDay = new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const istTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

function price(n: number, m: PulseMarket) {
  return n.toLocaleString("en-US", { minimumFractionDigits: m.decimals, maximumFractionDigits: m.decimals });
}
function signedPrice(n: number, m: PulseMarket) {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}$${price(Math.abs(n), m)}`;
}
function relative(ms: number) {
  const mins = Math.round(Math.abs(ms) / 60_000);
  const text = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`;
  return ms >= 0 ? `in ${text}` : `${text} ago`;
}

function readStoredSymbol() {
  try {
    const s = window.localStorage.getItem(STORAGE_KEY);
    return s && getPulseMarket(s) ? s : null;
  } catch {
    return null;
  }
}

function ZoneRow({ kind, zone, market }: { kind: "supply" | "demand"; zone: PulseZone | null; market: PulseMarket }) {
  const sell = kind === "supply";
  return (
    <div className={`flex items-center justify-between gap-3 rounded-md border border-rule border-l-[3px] bg-ink/40 px-3 py-2.5 ${sell ? "border-l-loss" : "border-l-gain"}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-paper">{sell ? "Sell zone (supply)" : "Buy zone (demand)"}</p>
        <p className="text-xs text-fog">
          {!zone
            ? "No data"
            : zone.distance === 0
              ? "Price is inside it"
              : `$${price(zone.distance, market)} ${sell ? "above" : "below"} price`}
        </p>
      </div>
      {zone && (
        <p className={`shrink-0 font-display text-[15px] font-semibold tabular-nums ${sell ? "text-loss-ink" : "text-gain-ink"}`}>
          {price(zone.low, market)} – {price(zone.high, market)}
        </p>
      )}
    </div>
  );
}

function BiasView({ pulse, market, wide }: { pulse: MarketPulse; market: PulseMarket; wide: boolean }) {
  const v = pulse.volatility;
  const moved =
    pulse.change1h === null
      ? `${market.label} has no price from an hour ago yet.`
      : `${market.label} moved ${signedPrice(pulse.change1h, market)} (${pulse.change1hPct! >= 0 ? "+" : "−"}${Math.abs(pulse.change1hPct!).toFixed(2)}%) over the past hour.`;
  const flow =
    pulse.bias === "balanced"
      ? `Neither side took ${BIAS_THRESHOLD_PCT}% of the hour's volume in the direction price moved, and price sits ${pulse.rangePosPct.toFixed(0)}% of the way up its 24h range.`
      : `${pulse.bias === "buyers" ? "Buyers" : "Sellers"} took ${pulse.bias === "buyers" ? pulse.bullPct : pulse.bearPct}% of the hour's volume; price sits ${pulse.rangePosPct.toFixed(0)}% of the way up its 24h range.`;

  const headline = (
    <div>
      <h3 className="font-display text-[22px] font-bold uppercase leading-tight tracking-[-0.01em] text-paper">{HEADLINE[pulse.bias]}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-fog">
        {moved} {flow}
      </p>
    </div>
  );

  const range = (
    <div className="grid grid-cols-2 divide-x divide-rule border-y border-rule py-3">
      <div className="flex items-baseline justify-between gap-2 pr-3">
        <span className="whitespace-nowrap text-[13px] text-fog">24h low</span>
        <span className="font-display text-lg font-semibold tabular-nums text-gain-ink">${price(pulse.low24h, market)}</span>
      </div>
      <div className="flex items-baseline justify-between gap-2 pl-3">
        <span className="whitespace-nowrap text-[13px] text-fog">24h high</span>
        <span className="font-display text-lg font-semibold tabular-nums text-fees-ink">${price(pulse.high24h, market)}</span>
      </div>
    </div>
  );

  const split = (
    <div>
      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-deck-2"
        role="img"
        aria-label={`Last hour: ${pulse.bullPct}% of volume bought at market, ${pulse.bearPct}% sold at market`}
      >
        <div className="bg-gain" style={{ width: `${pulse.bullPct}%` }} />
        <div className="w-0.5 bg-ink" />
        <div className="flex-1 bg-loss" />
      </div>
      <div className="mt-2 flex items-center justify-between text-[13px]">
        <span className="font-semibold text-gain-ink">Bull {pulse.bullPct}%</span>
        <span className="text-fog">Range position {pulse.rangePosPct.toFixed(0)}%</span>
        <span className="font-semibold text-loss-ink">Bear {pulse.bearPct}%</span>
      </div>
    </div>
  );

  const zones = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-fog">Zones · 24h extremes</p>
        <Tag tone="fees">Live</Tag>
      </div>
      <ZoneRow kind="supply" zone={pulse.supply} market={market} />
      <ZoneRow kind="demand" zone={pulse.demand} market={market} />
      <div className="flex items-center justify-between gap-3 rounded-md border border-rule border-l-[3px] border-l-fees bg-ink/40 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-paper">Volatility</p>
          <p className="text-xs text-fog">
            24h span · {v.regime ? REGIME[v.regime] : "Not enough history"}
            {v.ratio !== null && ` (${v.ratio.toFixed(2)}× the 14-day average)`}
          </p>
        </div>
        <p className="shrink-0 font-display text-[15px] font-semibold tabular-nums text-fees-ink">
          ${price(v.span, market)} ({v.pips !== null ? `${Math.round(v.pips).toLocaleString()} pips` : `${v.spanPct.toFixed(2)}%`})
        </p>
      </div>
    </div>
  );

  if (wide) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-4">
          {headline}
          {range}
          {split}
        </div>
        {zones}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {headline}
      {range}
      {split}
      {zones}
    </div>
  );
}

function CatalystsView({ symbol, market, wide }: { symbol: string; market: PulseMarket; wide: boolean }) {
  const query = useQuery({
    queryKey: ["market-catalysts", symbol],
    queryFn: () => fetchJson<{ catalysts: Catalyst[]; source: string }>(`/api/market/catalysts?symbol=${symbol}`),
    staleTime: 15 * 60_000,
  });
  const now = Date.now();
  const events = query.data?.catalysts ?? [];
  const nextIdx = events.findIndex((e) => e.time >= now);

  if (query.isLoading) return <p className="py-6 text-sm text-fog">Loading the calendar…</p>;
  if (query.isError) return <p className="py-6 text-sm text-loss-ink">The economic calendar isn&apos;t available right now.</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-fog">
        High and medium impact events for {market.currencies.join(" and ")} this week, from 12 hours ago. Times in UTC, with IST.
      </p>
      {events.length === 0 ? (
        <p className="py-4 text-sm text-fog">Nothing scheduled.</p>
      ) : (
        <ul className={`grid gap-2 ${wide ? "md:grid-cols-2" : "grid-cols-1"}`}>
          {events.map((e, i) => {
            const past = e.time < now;
            return (
              <li
                key={`${e.time}-${e.title}`}
                className={`rounded-md border border-rule border-l-[3px] bg-ink/40 px-3 py-2.5 ${e.impact === "High" ? "border-l-loss" : "border-l-fees"} ${past ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-sm font-medium text-paper">{e.title}</p>
                  <Tag tone={e.impact === "High" ? "loss" : "fees"}>{e.impact}</Tag>
                </div>
                <p className="mt-0.5 text-xs text-fog">
                  {e.currency} · {utcDay.format(e.time)} UTC ({istTime.format(e.time)} IST) ·{" "}
                  <span className={i === nextIdx ? "font-medium text-signal" : ""}>{relative(e.time - now)}</span>
                </p>
                {(e.forecast || e.previous) && (
                  <p className="mt-0.5 text-xs text-mist">
                    {e.forecast && `Forecast ${e.forecast}`}
                    {e.forecast && e.previous && " · "}
                    {e.previous && `Previous ${e.previous}`}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-mist">Source: {query.data?.source}.</p>
    </div>
  );
}

// Live market read for one crypto or commodity: last hour's move and order
// flow, the 24h range with zones at its extremes, volatility, and upcoming
// economic events. `wide` lays it out for a full-width dashboard row.
export default function LivePulse({ wide = false }: { wide?: boolean }) {
  const [symbol, setSymbol] = useState(DEFAULT_PULSE_SYMBOL);
  const [tab, setTab] = useState<"bias" | "catalysts">("bias");
  const market = getPulseMarket(symbol)!;

  // Restore the last market picked (on this page or the other).
  useEffect(() => {
    const stored = readStoredSymbol();
    if (stored) setSymbol(stored);
  }, []);

  const choose = (s: string) => {
    setSymbol(s);
    try {
      window.localStorage.setItem(STORAGE_KEY, s);
    } catch {
      // Private mode etc.: the choice just isn't remembered.
    }
  };

  const query = useQuery({
    queryKey: ["market-pulse", symbol],
    queryFn: () => fetchJson<{ pulse: MarketPulse }>(`/api/market/pulse?symbol=${symbol}`),
    refetchInterval: REFRESH_MS,
  });
  const pulse = query.data?.pulse?.symbol === symbol ? query.data.pulse : undefined;

  return (
    <section aria-label="Live pulse" className="min-w-0 rounded-[10px] border border-rule bg-deck p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-[15px] font-bold uppercase tracking-[0.06em] text-fees-ink">Live pulse</h2>
          <label className="sr-only" htmlFor={`pulse-market-${wide ? "wide" : "stack"}`}>
            Market
          </label>
          <SelectInput id={`pulse-market-${wide ? "wide" : "stack"}`} value={symbol} onChange={(e) => choose(e.target.value)} className="w-auto py-1 text-sm">
            {(["Crypto", "Commodity"] as const).map((category) => (
              <optgroup key={category} label={category === "Crypto" ? "Crypto" : "Commodities"}>
                {PULSE_MARKETS.filter((m) => m.category === category).map((m) => (
                  <option key={m.symbol} value={m.symbol}>
                    {m.label} ({m.symbol.replace("USDT", "")})
                  </option>
                ))}
              </optgroup>
            ))}
          </SelectInput>
        </div>
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.04em] text-fog" aria-live="polite">
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${query.isError ? "bg-loss" : "bg-gain"}`} />
          {pulse ? `${utcTime.format(pulse.asOf)} UTC` : "Connecting…"}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-4">
        <Segmented
          label="Live pulse view"
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: "bias", label: "Market bias · 1H" },
            { value: "catalysts", label: "Catalysts · UTC" },
          ]}
        />
        {pulse && pulse.change1h !== null && (
          <span
            className={`rounded border px-2 py-0.5 font-display text-[13px] font-semibold tabular-nums ${pulse.change1h >= 0 ? "border-gain/40 text-gain-ink" : "border-loss/40 text-loss-ink"}`}
          >
            1H {signedPrice(pulse.change1h, market)}
          </span>
        )}
      </div>

      <div className="mt-5">
        {tab === "catalysts" ? (
          <CatalystsView symbol={symbol} market={market} wide={wide} />
        ) : query.isError && !pulse ? (
          <p className="py-6 text-sm text-loss-ink">Couldn&apos;t load {market.label} from Binance. Retrying every 15 seconds.</p>
        ) : !pulse ? (
          <p className="py-6 text-sm text-fog">Loading {market.label}…</p>
        ) : (
          <BiasView pulse={pulse} market={market} wide={wide} />
        )}
      </div>

      {tab === "bias" && (
        <p className="mt-4 text-xs leading-relaxed text-mist">
          Binance USDⓈ-M futures, refreshed every 15s. Bull/bear is the share of the last hour&apos;s volume from market buy vs market sell orders. Zones are the 15m candles
          that made the 24h high and low. A read of the market, not a signal.
        </p>
      )}
    </section>
  );
}
