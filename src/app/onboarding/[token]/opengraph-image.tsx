import { ImageResponse } from "next/og";

// Generic, Gitwork-branded preview for shared onboarding links. Intentionally
// carries NO client data — a link unfurl renders for anyone the tokenised URL
// is forwarded to, so the image must never leak who's being onboarded.

export const alt = "Gitwork — Project onboarding";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OnboardingOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          color: "#ffffff",
          backgroundColor: "#1D4ED8",
          backgroundImage:
            "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 46%, #1E3A8A 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 700 }}>Gitwork</div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 72, fontWeight: 700 }}>
            Let’s get your project set up.
          </div>
          <div style={{ fontSize: 30, opacity: 0.85, marginTop: 24 }}>
            A quick, secure onboarding — about 3 minutes.
          </div>
        </div>

        <div style={{ fontSize: 24, opacity: 0.7 }}>gitwork.co.uk</div>
      </div>
    ),
    { ...size },
  );
}
