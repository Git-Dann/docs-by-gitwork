import { ImageResponse } from "next/og";
import { BrandedCard } from "@/lib/og/card";
import { loadOgFonts } from "@/lib/og/fonts";
import { loadFoundryLogo } from "@/lib/og/logo";
import { SIZE, CONTENT_TYPE } from "@/lib/og/constants";

export const runtime = "nodejs";
export const alt = "Foundry — Portal";
export const size = SIZE;
export const contentType = CONTENT_TYPE;

export default async function OgImage() {
  const [fonts, logo] = await Promise.all([loadOgFonts(), loadFoundryLogo()]);
  return new ImageResponse(
    (
      <BrandedCard
        module="PORTAL"
        title="Portal"
        subtitle="Clients & engagement"
        bottomRight="Clients"
        logoDataUri={logo}
      />
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
