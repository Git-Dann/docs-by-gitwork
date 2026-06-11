/* eslint-disable @next/next/no-img-element */
// Branded card chrome used by every Foundry Open Graph image. One uniform layout
// — Foundry logo top-left, mono-caps module eyebrow, DM Serif title, optional
// subtitle, mono bottom-right label naming the page/product/dev — so unfurls in
// a Slack feed read as one coherent product.
//
// Rendered by next/og's ImageResponse via Satori. Satori supports a subset of
// CSS — no flex `gap`, no `transform`, no system fonts unless declared. Keep
// styles simple, declare every font family, use absolute positioning for the
// chrome.

import type { ReactElement } from "react";
import { eyebrow, type ModuleKey } from "./constants";
import { SERIF_FAMILY, MONO_FAMILY } from "./fonts";

export interface BrandedCardProps {
  module: ModuleKey;
  title: string;
  subtitle?: string | null;
  bottomRight: string;
  // Optional accent number rendered to the right of the title (e.g. Pulse
  // health score "72/100", Docs total "£24,500"). Kept short — Satori
  // doesn't wrap nicely.
  metric?: string | null;
  // Absolute URL to the Foundry logo. Optional — if undefined, the wordmark is
  // rendered text-only. Loaded via fetch by the generator and passed in as a
  // data URI so we don't depend on the request's host.
  logoDataUri?: string | null;
}

const BG = "#F6F1E7";        // Foundry cream
const INK = "#0E0E10";       // near-black, body
const INK_MUTED = "#5B5849"; // mono-caps muted
const ACCENT = "#1F1B16";    // ring outline

// Title font-size shrinks with length so long document titles still fit.
function titleSize(title: string): number {
  const len = title.length;
  if (len <= 24) return 96;
  if (len <= 40) return 80;
  if (len <= 60) return 64;
  return 52;
}

export function BrandedCard({
  module,
  title,
  subtitle,
  bottomRight,
  metric,
  logoDataUri,
}: BrandedCardProps): ReactElement {
  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        color: INK,
        backgroundColor: BG,
        backgroundImage:
          "radial-gradient(circle at 92% 8%, rgba(31,27,22,0.06) 0%, rgba(31,27,22,0) 55%)",
        position: "relative",
        fontFamily: SERIF_FAMILY,
      }}
    >
      {/* Faded concentric rings, top-right — subtle brand accent */}
      <div
        style={{
          position: "absolute",
          top: -180,
          right: -180,
          width: 640,
          height: 640,
          borderRadius: 9999,
          border: `1px solid ${ACCENT}`,
          opacity: 0.08,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: -90,
          right: -90,
          width: 400,
          height: 400,
          borderRadius: 9999,
          border: `1px solid ${ACCENT}`,
          opacity: 0.06,
        }}
      />

      {/* Top row: Foundry logo + eyebrow */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          {/* The Foundry logo PNG already contains the "Foundry by Gitwork"
              wordmark — no extra text needed. Fallback to a serif wordmark
              only when the asset failed to load. */}
          {logoDataUri ? (
            // The logo asset is 245x64 — Satori requires explicit pixel
            // dimensions on <img>; `width: auto` resolves to 0 and the img
            // collapses. Lock to the natural aspect ratio.
            <img
              src={logoDataUri}
              alt="Foundry by Gitwork"
              width={245}
              height={64}
              style={{ width: 245, height: 64 }}
            />
          ) : (
            <div
              style={{
                fontFamily: SERIF_FAMILY,
                fontSize: 40,
                color: INK,
                letterSpacing: "-0.01em",
              }}
            >
              Foundry
            </div>
          )}
        </div>
        <div
          style={{
            fontFamily: MONO_FAMILY,
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: INK_MUTED,
          }}
        >
          {eyebrow(module)}
        </div>
      </div>

      {/* Title + subtitle */}
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 1040 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              fontFamily: SERIF_FAMILY,
              fontSize: titleSize(title),
              lineHeight: 1.05,
              color: INK,
              maxWidth: metric ? 820 : 1040,
              letterSpacing: "-0.01em",
            }}
          >
            {title}
          </div>
          {metric ? (
            <div
              style={{
                fontFamily: MONO_FAMILY,
                fontSize: 56,
                fontWeight: 600,
                color: INK,
                marginLeft: 24,
                letterSpacing: -1,
              }}
            >
              {metric}
            </div>
          ) : null}
        </div>
        {subtitle ? (
          <div
            style={{
              fontSize: 30,
              marginTop: 20,
              color: INK_MUTED,
              fontFamily: SERIF_FAMILY,
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>

      {/* Footer: gitwork.co.uk left, page/product/dev label right */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: MONO_FAMILY,
          fontSize: 20,
          fontWeight: 600,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: INK_MUTED,
        }}
      >
        <div>gitwork.co.uk</div>
        <div style={{ color: INK }}>{bottomRight}</div>
      </div>
    </div>
  );
}
