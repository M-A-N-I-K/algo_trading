import { NextRequest, NextResponse } from "next/server";
import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { decodeReport, parseMt5Report } from "@/lib/mt5/report";
import { importReport, mt5Summary } from "@/lib/mt5/store";

const MAX_BYTES = 5 * 1024 * 1024;

// GET /api/mt5 → imported MT5 positions, totals and the commission each
// symbol was charged.
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();
  try {
    return NextResponse.json(await mt5Summary(user.id));
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/mt5 (multipart, field "file") → import an MT5 Trade History
// Report (HTML). Positions already stored are updated, new ones added.
export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ message: "Attach the report as 'file'." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ message: "That file is larger than an MT5 report should be (5 MB)." }, { status: 413 });
    let report;
    try {
      report = parseMt5Report(decodeReport(new Uint8Array(await file.arrayBuffer())));
    } catch (e) {
      return NextResponse.json({ message: e instanceof Error ? e.message : "Couldn't read that report." }, { status: 422 });
    }
    const result = await importReport(user.id, report);
    return NextResponse.json({
      ...result,
      account: { login: report.login, server: report.server, type: report.accountType, balance: report.balance, equity: report.equity },
      summary: await mt5Summary(user.id),
    });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
