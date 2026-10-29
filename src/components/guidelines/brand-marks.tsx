/* eslint-disable @next/next/no-img-element -- the guidelines show the logo files themselves, at exact sizes */
import { GitworkMark } from "@/components/gitwork-mark";
import { FOUNDRY_WORDMARK } from "./foundry-wordmark-paths";

/** The Gitwork palette, exactly as the brand defines it (BG-2026-01). */
export const GW = {
  ink: "#0C0C18",
  paper: "#F2EDE4",
  signal: "#6B52FF",
  text: "#1A1A1E",
  muted: "#6B6B6B",
  warm: "#EAE5DC",
  white: "#FFFFFF",
  signalTint: "rgba(107, 82, 255, 0.12)",
  inkMuted: "rgba(242, 237, 228, 0.62)",
  inkRule: "rgba(242, 237, 228, 0.16)",
  paperRule: "rgba(12, 12, 24, 0.12)",
} as const;

/** Foundry's own colours, read from its logo files and DESIGN.md. */
export const FOUNDRY = {
  /** The full stop in the wordmark, and the app icon's disc (src/app/icon.svg). */
  indigo: "#4F46E5",
  /** Foundry's interface colour: buttons, links, active states (DESIGN.md "Gitwork Blue"). */
  interface: "#1D4ED8",
  endorsement: "#9D9D9D",
} as const;

export const FONT = {
  display: "var(--font-fraunces)",
  body: "var(--font-sans)",
  mono: "var(--font-mono)",
  numeral: "var(--font-playfair)",
  foundryDisplay: '"DM Serif Display", Georgia, serif',
} as const;

const WORDMARK_SRC = "/email/gitwork-wordmark-ink.png";
/** The wordmark file is 480 x 100; its purple dot sits at x 456 to 478, y 77 to 98. */
const WORDMARK_RATIO = 480 / 100;
const DOT = { left: 456 / 480, top: 77 / 100, width: 23 / 480, height: 22 / 100 };

/**
 * The Gitwork wordmark, from the real asset. The ink file is drawn as-is. The paper and white
 * variants are the same file used as a mask, filled with the variant's colour; the paper variant
 * then puts the purple dot back, because the dot is never recoloured on an ink ground.
 */
export function GitworkWordmark({
  height,
  variant = "ink",
}: {
  height: number;
  variant?: "ink" | "paper" | "white";
}) {
  const width = height * WORDMARK_RATIO;
  if (variant === "ink") {
    return <img src={WORDMARK_SRC} alt="Gitwork" width={width} height={height} style={{ display: "block" }} />;
  }
  return (
    <span role="img" aria-label="Gitwork" style={{ position: "relative", display: "block", width, height }}>
      <span
        style={{
          position: "absolute",
          inset: 0,
          background: variant === "paper" ? GW.paper : GW.white,
          WebkitMaskImage: `url(${WORDMARK_SRC})`,
          maskImage: `url(${WORDMARK_SRC})`,
          WebkitMaskSize: "100% 100%",
          maskSize: "100% 100%",
        }}
      />
      {variant === "paper" ? (
        <span
          style={{
            position: "absolute",
            left: width * DOT.left - 0.5,
            top: height * DOT.top - 0.5,
            width: width * DOT.width + 1,
            height: height * DOT.height + 1,
            borderRadius: "50%",
            background: GW.signal,
          }}
        />
      ) : null}
    </span>
  );
}

/** The roundel: the platform's one G. mark (`GitworkMark`), re-exported so there is still only one. */
export function GitworkRoundel({ size }: { size: number }) {
  return <GitworkMark size={size} />;
}

/**
 * The Foundry lockup (public/foundry-logo.svg) as inline paths, so each of its three parts can
 * follow the ground: the name, the indigo full stop and the "by Gitwork" endorsement.
 */
export function FoundryWordmark({
  height,
  ground = "light",
  endorsement = true,
}: {
  height: number;
  ground?: "light" | "dark";
  endorsement?: boolean;
}) {
  const [, , w, h] = FOUNDRY_WORDMARK.viewBox.split(" ").map(Number);
  return (
    <svg
      role="img"
      aria-label={endorsement ? "Foundry by Gitwork" : "Foundry"}
      viewBox={FOUNDRY_WORDMARK.viewBox}
      width={(height * w) / h}
      height={height}
      style={{ display: "block" }}
    >
      <path d={FOUNDRY_WORDMARK.name} fill={ground === "light" ? "#000000" : GW.paper} />
      <path d={FOUNDRY_WORDMARK.dot} fill={FOUNDRY.indigo} />
      {endorsement ? (
        <path d={FOUNDRY_WORDMARK.endorsement} fill={ground === "light" ? FOUNDRY.endorsement : GW.inkMuted} />
      ) : null}
    </svg>
  );
}

/** Foundry's app mark ("F." on white), as it appears as an icon. */
export function FoundryAppIcon({ size }: { size: number }) {
  return (
    <img
      src="/foundry-mark.png"
      alt="Foundry"
      width={size}
      height={size}
      style={{ display: "block", borderRadius: size * 0.22, border: `1px solid ${GW.paperRule}` }}
    />
  );
}
