import { ImageResponse } from "next/og";

/**
 * Dynamic link-preview (OG) image for the white-labelled demo suite.
 *
 * `/demo/og?name=<Client>&color=<#hex>` → a 1200×630 branded card so pasting a
 * `/demo/<Client>` link into Slack / iMessage / socials unfurls with an image, not
 * just text. Public by design (crawlers must fetch it) — it lives outside `/api`
 * so the API_KEY middleware doesn't gate it, and reads nothing but its own query.
 */

export const runtime = "nodejs";

/** Only allow a real #hex colour; otherwise fall back to Gitwork Blue. */
function safeColor(raw: string | null): string {
  const t = (raw ?? "").trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(t) ? t : "#1D4ED8";
}

/** Pick readable text (dark/light) for a solid swatch of `hex`. */
function readableOn(hex: string): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.62 ? "#0F172A" : "#FFFFFF";
}

export function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = (searchParams.get("name") || "Foundry").trim().slice(0, 42) || "Foundry";
  const color = safeColor(searchParams.get("color"));
  const nameSize = name.length > 16 ? 78 : name.length > 10 ? 98 : 118;

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#FAFAF9" }}>
        {/* Client-colour band */}
        <div style={{ width: 26, height: "100%", background: color }} />

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "68px 76px",
          }}
        >
          {/* Top row — Foundry mark + eyebrow, and a LIVE DEMO chip in the client colour */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 11,
                  background: "#1D4ED8",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 6,
                  padding: "0 12px",
                }}
              >
                <div style={{ height: 3.5, width: "100%", background: "#fff", borderRadius: 2 }} />
                <div style={{ height: 3.5, width: "72%", background: "#fff", borderRadius: 2 }} />
                <div style={{ height: 3.5, width: "46%", background: "#fff", borderRadius: 2 }} />
              </div>
              <div style={{ display: "flex", fontSize: 23, letterSpacing: 3, color: "#64748B" }}>
                FOUNDRY BY GITWORK
              </div>
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 20,
                letterSpacing: 3,
                color: readableOn(color),
                background: color,
                padding: "9px 18px",
                borderRadius: 8,
              }}
            >
              LIVE DEMO
            </div>
          </div>

          {/* Centre — accent rule + client name + subtitle */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ width: 148, height: 8, background: color, borderRadius: 4, marginBottom: 30 }} />
            <div style={{ display: "flex", fontSize: nameSize, fontWeight: 700, color: "#0F172A", lineHeight: 1 }}>
              {name}
            </div>
            <div style={{ display: "flex", fontSize: 46, color: "#475569", marginTop: 18 }}>
              Live product demo
            </div>
          </div>

          {/* Bottom — reassurance line */}
          <div style={{ display: "flex", fontSize: 25, color: "#94A3B8" }}>
            Running on sample data · No login, nothing is saved.
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    },
  );
}
