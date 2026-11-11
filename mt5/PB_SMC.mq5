//+------------------------------------------------------------------+
//| PB_SMC.mq5                                                       |
//| Playbook setup: Gold Smart Money Concepts, 4h                    |
//|                                                                  |
//| Line-by-line port of src/strategies/smartMoneyConceptsStrategy.ts|
//| with its defaults, run on 4h candles built from H1 bars on the   |
//| UTC clock (00:00, 04:00 ... UTC), exactly like the app's scanner.|
//|                                                                  |
//| 1 Sweep : a low dips below the latest swing low (5 candles each  |
//|           side, known 5 candles later) and closes no more than   |
//|           0.2% below it.                                         |
//| 2 CHoCH : within 40 candles, a close above the swing high that   |
//|           was latest at the sweep.                               |
//| 3 FVG   : every bullish fair value gap in the last 7 candles.    |
//|           Lives 60 candles or until a close below its bottom.    |
//| 4 BUY   : a low reaches the gap's midpoint and the candle closes |
//|           at or above the gap bottom. Stop = min(gap bottom,     |
//|           sweep low) - 0.2%. Target = latest swing high or 3R,   |
//|           whichever is further. One trade per gap.               |
//| SELL is the mirror image. Closed candles only; the backtest      |
//| enters at the open of the next 4h candle.                        |
//+------------------------------------------------------------------+
#property copyright "Playbook"
#property version   "1.00"
#property description "Smart Money Concepts (Playbook Gold 4h). Marks sweeps, CHoCH, gaps, entry, stop and target."
#property indicator_chart_window
#property indicator_plots 0

enum ENUM_GRID { GRID_UTC = 0,    // UTC clock (matches the app's backtest)
                 GRID_SERVER = 1  // Broker server clock (MT5's own H4 candles)
               };

input group "Rules (keep defaults to match the backtest)"
input int    InpSwing      = 5;    // Swing lookback (candles each side)
input int    InpSetupLife  = 40;   // Candles allowed between sweep and CHoCH
input int    InpFvgLife    = 60;   // Gap lifetime (candles)
input double InpFixedRR    = 3.0;  // Minimum target (x risk)
input double InpMinRR      = 2.0;  // Skip trades paying less than (x risk)
input group "Candles"
input ENUM_GRID InpGrid    = GRID_UTC; // 4h candle grid
input int    InpServerGmt  = 2;    // Server UTC offset in winter (hours)
input bool   InpEuDst      = true; // Server adds 1h for EU summer time (late Mar to late Oct)
input int    InpH1Bars     = 60000; // H1 bars of history to load
input group "Show"
input bool   InpLong       = true; // Long setups
input bool   InpShort      = true; // Short setups
input bool   InpSteps      = true; // Sweeps, CHoCH and gaps (last 150 candles)
input int    InpLineCandles= 6;    // Entry / stop / target line length (4h candles)
input color  InpLongColor  = clrMediumSeaGreen;
input color  InpShortColor = clrTomato;
input group "Alerts"
input bool   InpAlert      = true;  // Pop-up alert on a new signal
input bool   InpPush       = false; // Push notification to the MT5 phone app
input bool   InpStepAlert  = true;  // Also alert on a CHoCH that leaves a gap to trade

const string PFX = "PBSMC_";
const int    CS  = 4 * 3600;        // strategy candle length (s)
const int    WARMUP = 25;           // swingLookback * 3 + 10 with the defaults

double   O[], Hh[], Ll[], C[];
datetime T[];
datetime g_lastH1 = 0;
datetime g_lastAlert = 0;
bool     g_primed = false;

struct Fvg { bool bull; double low, high, mid; int createdAt, firstIdx; double sweep; bool dead; };

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
   long cur = -1, lastEnd = 0;
   for(int i = 0; i < got - 1; i++)          // r[got-1] is the forming H1 bar
   {
      long key = (long)(InpGrid == GRID_UTC ? ServerToUtc(r[i].time) : r[i].time);
      long b = key / CS;
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
   if(n > 0 && lastEnd % CS != 0) n--;       // last 4h candle still forming
   ArrayResize(O, n); ArrayResize(Hh, n); ArrayResize(Ll, n); ArrayResize(C, n); ArrayResize(T, n);
   return n;
}

void Notify(string msg)
{
   if(InpAlert) Alert(msg);
   if(InpPush) SendNotification(msg);
}

void Line(string id, datetime t1, double p1, datetime t2, double p2, color col, int style, int width)
{
   ObjectCreate(0, id, OBJ_TREND, 0, t1, p1, t2, p2);
   ObjectSetInteger(0, id, OBJPROP_COLOR, col);
   ObjectSetInteger(0, id, OBJPROP_STYLE, style);
   ObjectSetInteger(0, id, OBJPROP_WIDTH, width);
   ObjectSetInteger(0, id, OBJPROP_RAY_RIGHT, false);
   ObjectSetInteger(0, id, OBJPROP_SELECTABLE, false);
}

void Text(string id, datetime t, double p, string txt, color col, bool below)
{
   ObjectCreate(0, id, OBJ_TEXT, 0, t, p);
   ObjectSetString(0, id, OBJPROP_TEXT, txt);
   ObjectSetInteger(0, id, OBJPROP_COLOR, col);
   ObjectSetInteger(0, id, OBJPROP_FONTSIZE, 8);
   ObjectSetInteger(0, id, OBJPROP_ANCHOR, below ? ANCHOR_LEFT_UPPER : ANCHOR_LEFT_LOWER);
   ObjectSetInteger(0, id, OBJPROP_SELECTABLE, false);
}

void DrawTrade(int t, bool isLong, double entry, double sl, double tp)
{
   string id = PFX + IntegerToString((long)T[t]);
   color col = isLong ? InpLongColor : InpShortColor;
   datetime t2 = T[t] + InpLineCandles * CS;
   ObjectCreate(0, id + "_a", isLong ? OBJ_ARROW_BUY : OBJ_ARROW_SELL, 0, T[t], isLong ? Ll[t] : Hh[t]);
   ObjectSetInteger(0, id + "_a", OBJPROP_COLOR, col);
   ObjectSetInteger(0, id + "_a", OBJPROP_WIDTH, 2);
   ObjectSetInteger(0, id + "_a", OBJPROP_ANCHOR, isLong ? ANCHOR_TOP : ANCHOR_BOTTOM);
   Line(id + "_e", T[t], entry, t2, entry, clrSilver, STYLE_DASH, 1);
   Line(id + "_sl", T[t], sl, t2, sl, InpShortColor, STYLE_SOLID, 2);
   Line(id + "_tp", T[t], tp, t2, tp, InpLongColor, STYLE_SOLID, 2);
   Text(id + "_t", T[t], isLong ? Ll[t] : Hh[t], StringFormat("%s %s  SL %s  TP %s  %.1fR", isLong ? "BUY" : "SELL",
        DoubleToString(entry, _Digits), DoubleToString(sl, _Digits), DoubleToString(tp, _Digits), MathAbs(tp - entry) / MathAbs(entry - sl)), col, isLong);
}

// getNearestSwingHigh / Low: the latest swing at or before t-k, else this candle's extreme
double NearestHigh(const bool &sw[], int t)
{
   for(int i = t - InpSwing; i >= 0; i--) if(sw[i]) return Hh[i];
   return Hh[t];
}
double NearestLow(const bool &sw[], int t)
{
   for(int i = t - InpSwing; i >= 0; i--) if(sw[i]) return Ll[i];
   return Ll[t];
}

void Compute()
{
   int n = BuildCandles();
   if(n < 0) return;
   g_lastH1 = iTime(_Symbol, PERIOD_H1, 0);
   ObjectsDeleteAll(0, PFX);
   if(n < WARMUP) { Comment("SMC: need ", WARMUP, " closed 4h candles, have ", n); return; }

   int k = InpSwing;
   bool swH[], swL[];
   ArrayResize(swH, n); ArrayResize(swL, n);
   ArrayInitialize(swH, false); ArrayInitialize(swL, false);
   for(int i = k; i < n - k; i++)
   {
      bool h = true, l = true;
      for(int j = i - k; j <= i + k; j++)
      {
         if(j == i) continue;
         if(Hh[j] >= Hh[i]) h = false;
         if(Ll[j] <= Ll[i]) l = false;
      }
      swH[i] = h; swL[i] = l;
   }

   bool haveSup = false, haveRes = false;
   double sup = 0, res = 0;
   bool bullOn = false, bearOn = false;
   double bullSweep = 0, bullLevel = 0, bearSweep = 0, bearLevel = 0;
   int bullAt = -1, bearAt = -1;
   Fvg fv[];
   int nf = 0;
   int steps0 = n - 150;                       // draw steps for the most recent candles only
   int last = n - 1;
   int sigT = -1; bool sigLong = false; double sE = 0, sSl = 0, sTp = 0;
   int chochT = -1; bool chochLong = false; int chochGaps = 0;

   for(int t = 0; t < n; t++)
   {
      int rv = t - k;
      if(rv >= 0)
      {
         if(swL[rv]) { sup = Ll[rv]; haveSup = true; }
         if(swH[rv]) { res = Hh[rv]; haveRes = true; }
      }
      if(t < WARMUP) continue;

      // 2. Sweeps
      if(haveSup && Ll[t] < sup && C[t] > sup * 0.998)
      {
         bullOn = true; bullSweep = Ll[t]; bullLevel = NearestHigh(swH, t); bullAt = t;
         if(InpSteps && InpLong && t >= steps0) Text(PFX + "sw_" + IntegerToString(t) + "L", T[t], Ll[t], "1 Sweep", clrDodgerBlue, true);
      }
      if(haveRes && Hh[t] > res && C[t] < res * 1.002)
      {
         bearOn = true; bearSweep = Hh[t]; bearLevel = NearestLow(swL, t); bearAt = t;
         if(InpSteps && InpShort && t >= steps0) Text(PFX + "sw_" + IntegerToString(t) + "S", T[t], Hh[t], "1 Sweep", clrDodgerBlue, false);
      }
      if(bullOn && t - bullAt > InpSetupLife) bullOn = false;
      if(bearOn && t - bearAt > InpSetupLife) bearOn = false;

      // 3. CHoCH -> gaps of the last 7 candles
      if(bullOn && C[t] > bullLevel)
      {
         int found = 0;
         for(int j = MathMax(2, t - 6); j <= t; j++)
            if(C[j-1] > O[j-1] && Hh[j-2] < Ll[j])
            {
               ArrayResize(fv, nf + 1, 64);
               fv[nf].bull = true; fv[nf].low = Hh[j-2]; fv[nf].high = Ll[j]; fv[nf].mid = (Hh[j-2] + Ll[j]) / 2;
               fv[nf].createdAt = t; fv[nf].firstIdx = j - 2; fv[nf].sweep = bullSweep; fv[nf].dead = false;
               nf++; found++;
            }
         bullOn = false;
         if(InpSteps && InpLong && t >= steps0)
         {
            Line(PFX + "ch_" + IntegerToString(t) + "L", T[bullAt], bullLevel, T[t], bullLevel, InpLongColor, STYLE_DOT, 1);
            Text(PFX + "cht_" + IntegerToString(t) + "L", T[t], Hh[t], found ? "2 CHoCH" : "2 CHoCH (no gap)", InpLongColor, false);
         }
         if(InpLong) { chochT = t; chochLong = true; chochGaps = found; }
      }
      if(bearOn && C[t] < bearLevel)
      {
         int found = 0;
         for(int j = MathMax(2, t - 6); j <= t; j++)
            if(C[j-1] < O[j-1] && Ll[j-2] > Hh[j])
            {
               ArrayResize(fv, nf + 1, 64);
               fv[nf].bull = false; fv[nf].low = Hh[j]; fv[nf].high = Ll[j-2]; fv[nf].mid = (Hh[j] + Ll[j-2]) / 2;
               fv[nf].createdAt = t; fv[nf].firstIdx = j - 2; fv[nf].sweep = bearSweep; fv[nf].dead = false;
               nf++; found++;
            }
         bearOn = false;
         if(InpSteps && InpShort && t >= steps0)
         {
            Line(PFX + "ch_" + IntegerToString(t) + "S", T[bearAt], bearLevel, T[t], bearLevel, InpShortColor, STYLE_DOT, 1);
            Text(PFX + "cht_" + IntegerToString(t) + "S", T[t], Ll[t], found ? "2 CHoCH" : "2 CHoCH (no gap)", InpShortColor, true);
         }
         if(InpShort) { chochT = t; chochLong = false; chochGaps = found; }
      }

      // 4. Gaps die on age or on a close through them
      for(int q = 0; q < nf; q++)
      {
         if(fv[q].dead) continue;
         bool kill = t - fv[q].createdAt > InpFvgLife || (fv[q].bull && C[t] < fv[q].low) || (!fv[q].bull && C[t] > fv[q].high);
         if(kill)
         {
            fv[q].dead = true;
            if(InpSteps && fv[q].createdAt >= steps0 && ((fv[q].bull && InpLong) || (!fv[q].bull && InpShort)))
            {
               string id = PFX + "fvg_" + IntegerToString(q);
               ObjectCreate(0, id, OBJ_RECTANGLE, 0, T[fv[q].firstIdx], fv[q].high, T[t], fv[q].low);
               ObjectSetInteger(0, id, OBJPROP_COLOR, fv[q].bull ? InpLongColor : InpShortColor);
               ObjectSetInteger(0, id, OBJPROP_FILL, true);
               ObjectSetInteger(0, id, OBJPROP_BACK, true);
               ObjectSetInteger(0, id, OBJPROP_SELECTABLE, false);
            }
         }
      }

      // 5. Retests -> at most one signal per candle, oldest gap first
      for(int q = 0; q < nf; q++)
      {
         if(fv[q].dead || t <= fv[q].createdAt) continue;
         if(fv[q].bull && Ll[t] <= fv[q].mid && C[t] >= fv[q].low)
         {
            double sl = MathMin(fv[q].low, fv[q].sweep) * 0.998;
            double risk = C[t] - sl;
            if(risk > 0)
            {
               double reward = MathMax(NearestHigh(swH, t) - C[t], risk * InpFixedRR);
               if(reward / risk >= InpMinRR)
               {
                  if(InpLong) { DrawTrade(t, true, C[t], sl, C[t] + reward); sigT = t; sigLong = true; sE = C[t]; sSl = sl; sTp = C[t] + reward; }
                  fv[q].dead = true;
                  if(InpSteps && fv[q].createdAt >= steps0 && InpLong)
                  {
                     string id = PFX + "fvg_" + IntegerToString(q);
                     ObjectCreate(0, id, OBJ_RECTANGLE, 0, T[fv[q].firstIdx], fv[q].high, T[t], fv[q].low);
                     ObjectSetInteger(0, id, OBJPROP_COLOR, InpLongColor);
                     ObjectSetInteger(0, id, OBJPROP_FILL, true);
                     ObjectSetInteger(0, id, OBJPROP_BACK, true);
                     ObjectSetInteger(0, id, OBJPROP_SELECTABLE, false);
                  }
                  break;
               }
            }
         }
         if(!fv[q].bull && Hh[t] >= fv[q].mid && C[t] <= fv[q].high)
         {
            double sl = MathMax(fv[q].high, fv[q].sweep) * 1.002;
            double risk = sl - C[t];
            if(risk > 0)
            {
               double reward = MathMax(C[t] - NearestLow(swL, t), risk * InpFixedRR);
               if(reward / risk >= InpMinRR)
               {
                  if(InpShort) { DrawTrade(t, false, C[t], sl, C[t] - reward); sigT = t; sigLong = false; sE = C[t]; sSl = sl; sTp = C[t] - reward; }
                  fv[q].dead = true;
                  if(InpSteps && fv[q].createdAt >= steps0 && InpShort)
                  {
                     string id = PFX + "fvg_" + IntegerToString(q);
                     ObjectCreate(0, id, OBJ_RECTANGLE, 0, T[fv[q].firstIdx], fv[q].high, T[t], fv[q].low);
                     ObjectSetInteger(0, id, OBJPROP_COLOR, InpShortColor);
                     ObjectSetInteger(0, id, OBJPROP_FILL, true);
                     ObjectSetInteger(0, id, OBJPROP_BACK, true);
                     ObjectSetInteger(0, id, OBJPROP_SELECTABLE, false);
                  }
                  break;
               }
            }
         }
      }
   }

   // Live gaps: draw to the right edge
   int gL = 0, gS = 0;
   for(int q = 0; q < nf; q++)
   {
      if(fv[q].dead) continue;
      if(fv[q].bull) gL++; else gS++;
      if(!InpSteps || (fv[q].bull && !InpLong) || (!fv[q].bull && !InpShort)) continue;
      string id = PFX + "fvg_" + IntegerToString(q);
      ObjectCreate(0, id, OBJ_RECTANGLE, 0, T[fv[q].firstIdx], fv[q].high, T[last] + 6 * CS, fv[q].low);
      ObjectSetInteger(0, id, OBJPROP_COLOR, fv[q].bull ? InpLongColor : InpShortColor);
      ObjectSetInteger(0, id, OBJPROP_FILL, true);
      ObjectSetInteger(0, id, OBJPROP_BACK, true);
      ObjectSetInteger(0, id, OBJPROP_SELECTABLE, false);
   }

   // Alerts: only for candles that closed after the indicator was loaded
   if(!g_primed) { g_lastAlert = T[last]; g_primed = true; }
   else if(T[last] > g_lastAlert)
   {
      g_lastAlert = T[last];
      if(sigT == last)
         Notify(StringFormat("%s SMC %s %s SL %s TP %s (enter at the next 4h open)", _Symbol, sigLong ? "BUY" : "SELL",
                DoubleToString(sE, _Digits), DoubleToString(sSl, _Digits), DoubleToString(sTp, _Digits)));
      else if(InpStepAlert && chochT == last && chochGaps > 0)
         Notify(StringFormat("%s SMC: %s CHoCH. %s if a 4h candle reaches the middle of the gap.", _Symbol,
                chochLong ? "bullish" : "bearish", chochLong ? "Buy" : "Sell"));
   }

   string sl = gL > 0 ? StringFormat("%d live bullish gap(s): buy when a 4h candle dips to a gap's middle", gL)
             : bullOn ? StringFormat("swept %s, wait for a 4h close above %s within %d candles", DoubleToString(bullSweep, _Digits), DoubleToString(bullLevel, _Digits), InpSetupLife - (last - bullAt))
             : "wait for a 4h candle to sweep the swing low " + (haveSup ? DoubleToString(sup, _Digits) : "");
   string ss = gS > 0 ? StringFormat("%d live bearish gap(s): sell when a 4h candle rises to a gap's middle", gS)
             : bearOn ? StringFormat("swept %s, wait for a 4h close below %s within %d candles", DoubleToString(bearSweep, _Digits), DoubleToString(bearLevel, _Digits), InpSetupLife - (last - bearAt))
             : "wait for a 4h candle to sweep the swing high " + (haveRes ? DoubleToString(res, _Digits) : "");
   Comment(StringFormat("SMC  |  4h candles on the %s clock  |  last closed candle opened %s (server)\nLong: %s\nShort: %s",
           InpGrid == GRID_UTC ? "UTC" : "server", TimeToString(T[last], TIME_DATE | TIME_MINUTES), sl, ss));
}

int OnInit()
{
   IndicatorSetString(INDICATOR_SHORTNAME, "PB SMC");
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
   datetime h1 = iTime(_Symbol, PERIOD_H1, 0);
   if(h1 != 0 && h1 != g_lastH1) Compute();   // once per new H1 bar
   return rates_total;
}
//+------------------------------------------------------------------+
