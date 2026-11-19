/** /demo/profile — the public profile page drawn from a fixture, for checking the design. */
import type { Metadata } from "next";
import { PublicProfileView } from "@/components/profile/public-profile-view";
import { DEMO_PUBLIC_PROFILE } from "@/lib/demo/demo-public-profile";

export const metadata: Metadata = { title: "Profile demo", robots: { index: false, follow: false } };

export default function DemoProfilePage() {
  return <PublicProfileView profile={DEMO_PUBLIC_PROFILE} />;
}
