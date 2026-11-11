//+------------------------------------------------------------------+
//| PB_LiquidityReversal.mq5                                         |
//| Playbook setup: EUR/USD Liquidity Reversal, 1h                   |
//|                                                                  |
//| Line-by-line port of src/strategies/liquidityReversalStrategy.ts |
//| (LIQUIDITY_REVERSAL_DEFAULTS), run on closed H1 bars.            |
//|                                                                  |
//| 1 Equal lows : two swing lows (3 candles each side) within       |
//|                0.1 x ATR(14), <=100 candles apart, nothing lower |
//|                between them.                                     |
//| 2 Sweep      : a later low trades below them.                    |
//| 3 Shift      : within 48 candles, a close above the last swing   |
//|                high that formed before the sweep low.            |
//| 4 Zone       : last red candle at, or up to 10 before, the sweep |
//|                low: its open down to the sweep low.              |
//| 5 BUY        : price dips into the zone, then a candle closes    |
//|                above it, within 48 candles. Stop = sweep low -   |
//|                0.1 x ATR. Target = nearest untouched swing high  |
//|                (last 200 candles) paying >= 2R, else no trade.   |
//| SELL is the same logic on the chart turned upside down. Both on  |
//| one candle = skipped. The backtest enters at the next H1 open.   |
//+------------------------------------------------------------------+
#property copyright "Playbook"
#property version   "1.00"
#property description "Liquidity Reversal (Playbook EUR/USD 1h; GBP/USD 1h and S&P 500 4h with Fixed target 2). Marks equal lows/highs, sweep, shift, zone, entry, stop and target."
#property indicator_chart_window
#property indicator_plots 0

input group "Rules (keep defaults to match the backtest)"
input int    InpSwing      = 3;    // Swing lookback (candles each side)
input int    InpAtr        = 14;   // ATR length
input double InpEqTol      = 0.1;  // Equal lows tolerance (x ATR)
input int    InpPoolLook   = 100;  // Max candles between the two lows
input int    InpObSearch   = 10;   // Zone search (candles before the sweep low)
input double InpStopBuf    = 0.1;  // Stop buffer (x ATR)
input double InpMinRR      = 2.0;  // Minimum reward : risk
input int    InpTargetLook = 200;  // Target search (candles back)
input double InpFixedRR    = 0.0;  // Fixed target (x risk, 0 = swing target). Playbook: 2 on GBPUSD H1, SPX500 4h
input int    InpMaxSetup   = 48;   // Setup expiry (candles)
input group "Data"
input int    InpH1Bars     = 60000; // H1 bars of history to load
input group "Show"
input bool   InpLong       = true; // Long setups
input bool   InpShort      = true; // Short setups
input bool   InpSteps      = true; // Pools, shifts and zones (last 300 candles)
input int    InpLineCandles= 12;   // Entry / stop / target line length (H1 candles)
input color  InpLongColor  = clrMediumSeaGreen;
input color  InpShortColor = clrTomato;
input group "Alerts"
input bool   InpAlert      = true;  // Pop-up alert on a new signal
input bool   InpPush       = false; // Push notification to the MT5 phone app
input bool   InpStepAlert  = true;  // Also alert when a shift opens a zone

const string PFX = "PBLR_";
const int    CS  = 3600;

double   O[], Hh[], Ll[], C[], ATR[];
datetime T[];
datetime g_lastH1 = 0;
datetime g_lastAlert = 0;
bool     g_primed = false;
int      g_steps0 = 0;

struct Swing { double price; int idx; };
struct Pool  { double level; int createdAt; bool swept; int firstIdx; int sweptAt; };
struct Hit   { int t; double stop, target; };

// State the status line reads after a scan
struct ScanState { int phase; int at; double low; double zoneTop; bool touched; int lastShift; };

int LoadBars()
{
   MqlRates r[];
   int got = CopyRates(_Symbol, PERIOD_H1, 0, InpH1Bars, r);
   if(got < 3) return -1;
   int n = got - 1;                          // r[got-1] is the forming H1 bar
   ArrayResize(O, n); ArrayResize(Hh, n); ArrayResize(Ll, n); ArrayResize(C, n); ArrayResize(T, n);
   for(int i = 0; i < n; i++) { O[i] = r[i].open; Hh[i] = r[i].high; Ll[i] = r[i].low; C[i] = r[i].close; T[i] = r[i].time; }
   // Wilder ATR seeded like src/indicators/atr.ts: mean of TR[1..len] at index len
   ArrayResize(ATR, n);
   ArrayInitialize(ATR, EMPTY_VALUE);
   if(n > InpAtr)
   {
      double sum = 0;
      for(int i = 1; i <= InpAtr; i++) sum += MathMax(Hh[i] - Ll[i], MathMax(MathAbs(Hh[i] - C[i-1]), MathAbs(Ll[i] - C[i-1])));
      double a = sum / InpAtr;
      ATR[InpAtr] = a;
      for(int i = InpAtr + 1; i < n; i++)
      {
         double tr = MathMax(Hh[i] - Ll[i], MathMax(MathAbs(Hh[i] - C[i-1]), MathAbs(Ll[i] - C[i-1])));
         a = (a * (InpAtr - 1) + tr) / InpAtr;
         ATR[i] = a;
      }
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

//--- createLongScanner on series (o,h,l,c). s = +1: the candles as they are; s = -1: the flipped candles
//--- (high = -low, low = -high, open/close negated). Prices drawn on the chart are multiplied back by s.
void Scan(int s, const double &o[], const double &h[], const double &l[], const double &c[], int n,
          Hit &hits[], ScanState &st)
{
   int k = InpSwing;
   Swing highs[], lows[];
   Pool pools[];
   int nh = 0, nl = 0, np = 0, nhit = 0;
   int phase = 0, at = 0, lowIdx = 0;          // phase 0 none, 1 swept, 2 broken
   double low = 0, zoneTop = 0;
   bool touched = false;
   int lastShift = -1;
   color col = s > 0 ? InpLongColor : InpShortColor;
   bool show = InpSteps && (s > 0 ? InpLong : InpShort);
   string sd = s > 0 ? "L" : "S";
   ArrayResize(hits, 0);

   for(int t = 0; t < n; t++)
   {
      int r = t - k;
      if(r >= k)
      {
         bool isH = true, isL = true;
         for(int j = r - k; j <= r + k; j++)
         {
            if(j == r) continue;
            if(h[j] >= h[r]) isH = false;
            if(l[j] <= l[r]) isL = false;
         }
         if(isH) { ArrayResize(highs, nh + 1, 256); highs[nh].price = h[r]; highs[nh].idx = r; nh++; }
         if(isL)
         {
            double tol = ATR[t] == EMPTY_VALUE ? EMPTY_VALUE : InpEqTol * ATR[t];
            for(int i = nl - 1; i >= 0 && lows[i].idx >= r - InpPoolLook; i--)
            {
               double level = MathMin(lows[i].price, l[r]);
               if(tol == EMPTY_VALUE || MathAbs(lows[i].price - l[r]) > tol) continue;
               double m = DBL_MAX;
               for(int j = lows[i].idx + 1; j < r; j++) m = MathMin(m, l[j]);
               if(m >= level)
               {
                  ArrayResize(pools, np + 1, 64);
                  pools[np].level = level; pools[np].createdAt = t; pools[np].swept = false;
                  pools[np].firstIdx = lows[i].idx; pools[np].sweptAt = -1;
                  np++;
                  break;
               }
            }
            ArrayResize(lows, nl + 1, 256); lows[nl].price = l[r]; lows[nl].idx = r; nl++;
         }
      }

      // Progress or drop an existing setup
      if(phase == 1)
      {
         if(l[t] < low) { low = l[t]; lowIdx = t; }
         int bos = -1;
         for(int i = nh - 1; i >= 0; i--) if(highs[i].idx < lowIdx) { bos = i; break; }
         if(bos >= 0 && c[t] > highs[bos].price)
         {
            zoneTop = h[lowIdx];
            for(int j = lowIdx; j >= MathMax(0, lowIdx - InpObSearch); j--)
               if(c[j] < o[j]) { zoneTop = o[j]; break; }
            if(show && t >= g_steps0)
            {
               Line(PFX + "bos_" + sd + IntegerToString(t), T[highs[bos].idx], s * highs[bos].price, T[t], s * highs[bos].price, col, STYLE_DOT, 1);
               Text(PFX + "bost_" + sd + IntegerToString(t), T[t], s * highs[bos].price, "3 Shift", col, s < 0);
               string id = PFX + "zone_" + sd + IntegerToString(t);
               ObjectCreate(0, id, OBJ_RECTANGLE, 0, T[lowIdx], s * zoneTop, T[MathMin(n - 1, t + InpMaxSetup)], s * low);
               ObjectSetInteger(0, id, OBJPROP_COLOR, col);
               ObjectSetInteger(0, id, OBJPROP_FILL, true);
               ObjectSetInteger(0, id, OBJPROP_BACK, true);
               ObjectSetInteger(0, id, OBJPROP_SELECTABLE, false);
            }
            phase = 2; at = t; touched = false; lastShift = t;
         }
         else if(t - at > InpMaxSetup) phase = 0;
      }
      else if(phase == 2 && t > at)
      {
         if(c[t] < low || t - at > InpMaxSetup) phase = 0;
         else
         {
            if(l[t] <= zoneTop) touched = true;
            if(touched && c[t] > zoneTop)
            {
               double entry = c[t];
               double buffer = InpStopBuf > 0 && ATR[t] != EMPTY_VALUE ? InpStopBuf * ATR[t] : 0;
               double stop = low - buffer;
               double risk = entry - stop;
               double target = DBL_MAX;
               for(int i = 0; i < nh; i++)
               {
                  if(highs[i].idx < t - InpTargetLook || highs[i].price >= target) continue;
                  if(risk > 0 && highs[i].price - entry >= InpMinRR * risk)
                  {
                     double m = -DBL_MAX;
                     for(int j = highs[i].idx + 1; j <= t; j++) m = MathMax(m, h[j]);
                     if(m < highs[i].price) target = highs[i].price;
                  }
               }
               // The swing still has to pay InpMinRR for a trade; a fixed target then replaces it.
               if(target != DBL_MAX && InpFixedRR > 0) target = entry + InpFixedRR * risk;
               if(target != DBL_MAX) { ArrayResize(hits, nhit + 1, 64); hits[nhit].t = t; hits[nhit].stop = stop; hits[nhit].target = target; nhit++; }
               phase = 0;
            }
         }
      }

      // Liquidity sweeps. A fresh sweep starts a setup unless one has already broken structure.
      for(int p = 0; p < np; p++)
      {
         if(pools[p].swept || pools[p].createdAt >= t || l[t] >= pools[p].level) continue;
         pools[p].swept = true; pools[p].sweptAt = t;
         if(phase == 0) { phase = 1; at = t; lowIdx = t; low = l[t]; }
         else if(phase == 1) at = t;
      }
   }

   // Pools (equal lows / highs) in the drawn window
   if(InpSteps && (s > 0 ? InpLong : InpShort))
      for(int p = 0; p < np; p++)
      {
         if(pools[p].createdAt < g_steps0) continue;
         int end = pools[p].swept ? pools[p].sweptAt : n - 1;
         Line(PFX + "pool_" + sd + IntegerToString(p), T[pools[p].firstIdx], s * pools[p].level, T[end], s * pools[p].level,
              s > 0 ? clrDodgerBlue : clrOrange, STYLE_DASH, 1);
         Text(PFX + "poolt_" + sd + IntegerToString(p), T[pools[p].firstIdx], s * pools[p].level, s > 0 ? "1 Equal lows" : "1 Equal highs",
              s > 0 ? clrDodgerBlue : clrOrange, s > 0);
         if(pools[p].swept) Text(PFX + "sw_" + sd + IntegerToString(p), T[end], s * l[end], "2 Sweep", s > 0 ? clrDodgerBlue : clrOrange, s > 0);
      }

   st.phase = phase; st.at = at; st.low = low; st.zoneTop = zoneTop; st.touched = touched; st.lastShift = lastShift;
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
   Text(id + "_t", T[t], isLong ? Ll[t] : Hh[t], StringFormat("5 %s %s  SL %s  TP %s  %.1fR", isLong ? "BUY" : "SELL",
        DoubleToString(entry, _Digits), DoubleToString(sl, _Digits), DoubleToString(tp, _Digits), MathAbs(tp - entry) / MathAbs(entry - sl)), col, isLong);
}

string Status(const ScanState &st, bool isLong, int last)
{
   string fmtLow = DoubleToString((isLong ? 1 : -1) * st.low, _Digits);
   string fmtTop = DoubleToString((isLong ? 1 : -1) * st.zoneTop, _Digits);
   if(st.phase == 1)
      return StringFormat("swept to %s, wait for a close %s the last swing %s before it (%d candles left)", fmtLow,
                          isLong ? "above" : "below", isLong ? "high" : "low", InpMaxSetup - (last - st.at));
   if(st.phase == 2)
      return StringFormat("zone %s to %s. %s (%d candles left)", fmtLow, fmtTop,
                          st.touched ? (isLong ? "Touched: buy on a close above " : "Touched: sell on a close below ") + fmtTop
                                     : (isLong ? "Wait for price to dip into it" : "Wait for price to rise into it"),
                          InpMaxSetup - (last - st.at));
   return isLong ? "wait for equal lows to be swept" : "wait for equal highs to be swept";
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
   ScanState sl, ss;
   Scan(1, O, Hh, Ll, C, n, hl, sl);
   Scan(-1, fo, fh, fl, fc, n, hs, ss);

   // 0 none, 1 buy, -1 sell, 2 both (skipped)
   int side[]; double stp[], tgt[];
   ArrayResize(side, n); ArrayResize(stp, n); ArrayResize(tgt, n);
   ArrayInitialize(side, 0);
   for(int i = 0; i < ArraySize(hl); i++) { side[hl[i].t] = 1; stp[hl[i].t] = hl[i].stop; tgt[hl[i].t] = hl[i].target; }
   for(int i = 0; i < ArraySize(hs); i++)
   {
      int t = hs[i].t;
      if(side[t] != 0) { side[t] = 2; continue; }
      side[t] = -1; stp[t] = -hs[i].stop; tgt[t] = -hs[i].target;
   }
   for(int t = 0; t < n; t++)
   {
      if(side[t] == 1 && InpLong) DrawTrade(t, true, C[t], stp[t], tgt[t]);
      if(side[t] == -1 && InpShort) DrawTrade(t, false, C[t], stp[t], tgt[t]);
   }

   int last = n - 1;
   if(!g_primed) { g_lastAlert = T[last]; g_primed = true; }
   else if(T[last] > g_lastAlert)
   {
      g_lastAlert = T[last];
      if((side[last] == 1 && InpLong) || (side[last] == -1 && InpShort))
         Notify(StringFormat("%s Liquidity Reversal %s %s SL %s TP %s (enter at the next H1 open)", _Symbol, side[last] == 1 ? "BUY" : "SELL",
                DoubleToString(C[last], _Digits), DoubleToString(stp[last], _Digits), DoubleToString(tgt[last], _Digits)));
      else if(InpStepAlert && InpLong && sl.lastShift == last)
         Notify(_Symbol + " Liquidity Reversal: long zone open. " + Status(sl, true, last));
      else if(InpStepAlert && InpShort && ss.lastShift == last)
         Notify(_Symbol + " Liquidity Reversal: short zone open. " + Status(ss, false, last));
   }

   Comment(StringFormat("Liquidity Reversal  |  H1  |  last closed candle opened %s (server)\nLong: %s\nShort: %s",
           TimeToString(T[last], TIME_DATE | TIME_MINUTES), Status(sl, true, last), Status(ss, false, last)));
}

int OnInit()
{
   IndicatorSetString(INDICATOR_SHORTNAME, "PB Liquidity Reversal");
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
