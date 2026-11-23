# AuraJournal

A trading journal and playbook for passing and keeping prop-firm accounts. It decides whether you may trade right now, sizes every trade from the account's rules, warns you about news and liquidity levels, and keeps you honest with a daily discipline streak. Every setup it lets you trade has been backtested in the app and re-checked in MetaTrader 5's Strategy Tester.

It works with any number of prop-firm challenge or funded accounts traded by hand on MT5. Each account's size, loss limits, profit target, risk rules and setups are plain config.

## What it's for

Most prop-firm accounts are lost to rule breaks, not bad strategies: one revenge trade past the daily loss limit, oversizing after a win, trading into CPI. This app makes the rules impossible to miss.

- **Can I trade right now?** Each account shows a verdict (Clear, Careful, Full, Locked, Stopped, Done) worked out from today's losses, open risk, the profit lock and the 6-trades-a-day cap shared across accounts.
- **What should I take, and how big?** Signals from the backtested setups only. A planned trade is sized to the exact lot from the account's risk, the A/B location grade and the instrument's contract spec.
- **Is anything in the way?** The economic calendar (high-impact news blocks new trades for 30 minutes either side) and weekly and daily liquidity levels, with an alert on every page when price nears or sweeps one.
- **Am I getting better?** A journal with notes, tags and checklists, a trade review that finds where money leaks (fees, funding, time of day, setup), and a discipline streak with a daily close-out.

## Pages

| Page | What it does |
|---|---|
| **Playbook** | Both accounts side by side with their verdict, a P&L corridor from the daily stop to the profit lock, losses and open slots, and balance against the target and floor. Tabs: **Trade** (open trades, signals, news, liquidity levels, this week's levels), **Closed trades**, **Scorecard** and **Rules**. |
| **Discipline** | On every page (the sidebar, the mobile top bar or the `D` key): the clean-day streak, this week, and today's close-out, part checked against the journal and part ticked by you. |
| **Liquidity alerts** | A strip on every page when price is at or near an untaken weekly or daily high or low, or has just swept one. Optional browser notifications. |
| **Indicators** | TradingView Pine scripts that mark each step of the setups, ready to paste in. |
| **Dashboard** | Where the P&L comes from and where it leaks: equity, calendar, costs and breakdowns. |
| **Journal** | Every closed trade with notes, tags and checklist. |
| **Trade review** | What's losing money and what to change. |
| **Tester reports** | Each setup's MT5 Strategy Tester run: profit factor, losing streaks, worst day and how many challenge attempts it needs. |
| **Backtests** | Run a coded strategy on historical candles, with a history of runs and insights across them. |
| **Guides** | A beginner's step-by-step guide for each strategy: definitions, entries, stops, a worked example, a diagram and real backtest numbers. |
| **Sync** | Live MT5 sync: link each MT5 login to its prop account and every trade lands in the Playbook by itself. Also imports MT5 HTML reports and CoinDCX trades. |
| **Settings** | Account size, loss limits and dashboard preferences. |

## How it works

```
 MT5 terminal ──PB_BarFeed EA──▶ CSV bars ─┐
 Binance / Yahoo Finance ──────────────────┼─▶ candle cache ─▶ signal scanner ─▶ Playbook signals
                                           │                ├─▶ weekly plan (A/B grade, levels)
                                           │                └─▶ liquidity levels ─▶ alerts
 ForexFactory weekly calendar ─────────────┴─▶ news window ──▶ pre-trade check
 MT5 trade export (PB_BarFeed) / HTML report ▶ Postgres ─────▶ journal, review, discipline
```

- **Candles.** When MT5 is running the `PB_BarFeed` expert (`mt5/`), the app reads the broker's own bars from local CSV files, so signals and levels match your chart. Otherwise it uses Binance (crypto, gold) and Yahoo Finance (forex, indices). Candles are cached in memory and topped up as new ones close.
- **Setups.** The strategies in `src/strategies/` are pure functions over candles. A setup (strategy, market and timeframe) only makes the Playbook if it held up over two years at prop-firm costs (profit factor of 1.3 or more and profitable in both halves), and again on MT5's own data. The reasons and numbers live in `src/lib/playbook/config.ts`.
- **Rules.** Account limits, risk per grade, the losses-per-day stop, the profit lock and the daily trade cap are config, enforced by pure functions in `src/lib/playbook/` and covered by tests.
- **Signals are alerts, not a gate.** You can log your own trades. Only the risk rules are enforced.

## Tech

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, route handlers), React 19, TypeScript |
| Data | PostgreSQL (Neon) through Prisma 7 with the `pg` adapter |
| Auth | NextAuth with Google sign-in and database sessions |
| Client state | TanStack Query |
| UI | Tailwind CSS v4, Base UI and shadcn primitives, lucide icons, Chart.js and lightweight-charts |
| Validation | Zod |
| Tests | Vitest (about 400 tests) |
| Trading platforms | MQL5 indicators, Expert Advisors and a bar-feed service for MT5, and Pine Script for TradingView |
| Market data | MT5 bar feed, Binance REST, Yahoo Finance, ForexFactory calendar, CoinDCX API |

### Project layout

```
src/
  app/              pages ((dashboard)/…) and API routes (api/…)
  components/       UI: playbook, discipline, levels, journal, charts, kit
  lib/
    playbook/       accounts, setups, rules, verdicts, discipline
    levels/         liquidity levels and alerts
    news/           economic calendar and the news window
    plan/           weekly plan: last week's range, A/B grade, trends
    signals/        candle cache and signal scanner
    mt5/            bar feed, report import, contract specs
    journal/        metrics and trade review
  strategies/       coded strategies (one file each) and the registry
  guides/           a beginner's guide for every strategy
  backtest/         backtest engine, walk-forward, parameter sweeps, MT5 bars
  indicators/       technical indicators (EMA, ATR, MACD…)
mt5/                MQL5 indicators, Strategy Tester EAs and PB_BarFeed
tradingview/        Pine indicators and strategies for each setup
prisma/             database schema
docs/research/      notes behind the rules: prop-firm limits, fees, top-down analysis
GLOSSARY.md         the domain's terms
```

## Getting started

Needs Node 20 or later, pnpm and a PostgreSQL database.

```bash
pnpm install
cp .env.example .env        # then fill it in (see below)
npx prisma db push          # create the tables
pnpm dev                    # http://localhost:3000
```

Required in `.env`:

| Variable | For |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | NextAuth |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in |

Optional: `COINDCX_API_KEY` and `COINDCX_SECRET_KEY` (CoinDCX sync), `BINANCE_API_KEY` and `BINANCE_SECRET_KEY` (CLI scripts), `MT5_SYNC_EMAILS` (who may use live MT5 sync; set it if anyone else can sign in), `MT5_FEED_DIR` (if MT5's `MQL5/Files/PlaybookFeed` isn't in the default Mac location) and `SIGNAL_HISTORY_DAYS` (candle history, 730 by default). `.env.example` lists them all.

The first request after the server starts downloads the candle history (up to about 30 seconds without the MT5 feed). Later ones are quick.

### MT5 bar feed (recommended)

Compile `mt5/PB_BarFeed.mq5` in MetaEditor and run it in the terminal. It writes each market's closed bars and a heartbeat to `MQL5/Files/PlaybookFeed`, and the app switches to them automatically while the heartbeat is fresh. See `mt5/README.md` for this, the indicators and the Strategy Tester EAs.

It also exports the logged-in account's deals, open positions and balance to `PlaybookFeed/accounts/`. On the Sync page, link each login to its prop account. From then on its trades reach the Playbook by themselves, whenever the Playbook loads (at most every 15 seconds) or when you press Sync now. A trade you logged by hand is matched to its position (same account, market and side, opened within 3 minutes), not doubled. A trade you didn't log is checked against the rules as they stood when you opened it. The account's MT5 balance sets the Playbook's. No password leaves your machine.

## Scripts

| Command | Does |
|---|---|
| `pnpm dev` | Start the app on port 3000 |
| `pnpm build`, `pnpm start` | Production build and server |
| `pnpm test` | Run the test suite |
| `pnpm lint` | ESLint |
| `pnpm backtest` | Backtest a strategy from the command line (`BACKTEST_*` variables) |
| `pnpm backtest:walk-forward` | Walk-forward test (`WF_*` variables) |
| `pnpm backtest:param-sweep` | Parameter sweep (`SWEEP_*` variables) |
| `pnpm backtest:mt5` | Run every guide strategy on an MT5 bar export (`MT5_CSV`, `SYMBOL`, `FROM`, `TO`) |

## Adding a strategy

1. Write it in `src/strategies/` and register it in `src/strategies/registry.ts`.
2. Write its beginner guide in `src/guides/` and register it in `src/guides/index.ts`. A test fails if one is missing.
3. Backtest it at prop-firm costs, then on MT5 data, before adding it as a setup in `src/lib/playbook/config.ts`.

## Disclaimer

A personal tool, not financial advice. Backtests are optimistic. Expect live results to be worse.
