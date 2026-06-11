// /wiki/[token] — public client wiki. Section name shown when the share is
// scoped to a single section (Design System / IA / Dev Guide / Changelog /
// Course Requests), else just "Wiki".

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

export default async function OgImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
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
