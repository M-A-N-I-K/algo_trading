import { notFound } from "next/navigation";
import TesterReportView from "@/components/testerReports/TesterReportView";
import { loadDashboard } from "@/lib/testerReports/dashboard";
import { TESTER_REPORTS } from "@/lib/testerReports/catalog";

export function generateStaticParams() {
  return TESTER_REPORTS.map((r) => ({ slug: r.slug }));
}

export default async function TesterReportPage(props: PageProps<"/tester-reports/[slug]">) {
  const { slug } = await props.params;
  const d = await loadDashboard(slug);
  if (!d) notFound();
  return <TesterReportView d={d} />;
}
