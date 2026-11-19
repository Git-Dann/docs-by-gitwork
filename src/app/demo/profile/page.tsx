/** /demo/profile — the public profile page drawn from a fixture. `?long=1` is the awkward case. */
import type { Metadata } from "next";
import { PublicProfileView } from "@/components/profile/public-profile-view";
import { DEMO_PUBLIC_PROFILE, DEMO_PUBLIC_PROFILE_LONG } from "@/lib/demo/demo-public-profile";

export const metadata: Metadata = { title: "Profile demo", robots: { index: false, follow: false } };

export default async function DemoProfilePage({ searchParams }: { searchParams: Promise<{ long?: string }> }) {
  const { long } = await searchParams;
  return <PublicProfileView profile={long ? DEMO_PUBLIC_PROFILE_LONG : DEMO_PUBLIC_PROFILE} />;
}
