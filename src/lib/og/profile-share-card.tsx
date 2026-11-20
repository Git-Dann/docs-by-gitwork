/* eslint-disable @next/next/no-img-element */
/**
 * A public profile's share image (src/app/u/[slug]/opengraph-image.tsx), drawn by Satori: the
 * person's card colour, photo, name, headline and page address. Pure, so it can be rendered and
 * checked without a database.
 */
import { MONO_FAMILY, SERIF_FAMILY } from "./fonts";

/** Long names step down so they stay on two lines. */
const nameSize = (name: string) => (name.length <= 16 ? 92 : name.length <= 24 ? 78 : 64);

export function ProfileShareCard({
  name,
  headline,
  facts,
  bg,
  fg,
  photoDataUri,
  slug,
}: {
  name: string;
  headline: string | null;
  facts: string;
  bg: string;
  fg: string;
  photoDataUri: string | null;
  slug: string;
}) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  const frame = { width: 340, height: 340, borderRadius: 40, border: `8px solid ${fg}` } as const;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: bg, color: fg, padding: 72, alignItems: "center" }}>
      {photoDataUri ? (
        <img src={photoDataUri} width={340} height={340} style={{ ...frame, objectFit: "cover" }} alt="" />
      ) : (
        <div style={{ ...frame, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SERIF_FAMILY, fontSize: 140 }}>
          {initials}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", marginLeft: 64, flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: SERIF_FAMILY, fontSize: nameSize(name), lineHeight: 1.02 }}>{name}</div>
        {headline ? (
          <div style={{ fontFamily: MONO_FAMILY, fontSize: 28, lineHeight: 1.35, marginTop: 24, opacity: 0.92 }}>{headline}</div>
        ) : null}
        {facts ? (
          <div style={{ fontFamily: MONO_FAMILY, fontSize: 22, marginTop: 20, opacity: 0.7, textTransform: "uppercase", letterSpacing: 2 }}>
            {facts}
          </div>
        ) : null}
      </div>
      <div
        style={{
          position: "absolute",
          left: 72,
          right: 72,
          bottom: 40,
          display: "flex",
          justifyContent: "space-between",
          fontFamily: MONO_FAMILY,
          fontSize: 20,
          opacity: 0.75,
        }}
      >
        <span>PROFILE ON FOUNDRY</span>
        <span>{`foundry.gitwork.co.uk/u/${slug}`}</span>
      </div>
    </div>
  );
}
