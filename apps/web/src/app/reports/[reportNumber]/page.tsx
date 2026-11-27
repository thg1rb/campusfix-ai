import Screen from "@/features/reports/screens/PublicReportDetailScreen";

export default async function Page({ params }: { params: Promise<{ reportNumber: string }> }) {
  const { reportNumber } = await params;
  return <Screen reportNumber={reportNumber} />;
}
