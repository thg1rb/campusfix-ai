import Screen from "@/features/auth/screens/LoginScreen";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const { next, error } = await searchParams;
  return (
    <Screen
      next={typeof next === "string" ? next : undefined}
      error={typeof error === "string" ? error : undefined}
    />
  );
}
