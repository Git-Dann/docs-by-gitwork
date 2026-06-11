import { ImageResponse } from "next/og";
import { BrandedCard } from "@/lib/og/card";
import { loadOgFonts } from "@/lib/og/fonts";
import { loadFoundryLogo } from "@/lib/og/logo";
import { SIZE, CONTENT_TYPE } from "@/lib/og/constants";
import { loadDocumentById } from "@/lib/og/load-entity";

export const runtime = "nodejs";
export const alt = "Foundry document";
export const size = SIZE;
export const contentType = CONTENT_TYPE;

export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [doc, fonts, logo] = await Promise.all([
    loadDocumentById(id),
    loadOgFonts(),
    loadFoundryLogo(),
  ]);
  return new ImageResponse(
    (
      <BrandedCard
        module="DOCS"
        title={doc?.title ?? "Document"}
        subtitle={doc?.subtitle ?? null}
        bottomRight={doc?.bottomRight ?? "Document"}
        logoDataUri={logo}
      />
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
