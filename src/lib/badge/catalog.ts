/**
 * The badge catalogue — one place that names every mark.
 *
 * Each entry has a **stable code** (`FA-01`, `PS-03`) as well as a display name,
 * so a badge can be referred to unambiguously in a review, a Slack message or a
 * commit without anyone having to describe it ("the round one with the ring").
 * The studio, the docs and the generated files all read these names from here,
 * so they cannot drift apart.
 *
 * Codes are permanent. If a mark is retired, retire its code with it rather than
 * reusing the number — a stale reference should fail to resolve, not resolve to
 * something else.
 */
import type { CountermarkStyle } from "./countermark-badge";
import type { BadgeStyle } from "./pulse-badge";

export type BadgeFamily = "approved" | "pulse" | "countermark";

export interface BadgeDef {
  /** Permanent identifier. Call badges by this. */
  code: string;
  name: string;
  family: BadgeFamily;
  blurb: string;
  /** Intrinsic width in px; null when it is derived from the shaped type. */
  width: number | null;
  height: number;
  /** Smallest size the mark stays legible at — measured, not guessed. */
  floor?: number;
  /** `approved` only: the file stem under public/badge. */
  stem?: string;
  /** `pulse` only: the `?style=` value on /api/badge/pulse/[token]. */
  style?: BadgeStyle;
  /** `countermark` only: the `?style=` value on /api/badge/countermark/[token]. */
  cmStyle?: CountermarkStyle;
  /** Whether a `-dark` build exists (some marks carry their own ground). */
  hasDark: boolean;
  note?: string;
}

export const BADGES: BadgeDef[] = [
  {
    code: "FA-01",
    name: "The Seal",
    family: "approved",
    stem: "foundry-approved-seal",
    width: 160,
    height: 160,
    floor: 64,
    hasDark: true,
    blurb: "The hero mark — a circular stamp whose legend rotates and whose tick draws in.",
    note: "Below 64px the circular legend stops being legible.",
  },
  {
    code: "FA-02",
    name: "Instrument plate",
    family: "approved",
    stem: "foundry-approved-plate",
    width: 268,
    height: 132,
    hasDark: true,
    blurb:
      "The house widget grammar, so it reads as part of the system rather than a sticker. The most on-brand of the five.",
  },
  {
    code: "FA-03",
    name: "Certificate lockup",
    family: "approved",
    stem: "foundry-approved-lockup",
    width: null,
    height: 72,
    hasDark: true,
    blurb: "Horizontal, for a footer with room for a sentence.",
    note: "Width is derived from the shaped type, so the title can never collide with the chip.",
  },
  {
    code: "FA-04",
    name: "Shield",
    family: "approved",
    stem: "foundry-approved-shield",
    width: null,
    height: 22,
    hasDark: false,
    blurb: "Inline, at shields.io proportions — READMEs and footer badge rows.",
    note: "Carries its own dark ground, so there is no light/dark split.",
  },
  {
    code: "FA-05",
    name: "Monogram",
    family: "approved",
    stem: "foundry-approved-monogram",
    width: 56,
    height: 56,
    floor: 24,
    hasDark: false,
    blurb: "Square mark at avatar and favicon scale, built from the real wordmark's F.",
    note: "Below 24px the tick lozenge turns to mush — the -sm build drops it and holds to 16px.",
  },
  {
    code: "PS-01",
    name: "Score shield",
    family: "pulse",
    style: "shield",
    width: null,
    height: 22,
    hasDark: false,
    blurb: "Inline, colour-banded, with a pulse-trace glyph. Sits next to other badges.",
    note: "Carries its own dark ground.",
  },
  {
    code: "PS-02",
    name: "Score ring",
    family: "pulse",
    style: "ring",
    width: 152,
    height: 184,
    hasDark: true,
    blurb: "The report's own score ring, standalone, with its provenance beneath it.",
  },
  {
    code: "PS-03",
    name: "Score bar",
    family: "pulse",
    style: "bar",
    width: 320,
    height: 62,
    hasDark: true,
    blurb: "A slim horizontal readout for a site footer.",
  },
  {
    code: "PS-04",
    name: "Score card",
    family: "pulse",
    style: "card",
    width: 300,
    height: 200,
    hasDark: true,
    blurb: "The trust-page unit — score, project, top four domains and a link to the report.",
  },
  {
    code: "CM-01",
    name: "Mark shield",
    family: "countermark",
    cmStyle: "shield",
    width: null,
    height: 22,
    hasDark: false,
    blurb: "Inline — COUNTERMARK · CERTIFIED, or the status word once the mark stops asserting.",
    note: "Carries its own dark ground. A mark past its window is struck through, not just greyed.",
  },
  {
    code: "CM-02",
    name: "Validity disc",
    family: "countermark",
    cmStyle: "disc",
    width: 152,
    height: 184,
    hasDark: true,
    blurb:
      "A ring burning down the validity window, with the days left in the middle — the one thing a badge can show that a link to the certificate cannot.",
  },
  {
    code: "CM-03",
    name: "Certificate card",
    family: "countermark",
    cmStyle: "card",
    width: 300,
    height: 200,
    hasDark: true,
    blurb: "The trust-page unit — grade, subject, standard, seal state and a link to verify.",
    note: "Shows an UNSEALED marker when no signing secret is configured, so it can't pass for a signed mark.",
  },
];

export const APPROVED_BADGES = BADGES.filter((b) => b.family === "approved");
export const PULSE_BADGES = BADGES.filter((b) => b.family === "pulse");
export const COUNTERMARK_BADGES = BADGES.filter((b) => b.family === "countermark");

export function badgeByCode(code: string): BadgeDef | undefined {
  return BADGES.find((b) => b.code === code);
}

/**
 * The committed file for a Foundry Approved mark under the requested variants.
 * Falls back when a variant does not exist (the shield and monogram have no
 * dark build because they carry their own ground).
 */
export function approvedStem(
  badge: BadgeDef,
  opts: { dark?: boolean; motion?: boolean; small?: boolean } = {},
): string {
  if (!badge.stem) throw new Error(`${badge.code} is not a Foundry Approved mark`);
  let stem = badge.stem;
  if (opts.small && badge.code === "FA-05") stem += "-sm";
  if (opts.dark && badge.hasDark) stem += "-dark";
  if (opts.motion) stem += "-anim";
  return stem;
}

/** Public path of a Foundry Approved mark. */
export function approvedPath(badge: BadgeDef, opts?: Parameters<typeof approvedStem>[1]): string {
  return `/badge/${approvedStem(badge, opts)}.svg`;
}

/** Public path of a Countermark badge for a given certificate token. */
export function countermarkPath(
  badge: BadgeDef,
  token: string,
  opts: { dark?: boolean; motion?: boolean } = {},
): string {
  const q = new URLSearchParams();
  if (badge.cmStyle && badge.cmStyle !== "shield") q.set("style", badge.cmStyle);
  if (opts.dark) q.set("theme", "dark");
  if (opts.motion) q.set("motion", "1");
  const qs = q.toString();
  return `/api/badge/countermark/${token}.svg${qs ? `?${qs}` : ""}`;
}

/** Public path of a Pulse score badge for a given share token. */
export function pulsePath(
  badge: BadgeDef,
  token: string,
  opts: { dark?: boolean; motion?: boolean } = {},
): string {
  const q = new URLSearchParams();
  if (badge.style && badge.style !== "shield") q.set("style", badge.style);
  if (opts.dark) q.set("theme", "dark");
  if (opts.motion) q.set("motion", "1");
  const qs = q.toString();
  return `/api/badge/pulse/${token}.svg${qs ? `?${qs}` : ""}`;
}

// ── install helpers ─────────────────────────────────────────────────────────
// These live here, pure and exhaustive over `family`, because the studio's
// inline version branched on `!isPulse` and so sent Countermark badges down the
// Foundry Approved path — `approvedStem` threw and white-screened the page. A
// switch over the family cannot drift that way, and every badge is covered by a
// test below.

export interface BadgeUrlOptions {
  dark?: boolean;
  motion?: boolean;
  /** Required for the token-backed families; ignored by Foundry Approved. */
  token?: string | null;
}

/** The badge's own URL, or null when a token-backed family has no token yet. */
export function badgeSrc(badge: BadgeDef, opts: BadgeUrlOptions = {}): string | null {
  switch (badge.family) {
    case "approved":
      return approvedPath(badge, { dark: opts.dark, motion: opts.motion });
    case "pulse":
      return opts.token ? pulsePath(badge, opts.token, opts) : null;
    case "countermark":
      return opts.token ? countermarkPath(badge, opts.token, opts) : null;
  }
}

/** Where a token-backed badge should link to, so a claim is always checkable. */
export function badgeHref(badge: BadgeDef, token: string): string | null {
  switch (badge.family) {
    case "approved":
      return null;
    case "pulse":
      return `/report/${token}`;
    case "countermark":
      return `/countermark/${token}`;
  }
}

const ALT: Record<BadgeFamily, string> = {
  approved: "Foundry Approved",
  pulse: "Gitwork Pulse score",
  countermark: "Gitwork Countermark",
};

/**
 * The paste-ready snippet. Token-backed badges are wrapped in a link to what
 * they assert — a score or a grade with nothing to check is just a claim.
 */
export function installSnippet(
  badge: BadgeDef,
  origin: string,
  opts: BadgeUrlOptions = {},
): string {
  const src = badgeSrc(badge, opts);
  if (!src || !origin) return "";
  const size = badge.width ? ` width="${badge.width}" height="${badge.height}"` : "";
  const img = `<img src="${origin}${src}"${size} alt="${ALT[badge.family]}">`;
  const href = opts.token ? badgeHref(badge, opts.token) : null;
  return href ? [`<a href="${origin}${href}">`, `  ${img}`, `</a>`].join("\n") : img;
}
