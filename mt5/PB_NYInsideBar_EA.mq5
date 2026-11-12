//+------------------------------------------------------------------+
//| PB_NYInsideBar_EA.mq5                                            |
//| Expert Advisor for the Playbook's NY Inside Bar setup            |
//| (NAS100 and S&P 500, 15m), for MT5's Strategy Tester.            |
//|                                                                  |
//| Places the same orders as src/strategies/nyInsideBarStrategy.ts  |
//| with its defaults:                                               |
//| 1 Bias  : the 09:30 and 09:45 New York candles. Last close above |
//|           the first open = buys only today, below = sells only.  |
//| 2 Inside: after 10:00, a candle whose BODY sits inside the       |
//|           previous candle's body (touching counts).              |
//| 3 Order : buy stop at its high (sell stop at its low) for the    |
//|           next 3 candles, deleted as soon as price reaches the   |
//|           other side of the inside candle, replaced by a newer   |
//|           inside candle, and deleted when the next candle would  |
//|           start at 15:00 or later.                               |
//| 4 Trade : stop beyond both candles (lower low / higher high),    |
//|           target 1 x risk. Max 2 trades a day, one at a time,    |
//|           the next inside candle must come after the last trade  |
//|           ended. Anything open is closed at 16:00 New York.      |
//|                                                                  |
//| Real orders, so a few things follow MT5 rather than the app:     |
//| a buy stop triggers on the ask (the chart shows bids), the tick  |
//| order decides a candle that reaches both stop and target, and a  |
//| candle that reaches the trigger and the cancel level fills or    |
//| cancels by whichever came first.                                 |
//| Run it on the M15 chart of NAS100 or SPX500 in the tester with   |
//| "Every tick based on real ticks".                                |
//+------------------------------------------------------------------+
#property copyright "Playbook"
#property version   "1.00"
#property description "NY Inside Bar (Playbook NAS100 / S&P 500 15m). Trades the backtest's rules with stop orders."

#include <Trade/Trade.mqh>

input group "Rules (keep defaults to match the backtest)"
input int    InpOpenH      = 9;    // Opening range start: hour (New York)
input int    InpOpenM      = 30;   // Opening range start: minute
input int    InpRangeMin   = 30;   // Opening range length (minutes)
input int    InpLastH      = 15;   // No fills on candles starting at or after: hour (New York)
input int    InpFlatH      = 16;   // Close everything at: hour (New York)
input int    InpWaitBars   = 3;    // Order lives for (candles)
input double InpTargetR    = 1.0;  // Target (x risk)
input int    InpMaxTrades  = 2;    // Max trades a day
input group "Size"
input double InpRiskPct    = 1.0;  // Risk per trade (% of balance; 0 = use fixed lots)
input double InpFixedLots  = 0.10; // Fixed lots (when risk % is 0)
input group "Clock"
input int    InpServerGmt  = 2;    // Server UTC offset in winter (hours)
input bool   InpEuDst      = true; // Server adds 1h for EU summer time (late Mar to late Oct)
input group "Other"
input long   InpMagic      = 260915; // Magic number
input bool   InpLog        = true;   // Write each step to the journal

const int BAR = 900; // M15
const long DAY = 86400;

CTrade   trade;
datetime g_lastBar = 0;
// day state
long     g_day = -1, g_rangeEnd = 0, g_lastEntry = 0, g_flat = 0;
double   g_rangeOpen = 0, g_rangeClose = 0;
int      g_rangeBars = 0, g_bias = 0, g_taken = 0;
// the pending order
ulong    g_ticket = 0;
datetime g_insideTime = 0;  // server open time of its inside candle
double   g_cancel = 0;
// the trade
long     g_tradeFlat = 0;       // New York time it must be closed by
datetime g_lastExitBar = 0;     // server open time of the candle the last trade ended in

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
long ToNy(datetime server)
{
   datetime u = ServerToUtc(server);
   MqlDateTime d; TimeToStruct(u, d);
   bool dst = u >= NthSunday(d.year, 3, 2, 7) && u < NthSunday(d.year, 11, 1, 6);
   return (long)u - (dst ? 4 : 5) * 3600;
}

void Log(string s) { if(InpLog) Print("NY IB: ", s); }
string Px(double v) { return DoubleToString(v, _Digits); }

bool HasPosition()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
      if(PositionGetTicket(i) > 0 && PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == InpMagic) return true;
   return false;
}
bool PendingAlive()
{
   return g_ticket != 0 && OrderSelect(g_ticket);
}
void DeletePending(string why)
{
   if(PendingAlive())
   {
      if(trade.OrderDelete(g_ticket)) Log("order deleted: " + why);
      else Log("could not delete the order: " + trade.ResultRetcodeDescription());
   }
   g_ticket = 0;
}
void CloseAll(string why)
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong t = PositionGetTicket(i);
      if(t > 0 && PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == InpMagic)
         if(trade.PositionClose(t)) Log("closed: " + why);
   }
}

double Lots(int dir, double entry, double sl)
{
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP), vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN), vmax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double lots = InpFixedLots;
   if(InpRiskPct > 0)
   {
      double loss = 0;
      if(!OrderCalcProfit(dir > 0 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL, _Symbol, 1.0, entry, sl, loss) || loss >= 0) return 0;
      lots = AccountInfoDouble(ACCOUNT_BALANCE) * InpRiskPct / 100.0 / -loss;
   }
   lots = MathFloor(lots / step) * step;
   if(lots < vmin) return 0;   // the risk is too small for the minimum lot: skip rather than over-risk
   return MathMin(lots, vmax);
}

// A new stop order for the inside candle that just closed.
void Place(int dir, double trig, double sl, double tp, double cancel, datetime insideTime)
{
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK), bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   // The next candle has already reached the cancel level or the target: the app takes no trade.
   if(dir > 0 ? bid <= cancel : ask >= cancel) { Log("skipped: price is already at the cancel level"); return; }
   double lots = Lots(dir, trig, sl);
   if(lots <= 0) { Log("skipped: the lot size works out below the minimum"); return; }
   bool ok;
   double stopsLvl = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   if(dir > 0 ? ask >= trig - stopsLvl : bid <= trig + stopsLvl)
   {
      // Price is already through the trigger (a gap): the app fills at the open, so buy / sell now, unless past the target.
      if(dir > 0 ? ask >= tp : bid <= tp) { Log("skipped: price gapped past the target"); return; }
      ok = dir > 0 ? trade.Buy(lots, _Symbol, 0, sl, tp, "NY IB") : trade.Sell(lots, _Symbol, 0, sl, tp, "NY IB");
      if(ok) Log(StringFormat("%s at market (through the trigger %s), SL %s TP %s, %.2f lots", dir > 0 ? "BUY" : "SELL", Px(trig), Px(sl), Px(tp), lots));
      return;
   }
   ok = dir > 0 ? trade.BuyStop(lots, trig, _Symbol, sl, tp, ORDER_TIME_GTC, 0, "NY IB")
                : trade.SellStop(lots, trig, _Symbol, sl, tp, ORDER_TIME_GTC, 0, "NY IB");
   if(ok)
   {
      g_ticket = trade.ResultOrder();
      g_insideTime = insideTime;
      g_cancel = cancel;
      Log(StringFormat("%s STOP %s SL %s TP %s, cancel at %s, %.2f lots", dir > 0 ? "BUY" : "SELL", Px(trig), Px(sl), Px(tp), Px(cancel), lots));
   }
   else Log("order rejected: " + trade.ResultRetcodeDescription());
}

// Runs once per closed M15 candle: the steps the app takes at the candle's close.
void OnBarClose()
{
   MqlRates r[];
   if(CopyRates(_Symbol, PERIOD_M15, 1, 2, r) < 2) return;   // r[1] = the candle that just closed, r[0] = the one before
   MqlRates b = r[1], p = r[0];
   long ny = ToNy(b.time);
   long d0 = ny / DAY;
   if(d0 != g_day)
   {
      g_day = d0;
      g_rangeEnd = d0 * DAY + InpOpenH * 3600 + InpOpenM * 60 + InpRangeMin * 60;
      g_lastEntry = d0 * DAY + InpLastH * 3600;
      g_flat = d0 * DAY + InpFlatH * 3600;
      g_rangeBars = 0; g_bias = 0; g_taken = 0;
      DeletePending("new day");
   }
   long rangeStart = g_rangeEnd - InpRangeMin * 60;
   // 1. Opening range and bias
   if(ny >= rangeStart && ny < g_rangeEnd)
   {
      if(g_rangeBars == 0) g_rangeOpen = b.open;
      g_rangeClose = b.close;
      g_rangeBars++;
      if(ny + BAR >= g_rangeEnd)
      {
         int need = MathMax(1, InpRangeMin * 60 / BAR - 1);
         g_bias = g_rangeBars >= need ? (g_rangeClose > g_rangeOpen ? 1 : g_rangeClose < g_rangeOpen ? -1 : 0) : 0;
         Log(g_bias > 0 ? "opening range up: buys only today" : g_bias < 0 ? "opening range down: sells only today" : "flat opening range: no trade today");
      }
   }
   bool inPos = HasPosition();
   // 3. The live order expires after its 3 candles
   if(PendingAlive() && (b.time - g_insideTime) / BAR >= InpWaitBars) DeletePending("not triggered in " + IntegerToString(InpWaitBars) + " candles");
   if(g_ticket != 0 && !PendingAlive()) g_ticket = 0;   // filled or deleted elsewhere

   // 2. A new inside candle (after the opening range and before the cutoff, on a day with a bias,
   //    no trade open, after the candle the last trade ended in, under the daily limit)
   if(!inPos && g_bias != 0 && ny >= g_rangeEnd && ny + BAR < g_lastEntry && b.time > g_lastExitBar && g_taken < InpMaxTrades &&
      MathMin(b.open, b.close) >= MathMin(p.open, p.close) && MathMax(b.open, b.close) <= MathMax(p.open, p.close))
   {
      int dir = g_bias;
      double trig = dir > 0 ? b.high : b.low;
      double sl = dir > 0 ? MathMin(p.low, b.low) : MathMax(p.high, b.high);
      double risk = (trig - sl) * dir;
      if(risk > 0)
      {
         DeletePending("replaced by a newer inside candle");
         Place(dir, trig, sl, NormalizeDouble(trig + dir * InpTargetR * risk, _Digits), dir > 0 ? b.low : b.high, b.time);
      }
   }
   // The order stays live for the next candle only if it starts before the cutoff
   if(PendingAlive() && ny + BAR >= g_lastEntry) DeletePending("no fills from 15:00 New York");
}

int OnInit()
{
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetTypeFillingBySymbol(_Symbol);
   trade.SetDeviationInPoints(50);
   return INIT_SUCCEEDED;
}

void OnTick()
{
   datetime bt = iTime(_Symbol, PERIOD_M15, 0);
   if(bt != 0 && bt != g_lastBar)
   {
      bool first = g_lastBar == 0;
      g_lastBar = bt;
      if(!first) OnBarClose();
   }
   // The other side of the inside candle reached before the trigger: the order is gone
   if(PendingAlive())
   {
      double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID), ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      if(g_bias > 0 ? bid <= g_cancel : ask >= g_cancel) DeletePending("price reached the other side of the inside candle first");
   }
   // Time exit at 16:00 New York
   if(g_tradeFlat > 0 && HasPosition() && ToNy(TimeCurrent()) >= g_tradeFlat) { CloseAll("16:00 New York"); g_tradeFlat = 0; }
}

// Fills and exits: count the day's trades and remember where the last one ended
void OnTradeTransaction(const MqlTradeTransaction &tx, const MqlTradeRequest &req, const MqlTradeResult &res)
{
   if(tx.type != TRADE_TRANSACTION_DEAL_ADD || tx.symbol != _Symbol) return;
   if(!HistoryDealSelect(tx.deal) || HistoryDealGetInteger(tx.deal, DEAL_MAGIC) != InpMagic) return;
   long entry = HistoryDealGetInteger(tx.deal, DEAL_ENTRY);
   datetime t = (datetime)HistoryDealGetInteger(tx.deal, DEAL_TIME);
   if(entry == DEAL_ENTRY_IN)
   {
      g_taken++;
      g_tradeFlat = g_flat;
      g_ticket = 0;
      Log(StringFormat("filled at %s (trade %d of %d today)", Px(HistoryDealGetDouble(tx.deal, DEAL_PRICE)), g_taken, InpMaxTrades));
   }
   else if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY)
   {
      g_lastExitBar = t - t % BAR;
      g_tradeFlat = 0;
      Log(StringFormat("trade ended at %s, profit %.2f", Px(HistoryDealGetDouble(tx.deal, DEAL_PRICE)), HistoryDealGetDouble(tx.deal, DEAL_PROFIT)));
   }
}
//+------------------------------------------------------------------+
