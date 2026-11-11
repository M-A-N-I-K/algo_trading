//+------------------------------------------------------------------+
//| PB_SRSweepTrendline.mq5                                          |
//| Playbook setup: NAS100 S/R Sweep + Trend-Line Break, 1h          |
//|                                                                  |
//| Line-by-line port of src/strategies/srSweepTrendlineStrategy.ts  |
//| (SR_SWEEP_TRENDLINE_DEFAULTS), run on closed H1 bars.            |
//|                                                                  |
//| 1 Level  : two swing lows (3 candles each side) within 0.25 x    |
//|            ATR(14), <=100 candles apart, nothing lower between.  |
//| 2 Sweep  : a low trades below it (within 300 candles of it       |
//|            forming); a candle closes back above within 3 candles.|
//| 3 Line   : trend line through the last two falling swing highs   |
//|            (3 each side) at or before the sweep (within 80).     |
//| 4 BUY    : within 48 candles, a green candle with body >= 1 ATR  |
//|            closes above the line and the 200 EMA. Stop = lowest  |
//|            low since the sweep - 0.1 ATR. Target = 3R.           |
//| SELL is the same logic on the chart turned upside down. Both on  |
//| one candle = skipped. The backtest enters at the next H1 open.   |
//+------------------------------------------------------------------+
#property copyright "Playbook"
#property version   "1.00"
#property description "S/R Sweep + Trend-Line Break (Playbook NAS100 1h). Marks levels, sweeps, trend lines, entry, stop and target."
#property indicator_chart_window
#property indicator_plots 0

input group "Rules (keep defaults to match the backtest)"
input int    InpEma        = 200;  // Trend EMA
input bool   InpTrend      = true; // Only trade with the 200 EMA
input int    InpLvlSwing   = 3;    // Level swing lookback (candles each side)
input double InpEqTol      = 0.25; // Equal lows tolerance (x ATR)
input int    InpSweepN     = 3;    // Candles allowed to close back above the level
input int    InpLineSwing  = 3;    // Trend-line swing lookback (candles each side)
input double InpBigBody    = 1.0;  // Break candle body (x ATR, 0 = any)
input double InpRR         = 3.0;  // Target (x risk). Playbook: 3 on NDX100 1h, 1.5 on ETHUSD 4h
input group "Data"
input int    InpH1Bars     = 60000; // H1 bars of history to load
input group "Show"
input bool   InpLong       = true; // Long setups
input bool   InpShort      = true; // Short setups
input bool   InpSteps      = true; // Levels, sweeps and trend lines (last 300 candles)
input bool   InpShowEma    = true; // Draw the 200 EMA (last 400 candles)
input int    InpLineCandles= 12;   // Entry / stop / target line length (H1 candles)
input color  InpLongColor  = clrMediumSeaGreen;
input color  InpShortColor = clrTomato;
input group "Alerts"
input bool   InpAlert      = true;  // Pop-up alert on a new signal
input bool   InpPush       = false; // Push notification to the MT5 phone app
input bool   InpStepAlert  = true;  // Also alert when a level is swept and reclaimed

const string PFX = "PBSRTL_";
const int    CS  = 3600;
const int    ATR_LEN = 14;
const int    POOL_LOOKBACK = 100;
const int    LEVEL_LIFE = 300;
const int    MAX_LEVELS = 20;
const int    SETUP_LIFE = 48;
const int    LINE_LOOKBACK = 80;
const double STOP_BUF = 0.1;

double   O[], Hh[], Ll[], C[], ATR[], EMA[];
datetime T[];
datetime g_lastH1 = 0;
datetime g_lastAlert = 0;
bool     g_primed = false;
int      g_steps0 = 0;

struct Swing { double p; int i; };
struct Level { double level; int at; int first; bool dead; };
struct Hit   { int t; double stop, target; int l1; double p1; double p2; };
struct State { bool on; int phase; int at; double level; double ext; int below; int lastReclaim; };

int LoadBars()
{
   MqlRates r[];
   int got = CopyRates(_Symbol, PERIOD_H1, 0, InpH1Bars, r);
   if(got < 3) return -1;
   int n = got - 1;                          // r[got-1] is the forming H1 bar
   ArrayResize(O, n); ArrayResize(Hh, n); ArrayResize(Ll, n); ArrayResize(C, n); ArrayResize(T, n);
   for(int i = 0; i < n; i++) { O[i] = r[i].open; Hh[i] = r[i].high; Ll[i] = r[i].low; C[i] = r[i].close; T[i] = r[i].time; }
   // ATR like src/indicators/atr.ts: mean of TR[1..14] at index 14, then Wilder
   ArrayResize(ATR, n);
   ArrayInitialize(ATR, EMPTY_VALUE);
   if(n > ATR_LEN)
   {
      double sum = 0;
      for(int i = 1; i <= ATR_LEN; i++) sum += MathMax(Hh[i] - Ll[i], MathMax(MathAbs(Hh[i] - C[i-1]), MathAbs(Ll[i] - C[i-1])));
      double a = sum / ATR_LEN;
      ATR[ATR_LEN] = a;
      for(int i = ATR_LEN + 1; i < n; i++)
      {
         double tr = MathMax(Hh[i] - Ll[i], MathMax(MathAbs(Hh[i] - C[i-1]), MathAbs(Ll[i] - C[i-1])));
         a = (a * (ATR_LEN - 1) + tr) / ATR_LEN;
         ATR[i] = a;
      }
   }
   // EMA like src/indicators/ema.ts (SMA seed)
   ArrayResize(EMA, n);
   ArrayInitialize(EMA, EMPTY_VALUE);
   if(n >= InpEma)
   {
      double s = 0;
      for(int i = 0; i < InpEma; i++) s += C[i];
      EMA[InpEma - 1] = s / InpEma;
      double m = 2.0 / (InpEma + 1);
      for(int i = InpEma; i < n; i++) EMA[i] = (C[i] - EMA[i-1]) * m + EMA[i-1];
   }
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

bool IsSwing(const double &h[], const double &l[], int r, int k, bool high)
{
   for(int j = r - k; j <= r + k; j++)
   {
      if(j == r) continue;
      if(high ? h[j] >= h[r] : l[j] <= l[r]) return false;
   }
   return true;
}

//--- scanSrSweepTrendlineLongs on series (o,h,l,c); s = -1 means flipped candles (prices x -1 on the chart)
void Scan(int s, const double &o[], const double &h[], const double &l[], const double &c[], int n, Hit &hits[], State &st)
{
   Swing lows[], lineHighs[];
   Level levels[];
   int nl = 0, nh = 0, nv = 0, nhit = 0;
   bool on = false; int phase = 0, at = 0, sweepIdx = 0, below = 0, li = -1;
   double ext = 0, lvlVal = 0;           // lvlVal: the active setup's level (li may be trimmed away)
   int lastReclaim = -1;
   color col = s > 0 ? clrDodgerBlue : clrOrange;
   bool show = InpSteps && (s > 0 ? InpLong : InpShort);
   string sd = s > 0 ? "L" : "S";
   ArrayResize(hits, 0);

   for(int t = 0; t < n; t++)
   {
      double a = ATR[t];
      // level swings (lows) -> equal-lows levels
      int r = t - InpLvlSwing;
      if(r >= InpLvlSwing && IsSwing(h, l, r, InpLvlSwing, false))
      {
         if(a != EMPTY_VALUE)
            for(int q = nl - 1; q >= 0 && lows[q].i >= r - POOL_LOOKBACK; q--)
            {
               double lv = MathMin(lows[q].p, l[r]);
               double lo = DBL_MAX;
               for(int j = lows[q].i + 1; j < r; j++) lo = MathMin(lo, l[j]);
               if(MathAbs(lows[q].p - l[r]) <= InpEqTol * a && lo >= lv)
               {
                  if(nv == MAX_LEVELS)
                  {
                     for(int z = 1; z < nv; z++) levels[z-1] = levels[z];
                     nv--;
                     li--;                          // keep pointing at the same level
                  }
                  ArrayResize(levels, nv + 1, 32);
                  levels[nv].level = lv; levels[nv].at = t; levels[nv].first = lows[q].i; levels[nv].dead = false;
                  nv++;
                  break;
               }
            }
         ArrayResize(lows, nl + 1, 256); lows[nl].p = l[r]; lows[nl].i = r; nl++;
      }
      // trend-line swings (highs)
      int r2 = t - InpLineSwing;
      if(r2 >= InpLineSwing && IsSwing(h, l, r2, InpLineSwing, true))
      {
         ArrayResize(lineHighs, nh + 1, 256); lineHighs[nh].p = h[r2]; lineHighs[nh].i = r2; nh++;
      }
      if(a == EMPTY_VALUE || EMA[t] == EMPTY_VALUE) continue;

      if(on)
      {
         if(phase == 1)
         {
            ext = MathMin(ext, l[t]);
            if(c[t] > lvlVal) { phase = 2; at = t; lastReclaim = t; }
            else if(++below >= InpSweepN) on = false;
         }
         else
         {
            if(l[t] < ext)
            {
               if(c[t] <= lvlVal) on = false;
               else ext = l[t];
            }
            if(on && t - at > SETUP_LIFE) on = false;
            if(on)
            {
               int n2 = -1, n1 = -1;
               for(int q = nh - 1; q >= 0; q--)
               {
                  if(lineHighs[q].i > sweepIdx) continue;
                  if(lineHighs[q].i < sweepIdx - LINE_LOOKBACK) break;
                  if(n2 < 0) n2 = q; else { n1 = q; break; }
               }
               bool haveLine = false;
               double line = 0;
               if(n1 >= 0 && n2 >= 0 && lineHighs[n1].p > lineHighs[n2].p)
               {
                  haveLine = true;
                  line = lineHighs[n2].p + (lineHighs[n2].p - lineHighs[n1].p) / (lineHighs[n2].i - lineHighs[n1].i) * (t - lineHighs[n2].i);
               }
               bool big = MathAbs(c[t] - o[t]) >= InpBigBody * a;
               bool trendOk = !InpTrend || c[t] > s * EMA[t];
               if(haveLine && c[t] > line && c[t] > o[t] && big && trendOk)
               {
                  double stop = ext - STOP_BUF * a;
                  double risk = c[t] - stop;
                  if(risk > 0)
                  {
                     ArrayResize(hits, nhit + 1, 64);
                     hits[nhit].t = t; hits[nhit].stop = stop; hits[nhit].target = c[t] + InpRR * risk;
                     hits[nhit].l1 = lineHighs[n1].i; hits[nhit].p1 = lineHighs[n1].p; hits[nhit].p2 = line;
                     nhit++;
                  }
                  if(li >= 0) levels[li].dead = true;
                  on = false;
               }
            }
         }
      }
      if(!on)
      {
         for(int q = 0; q < nv; q++)
         {
            if(levels[q].dead || levels[q].at >= t || t - levels[q].at > LEVEL_LIFE) continue;
            if(l[t] < levels[q].level)
            {
               levels[q].dead = true;
               if(show && t >= g_steps0)
               {
                  Line(PFX + "lvl_" + sd + IntegerToString(t), T[levels[q].first], s * levels[q].level, T[t], s * levels[q].level, col, STYLE_DASH, 1);
                  Text(PFX + "sw_" + sd + IntegerToString(t), T[t], s * l[t], "Sweep", col, s > 0);
               }
               lvlVal = levels[q].level;
               if(c[t] > levels[q].level) { on = true; li = q; ext = l[t]; sweepIdx = t; below = 0; phase = 2; at = t; lastReclaim = t; }
               else if(InpSweepN > 1) { on = true; li = q; ext = l[t]; sweepIdx = t; below = 1; phase = 1; at = t; }
               break;
            }
         }
      }
   }
   st.on = on; st.phase = phase; st.at = at; st.level = on ? lvlVal : 0; st.ext = ext; st.below = below; st.lastReclaim = lastReclaim;
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
   Text(id + "_t", T[t], isLong ? Ll[t] : Hh[t], StringFormat("%s %s  SL %s  TP %s", isLong ? "BUY" : "SELL",
        DoubleToString(entry, _Digits), DoubleToString(sl, _Digits), DoubleToString(tp, _Digits)), col, isLong);
}

string Status(const State &st, bool isLong, int last)
{
   string lvl = DoubleToString((isLong ? 1 : -1) * st.level, _Digits);
   if(!st.on) return isLong ? "wait for a sweep of support (equal lows)" : "wait for a sweep of resistance (equal highs)";
   if(st.phase == 1)
      return StringFormat("swept %s, needs a close back %s it within %d candles", lvl, isLong ? "above" : "below", InpSweepN - st.below);
   return StringFormat("reclaimed %s. Trigger: a big %s close through the trend line (%d candles left)", lvl, isLong ? "green" : "red", SETUP_LIFE - (last - st.at));
}

void Compute()
{
   int n = LoadBars();
   if(n < 0) return;
   g_lastH1 = iTime(_Symbol, PERIOD_H1, 0);
   ObjectsDeleteAll(0, PFX);
   g_steps0 = n - 300;

   double fo[], fh[], fl[], fc[];
   ArrayResize(fo, n); ArrayResize(fh, n); ArrayResize(fl, n); ArrayResize(fc, n);
   for(int i = 0; i < n; i++) { fo[i] = -O[i]; fh[i] = -Ll[i]; fl[i] = -Hh[i]; fc[i] = -C[i]; }

   Hit hl[], hs[];
   State sl, ss;
   Scan(1, O, Hh, Ll, C, n, hl, sl);
   Scan(-1, fo, fh, fl, fc, n, hs, ss);

   int side[]; double stp[], tgt[];
   ArrayResize(side, n); ArrayResize(stp, n); ArrayResize(tgt, n);
   ArrayInitialize(side, 0);
   for(int i = 0; i < ArraySize(hl); i++) { side[hl[i].t] = 1; stp[hl[i].t] = hl[i].stop; tgt[hl[i].t] = hl[i].target; }
   for(int i = 0; i < ArraySize(hs); i++)
   {
      int t = hs[i].t;
      if(side[t] != 0) { side[t] = 2; continue; }   // both directions on one candle: skipped
      side[t] = -1; stp[t] = -hs[i].stop; tgt[t] = -hs[i].target;
   }
   for(int i = 0; i < ArraySize(hl); i++)
   {
      int t = hl[i].t;
      if(side[t] != 1 || !InpLong) continue;
      DrawTrade(t, true, C[t], stp[t], tgt[t]);
      if(InpSteps && t >= g_steps0) Line(PFX + "tl_L" + IntegerToString(t), T[hl[i].l1], hl[i].p1, T[t], hl[i].p2, InpLongColor, STYLE_DOT, 1);
   }
   for(int i = 0; i < ArraySize(hs); i++)
   {
      int t = hs[i].t;
      if(side[t] != -1 || !InpShort) continue;
      DrawTrade(t, false, C[t], stp[t], tgt[t]);
      if(InpSteps && t >= g_steps0) Line(PFX + "tl_S" + IntegerToString(t), T[hs[i].l1], -hs[i].p1, T[t], -hs[i].p2, InpShortColor, STYLE_DOT, 1);
   }

   if(InpShowEma)
      for(int t = MathMax(1, n - 400); t < n; t++)
      {
         if(EMA[t-1] == EMPTY_VALUE) continue;
         string id = PFX + "ema_" + IntegerToString(t);
         Line(id, T[t-1], EMA[t-1], T[t], EMA[t], clrOrange, STYLE_SOLID, 2);
         ObjectSetInteger(0, id, OBJPROP_BACK, true);
      }

   int last = n - 1;
   if(!g_primed) { g_lastAlert = T[last]; g_primed = true; }
   else if(T[last] > g_lastAlert)
   {
      g_lastAlert = T[last];
      if((side[last] == 1 && InpLong) || (side[last] == -1 && InpShort))
         Notify(StringFormat("%s SR Sweep TL %s %s SL %s TP %s (enter at the next H1 open)", _Symbol, side[last] == 1 ? "BUY" : "SELL",
                DoubleToString(C[last], _Digits), DoubleToString(stp[last], _Digits), DoubleToString(tgt[last], _Digits)));
      else if(InpStepAlert && InpLong && sl.on && sl.lastReclaim == last)
         Notify(_Symbol + " SR Sweep TL: support swept and reclaimed. " + Status(sl, true, last));
      else if(InpStepAlert && InpShort && ss.on && ss.lastReclaim == last)
         Notify(_Symbol + " SR Sweep TL: resistance swept and reclaimed. " + Status(ss, false, last));
   }

   Comment(StringFormat("S/R Sweep + Trend-Line Break  |  H1  |  last closed candle opened %s (server)\nLong: %s\nShort: %s",
           TimeToString(T[last], TIME_DATE | TIME_MINUTES), Status(sl, true, last), Status(ss, false, last)));
}

int OnInit()
{
   IndicatorSetString(INDICATOR_SHORTNAME, "PB SR Sweep TL");
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
