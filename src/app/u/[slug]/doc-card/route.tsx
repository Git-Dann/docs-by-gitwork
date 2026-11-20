/**
 * A person's doc card image (src/lib/og/profile-doc-card.tsx): the small linked card pasted into
 * a document when work is attributed to them. Public like the page itself, and only while the
 * page is live; a hidden or unknown page is a 404, so a doc never shows a card for a page that
 * would say "not found".
 */
import { ImageResponse } from "next/og";
import { loadOgFonts } from "@/lib/og/fonts";
import { DOC_CARD_SIZE, ProfileDocCard } from "@/lib/og/profile-doc-card";
import { cardColour, DEFAULT_CARD } from "@/lib/profile-card";
import { loadPublicProfile } from "@/server/public-profile";
import { profilePhotoPng } from "@/server/profile-photo";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await loadPublicProfile(slug);
  if (!p) return new Response("Not found", { status: 404 });
  const [fonts, photo] = await Promise.all([loadOgFonts(), profilePhotoPng(slug, 464)]);
  const { bg, fg } = cardColour((p.card ?? DEFAULT_CARD).colour);
  const image = new ImageResponse(
    <ProfileDocCard
      name={p.name}
      position={p.position ?? p.headline}
      bg={bg}
      fg={fg}
      photoDataUri={photo ? `data:image/png;base64,${photo.toString("base64")}` : null}
    />,
    { ...DOC_CARD_SIZE, fonts: fonts.length ? fonts : undefined },
  );
  // Google Docs copies the image when it's pasted, so a short cache is plenty.
  image.headers.set("Cache-Control", "public, max-age=300");
  return image;
}
