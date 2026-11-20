/** /demo/profile/doc-card: the demo profile's doc card, drawn from the fixture (no database). */
import { ImageResponse } from "next/og";
import { loadOgFonts } from "@/lib/og/fonts";
import { DOC_CARD_SIZE, ProfileDocCard } from "@/lib/og/profile-doc-card";
import { cardColour, DEFAULT_CARD } from "@/lib/profile-card";
import { DEMO_PUBLIC_PROFILE } from "@/lib/demo/demo-public-profile";

export const runtime = "nodejs";

export async function GET() {
  const p = DEMO_PUBLIC_PROFILE;
  const fonts = await loadOgFonts();
  const { bg, fg } = cardColour((p.card ?? DEFAULT_CARD).colour);
  return new ImageResponse(<ProfileDocCard name={p.name} position={p.position ?? p.headline} bg={bg} fg={fg} photoDataUri={null} />, {
    ...DOC_CARD_SIZE,
    fonts: fonts.length ? fonts : undefined,
  });
}
