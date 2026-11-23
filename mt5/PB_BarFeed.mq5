//+------------------------------------------------------------------+
//| PB_BarFeed.mq5 — live candle feed for the AuraJournal scanner    |
//|                                                                  |
//| An Expert Advisor: drag it onto ANY one chart (EURUSD H1 is      |
//| fine) and leave that chart open. It places no trades and works   |
//| with Algo Trading switched off. Every few seconds it             |
//| writes each symbol's CLOSED bars to                              |
//|   MQL5/Files/PlaybookFeed/<SYMBOL>_<TF>.csv                      |
//| in the same layout as View → Symbols → Bars → Export Bars        |
//| (<DATE> <TIME> <OPEN> <HIGH> <LOW> <CLOSE> <TICKVOL> <VOL>       |
//| <SPREAD>, server time), plus heartbeat.txt and symbols.csv (each |
//| symbol's contract size and $ per tick, for position sizing).     |
//| The app reads these files instead of Yahoo/Binance while heartbeat.txt is fresh, so  |
//| signals are priced off the broker's own feed.                    |
//| A file is rewritten only when a new bar has closed, and written  |
//| to a .tmp first then moved, so the app never reads half a file.  |
//|                                                                  |
//| It also exports the logged-in account's trades for the app's     |
//| live sync, to PlaybookFeed/accounts/:                            |
//|   <LOGIN>.txt            account, balance, equity, heartbeat     |
//|   <LOGIN>_deals.csv      every deal in the history               |
//|   <LOGIN>_positions.csv  open positions                          |
//| Switch accounts in the terminal and the next one is exported     |
//| too; each keeps its own files.                                   |
//+------------------------------------------------------------------+
#property copyright "AuraJournal"
#property version   "1.30"

input string InpSymbols   = "XAUUSD,XAGUSD,BTCUSD,ETHUSD,EURUSD,GBPUSD,USDJPY,AUDUSD,USDCAD,USDCHF,NZDUSD,NDX100,SPX500,EURJPY,GBPAUD,FTSE100,UKOIL"; // Broker symbols (missing ones are skipped)
input bool   InpM5        = true;   // Write M5 (NAS100 8/33 EMA signals use it)
input bool   InpM15       = true;   // Write M15
input bool   InpH1        = true;   // Write H1 (the app builds 4h from it)
input int    InpBarsM5    = 60000;  // M5 bars (~7 months)
input int    InpBarsM15   = 75000;  // M15 bars (~2 years)
input int    InpBarsH1    = 20000;  // H1 bars (~3 years)
input int    InpSeconds   = 10;     // Seconds between checks
input bool   InpTrades    = true;   // Export this account's trades for the app's live sync

#define DIR "PlaybookFeed\\"
#define ACC_DIR "PlaybookFeed\\accounts\\"

string           g_sym[];
ENUM_TIMEFRAMES  g_tf[];
string           g_tfName[];
int              g_bars[];
datetime         g_last[];   // last closed bar written, per symbol × timeframe
int              g_count[];  // bars written then (more arrive while MT5 downloads history)
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
   int avail = MathMin(Bars(sym, tf) - 1, g_bars[k]);
   if(t[0] == g_last[slot] && avail <= g_count[slot]) return true;

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
   g_count[slot] = got;
   return true;
}

// Contract specs the app sizes positions from: lot size, tick size and what a
// tick is worth per lot in the account currency (MT5 converts pounds, yen…).
void WriteSpecs()
{
   int h = FileOpen(DIR + "symbols.tmp", FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(h == INVALID_HANDLE) return;
   FileWriteString(h, "SYMBOL\tDIGITS\tCONTRACT\tTICKSIZE\tTICKVALUE\tVOLUMEMIN\tVOLUMESTEP\tPROFITCCY\tACCOUNTCCY\r\n");
   string acc = AccountInfoString(ACCOUNT_CURRENCY);
   for(int s = 0; s < ArraySize(g_sym); s++)
   {
      string sym = g_sym[s];
      if(!SymbolInfoInteger(sym, SYMBOL_SELECT)) continue;
      double tv = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE_LOSS);
      if(tv <= 0) tv = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
      FileWriteString(h, sym + "\t" +
         IntegerToString(SymbolInfoInteger(sym, SYMBOL_DIGITS)) + "\t" +
         DoubleToString(SymbolInfoDouble(sym, SYMBOL_TRADE_CONTRACT_SIZE), 8) + "\t" +
         DoubleToString(SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE), 10) + "\t" +
         DoubleToString(tv, 10) + "\t" +
         DoubleToString(SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN), 4) + "\t" +
         DoubleToString(SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP), 4) + "\t" +
         SymbolInfoString(sym, SYMBOL_CURRENCY_PROFIT) + "\t" + acc + "\r\n");
   }
   FileClose(h);
   FileMove(DIR + "symbols.tmp", 0, DIR + "symbols.csv", FILE_REWRITE);
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

// ---------- trade export (live sync) ----------

// Tabs and line breaks would break the file's columns.
string Clean(string s)
{
   StringReplace(s, "\t", " ");
   StringReplace(s, "\r", " ");
   StringReplace(s, "\n", " ");
   return s;
}

string DealType(long t)
{
   if(t == DEAL_TYPE_BUY) return "buy";
   if(t == DEAL_TYPE_SELL) return "sell";
   if(t == DEAL_TYPE_BALANCE) return "balance";
   if(t == DEAL_TYPE_CREDIT) return "credit";
   if(t == DEAL_TYPE_COMMISSION || t == DEAL_TYPE_COMMISSION_DAILY || t == DEAL_TYPE_COMMISSION_MONTHLY) return "commission";
   return "other";
}

string DealEntry(long e)
{
   if(e == DEAL_ENTRY_IN) return "in";
   if(e == DEAL_ENTRY_OUT) return "out";
   if(e == DEAL_ENTRY_INOUT) return "inout";
   if(e == DEAL_ENTRY_OUT_BY) return "out_by";
   return "";
}

string DealReason(long r)
{
   if(r == DEAL_REASON_SL) return "sl";
   if(r == DEAL_REASON_TP) return "tp";
   if(r == DEAL_REASON_SO) return "so";
   if(r == DEAL_REASON_EXPERT) return "expert";
   if(r == DEAL_REASON_MOBILE) return "mobile";
   if(r == DEAL_REASON_WEB) return "web";
   return "client";
}

string Px(double v, int digits) { return v == 0 ? "" : DoubleToString(v, digits); }

bool Replace(string tmp, string dest)
{
   if(FileMove(tmp, 0, dest, FILE_REWRITE)) return true;
   PrintFormat("PB_BarFeed: cannot replace %s (error %d)", dest, GetLastError());
   return false;
}

int g_dealsWritten = -1;   // deals in the last deals file (rewritten when this changes)
long g_dealsLogin = 0;

void WriteTrades()
{
   long login = AccountInfoInteger(ACCOUNT_LOGIN);
   if(login <= 0 || !TerminalInfoInteger(TERMINAL_CONNECTED)) return;
   string base = ACC_DIR + IntegerToString(login);
   if(login != g_dealsLogin) { g_dealsLogin = login; g_dealsWritten = -1; }

   // Deals: the whole history, rewritten only when a deal is added.
   if(HistorySelect(0, TimeCurrent() + 86400))
   {
      int total = HistoryDealsTotal();
      if(total != g_dealsWritten)
      {
         int h = FileOpen(base + "_deals.tmp", FILE_WRITE | FILE_TXT | FILE_ANSI);
         if(h != INVALID_HANDLE)
         {
            FileWriteString(h, "TICKET\tPOSITION\tTIME\tTYPE\tENTRY\tSYMBOL\tVOLUME\tPRICE\tSL\tTP\tCOMMISSION\tSWAP\tFEE\tPROFIT\tREASON\tCOMMENT\r\n");
            for(int i = 0; i < total; i++)
            {
               ulong d = HistoryDealGetTicket(i);
               if(d == 0) continue;
               string sym = HistoryDealGetString(d, DEAL_SYMBOL);
               int digits = sym == "" ? 2 : (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
               FileWriteString(h,
                  IntegerToString((long)d) + "\t" +
                  IntegerToString(HistoryDealGetInteger(d, DEAL_POSITION_ID)) + "\t" +
                  TimeToString((datetime)HistoryDealGetInteger(d, DEAL_TIME), TIME_DATE | TIME_SECONDS) + "\t" +
                  DealType(HistoryDealGetInteger(d, DEAL_TYPE)) + "\t" +
                  DealEntry(HistoryDealGetInteger(d, DEAL_ENTRY)) + "\t" +
                  sym + "\t" +
                  DoubleToString(HistoryDealGetDouble(d, DEAL_VOLUME), 2) + "\t" +
                  Px(HistoryDealGetDouble(d, DEAL_PRICE), digits) + "\t" +
                  Px(HistoryDealGetDouble(d, DEAL_SL), digits) + "\t" +
                  Px(HistoryDealGetDouble(d, DEAL_TP), digits) + "\t" +
                  DoubleToString(HistoryDealGetDouble(d, DEAL_COMMISSION), 2) + "\t" +
                  DoubleToString(HistoryDealGetDouble(d, DEAL_SWAP), 2) + "\t" +
                  DoubleToString(HistoryDealGetDouble(d, DEAL_FEE), 2) + "\t" +
                  DoubleToString(HistoryDealGetDouble(d, DEAL_PROFIT), 2) + "\t" +
                  DealReason(HistoryDealGetInteger(d, DEAL_REASON)) + "\t" +
                  Clean(HistoryDealGetString(d, DEAL_COMMENT)) + "\r\n");
            }
            FileClose(h);
            if(Replace(base + "_deals.tmp", base + "_deals.csv")) g_dealsWritten = total;
         }
      }
   }

   // Open positions: every loop, for their stop, target and floating P&L.
   int h = FileOpen(base + "_positions.tmp", FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(h != INVALID_HANDLE)
   {
      FileWriteString(h, "POSITION\tSYMBOL\tTYPE\tTIME\tVOLUME\tPRICE\tSL\tTP\tSWAP\tPROFIT\tCURRENT\r\n");
      for(int i = 0; i < PositionsTotal(); i++)
      {
         ulong p = PositionGetTicket(i);
         if(p == 0) continue;
         string sym = PositionGetString(POSITION_SYMBOL);
         int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
         FileWriteString(h,
            IntegerToString(PositionGetInteger(POSITION_IDENTIFIER)) + "\t" +
            sym + "\t" +
            (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? "buy" : "sell") + "\t" +
            TimeToString((datetime)PositionGetInteger(POSITION_TIME), TIME_DATE | TIME_SECONDS) + "\t" +
            DoubleToString(PositionGetDouble(POSITION_VOLUME), 2) + "\t" +
            Px(PositionGetDouble(POSITION_PRICE_OPEN), digits) + "\t" +
            Px(PositionGetDouble(POSITION_SL), digits) + "\t" +
            Px(PositionGetDouble(POSITION_TP), digits) + "\t" +
            DoubleToString(PositionGetDouble(POSITION_SWAP), 2) + "\t" +
            DoubleToString(PositionGetDouble(POSITION_PROFIT), 2) + "\t" +
            Px(PositionGetDouble(POSITION_PRICE_CURRENT), digits) + "\r\n");
      }
      FileClose(h);
      Replace(base + "_positions.tmp", base + "_positions.csv");
   }

   // The account, written last: the app reads it as "this login's files are complete as of now".
   h = FileOpen(base + ".tmp", FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(h != INVALID_HANDLE)
   {
      long mode = AccountInfoInteger(ACCOUNT_TRADE_MODE);
      FileWriteString(h,
         "login\t" + IntegerToString(login) + "\r\n" +
         "server\t" + Clean(AccountInfoString(ACCOUNT_SERVER)) + "\r\n" +
         "company\t" + Clean(AccountInfoString(ACCOUNT_COMPANY)) + "\r\n" +
         "name\t" + Clean(AccountInfoString(ACCOUNT_NAME)) + "\r\n" +
         "currency\t" + AccountInfoString(ACCOUNT_CURRENCY) + "\r\n" +
         "mode\t" + (mode == ACCOUNT_TRADE_MODE_REAL ? "real" : mode == ACCOUNT_TRADE_MODE_CONTEST ? "contest" : "demo") + "\r\n" +
         "balance\t" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + "\r\n" +
         "equity\t" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) + "\r\n" +
         "utc\t" + IntegerToString((long)TimeGMT()) + "\r\n" +
         "server_time\t" + TimeToString(TimeTradeServer(), TIME_DATE | TIME_SECONDS) + "\r\n");
      FileClose(h);
      Replace(base + ".tmp", base + ".txt");
   }
}

int g_loops = 0;

int OnInit()
{
   ArrayResize(g_sym, 0);
   ArrayResize(g_tf, 0);
   ArrayResize(g_tfName, 0);
   ArrayResize(g_bars, 0);
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
   ArrayResize(g_count, slots);
   ArrayInitialize(g_count, 0);
   ArrayResize(g_warned, ArraySize(g_sym));
   ArrayInitialize(g_warned, false);
   g_loops = 0;
   FolderCreate("PlaybookFeed");
   if(InpTrades) FolderCreate("PlaybookFeed\\accounts");
   g_dealsWritten = -1;
   PrintFormat("PB_BarFeed: %d symbols × %d timeframes → MQL5\\Files\\%s", ArraySize(g_sym), ArraySize(g_tf), DIR);
   EventSetTimer(MathMax(1, InpSeconds));
   OnTimer(); // first write now, not in 10 seconds
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
}

void OnTimer()
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
   // Tick values move with exchange rates: refresh them about once a minute.
   if(g_loops++ % MathMax(1, 60 / MathMax(1, InpSeconds)) == 0) WriteSpecs();
   if(InpTrades) WriteTrades();
   WriteHeartbeat(live);
}

// A deal (fill, close, stop hit) re-exports at once instead of on the next loop.
void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
{
   if(InpTrades && trans.type == TRADE_TRANSACTION_DEAL_ADD) WriteTrades();
}

// Bars come from the timer, not from this chart's ticks.
void OnTick() {}
