import { ImageResponse } from "next/og";
import { BrandedCard } from "@/lib/og/card";
import { loadOgFonts } from "@/lib/og/fonts";
import { loadFoundryLogo } from "@/lib/og/logo";
import { SIZE, CONTENT_TYPE } from "@/lib/og/constants";
import { loadClientByBrandToken } from "@/lib/og/load-entity";

export const runtime = "nodejs";
export const alt = "Foundry brand & design system";
export const size = SIZE;
export const contentType = CONTENT_TYPE;

export default async function OgImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [client, fonts, logo] = await Promise.all([
    loadClientByBrandToken(token),
    loadOgFonts(),
    loadFoundryLogo(),
  ]);
  return new ImageResponse(
    (
      <BrandedCard
        module="BRAND"
        title={client?.name ?? "Design system"}
        subtitle="Brand tokens, colour, type"
        bottomRight="Design System"
        logoDataUri={logo}
      />
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
