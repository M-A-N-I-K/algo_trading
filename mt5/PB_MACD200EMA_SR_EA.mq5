//+------------------------------------------------------------------+
//| PB_MACD200EMA_SR_EA.mq5                                        |
//| Playbook setup: NAS100 MACD + 200 EMA + Support/Resistance, 4h |
//|                                                                |
//| Line-by-line port of src/strategies/macd200EmaSrStrategy.ts with |
//| its defaults, run on 4h candles built from H1 bars on the UTC  |
//| clock (00:00, 04:00 ... UTC), exactly like the app's scanner.  |
//|                                                                |
//| BUY : close above the 200 EMA, a candle low touched a live swing |
//|       low (support) within the last 10 candles, MACD(12,26,9)  |
//|       crosses up through its signal with both lines below zero.  |
//|       Stop = 200 EMA, target = entry + 2 x risk (the Playbook's target; the strategy's own is 1.5).               |
//| SELL: the mirror image.                                        |
//| Signals use closed candles only. The backtest enters at the open |
//| of the next 4h candle.                                         |
//|                                                                |
//| Strategy Tester EA: the indicator's rules unchanged, plus a    |
//| market order at the next candle's open on each signal, with    |
//| the signal's stop and target. One trade at a time; a signal    |
//| while a trade is open is skipped, as in the app's backtest.    |
//+------------------------------------------------------------------+
#property copyright "Playbook"
#property version   "1.00"
#property description "Strategy Tester EA. MACD + 200 EMA + S/R (Playbook NAS100 4h). Marks entry, stop and target."
#include <Trade/Trade.mqh>

enum ENUM_GRID { GRID_UTC = 0,    // UTC clock (matches the app's backtest)
                 GRID_SERVER = 1  // Broker server clock (MT5's own H4 candles)
               };

input group "Rules (keep defaults to match the backtest)"
input int    InpEmaLen     = 200;  // Trend EMA
input int    InpFast       = 12;   // MACD fast
input int    InpSlow       = 26;   // MACD slow
input int    InpSignal     = 9;    // MACD signal
input int    InpSwing      = 5;    // Swing lookback (candles each side)
input int    InpTrigWin    = 10;   // Candles allowed between touch and crossover
input double InpRR         = 2.0;  // Target (x risk; Playbook 2R, the strategy's own 1.5R)
input group "Candles"
input ENUM_GRID InpGrid    = GRID_UTC; // 4h candle grid
input int    InpServerGmt  = 2;    // Server UTC offset in winter (hours)
input bool   InpEuDst      = true; // Server adds 1h for EU summer time (late Mar to late Oct)
input int    InpH1Bars     = 12000; // H1 bars of history to read each hour (more = slower tester)
input group "Show"
input bool   InpLong       = true; // Long signals
input bool   InpShort      = true; // Short signals
input bool   InpShowEma    = true; // Draw the 4h 200 EMA
input int    InpEmaCandles = 400;  // ...for the last N 4h candles
input int    InpLineCandles= 6;    // Entry / stop / target line length (4h candles)
input color  InpLongColor  = clrMediumSeaGreen;
input color  InpShortColor = clrTomato;
input color  InpEmaColor   = clrOrange;
input group "Alerts"
input bool   InpAlert      = false;  // Pop-up alert on a new signal
input bool   InpPush       = false; // Push notification to the MT5 phone app
input bool   InpTouchAlert = false; // Also alert when support / resistance is touched
input group "Size"
input double InpRiskPct    = 1.0;  // Risk per trade (% of balance; 0 = use fixed lots)
input double InpFixedLots  = 0.10; // Fixed lots (when risk % is 0)
input group "Other"
input long   InpMagic      = 260916; // Magic number
input bool   InpLog        = true;   // Write each trade to the journal
input bool   InpDrawTester = false;  // Draw marks in the tester's non-visual mode (slow)

const string PFX = "PBMACD_";
const int    H4S = 4 * 3600;

double   O[], Hh[], Ll[], C[];
datetime T[];          // server time of each candle's first H1 bar
datetime g_lastH1 = 0;
datetime g_lastAlert = 0;
bool     g_primed = false;

//--- server time -> UTC, EU daylight-saving rule (last Sunday of March / October, 01:00 UTC)
datetime LastSunday(int year, int mon)
{
   MqlDateTime d; ZeroMemory(d);
   d.year = year; d.mon = mon; d.day = 31; d.hour = 1;
   datetime t = StructToTime(d);
   MqlDateTime w; TimeToStruct(t, w);
   return t - w.day_of_week * 86400;
}
datetime ServerToUtc(datetime s)
{
   datetime u = s - InpServerGmt * 3600;
   if(InpEuDst)
   {
      MqlDateTime d; TimeToStruct(u, d);
      if(u >= LastSunday(d.year, 3) && u < LastSunday(d.year, 10)) u -= 3600;
   }
   return u;
}

//--- 4h candles from closed H1 bars (the forming H1 bar and an unfinished last 4h candle are left out)
int BuildCandles()
{
   MqlRates r[];
   int got = CopyRates(_Symbol, PERIOD_H1, 0, InpH1Bars, r);
   if(got < 3) return -1;
   int n = 0;
   long cur = -1;
   long lastEnd = 0;
   ArrayResize(O, 0, got / 4 + 8); ArrayResize(Hh, 0, got / 4 + 8); ArrayResize(Ll, 0, got / 4 + 8);
   ArrayResize(C, 0, got / 4 + 8); ArrayResize(T, 0, got / 4 + 8);
   for(int i = 0; i < got - 1; i++)          // r[got-1] is the forming H1 bar
   {
      long key = (long)(InpGrid == GRID_UTC ? ServerToUtc(r[i].time) : r[i].time);
      long b = key / H4S;
      if(b != cur)
      {
         n++;
         ArrayResize(O, n, 1024); ArrayResize(Hh, n, 1024); ArrayResize(Ll, n, 1024);
         ArrayResize(C, n, 1024); ArrayResize(T, n, 1024);
         O[n-1] = r[i].open; Hh[n-1] = r[i].high; Ll[n-1] = r[i].low; C[n-1] = r[i].close; T[n-1] = r[i].time;
         cur = b;
      }
      else
      {
         Hh[n-1] = MathMax(Hh[n-1], r[i].high);
         Ll[n-1] = MathMin(Ll[n-1], r[i].low);
         C[n-1]  = r[i].close;
      }
      lastEnd = key + 3600;
   }
   if(n > 0 && lastEnd % H4S != 0) n--;      // last 4h candle still forming
   ArrayResize(O, n); ArrayResize(Hh, n); ArrayResize(Ll, n); ArrayResize(C, n); ArrayResize(T, n);
   return n;
}

//--- SMA-seeded EMA (src/indicators/ema.ts), EMPTY_VALUE before index len-1
void Ema(const double &v[], int from, int n, int len, double &out[])
{
   ArrayResize(out, n);
   ArrayInitialize(out, EMPTY_VALUE);
   if(n - from < len) return;
   double s = 0;
   for(int i = from; i < from + len; i++) s += v[i];
   out[from + len - 1] = s / len;
   double m = 2.0 / (len + 1);
   for(int i = from + len; i < n; i++) out[i] = (v[i] - out[i-1]) * m + out[i-1];
}

void Draw(int t, bool isLong, double entry, double sl, double tp)
{
   string id = PFX + IntegerToString((long)T[t]);
   color col = isLong ? InpLongColor : InpShortColor;
   datetime t2 = T[t] + InpLineCandles * H4S;
   PbObj(0, id + "_a", isLong ? OBJ_ARROW_BUY : OBJ_ARROW_SELL, 0, T[t], isLong ? Ll[t] : Hh[t]);
   ObjectSetInteger(0, id + "_a", OBJPROP_COLOR, col);
   ObjectSetInteger(0, id + "_a", OBJPROP_WIDTH, 2);
   ObjectSetInteger(0, id + "_a", OBJPROP_ANCHOR, isLong ? ANCHOR_TOP : ANCHOR_BOTTOM);
   string px[3] = {"_e", "_sl", "_tp"};
   double pv[3];
   pv[0] = entry; pv[1] = sl; pv[2] = tp;
   color pc[3];
   pc[0] = clrSilver; pc[1] = InpShortColor; pc[2] = InpLongColor;
   for(int i = 0; i < 3; i++)
   {
      PbObj(0, id + px[i], OBJ_TREND, 0, T[t], pv[i], t2, pv[i]);
      ObjectSetInteger(0, id + px[i], OBJPROP_COLOR, pc[i]);
      ObjectSetInteger(0, id + px[i], OBJPROP_STYLE, i == 0 ? STYLE_DASH : STYLE_SOLID);
      ObjectSetInteger(0, id + px[i], OBJPROP_WIDTH, i == 0 ? 1 : 2);
      ObjectSetInteger(0, id + px[i], OBJPROP_RAY_RIGHT, false);
      ObjectSetInteger(0, id + px[i], OBJPROP_SELECTABLE, false);
   }
   string txt = StringFormat("%s %s  SL %s  TP %s", isLong ? "BUY" : "SELL", DoubleToString(entry, _Digits),
                             DoubleToString(sl, _Digits), DoubleToString(tp, _Digits));
   PbObj(0, id + "_t", OBJ_TEXT, 0, T[t], isLong ? Ll[t] : Hh[t]);
   ObjectSetString(0, id + "_t", OBJPROP_TEXT, txt);
   ObjectSetInteger(0, id + "_t", OBJPROP_COLOR, col);
   ObjectSetInteger(0, id + "_t", OBJPROP_FONTSIZE, 8);
   ObjectSetInteger(0, id + "_t", OBJPROP_ANCHOR, isLong ? ANCHOR_LEFT_UPPER : ANCHOR_LEFT_LOWER);
}

#define EA_NAME "PB MACD200"

//--- Trading (EA only) -------------------------------------------------
CTrade   trade;
datetime g_lastTraded = 0;
bool     g_draw = true;

// Drawing is skipped in the tester's fast (non-visual) mode
bool PbObj(long c, string name, ENUM_OBJECT type, int w, datetime t1, double p1)
{ return g_draw && ObjectCreate(c, name, type, w, t1, p1); }
bool PbObj(long c, string name, ENUM_OBJECT type, int w, datetime t1, double p1, datetime t2, double p2)
{ return g_draw && ObjectCreate(c, name, type, w, t1, p1, t2, p2); }

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

// Called once per closed signal candle. Like the app's backtest: enter at the
// next candle's open (now, at market) with the signal's stop and target, one
// trade at a time, and a signal while a trade is open is ignored.
void TradeSignal(datetime candle, bool sig, bool isLong, double sl, double tp)
{
   if(candle <= g_lastTraded) return;
   bool first = g_lastTraded == 0;
   g_lastTraded = candle;
   if(first || !sig) return;                 // never trade a signal from before the EA started
   string side = isLong ? "BUY" : "SELL";
   if(HasPosition()) { Log(side + " signal skipped: a trade is still open"); return; }
   double px = isLong ? SymbolInfoDouble(_Symbol, SYMBOL_ASK) : SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(isLong ? (px <= sl || px >= tp) : (px >= sl || px <= tp))
   {
      Log(StringFormat("%s signal skipped: price %s already past the stop %s or target %s", side, Px(px), Px(sl), Px(tp)));
      return;
   }
   double lots = Lots(isLong, px, sl);
   if(lots <= 0) { Log(side + " signal skipped: lot size below the minimum"); return; }
   sl = NormPx(sl); tp = NormPx(tp);
   bool ok = isLong ? trade.Buy(lots, _Symbol, 0, sl, tp, EA_NAME) : trade.Sell(lots, _Symbol, 0, sl, tp, EA_NAME);
   if(ok) Log(StringFormat("%s %.2f lots at %s, stop %s, target %s", side, lots, Px(trade.ResultPrice()), Px(sl), Px(tp)));
   else Log(side + " rejected: " + trade.ResultRetcodeDescription());
}

void Notify(string msg)
{
   if(InpAlert) Alert(msg);
   if(InpPush) SendNotification(msg);
}

void Compute()
{
   int n = BuildCandles();
   if(n < 0) return;
   g_lastH1 = iTime(_Symbol, PERIOD_H1, 0);
   ObjectsDeleteAll(0, PFX);

   int warmup = MathMax(InpEmaLen, MathMax(InpSlow + InpSignal, InpSwing * 2)) + 5;
   if(n < warmup) { Comment("MACD 200 S/R: need ", warmup, " closed 4h candles, have ", n); return; }

   double ema[], fast[], slow[], macd[], sig[];
   Ema(C, 0, n, InpEmaLen, ema);
   Ema(C, 0, n, InpFast, fast);
   Ema(C, 0, n, InpSlow, slow);
   ArrayResize(macd, n);
   int first = -1;
   for(int i = 0; i < n; i++)
   {
      macd[i] = (fast[i] == EMPTY_VALUE || slow[i] == EMPTY_VALUE) ? EMPTY_VALUE : fast[i] - slow[i];
      if(first < 0 && macd[i] != EMPTY_VALUE) first = i;
   }
   if(first < 0) return;
   Ema(macd, first, n, InpSignal, sig);

   double sups[], ress[];
   int lastSup = -9999, lastRes = -9999;
   int k = InpSwing;
   int lastSigT = -1; bool lastSigLong = false; double lastE = 0, lastSl = 0, lastTp = 0;
   bool touchS = false, touchR = false;

   for(int t = 0; t < n; t++)
   {
      touchS = false; touchR = false;
      // 1. Levels broken by a close are gone
      int m = 0;
      for(int i = 0; i < ArraySize(sups); i++) if(C[t] >= sups[i]) sups[m++] = sups[i];
      ArrayResize(sups, m);
      m = 0;
      for(int i = 0; i < ArraySize(ress); i++) if(C[t] <= ress[i]) ress[m++] = ress[i];
      ArrayResize(ress, m);
      // 2. Swings confirmed k candles late
      if(t >= k * 2)
      {
         int ci = t - k;
         bool isL = true, isH = true;
         for(int j = t - k * 2; j <= t; j++)
         {
            if(j == ci) continue;
            if(Ll[j] <= Ll[ci]) isL = false;
            if(Hh[j] >= Hh[ci]) isH = false;
         }
         if(isL) { int s = ArraySize(sups); ArrayResize(sups, s + 1, 64); sups[s] = Ll[ci]; }
         if(isH) { int s = ArraySize(ress); ArrayResize(ress, s + 1, 64); ress[s] = Hh[ci]; }
      }
      if(t < 1 || ema[t] == EMPTY_VALUE || macd[t] == EMPTY_VALUE || sig[t] == EMPTY_VALUE ||
         macd[t-1] == EMPTY_VALUE || sig[t-1] == EMPTY_VALUE) continue;

      // 3. Touches
      bool above = C[t] > ema[t], below = C[t] < ema[t];
      if(above) for(int i = 0; i < ArraySize(sups); i++) if(Ll[t] <= sups[i]) { lastSup = t; touchS = true; break; }
      if(below) for(int i = 0; i < ArraySize(ress); i++) if(Hh[t] >= ress[i]) { lastRes = t; touchR = true; break; }
      // 4-5. Crossovers -> signals
      bool bull = macd[t-1] <= sig[t-1] && macd[t] > sig[t];
      bool bear = macd[t-1] >= sig[t-1] && macd[t] < sig[t];
      if(above && bull && t - lastSup <= InpTrigWin && macd[t] < 0 && sig[t] < 0 && C[t] > ema[t])
      {
         double tp = C[t] + InpRR * (C[t] - ema[t]);
         if(InpLong) Draw(t, true, C[t], ema[t], tp);
         if(InpLong) { lastSigT = t; lastSigLong = true; lastE = C[t]; lastSl = ema[t]; lastTp = tp; }
      }
      if(below && bear && t - lastRes <= InpTrigWin && macd[t] > 0 && sig[t] > 0 && C[t] < ema[t])
      {
         double tp = C[t] - InpRR * (ema[t] - C[t]);
         if(InpShort) Draw(t, false, C[t], ema[t], tp);
         if(InpShort) { lastSigT = t; lastSigLong = false; lastE = C[t]; lastSl = ema[t]; lastTp = tp; }
      }
   }

   // 200 EMA of the 4h candles
   if(InpShowEma)
      for(int t = MathMax(1, n - InpEmaCandles); t < n; t++)
      {
         if(ema[t-1] == EMPTY_VALUE) continue;
         string id = PFX + "ema_" + IntegerToString(t);
         PbObj(0, id, OBJ_TREND, 0, T[t-1], ema[t-1], T[t], ema[t]);
         ObjectSetInteger(0, id, OBJPROP_COLOR, InpEmaColor);
         ObjectSetInteger(0, id, OBJPROP_WIDTH, 2);
         ObjectSetInteger(0, id, OBJPROP_RAY_RIGHT, false);
         ObjectSetInteger(0, id, OBJPROP_SELECTABLE, false);
         ObjectSetInteger(0, id, OBJPROP_BACK, true);
      }

   // Alerts: only for candles that closed after the indicator was loaded
   int last = n - 1;
   TradeSignal(T[last], lastSigT == last, lastSigLong, lastSl, lastTp);
   if(!g_primed) { g_lastAlert = T[last]; g_primed = true; }
   else if(T[last] > g_lastAlert)
   {
      g_lastAlert = T[last];
      if(lastSigT == last)
         Notify(StringFormat("%s MACD 200 S/R %s %s SL %s TP %s (enter at the next 4h open)", _Symbol, lastSigLong ? "BUY" : "SELL",
                DoubleToString(lastE, _Digits), DoubleToString(lastSl, _Digits), DoubleToString(lastTp, _Digits)));
      else if(InpTouchAlert && touchS && InpLong)
         Notify(_Symbol + " MACD 200 S/R: support touched above the 200 EMA. Long if MACD crosses up below zero within " + IntegerToString(InpTrigWin) + " candles.");
      else if(InpTouchAlert && touchR && InpShort)
         Notify(_Symbol + " MACD 200 S/R: resistance touched below the 200 EMA. Short if MACD crosses down above zero within " + IntegerToString(InpTrigWin) + " candles.");
   }

   string trend = C[last] > ema[last] ? "above the 200 EMA: longs only" : "below the 200 EMA: shorts only";
   string sl = (last - lastSup <= InpTrigWin) ? StringFormat("support touched, MACD must cross up below zero within %d more candles", InpTrigWin - (last - lastSup)) : "wait for a 4h low to touch support";
   string ss = (last - lastRes <= InpTrigWin) ? StringFormat("resistance touched, MACD must cross down above zero within %d more candles", InpTrigWin - (last - lastRes)) : "wait for a 4h high to touch resistance";
   Comment(StringFormat("MACD 200 S/R  |  4h candles on the %s clock  |  last closed candle opened %s (server)\nTrend: %s   EMA %s\nLong: %s\nShort: %s",
           InpGrid == GRID_UTC ? "UTC" : "server", TimeToString(T[last], TIME_DATE | TIME_MINUTES), trend, DoubleToString(ema[last], _Digits), sl, ss));
}

int OnInit()
{
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetTypeFillingBySymbol(_Symbol);
   trade.SetDeviationInPoints(50);
   g_draw = InpDrawTester || !MQLInfoInteger(MQL_TESTER) || MQLInfoInteger(MQL_VISUAL_MODE);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   ObjectsDeleteAll(0, PFX);
   Comment("");
}

void OnTick()
{
   datetime h1 = iTime(_Symbol, PERIOD_H1, 0);
   if(h1 != 0 && h1 != g_lastH1) Compute();   // once per new H1 bar
}
//+------------------------------------------------------------------+
