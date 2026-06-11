// /app/codeclear/candidates/[id] — dev-specific OG card. Slack's fetcher hits
// the URL unauthenticated; generateMetadata + this generator both still run
// server-side, so the candidate's name surfaces in the unfurl even though the
// page body is auth-gated.

import { ImageResponse } from "next/og";
import { BrandedCard } from "@/lib/og/card";
import { loadOgFonts } from "@/lib/og/fonts";
import { loadFoundryLogo } from "@/lib/og/logo";
import { SIZE, CONTENT_TYPE } from "@/lib/og/constants";
import { loadCandidateById } from "@/lib/og/load-entity";

export const runtime = "nodejs";
export const alt = "Foundry — Developer";
export const size = SIZE;
export const contentType = CONTENT_TYPE;

export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [c, fonts, logo] = await Promise.all([
    loadCandidateById(id),
    loadOgFonts(),
    loadFoundryLogo(),
  ]);
  return new ImageResponse(
    (
      <BrandedCard
        module="CODE"
        title={c?.name ?? "Developer"}
        subtitle={c?.location ?? "Gitwork developer profile"}
        bottomRight="Developer"
        logoDataUri={logo}
      />
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
