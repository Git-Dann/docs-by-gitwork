/**
 * A person's public profile, /u/<handle> (CLAUDE.md §139). No sign-in: the person chose to make
 * it public. A page that is off, unknown or archived is a plain 404, the same for every case, so
 * the route can't be used to learn who has a profile.
 */
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { PublicProfileView } from "@/components/profile/public-profile-view";
import { auth } from "@/auth";
import { loadPublicProfile, publicAvatarUserId } from "@/server/public-profile";
import { walletAvailability } from "@/server/profile-wallet";

export const dynamic = "force-dynamic";

/** Phones: the browser bar takes the brand colour, and the page can use the full screen width. */
export const viewport: Viewport = { themeColor: "#1D4ED8", viewportFit: "cover" };

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await loadPublicProfile(slug);
  if (!p) return { title: "Profile not found", robots: { index: false, follow: false } };
  const description = p.headline ?? p.bio ?? `${p.name} at ${p.company}`;
  return {
    title: `${p.name} · ${p.company}`,
    description,
    // Shared by link, not found by search: a person opting in to a page isn't opting in to Google.
    robots: { index: false, follow: false },
    openGraph: { title: `${p.name} · ${p.company}`, description, type: "profile" },
  };
}

export default async function PublicProfilePage({ params }: Props) {
  const { slug } = await params;
  const profile = await loadPublicProfile(slug);
  if (!profile) notFound();
  // The owner, signed in, gets an Edit button. A failed session read just means no button.
  const [session, ownerId] = await Promise.all([auth().catch(() => null), publicAvatarUserId(slug)]);
  const isOwner = Boolean(ownerId && session?.user?.id === ownerId);
  return <PublicProfileView profile={profile} isOwner={isOwner} wallets={walletAvailability()} />;
}
