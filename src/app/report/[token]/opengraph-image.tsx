// /report/[token] — public Pulse scan report. Shows project name + health
// score as the headline metric.

import { ImageResponse } from "next/og";
import { BrandedCard } from "@/lib/og/card";
import { loadOgFonts } from "@/lib/og/fonts";
import { loadFoundryLogo } from "@/lib/og/logo";
import { SIZE, CONTENT_TYPE } from "@/lib/og/constants";
import { loadPulseScanByToken } from "@/lib/og/load-entity";

export const runtime = "nodejs";
export const alt = "Foundry Pulse report";
export const size = SIZE;
export const contentType = CONTENT_TYPE;

export default async function OgImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [scan, fonts, logo] = await Promise.all([
    loadPulseScanByToken(token),
    loadOgFonts(),
    loadFoundryLogo(),
  ]);
  const metric =
    scan?.healthScore != null ? `${scan.healthScore}/100` : null;
  return new ImageResponse(
    (
      <BrandedCard
        module="PULSE"
        title={scan?.projectName ?? "Pulse report"}
        subtitle="Technical audit & health score"
        bottomRight="Report"
        metric={metric}
        logoDataUri={logo}
      />
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
