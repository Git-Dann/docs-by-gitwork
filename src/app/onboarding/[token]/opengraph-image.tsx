import { ImageResponse } from "next/og";

// Generic, Gitwork-branded link preview that mirrors the Docs `DocumentCover`
// hero (blue gradient, faded rings, mono eyebrow, DM Serif title). Carries NO
// client data — unfurls are public to anyone the tokenised URL reaches.

export const alt = "Gitwork — Project onboarding";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Fetch a TTF from Google Fonts for Satori (an old UA makes Google serve TTF,
// which Satori needs — it can't parse woff2). Best-effort: on any failure we
// fall back to the default font so the image still renders.
async function loadFont(family: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`,
      { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1)" } },
    ).then((r) => r.text());
    const url = css.match(/src:\s*url\(([^)]+)\)\s*format\(['"]?truetype/)?.[1]
      ?? css.match(/src:\s*url\(([^)]+)\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function OnboardingOgImage() {
  const [serif, mono] = await Promise.all([
    loadFont("DM Serif Display", 400),
    loadFont("JetBrains Mono", 600),
  ]);

  const fonts = [
    serif && { name: "DM Serif Display", data: serif, weight: 400 as const, style: "normal" as const },
    mono && { name: "JetBrains Mono", data: mono, weight: 600 as const, style: "normal" as const },
  ].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 400 | 600; style: "normal" }[];

  const serifFamily = serif ? "DM Serif Display" : "Georgia, serif";
  const monoFamily = mono ? "JetBrains Mono" : "monospace";

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          color: "#ffffff",
          backgroundColor: "#1D4ED8",
          backgroundImage: "linear-gradient(140deg, #1D4ED8 0%, #1E3A8A 100%)",
          position: "relative",
        }}
      >
        {/* Faded concentric rings, top-right — same accent as DocumentCover */}
        <div
          style={{
            position: "absolute",
            top: -150,
            right: -150,
            width: 620,
            height: 620,
            borderRadius: 9999,
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: -60,
            right: -60,
            width: 380,
            height: 380,
            borderRadius: 9999,
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        />

        {/* Eyebrow */}
        <div
          style={{
            fontFamily: monoFamily,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.55)",
          }}
        >
          Gitwork // Onboarding
        </div>

        {/* Title + subtitle */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontFamily: serifFamily,
              fontSize: 80,
              lineHeight: 1.05,
              maxWidth: 920,
            }}
          >
            Let’s get your project set up.
          </div>
          <div style={{ fontSize: 30, marginTop: 24, color: "rgba(255,255,255,0.6)" }}>
            A quick, secure onboarding — about 3 minutes.
          </div>
        </div>

        {/* Footer */}
        <div style={{ fontFamily: monoFamily, fontSize: 22, color: "rgba(255,255,255,0.45)" }}>
          gitwork.co.uk
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
