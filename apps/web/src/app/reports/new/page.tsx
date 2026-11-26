import Screen from "@/features/reports/screens/CreateReportScreen"

export default async function Page({ searchParams }: { searchParams: Promise<{ draftId?: string; targetTicketNumber?: string }> }) {
  const { draftId, targetTicketNumber } = await searchParams
  return <Screen draftId={typeof draftId === "string" ? draftId : undefined} targetId={typeof targetTicketNumber === "string" ? targetTicketNumber : undefined} />
}
