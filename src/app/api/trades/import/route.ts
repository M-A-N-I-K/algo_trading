import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateRequest, authChallengeResponse } from "@/lib/auth";

// Helper to parse the custom action strings from CSV
function parseActionText(actionStr: string) {
  const symbolMatch = actionStr.match(/symbol\s+([^\s]+)/);
  const priceMatch = actionStr.match(/at\s+price\s+([0-9.]+)/);
  const qtyMatch = actionStr.match(/for\s+([0-9.]+)\s+units/);
  const avgPriceMatch = actionStr.match(/Price\s+was\s+([0-9.]+)/);
  const currencyMatch = actionStr.match(/currency:\s+([^\s,]+)/);
  
  let exchange = "UNKNOWN";
  let symbol = "UNKNOWN";
  if (symbolMatch && symbolMatch[1]) {
    const rawSym = symbolMatch[1];
    if (rawSym.includes(":")) {
      const parts = rawSym.split(":");
      exchange = parts[0];
      symbol = parts[1];
    } else {
      symbol = rawSym;
    }
  }

  const side = actionStr.toLowerCase().includes("long") ? "LONG" : "SHORT";

  return {
    exchange,
    symbol,
    side,
    exitPrice: priceMatch ? parseFloat(priceMatch[1]) : 0,
    quantity: qtyMatch ? parseFloat(qtyMatch[1]) : 0,
    entryPrice: avgPriceMatch ? parseFloat(avgPriceMatch[1]) : 0,
    currency: currencyMatch ? currencyMatch[1] : "USD"
  };
}

// Helper to parse a CSV line, respecting double quotes and commas within quotes
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) {
    return authChallengeResponse();
  }

  try {
    const { csvText } = await request.json();
    if (!csvText) {
      return NextResponse.json({ error: "No CSV text provided" }, { status: 400 });
    }

    const lines = csvText.split(/\r?\n/).filter((l: string) => l.trim().length > 0);
    if (lines.length < 2) {
      return NextResponse.json({ error: "CSV has no data rows" }, { status: 400 });
    }

    const headers = lines[0].split(",").map((h: string) => h.trim());
    let importedCount = 0;

    // Load existing trade times/pnl to optimize duplicate checking in memory
    const existingTrades = await prisma.trade.findMany({
      where: { userId: user.id },
      select: { time: true, pnl: true }
    });

    // Helper to check for duplicates in memory
    const isDuplicate = (timeStr: string, pnlVal: number) => {
      const targetTime = new Date(timeStr).getTime();
      if (isNaN(targetTime)) {
        return false;
      }
      return existingTrades.some(t => {
        return Math.abs(t.time.getTime() - targetTime) < 2000 && Math.abs(t.pnl - pnlVal) < 0.01;
      });
    };

    const createDataList = [];

    for (let i = 1; i < lines.length; i++) {
      const cleanRow = parseCsvLine(lines[i]);
      if (cleanRow.length < headers.length) {
        continue;
      }
      
      const time = cleanRow[0];
      const balBefore = parseFloat(cleanRow[1]);
      const balAfter = parseFloat(cleanRow[2]);
      const pnl = parseFloat(cleanRow[3]);
      const currency = cleanRow[4];
      const action = cleanRow[5];

      // Avoid duplicates or malformed inputs
      if (!time || isNaN(pnl)) {
        continue;
      }
      if (isDuplicate(time, pnl)) {
        continue;
      }

      // Avoid duplicate checks against what we are already going to insert in this batch
      const isAlreadyInBatch = createDataList.some(item => {
        return Math.abs(item.time.getTime() - new Date(time).getTime()) < 2000 && Math.abs(item.pnl - pnl) < 0.01;
      });
      if (isAlreadyInBatch) {
        continue;
      }

      const details = parseActionText(action);

      createDataList.push({
        time: new Date(time),
        balanceBefore: isNaN(balBefore) ? null : balBefore,
        balanceAfter: isNaN(balAfter) ? null : balAfter,
        pnl,
        currency,
        symbol: details.symbol,
        exchange: details.exchange,
        side: details.side,
        quantity: details.quantity,
        entryPrice: details.entryPrice,
        exitPrice: details.exitPrice,
        strategy: "macd-200ema-sr", // default
        notes: `Imported trade. Action Details: ${action}`,
        userId: user.id
      });
    }

    if (createDataList.length > 0) {
      const result = await prisma.trade.createMany({
        data: createDataList,
        skipDuplicates: true
      });
      importedCount = result.count;
    }

    return NextResponse.json({ success: true, count: importedCount });
  } catch (e: any) {
    console.error("CSV Import Error:", e);
    return NextResponse.json({ error: "Failed to parse CSV: " + e.message }, { status: 500 });
  }
}
