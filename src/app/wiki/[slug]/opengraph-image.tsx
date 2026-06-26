// OG for legacy /wiki/<token> links (the [slug] segment holds the token here) so
// social unfurls still resolve even if a crawler doesn't follow the redirect.

import { ImageResponse } from "next/og";
import { BrandedCard } from "@/lib/og/card";
import { loadOgFonts } from "@/lib/og/fonts";
import { loadFoundryLogo } from "@/lib/og/logo";
import { SIZE, CONTENT_TYPE } from "@/lib/og/constants";
import { loadWikiByToken } from "@/lib/og/load-entity";

export const runtime = "nodejs";
export const alt = "Foundry wiki";
export const size = SIZE;
export const contentType = CONTENT_TYPE;

export default async function OgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: token } = await params;
  const [wiki, fonts, logo] = await Promise.all([
    loadWikiByToken(token),
    loadOgFonts(),
    loadFoundryLogo(),
  ]);
  return new ImageResponse(
    (
      <BrandedCard
        module="WIKI"
        title={wiki?.clientName ?? "Wiki"}
        subtitle={wiki?.section ?? "Knowledge wiki"}
        bottomRight={wiki?.section ?? "Wiki"}
        logoDataUri={logo}
      />
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
