import Screen from "@/features/tickets/screens/TicketDetailScreen";

export default async function Page({ params }: { params: Promise<{ ticketNumber: string }> }) {
  const { ticketNumber } = await params;
  return <Screen ticketNumber={ticketNumber} />;
}
