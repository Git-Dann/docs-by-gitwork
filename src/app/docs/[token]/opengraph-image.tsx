// /docs/[token] — per-document OG card. Loads the document by share token and
// renders title + client + document number. Token rotation kills the cached
// image automatically because the URL itself changes.

import { ImageResponse } from "next/og";
import { BrandedCard } from "@/lib/og/card";
import { loadOgFonts } from "@/lib/og/fonts";
import { loadFoundryLogo } from "@/lib/og/logo";
import { SIZE, CONTENT_TYPE } from "@/lib/og/constants";
import { loadDocumentByToken } from "@/lib/og/load-entity";

export const runtime = "nodejs";
export const alt = "Foundry document";
export const size = SIZE;
export const contentType = CONTENT_TYPE;

export default async function OgImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [doc, fonts, logo] = await Promise.all([
    loadDocumentByToken(token),
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
