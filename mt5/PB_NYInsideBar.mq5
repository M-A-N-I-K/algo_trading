//+------------------------------------------------------------------+
//| PB_NYInsideBar.mq5                                               |
//| Playbook setup: NY Inside Bar, NAS100 and S&P 500, 15m           |
//|                                                                  |
//| Port of src/strategies/nyInsideBarStrategy.ts with its defaults, |
//| run on closed M15 bars with New York time (daylight saving       |
//| included). It tracks its own trades like the app, so the marks   |
//| are the trades the backtest takes.                               |
//|                                                                  |
//| 1 Bias  : the 09:30 and 09:45 New York candles. Last close above |
//|           the first open = buys only today, below = sells only.  |
//| 2 Inside: after 10:00, a candle whose BODY sits inside the       |
//|           previous candle's body (touching counts).              |
//| 3 Order : buy stop at its high (sell stop at its low) for the    |
//|           next 3 candles. Cancelled if price reaches the other   |
//|           side first, or replaced by a newer inside candle; a    |
//|           candle reaching both sides fills. None from 15:00.     |
//| 4 Trade : stop beyond both candles (lower low / higher high),    |
//|           target 1 x risk. A candle reaching both = the stop.    |
//|           Max 2 trades a day, one at a time, closed at the 16:00 |
//|           open.                                                  |
//| This indicator never places trades.                              |
//+------------------------------------------------------------------+
#property copyright "Playbook"
#property version   "1.00"
#property description "NY Inside Bar (Playbook NAS100 / S&P 500 15m). Marks the bias, inside candles, stop orders, fills and exits."
#property indicator_chart_window
#property indicator_plots 0

input group "Rules (keep defaults to match the backtest)"
input int    InpOpenH      = 9;    // Opening range start: hour (New York)
input int    InpOpenM      = 30;   // Opening range start: minute
input int    InpRangeMin   = 30;   // Opening range length (minutes)
input int    InpLastH      = 15;   // No fills on candles starting at or after: hour (New York)
input int    InpFlatH      = 16;   // Close everything at: hour (New York)
input int    InpWaitBars   = 3;    // Order lives for (candles)
input double InpTargetR    = 1.0;  // Target (x risk)
input int    InpMaxTrades  = 2;    // Max trades a day
input group "Clock"
input int    InpServerGmt  = 2;    // Server UTC offset in winter (hours)
input bool   InpEuDst      = true; // Server adds 1h for EU summer time (late Mar to late Oct)
input int    InpBars       = 60000; // M15 bars of history to load
input group "Show"
input int    InpDrawDays   = 30;   // Draw marks for the last N New York days
input double InpCostPct    = 0.0031; // Cost per side for the results (% of price). NAS100 0.0031, S&P 500 0.0037
input color  InpLongColor  = clrMediumSeaGreen;
input color  InpShortColor = clrTomato;
input color  InpBiasColor  = clrSlateBlue;
input group "Alerts"
input bool   InpAlert      = true;  // Pop-up alerts (bias, order to place, fill, exit)
input bool   InpPush       = false; // Push notification to the MT5 phone app

const string PFX = "PBNYIB_";
const int    BAR = 900;   // M15

MqlRates R[];
long     NY[];           // New York wall-clock time of each bar's open, as seconds
datetime g_lastBar = 0;
datetime g_lastAlert = 0;
bool     g_primed = false;
string   g_events = "";  // alerts for the last closed bar

//--- server time -> UTC (EU rule: last Sunday of March / October, 01:00 UTC)
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
//--- UTC -> New York (US rule: second Sunday of March 07:00 UTC to first Sunday of November 06:00 UTC)
datetime NthSunday(int year, int mon, int nth, int hourUtc)
{
   MqlDateTime d; ZeroMemory(d);
   d.year = year; d.mon = mon; d.day = 1; d.hour = hourUtc;
   datetime t = StructToTime(d);
   MqlDateTime w; TimeToStruct(t, w);
   return t + ((7 - w.day_of_week) % 7) * 86400 + (nth - 1) * 7 * 86400;
}
long UtcToNy(datetime u)
{
   MqlDateTime d; TimeToStruct(u, d);
   bool dst = u >= NthSunday(d.year, 3, 2, 7) && u < NthSunday(d.year, 11, 1, 6);
   return (long)u - (dst ? 4 : 5) * 3600;
}

string Px(double v) { return DoubleToString(v, _Digits); }
string HhMm(int h, int m) { return StringFormat("%02d:%02d", h, m); }

void Notify(string msg)
{
   if(InpAlert) Alert(msg);
   if(InpPush) SendNotification(msg);
}

void Text(string id, int t, double price, string txt, color col, bool below, int size = 8)
{
   ObjectCreate(0, id, OBJ_TEXT, 0, R[t].time, price);
   ObjectSetString(0, id, OBJPROP_TEXT, txt);
   ObjectSetInteger(0, id, OBJPROP_COLOR, col);
   ObjectSetInteger(0, id, OBJPROP_FONTSIZE, size);
   ObjectSetInteger(0, id, OBJPROP_ANCHOR, below ? ANCHOR_UPPER : ANCHOR_LOWER);
   ObjectSetInteger(0, id, OBJPROP_SELECTABLE, false);
}
void Seg(string id, int t1, int t2, double price, color col, ENUM_LINE_STYLE st, int width)
{
   ObjectCreate(0, id, OBJ_TREND, 0, R[t1].time, price, R[t1].time + (t2 - t1) * BAR, price);
   ObjectSetInteger(0, id, OBJPROP_COLOR, col);
   ObjectSetInteger(0, id, OBJPROP_STYLE, st);
   ObjectSetInteger(0, id, OBJPROP_WIDTH, width);
   ObjectSetInteger(0, id, OBJPROP_RAY_RIGHT, false);
   ObjectSetInteger(0, id, OBJPROP_SELECTABLE, false);
}

// End a pending order's three lines at candle t
void CutLines(int si, int t)
{
   string oid = PFX + IntegerToString((long)R[si].time);
   string sfx[3] = {"_ot", "_os", "_og"};
   for(int i = 0; i < 3; i++)
      if(ObjectFind(0, oid + sfx[i]) >= 0) ObjectSetInteger(0, oid + sfx[i], OBJPROP_TIME, 1, R[t].time);
}

// Results in R
int    s_n = 0, s_wins = 0;
double s_won = 0, s_lost = 0, s_net = 0, s_peak = 0, s_dd = 0;

double Book(double entry, double stop, int dir, double exitPx)
{
   double r = ((exitPx - entry) * dir - 2 * InpCostPct / 100 * entry) / ((entry - stop) * dir);
   s_n++; s_net += r;
   if(r > 0) { s_wins++; s_won += r; } else s_lost -= r;
   s_peak = MathMax(s_peak, s_net);
   s_dd = MathMax(s_dd, s_peak - s_net);
   return r;
}

void Compute()
{
   int got = CopyRates(_Symbol, PERIOD_M15, 0, InpBars, R);
   if(got < 3) return;
   int n = got - 1;                          // R[got-1] is the forming bar
   g_lastBar = R[got-1].time;
   ArrayResize(NY, n);
   for(int i = 0; i < n; i++) NY[i] = UtcToNy(ServerToUtc(R[i].time));
   ObjectsDeleteAll(0, PFX);
   s_n = 0; s_wins = 0; s_won = 0; s_lost = 0; s_net = 0; s_peak = 0; s_dd = 0;
   g_events = "";

   const long DAY = 86400;
   long openSec = InpOpenH * 3600 + InpOpenM * 60;
   long drawFrom = NY[n-1] / DAY - InpDrawDays;
   int  needBars = MathMax(1, InpRangeMin * 60 / BAR - 1);

   long day = -1, tOpen = 0, rangeEnd = 0, lastEntry = 0, flat = 0;
   double rangeOpen = 0, rangeClose = 0;
   int rangeBars = 0, bias = 0, taken = 0, lastExit = -1;
   // the pending order
   int sIdx = -1; double sTrig = 0, sCancel = 0, sStop = 0, sTgt = 0;
   // the open trade
   int tFill = -1, tDir = 0; double tEntry = 0, tStop = 0, tTgt = 0; long tFlat = 0;

   for(int t = 0; t < n; t++)
   {
      bool draw = NY[t] / DAY >= drawFrom;
      bool last = t == n - 1;
      string id = PFX + IntegerToString((long)R[t].time);
      long d0 = NY[t] / DAY;
      if(d0 != day)
      {
         day = d0;
         tOpen = day * DAY + openSec;
         rangeEnd = tOpen + InpRangeMin * 60;
         lastEntry = day * DAY + InpLastH * 3600;
         flat = day * DAY + InpFlatH * 3600;
         rangeBars = 0; bias = 0; taken = 0;
         sIdx = -1;
      }
      // 1. Opening range and bias
      if(NY[t] >= tOpen && NY[t] < rangeEnd)
      {
         if(rangeBars == 0) rangeOpen = R[t].open;
         rangeClose = R[t].close;
         rangeBars++;
         if(NY[t] + BAR >= rangeEnd)
         {
            bias = rangeBars >= needBars ? (rangeClose > rangeOpen ? 1 : rangeClose < rangeOpen ? -1 : 0) : 0;
            string b = bias > 0 ? "UP, buys only today" : bias < 0 ? "DOWN, sells only today" : "flat, no trade today";
            if(draw) Text(id + "_bias", t, bias >= 0 ? R[t].low : R[t].high, "1 Opening range " + b, InpBiasColor, bias >= 0, 8);
            if(last) g_events += _Symbol + " NY Inside Bar: opening range " + b + "\n";
         }
      }

      // An open trade: the time exit at the open, then stop, then target
      if(tDir != 0)
      {
         double ex = 0; string why = "";
         if(t > tFill && NY[t] >= tFlat) { ex = R[t].open; why = HhMm(InpFlatH, 0); }
         else if(tDir > 0 ? R[t].low <= tStop : R[t].high >= tStop) { ex = tStop; why = "SL"; }
         else if(tDir > 0 ? R[t].high >= tTgt : R[t].low <= tTgt) { ex = tTgt; why = "TP"; }
         if(why != "")
         {
            double r = Book(tEntry, tStop, tDir, ex);
            if(draw) Text(id + "_x", t, tDir > 0 ? R[t].high : R[t].low, StringFormat("%s %+.2fR", why, r), r > 0 ? InpLongColor : InpShortColor, tDir < 0);
            if(last) g_events += StringFormat("%s NY Inside Bar: trade closed at %s (%s), %+.2fR\n", _Symbol, Px(ex), why, r);
            lastExit = t; tDir = 0;
         }
         continue;
      }

      // 3. The live order: fill, cancel or keep
      if(sIdx >= 0 && t > sIdx)
      {
         bool hit = bias > 0 ? R[t].high >= sTrig : R[t].low <= sTrig;
         bool other = bias > 0 ? R[t].low <= sCancel : R[t].high >= sCancel;
         bool openPast = bias > 0 ? R[t].open <= sCancel : R[t].open >= sCancel;
         string why = "";
         if(hit && !openPast)   // a candle reaching both sides fills, as a real stop order would
         {
            double entry = bias > 0 ? MathMax(R[t].open, sTrig) : MathMin(R[t].open, sTrig);
            int si = sIdx;
            sIdx = -1;
            if(bias > 0 ? entry < sTgt : entry > sTgt)
            {
               taken++;
               tDir = bias; tFill = t; tEntry = entry; tStop = sStop; tTgt = sTgt; tFlat = flat;
               if(draw)
               {
                  CutLines(si, t);
                  ObjectCreate(0, id + "_f", bias > 0 ? OBJ_ARROW_BUY : OBJ_ARROW_SELL, 0, R[t].time, entry);
                  ObjectSetInteger(0, id + "_f", OBJPROP_COLOR, bias > 0 ? InpLongColor : InpShortColor);
                  ObjectSetInteger(0, id + "_f", OBJPROP_WIDTH, 2);
                  Text(id + "_ft", t, bias > 0 ? R[t].low : R[t].high, (bias > 0 ? "BUY " : "SELL ") + Px(entry), bias > 0 ? InpLongColor : InpShortColor, bias > 0);
               }
               if(last) g_events += StringFormat("%s NY Inside Bar: %s filled at %s SL %s TP %s\n", _Symbol, bias > 0 ? "BUY" : "SELL", Px(entry), Px(tStop), Px(tTgt));
               // The fill candle itself can reach the stop or the target
               double ex = 0; string w = "";
               if(bias > 0 ? R[t].low <= tStop : R[t].high >= tStop) { ex = tStop; w = "SL"; }
               else if(bias > 0 ? R[t].high >= tTgt : R[t].low <= tTgt) { ex = tTgt; w = "TP"; }
               if(w != "")
               {
                  double r = Book(tEntry, tStop, tDir, ex);
                  if(draw) Text(id + "_x", t, tDir > 0 ? R[t].high : R[t].low, StringFormat("%s %+.2fR", w, r), r > 0 ? InpLongColor : InpShortColor, tDir < 0);
                  if(last) g_events += StringFormat("%s NY Inside Bar: trade closed at %s (%s), %+.2fR\n", _Symbol, Px(ex), w, r);
                  lastExit = t; tDir = 0;
               }
               continue;
            }
            if(draw) CutLines(si, t);
            why = "gapped past the target";
         }
         else if(other) why = hit ? "opened past the other side" : "other side reached first";
         else if(t - sIdx >= InpWaitBars) why = "not triggered";
         if(why != "")
         {
            if(sIdx >= 0 && draw) CutLines(sIdx, t);
            sIdx = -1;
            if(draw) Text(id + "_c", t, bias > 0 ? R[t].low : R[t].high, "x " + why, clrGray, bias > 0, 7);
         }
      }

      // 2. A new inside candle (after the opening range and before the cutoff, on a day with a bias, after the last trade ended)
      if(t > 0 && bias != 0 && NY[t] >= rangeEnd && NY[t] + BAR < lastEntry && t > lastExit && taken < InpMaxTrades &&
         MathMin(R[t].open, R[t].close) >= MathMin(R[t-1].open, R[t-1].close) &&
         MathMax(R[t].open, R[t].close) <= MathMax(R[t-1].open, R[t-1].close))
      {
         double trig = bias > 0 ? R[t].high : R[t].low;
         double stp = bias > 0 ? MathMin(R[t-1].low, R[t].low) : MathMax(R[t-1].high, R[t].high);
         double risk = (trig - stp) * bias;
         if(risk > 0)
         {
            if(sIdx >= 0 && draw) CutLines(sIdx, t);
            if(sIdx >= 0 && draw) Text(id + "_c", t, bias > 0 ? R[t].low : R[t].high, "x replaced", clrGray, bias > 0, 7);
            sIdx = t; sTrig = trig; sCancel = bias > 0 ? R[t].low : R[t].high; sStop = stp; sTgt = trig + bias * InpTargetR * risk;
            if(draw)
            {
               int end = t + 1 + InpWaitBars;
               Seg(id + "_ot", t, end, sTrig, clrSilver, STYLE_DASH, 1);
               Seg(id + "_os", t, end, sStop, InpShortColor, STYLE_SOLID, 2);
               Seg(id + "_og", t, end, sTgt, InpLongColor, STYLE_SOLID, 2);
               Text(id + "_i", t, bias > 0 ? R[t].low : R[t].high, "2 Inside", bias > 0 ? InpLongColor : InpShortColor, bias > 0, 7);
            }
         }
      }

      // The order stays live for the next candle only if that candle starts before the cutoff
      if(sIdx >= 0 && NY[t] + BAR >= lastEntry)
      {
         if(draw) CutLines(sIdx, t);
         sIdx = -1;
         if(draw) Text(id + "_c", t, bias > 0 ? R[t].low : R[t].high, "x no fills after " + HhMm(InpLastH, 0), clrGray, bias > 0, 7);
      }
      else if(sIdx == t && last)
         g_events += StringFormat("%s NY Inside Bar: place a %s %s SL %s TP %s. Cancel it if price reaches %s first, or after %d candles.\n",
                     _Symbol, bias > 0 ? "BUY STOP" : "SELL STOP", Px(sTrig), Px(sStop), Px(sTgt), Px(sCancel), InpWaitBars);
   }

   // Alerts: only for candles that closed after the indicator was loaded
   if(!g_primed) { g_lastAlert = R[n-1].time; g_primed = true; }
   else if(R[n-1].time > g_lastAlert)
   {
      g_lastAlert = R[n-1].time;
      string parts[];
      int k = StringSplit(g_events, '\n', parts);
      for(int i = 0; i < k; i++) if(parts[i] != "") Notify(parts[i]);
   }

   // Status
   long nyNow = NY[n-1] + BAR;  // the forming candle's open
   string side = bias > 0 ? "opening range UP: buys only" : bias < 0 ? "opening range DOWN: sells only"
                 : (nyNow < rangeEnd ? "waiting for the opening range (" + HhMm(InpOpenH, InpOpenM) + " New York)" : "flat opening range: no trade today");
   string now;
   if(tDir != 0) now = StringFormat("in a %s from %s, SL %s, TP %s, out at %s", tDir > 0 ? "buy" : "sell", Px(tEntry), Px(tStop), Px(tTgt), HhMm(InpFlatH, 0));
   else if(sIdx >= 0) now = StringFormat("%s %s, SL %s, TP %s. Cancel at %s. %d candle(s) left", bias > 0 ? "buy stop" : "sell stop", Px(sTrig), Px(sStop), Px(sTgt), Px(sCancel), InpWaitBars - (n - 1 - sIdx));
   else if(bias != 0 && taken >= InpMaxTrades) now = StringFormat("done: %d trades taken today", InpMaxTrades);
   else if(bias != 0 && nyNow < lastEntry) now = "watching each 15-minute close for an inside candle (body inside the previous body)";
   else if(bias != 0) now = "no new orders after " + HhMm(InpLastH, 0) + " New York time";
   else now = "-";
   MqlDateTime ny; TimeToStruct((datetime)NY[n-1], ny);
   Comment(StringFormat("NY Inside Bar  |  last closed candle %02d:%02d New York\nToday: %s\nNow: %s\nHistory: %d trades, %s won, profit factor %s, %+.1fR after costs, worst drawdown %.1fR",
           ny.hour, ny.min, side, now, s_n, s_n > 0 ? DoubleToString(100.0 * s_wins / s_n, 1) + "%" : "-",
           s_lost > 0 ? DoubleToString(s_won / s_lost, 2) : "-", s_net, s_dd));
}

int OnInit()
{
   IndicatorSetString(INDICATOR_SHORTNAME, "PB NY Inside Bar");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   ObjectsDeleteAll(0, PFX);
   Comment("");
}

int OnCalculate(const int rates_total, const int prev_calculated, const datetime &time[], const double &open[],
                const double &high[], const double &low[], const double &close[], const long &tick_volume[],
                const long &volume[], const int &spread[])
{
   datetime b = iTime(_Symbol, PERIOD_M15, 0);
   if(b != 0 && b != g_lastBar) Compute();   // once per new M15 bar
   return rates_total;
}
//+------------------------------------------------------------------+
