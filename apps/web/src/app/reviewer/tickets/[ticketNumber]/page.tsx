import Screen from "@/features/reviewer/screens/ReviewerTicketScreen";

export default async function Page({ params }: { params: Promise<{ ticketNumber: string }> }) {
  const { ticketNumber } = await params;
  return <Screen ticketNumber={ticketNumber} />;
}
