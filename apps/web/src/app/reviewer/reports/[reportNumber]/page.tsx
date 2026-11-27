import Screen from "@/features/reviewer/screens/ReviewerReportScreen";

export default async function Page({ params }: { params: Promise<{ reportNumber: string }> }) {
  const { reportNumber } = await params;
  return <Screen reportNumber={reportNumber} />;
}
