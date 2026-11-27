import Screen from "@/features/auth/screens/LoginScreen";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return <Screen next={typeof next === "string" ? next : undefined} />;
}
