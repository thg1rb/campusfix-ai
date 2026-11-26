import Screen from "@/features/public-feed/screens/PublicProfileScreen"

export default async function Page({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  return <Screen username={username} />
}
