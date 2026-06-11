import { ImageResponse } from "next/og";
import { BrandedCard } from "@/lib/og/card";
import { loadOgFonts } from "@/lib/og/fonts";
import { loadFoundryLogo } from "@/lib/og/logo";
import { SIZE, CONTENT_TYPE } from "@/lib/og/constants";

export const runtime = "nodejs";
export const alt = "Foundry — Study";
export const size = SIZE;
export const contentType = CONTENT_TYPE;

export default async function OgImage() {
  const [fonts, logo] = await Promise.all([loadOgFonts(), loadFoundryLogo()]);
  return new ImageResponse(
    (
      <BrandedCard
        module="STUDY"
        title="Study"
        subtitle="AI-powered user research"
        bottomRight="User research"
        logoDataUri={logo}
      />
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
