import { ImageResponse } from "next/og";
import { BrandedCard } from "@/lib/og/card";
import { loadOgFonts } from "@/lib/og/fonts";
import { loadFoundryLogo } from "@/lib/og/logo";
import { SIZE, CONTENT_TYPE } from "@/lib/og/constants";
import { loadClientByTimelineToken } from "@/lib/og/load-entity";

export const runtime = "nodejs";
export const alt = "Foundry project timeline";
export const size = SIZE;
export const contentType = CONTENT_TYPE;

export default async function OgImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [client, fonts, logo] = await Promise.all([
    loadClientByTimelineToken(token),
    loadOgFonts(),
    loadFoundryLogo(),
  ]);
  return new ImageResponse(
    (
      <BrandedCard
        module="PORTAL"
        title={client?.name ?? "Project timeline"}
        subtitle="Live delivery roadmap"
        bottomRight="Timeline"
        logoDataUri={logo}
      />
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
