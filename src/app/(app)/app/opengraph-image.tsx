// /app — Foundry HQ. Used as the fallback OG card for any in-app route that
// doesn't supply its own (and as the card unfurled when an auth-gated URL is
// shared in Slack — the fetcher hits the page unauthenticated and sees this
// metadata, even though the page body is gated).

import { ImageResponse } from "next/og";
import { BrandedCard } from "@/lib/og/card";
import { loadOgFonts } from "@/lib/og/fonts";
import { loadFoundryLogo } from "@/lib/og/logo";
import { SIZE, CONTENT_TYPE } from "@/lib/og/constants";

export const runtime = "nodejs";
export const alt = "Foundry HQ";
export const size = SIZE;
export const contentType = CONTENT_TYPE;

export default async function OgImage() {
  const [fonts, logo] = await Promise.all([loadOgFonts(), loadFoundryLogo()]);
  return new ImageResponse(
    (
      <BrandedCard
        module="FOUNDRY"
        title="Foundry HQ"
        subtitle="Gitwork's delivery platform"
        bottomRight="Platform"
        logoDataUri={logo}
      />
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
