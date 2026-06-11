import { ImageResponse } from "next/og";
import { BrandedCard } from "@/lib/og/card";
import { loadOgFonts } from "@/lib/og/fonts";
import { loadFoundryLogo } from "@/lib/og/logo";
import { SIZE, CONTENT_TYPE } from "@/lib/og/constants";
import { loadStudyById } from "@/lib/og/load-entity";

export const runtime = "nodejs";
export const alt = "Foundry Study";
export const size = SIZE;
export const contentType = CONTENT_TYPE;

export default async function OgImage({ params }: { params: Promise<{ studyId: string }> }) {
  const { studyId } = await params;
  const [s, fonts, logo] = await Promise.all([
    loadStudyById(studyId),
    loadOgFonts(),
    loadFoundryLogo(),
  ]);
  return new ImageResponse(
    (
      <BrandedCard
        module="STUDY"
        title={s?.title ?? "User research study"}
        subtitle="AI persona interviews"
        bottomRight="Study"
        logoDataUri={logo}
      />
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
