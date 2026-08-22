import { ImageResponse } from "next/og";
import { ADVERTISED_CHECK_COUNT_LABEL } from "@/server/checks-registry";
import { BrandedCard } from "@/lib/og/card";
import { loadOgFonts } from "@/lib/og/fonts";
import { loadFoundryLogo } from "@/lib/og/logo";
import { SIZE, CONTENT_TYPE } from "@/lib/og/constants";

export const runtime = "nodejs";
export const alt = "Pulse — Foundry by Gitwork";
export const size = SIZE;
export const contentType = CONTENT_TYPE;

export default async function OgImage() {
  const [fonts, logo] = await Promise.all([loadOgFonts(), loadFoundryLogo()]);
  return new ImageResponse(
    (
      <BrandedCard
        module="PULSE"
        title="Pulse — AI project validation"
        subtitle={`${ADVERTISED_CHECK_COUNT_LABEL} automated checks. Find what's broken before your users do.`}
        bottomRight="Overview"
        logoDataUri={logo}
      />
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
