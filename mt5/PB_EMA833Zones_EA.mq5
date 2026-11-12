//+------------------------------------------------------------------+
//| PB_EMA833Zones_EA.mq5                                          |
//| Research EA: 8/33 EMA "dominance candle" with a swing-zone     |
//| filter, 1h. NOT a Playbook setup: it is here so the app's      |
//| backtest (PF ~1.04-1.20 on 7 of 8 markets, 2020-2026) can be   |
//| checked in FundingPips' own Strategy Tester.                   |
//|                                                                |
//| Port of the app research script ema833.mts (tf 60, rr 3,       |
//| zones on), run on closed H1 bars:                              |
//| 1 Trend   : EMA8 above EMA33 (buys) / below (sells).           |
//| 2 Candle  : closes beyond both EMAs, body >= 60% of its range, |
//|             in the trend direction.                            |
//| 3 Cross   : closes beyond the previous candle's high (low).    |
//| 4 Retest  : this candle's low (high) touched EMA8, or the      |
//|             previous candle's touched the previous EMA8.       |
//| 5 Stop    : lowest low (highest high) of the last 5 candles.   |
//|             Target 3R from the signal close.                   |
//| 6 Room    : skip if the 100-candle high (low) lies between     |
//|             entry and target.                                  |
//| 7 Zones   : skip if any swing high/low (3 candles each side)   |
//|             of the last 200 candles lies between entry and     |
//|             target + 0.25R.                                    |
//| Market order at the next H1 open, one trade at a time, held    |
//| until the stop or target (no time exit).                       |
//| Session (All by default): only take signals whose candle closes |
//| in London 08:00-16:30 London time and/or New York 08:00-17:00  |
//| New York time (daylight saving handled).                       |
//| Trail (off by default): no target; at 3R the stop moves to 2R, |
//| at 4R to 3R, and so on, one R behind the best R reached.       |
//+------------------------------------------------------------------+
#property copyright "Playbook"
#property version   "1.20"
#property description "Research Strategy Tester EA: 8/33 EMA dominance candle with swing-zone filter, H1, 1:3. Not part of the Playbook."
#include <Trade/Trade.mqh>

enum ENUM_SESS { SESS_ALL = 0,    // All hours
                 SESS_LONDON = 1, // London 08:00-16:30 London
                 SESS_NY = 2,     // New York 08:00-17:00 NY
                 SESS_BOTH = 3    // London or New York
               };

input group "Rules (keep defaults to match the backtest)"
input int    InpFast      = 8;    // Fast EMA
input int    InpSlow      = 33;   // Slow EMA
input double InpBody      = 0.6;  // Minimum body (x candle range)
input int    InpStopLook  = 5;    // Stop: extreme of the last N candles
input double InpRR        = 3.0;  // Target (x risk)
input bool   InpRoom      = true; // Room filter (100-candle high/low)
input int    InpRoomLook  = 100;  // Room filter lookback
input bool   InpZones     = true; // Swing-zone filter
input bool   InpTrail     = false; // Trail instead of a fixed target (3R -> stop 2R, 4R -> 3R, ...)
input int    InpZoneLook  = 200;  // Zone lookback (candles)
input int    InpZoneSwing = 3;    // Swing size (candles each side)
input double InpZoneBuf   = 0.25; // Zone counts up to this many R past the target
input group "Session"
input ENUM_SESS InpSession = SESS_ALL; // Trade only when the signal candle closes in
input int    InpServerGmt  = 2;    // Server UTC offset in winter (hours)
input bool   InpEuDst      = true; // Server adds 1h for EU summer time (late Mar to late Oct)
input group "Show"
input bool   InpLong      = true; // Long trades
input bool   InpShort     = true; // Short trades
input group "Size"
input double InpRiskPct   = 1.0;  // Risk per trade (% of balance; 0 = use fixed lots)
input double InpFixedLots = 0.10; // Fixed lots (when risk % is 0)
input group "Other"
input long   InpMagic     = 260920; // Magic number
input bool   InpLog       = true;   // Write each trade to the journal

#define EA_NAME "PB_EMA833Zones"
#define BARS    1500   // H1 candles read each hour (EMA warm-up + 200 zone candles)

CTrade   trade;
datetime g_lastH1 = 0, g_lastTraded = 0;
double   g_entry = 0, g_risk = 0;   // the signal's entry (its close) and risk, for the trailing steps
ulong    g_ticket = 0;
double   O[], H[], L[], C[], EF[], ES[];
datetime T[];

void Log(string s) { if(InpLog) Print(EA_NAME, ": ", s); }
string Px(double v) { return DoubleToString(v, _Digits); }

bool HasPosition()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
      if(PositionGetTicket(i) > 0 && PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == InpMagic) return true;
   return false;
}

double Lots(bool isLong, double entry, double sl)
{
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP), vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN), vmax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double lots = InpFixedLots;
   if(InpRiskPct > 0)
   {
      double loss = 0;
      if(!OrderCalcProfit(isLong ? ORDER_TYPE_BUY : ORDER_TYPE_SELL, _Symbol, 1.0, entry, sl, loss) || loss >= 0) return 0;
      lots = AccountInfoDouble(ACCOUNT_BALANCE) * InpRiskPct / 100.0 / -loss;
   }
   lots = MathFloor(lots / step) * step;
   if(lots < vmin) return 0;   // the risk is too small for the minimum lot: skip rather than over-risk
   return MathMin(lots, vmax);
}

double NormPx(double p)
{
   double ts = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(ts > 0) p = MathRound(p / ts) * ts;
   return NormalizeDouble(p, _Digits);
}

//--- server time -> UTC, and UTC -> London / New York wall clock
datetime LastSunday(int year, int mon)   // last Sunday of a 31-day month, 01:00 UTC
{
   MqlDateTime d; ZeroMemory(d);
   d.year = year; d.mon = mon; d.day = 31; d.hour = 1;
   datetime t = StructToTime(d);
   MqlDateTime w; TimeToStruct(t, w);
   return t - w.day_of_week * 86400;
}
datetime NthSunday(int year, int mon, int n, int hourUtc)
{
   MqlDateTime d; ZeroMemory(d);
   d.year = year; d.mon = mon; d.day = 1; d.hour = hourUtc;
   datetime t = StructToTime(d);
   MqlDateTime w; TimeToStruct(t, w);
   return t + ((7 - w.day_of_week) % 7) * 86400 + (n - 1) * 7 * 86400;
}
bool EuSummer(datetime u) { MqlDateTime d; TimeToStruct(u, d); return u >= LastSunday(d.year, 3) && u < LastSunday(d.year, 10); }
bool UsSummer(datetime u) { MqlDateTime d; TimeToStruct(u, d); return u >= NthSunday(d.year, 3, 2, 7) && u < NthSunday(d.year, 11, 1, 6); }
datetime ServerToUtc(datetime s)
{
   datetime u = s - InpServerGmt * 3600;
   if(InpEuDst && EuSummer(u)) u -= 3600;
   return u;
}
int MinuteOfDay(datetime t) { MqlDateTime d; TimeToStruct(t, d); return d.hour * 60 + d.min; }
// Is this server time (the signal candle's close) inside the chosen session?
bool InSession(datetime server)
{
   if(InpSession == SESS_ALL) return true;
   datetime u = ServerToUtc(server);
   int lo = MinuteOfDay(u + (EuSummer(u) ? 3600 : 0));
   int ny = MinuteOfDay(u - (UsSummer(u) ? 4 : 5) * 3600);
   bool inL = lo >= 480 && lo <= 990, inN = ny >= 480 && ny <= 1020;
   return (InpSession == SESS_LONDON && inL) || (InpSession == SESS_NY && inN) || (InpSession == SESS_BOTH && (inL || inN));
}

// The chart in "side space": s = +1 as drawn, s = -1 turned upside down, so one
// set of long rules covers shorts (same trick as the backtest).
double Hs(int i, int s) { return s > 0 ? H[i] : -L[i]; }
double Ls(int i, int s) { return s > 0 ? L[i] : -H[i]; }

// EMA seeded on the first close, like the backtest.
void Ema(const double &x[], int n, int len, double &out[])
{
   ArrayResize(out, n);
   double k = 2.0 / (len + 1);
   for(int i = 0; i < n; i++) out[i] = i == 0 ? x[0] : (x[i] - out[i - 1]) * k + out[i - 1];
}

// Checks the closed candle j for side s. Returns true with the stop and target (real prices).
bool Signal(int j, int s, double &sl, double &tp)
{
   int n = ArraySize(C);
   if(j < MathMax(InpZoneLook + InpZoneSwing, InpRoomLook) + 1 || j >= n) return false;
   double F = s * EF[j], S = s * ES[j], Cj = s * C[j], Oj = s * O[j];
   if(!(F > S)) return false;                                   // 1 trend
   if(!(Cj > F && Cj > S)) return false;                        // 2 beyond both averages
   double body = Cj - Oj, rng = Hs(j, s) - Ls(j, s);
   if(!(body > 0 && body >= InpBody * rng)) return false;       // 2 dominance candle
   if(!(Cj > Hs(j - 1, s))) return false;                       // 3 cross entry
   if(!(Ls(j, s) <= F || Ls(j - 1, s) <= s * EF[j - 1])) return false; // 4 retest of the 8 EMA
   double st = DBL_MAX;
   for(int i = j - InpStopLook + 1; i <= j; i++) st = MathMin(st, Ls(i, s));
   double entry = Cj, risk = entry - st;
   if(!(risk > 0)) return false;
   double tgt = entry + InpRR * risk;
   if(InpRoom)                                                  // 6 room to the next high
   {
      double res = -DBL_MAX;
      for(int i = j - InpRoomLook; i < j; i++) res = MathMax(res, Hs(i, s));
      if(res > entry && res < tgt) return false;
   }
   if(InpZones)                                                 // 7 no swing zone in the way
   {
      for(int i = MathMax(InpZoneSwing, j - InpZoneLook); i <= j - InpZoneSwing - 1; i++)
      {
         bool sh = true, slw = true;
         for(int q = 1; q <= InpZoneSwing; q++)
         {
            if(!(Hs(i, s) > Hs(i - q, s) && Hs(i, s) >= Hs(i + q, s))) sh = false;
            if(!(Ls(i, s) < Ls(i - q, s) && Ls(i, s) <= Ls(i + q, s))) slw = false;
         }
         double lim = tgt + InpZoneBuf * risk;
         if(sh && Hs(i, s) > entry && Hs(i, s) < lim) return false;
         if(slw && Ls(i, s) > entry && Ls(i, s) < lim) return false;
      }
   }
   sl = s * st; tp = s * tgt;
   return true;
}

void Compute()
{
   MqlRates r[];
   ArraySetAsSeries(r, false);
   int got = CopyRates(_Symbol, PERIOD_H1, 1, BARS, r);      // closed candles only, oldest first
   if(got < InpZoneLook + 50) return;
   g_lastH1 = iTime(_Symbol, PERIOD_H1, 0);
   ArrayResize(O, got); ArrayResize(H, got); ArrayResize(L, got); ArrayResize(C, got); ArrayResize(T, got);
   for(int i = 0; i < got; i++) { O[i] = r[i].open; H[i] = r[i].high; L[i] = r[i].low; C[i] = r[i].close; T[i] = r[i].time; }
   Ema(C, got, InpFast, EF);
   Ema(C, got, InpSlow, ES);
   int j = got - 1;
   if(T[j] <= g_lastTraded) return;
   bool first = g_lastTraded == 0;
   g_lastTraded = T[j];
   if(first) return;                                          // never trade a candle from before the EA started
   if(!InSession(T[j] + 3600)) return;                        // the signal candle closes outside the session
   for(int s = 1; s >= -1; s -= 2)
   {
      if(s > 0 && !InpLong) continue;
      if(s < 0 && !InpShort) continue;
      double sl, tp;
      if(!Signal(j, s, sl, tp)) continue;
      bool isLong = s > 0;
      string side = isLong ? "BUY" : "SELL";
      if(HasPosition()) { Log(side + " signal skipped: a trade is still open"); return; }
      double px = isLong ? SymbolInfoDouble(_Symbol, SYMBOL_ASK) : SymbolInfoDouble(_Symbol, SYMBOL_BID);
      if(isLong ? (px <= sl || (!InpTrail && px >= tp)) : (px >= sl || (!InpTrail && px <= tp)))
      { Log(StringFormat("%s signal skipped: price %s already past the stop %s or target %s", side, Px(px), Px(sl), Px(tp))); return; }
      double lots = Lots(isLong, px, sl);
      if(lots <= 0) { Log(side + " signal skipped: lot size below the minimum"); return; }
      g_entry = C[j]; g_risk = MathAbs(C[j] - sl);
      sl = NormPx(sl); tp = InpTrail ? 0 : NormPx(tp);
      bool ok = isLong ? trade.Buy(lots, _Symbol, 0, sl, tp, EA_NAME) : trade.Sell(lots, _Symbol, 0, sl, tp, EA_NAME);
      if(ok) { g_ticket = trade.ResultOrder(); Log(StringFormat("%s %.2f lots at %s, stop %s, target %s (signal candle %s)", side, lots, Px(trade.ResultPrice()), Px(sl), InpTrail ? "trailing" : Px(tp), TimeToString(T[j]))); }
      else Log(side + " rejected: " + trade.ResultRetcodeDescription());
      return;
   }
}

int OnInit()
{
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetTypeFillingBySymbol(_Symbol);
   trade.SetDeviationInPoints(50);
   return INIT_SUCCEEDED;
}

// Stepped trail, like the backtest: once price has reached k R (k >= 3) from the
// signal's entry, the stop goes to (k - 1) R. It only ever moves forward.
void Trail()
{
   if(!InpTrail || g_risk <= 0) return;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0 || PositionGetString(POSITION_SYMBOL) != _Symbol || PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      bool isLong = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY;
      double px = isLong ? SymbolInfoDouble(_Symbol, SYMBOL_BID) : SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      double cur = PositionGetDouble(POSITION_SL);
      int k = (int)MathFloor((isLong ? px - g_entry : g_entry - px) / g_risk);
      if(k < InpRR) continue;
      double ns = NormPx(isLong ? g_entry + (k - 1) * g_risk : g_entry - (k - 1) * g_risk);
      if(isLong ? ns > cur + _Point / 2 : (cur == 0 || ns < cur - _Point / 2))
      {
         if(trade.PositionModify(tk, ns, 0)) Log(StringFormat("trail: price at %dR, stop to %dR (%s)", k, k - 1, Px(ns)));
         else Log("trail rejected: " + trade.ResultRetcodeDescription());
      }
   }
}

void OnTick()
{
   Trail();
   datetime h1 = iTime(_Symbol, PERIOD_H1, 0);
   if(h1 != 0 && h1 != g_lastH1) Compute();   // once per new H1 bar
}
//+------------------------------------------------------------------+
