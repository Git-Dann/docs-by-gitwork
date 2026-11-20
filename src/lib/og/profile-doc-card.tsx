/* eslint-disable @next/next/no-img-element */
/**
 * A person's doc card: the small linked card you paste into a document (a proposal, a
 * handover) when you attribute work to someone. Their card colour, photo, name and position,
 * nothing else. Drawn by Satori at 1200×360 (shown at 600×180, so it stays sharp).
 * Served by src/app/u/[slug]/doc-card/route.tsx; copied by the profile banner (doc-card.ts).
 */
import { MONO_FAMILY, SERIF_FAMILY } from "./fonts";

export const DOC_CARD_SIZE = { width: 1200, height: 360 } as const;

/** Long names step down so they stay on one line. */
const nameSize = (name: string) => (name.length <= 18 ? 84 : name.length <= 26 ? 70 : 58);

export function ProfileDocCard({
  name,
  position,
  bg,
  fg,
  photoDataUri,
}: {
  name: string;
  position: string | null;
  bg: string;
  fg: string;
  photoDataUri: string | null;
}) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  const frame = { width: 232, height: 232, borderRadius: 32, border: `6px solid ${fg}` } as const;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", background: bg, color: fg, padding: "0 64px", borderRadius: 28 }}>
      {photoDataUri ? (
        <img src={photoDataUri} width={232} height={232} style={{ ...frame, objectFit: "cover" }} alt="" />
      ) : (
        <div style={{ ...frame, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SERIF_FAMILY, fontSize: 96 }}>
          {initials}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", marginLeft: 56, flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: SERIF_FAMILY, fontSize: nameSize(name), lineHeight: 1.05 }}>{name}</div>
        {position ? (
          <div style={{ fontFamily: MONO_FAMILY, fontSize: 30, lineHeight: 1.35, marginTop: 18, opacity: 0.9, textTransform: "uppercase", letterSpacing: 2 }}>
            {position}
          </div>
        ) : null}
      </div>
    </div>
  );
}
