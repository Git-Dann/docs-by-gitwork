import { notFound } from "next/navigation";
import { getOnboardingByTokenPublic } from "@/server/onboarding";
import { OnboardingFlow } from "./onboarding-flow";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Onboarding — Gitwork",
  description: "Tell us about your project so we can hit the ground running.",
};

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await getOnboardingByTokenPublic(token);
  if (!session) notFound();

  return <OnboardingFlow token={token} initialSession={session} />;
}
