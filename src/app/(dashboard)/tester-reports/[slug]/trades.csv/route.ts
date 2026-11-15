import { authChallengeResponse, authenticateRequest } from "@/lib/auth";
import { loadReportTrades } from "@/lib/testerReports/dashboard";
import { tradesCsv } from "@/lib/testerReports/report";

// GET /tester-reports/<slug>/trades.csv → every trade of that tester run.
export async function GET(request: Request, ctx: RouteContext<"/tester-reports/[slug]/trades.csv">) {
  const user = await authenticateRequest(request);
  if (!user) return authChallengeResponse();
  const { slug } = await ctx.params;
  const trades = await loadReportTrades(slug);
  if (!trades) return new Response("Report not found", { status: 404 });
  return new Response(tradesCsv(trades), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}-trades.csv"` },
  });
}
