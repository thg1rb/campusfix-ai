import Screen from "@/features/department/screens/DepartmentTicketScreen";

export default async function Page({ params }: { params: Promise<{ ticketNumber: string }> }) {
  const { ticketNumber } = await params;
  return <Screen ticketNumber={ticketNumber} />;
}
