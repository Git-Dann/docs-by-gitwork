/**
 * The share image for a public profile (CLAUDE.md §139): what Slack, LinkedIn, WhatsApp and
 * iMessage show when someone pastes the link. Each person's own: their card colour, photo, name,
 * headline and page address. A page that isn't public gets Foundry's plain card.
 */
import { ImageResponse } from "next/og";
import { BrandedCard } from "@/lib/og/card";
import { SIZE, CONTENT_TYPE } from "@/lib/og/constants";
import { loadOgFonts } from "@/lib/og/fonts";
import { ProfileShareCard } from "@/lib/og/profile-share-card";
import { loadFoundryLogo } from "@/lib/og/logo";
import { cardColour, DEFAULT_CARD } from "@/lib/profile-card";
import { loadPublicProfile } from "@/server/public-profile";
import { profilePhotoPng } from "@/server/profile-photo";

export const runtime = "nodejs";
export const alt = "Profile on Foundry";
export const size = SIZE;
export const contentType = CONTENT_TYPE;

export default async function ProfileOgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [fonts, logo, p] = await Promise.all([loadOgFonts(), loadFoundryLogo(), loadPublicProfile(slug)]);
  const options = { ...size, fonts: fonts.length ? fonts : undefined };
  if (!p) {
    return new ImageResponse(
      <BrandedCard module="FOUNDRY" title="Profile on Foundry" bottomRight="foundry.gitwork.co.uk" logoDataUri={logo} />,
      options,
    );
  }
  const { bg, fg } = cardColour((p.card ?? DEFAULT_CARD).colour);
  const photo = await profilePhotoPng(slug, 520);

  return new ImageResponse(
    <ProfileShareCard
      name={p.name}
      headline={p.headline}
      facts={[p.company, p.location].filter(Boolean).join("  ·  ")}
      bg={bg}
      fg={fg}
      photoDataUri={photo ? `data:image/png;base64,${photo.toString("base64")}` : null}
      slug={slug}
    />,
    options,
  );
}
