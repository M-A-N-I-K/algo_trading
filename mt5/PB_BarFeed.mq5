//+------------------------------------------------------------------+
//| PB_BarFeed.mq5 — live candle feed for the AuraJournal scanner    |
//|                                                                  |
//| A service (Navigator → Services → right-click → Add Service): it |
//| runs in the background with no chart. Every few seconds it       |
//| writes each symbol's CLOSED bars to                              |
//|   MQL5/Files/PlaybookFeed/<SYMBOL>_<TF>.csv                      |
//| in the same layout as View → Symbols → Bars → Export Bars        |
//| (<DATE> <TIME> <OPEN> <HIGH> <LOW> <CLOSE> <TICKVOL> <VOL>       |
//| <SPREAD>, server time), plus heartbeat.txt. The app reads these  |
//| files instead of Yahoo/Binance while heartbeat.txt is fresh, so  |
//| signals are priced off the broker's own feed.                    |
//| A file is rewritten only when a new bar has closed, and written  |
//| to a .tmp first then moved, so the app never reads half a file.  |
//+------------------------------------------------------------------+
#property service
#property copyright "AuraJournal"
#property version   "1.00"

input string InpSymbols   = "XAUUSD,XAGUSD,BTCUSD,ETHUSD,EURUSD,GBPUSD,USDJPY,AUDUSD,USDCAD,USDCHF,NZDUSD,NDX100,SPX500,EURJPY,GBPAUD,FTSE100,UKOIL"; // Broker symbols (missing ones are skipped)
input bool   InpM5        = false;  // Write M5
input bool   InpM15       = true;   // Write M15
input bool   InpH1        = true;   // Write H1 (the app builds 4h from it)
input int    InpBarsM5    = 60000;  // M5 bars (~7 months)
input int    InpBarsM15   = 75000;  // M15 bars (~2 years)
input int    InpBarsH1    = 20000;  // H1 bars (~3 years)
input int    InpSeconds   = 10;     // Seconds between checks

#define DIR "PlaybookFeed\\"

string           g_sym[];
ENUM_TIMEFRAMES  g_tf[];
string           g_tfName[];
int              g_bars[];
datetime         g_last[];   // last closed bar written, per symbol × timeframe
bool             g_warned[]; // "not available" logged once per symbol

void AddTf(bool on, ENUM_TIMEFRAMES tf, string name, int bars)
{
   if(!on || bars <= 0) return;
   int n = ArraySize(g_tf);
   ArrayResize(g_tf, n + 1);
   ArrayResize(g_tfName, n + 1);
   ArrayResize(g_bars, n + 1);
   g_tf[n] = tf;
   g_tfName[n] = name;
   g_bars[n] = bars;
}

// Writes the closed bars of one symbol/timeframe if a new one has closed.
// Returns false if the terminal has no data for it yet (tried again next loop).
bool WriteSeries(int s, int k)
{
   string sym = g_sym[s];
   ENUM_TIMEFRAMES tf = g_tf[k];
   int slot = s * ArraySize(g_tf) + k;

   // Index 0 is the bar still forming: start at 1 so only closed bars go out.
   datetime t[];
   if(CopyTime(sym, tf, 1, 1, t) != 1) return false;
   if(t[0] == g_last[slot]) return true;

   MqlRates r[];
   ArraySetAsSeries(r, false);
   int got = CopyRates(sym, tf, 1, g_bars[k], r);
   if(got <= 0) return false;

   int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   string name = sym + "_" + g_tfName[k];
   string tmp = DIR + name + ".tmp";
   int h = FileOpen(tmp, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(h == INVALID_HANDLE)
   {
      PrintFormat("PB_BarFeed: cannot write %s (error %d)", tmp, GetLastError());
      return false;
   }
   FileWriteString(h, "<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>\r\n");
   for(int i = 0; i < got; i++)
   {
      FileWriteString(h,
         TimeToString(r[i].time, TIME_DATE) + "\t" +
         TimeToString(r[i].time, TIME_SECONDS) + "\t" +
         DoubleToString(r[i].open, digits) + "\t" +
         DoubleToString(r[i].high, digits) + "\t" +
         DoubleToString(r[i].low, digits) + "\t" +
         DoubleToString(r[i].close, digits) + "\t" +
         IntegerToString(r[i].tick_volume) + "\t" +
         IntegerToString(r[i].real_volume) + "\t" +
         IntegerToString(r[i].spread) + "\r\n");
   }
   FileClose(h);
   if(!FileMove(tmp, 0, DIR + name + ".csv", FILE_REWRITE))
   {
      PrintFormat("PB_BarFeed: cannot replace %s.csv (error %d)", name, GetLastError());
      return false;
   }
   g_last[slot] = r[got - 1].time;
   return true;
}

void WriteHeartbeat(int live)
{
   int h = FileOpen(DIR + "heartbeat.tmp", FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(h == INVALID_HANDLE) return;
   // UTC seconds, server time, symbols written.
   FileWriteString(h, IntegerToString((long)TimeGMT()) + "\t" +
                      TimeToString(TimeTradeServer(), TIME_DATE | TIME_SECONDS) + "\t" +
                      IntegerToString(live) + "\r\n");
   FileClose(h);
   FileMove(DIR + "heartbeat.tmp", 0, DIR + "heartbeat.txt", FILE_REWRITE);
}

void OnStart()
{
   string parts[];
   int n = StringSplit(InpSymbols, ',', parts);
   for(int i = 0; i < n; i++)
   {
      string s = parts[i];
      StringTrimLeft(s);
      StringTrimRight(s);
      if(s == "") continue;
      int m = ArraySize(g_sym);
      ArrayResize(g_sym, m + 1);
      g_sym[m] = s;
   }
   AddTf(InpM5, PERIOD_M5, "M5", InpBarsM5);
   AddTf(InpM15, PERIOD_M15, "M15", InpBarsM15);
   AddTf(InpH1, PERIOD_H1, "H1", InpBarsH1);

   int slots = ArraySize(g_sym) * ArraySize(g_tf);
   ArrayResize(g_last, slots);
   ArrayInitialize(g_last, 0);
   ArrayResize(g_warned, ArraySize(g_sym));
   ArrayInitialize(g_warned, false);
   FolderCreate("PlaybookFeed");
   PrintFormat("PB_BarFeed: %d symbols × %d timeframes → MQL5\\Files\\%s", ArraySize(g_sym), ArraySize(g_tf), DIR);

   while(!IsStopped())
   {
      int live = 0;
      for(int s = 0; s < ArraySize(g_sym) && !IsStopped(); s++)
      {
         if(!SymbolSelect(g_sym[s], true))
         {
            if(!g_warned[s]) PrintFormat("PB_BarFeed: %s is not offered by this broker, skipped", g_sym[s]);
            g_warned[s] = true;
            continue;
         }
         bool ok = true;
         for(int k = 0; k < ArraySize(g_tf); k++)
            if(!WriteSeries(s, k)) ok = false;
         if(ok) live++;
      }
      WriteHeartbeat(live);
      Sleep(MathMax(1, InpSeconds) * 1000);
   }
}
