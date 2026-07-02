// Default narrative copy for a client's brand guidelines, seeded from their
// DesignTokens. Pure and deterministic: same tokens in, same copy out — no I/O,
// no randomness, no live model call. Every claim traces to a token value; when a
// group is absent the related copy is omitted rather than invented.
//
// The output is the shared shape (`GuidelinesContent`) that the viewer renders and
// that a future editable-content UI would write, so defaults and user edits agree.

import type {
  DesignTokens,
  GuidelinesContent,
  GuidelinesDosAndDonts,
  GuidelinesSectionBlurbs,
} from "@/types/design-tokens";

// ── small string helpers ────────────────────────────────────────────────────────

/** Whole-string lowercase for friendly colour names used mid-sentence. */
function lower(value: string): string {
  return value.trim().toLowerCase();
}

/** Lowercase only the first character (keeps acronyms like "CTA" intact). */
function lowerFirst(value: string): string {
  const v = value.trim();
  return v ? v.charAt(0).toLowerCase() + v.slice(1) : v;
}

/** Strip a trailing full stop and surrounding whitespace. */
function trimDot(value: string): string {
  return value.trim().replace(/[.\s]+$/, "");
}

/** British-style list join: "a, b and c" (no Oxford comma). */
function joinList(items: string[]): string {
  const xs = items.filter((s) => s && s.trim());
  if (xs.length === 0) return "";
  if (xs.length === 1) return xs[0];
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** Indefinite article for a base-unit number ("an 8-point rhythm", "a 4-point rhythm"). */
function article(n: number): string {
  return n === 8 || n === 11 || n === 18 ? "an" : "a";
}

function isZeroRadius(v: string): boolean {
  return /^0(px|rem|em|%)?$/i.test(v);
}

/** Full/pill radii (used for round chips) — a poor "default" to quote. */
function isPillRadius(v: string): boolean {
  if (/^(50|100)%$/.test(v)) return true;
  if (/9999/.test(v)) return true;
  const m = v.match(/^(\d+(?:\.\d+)?)(px|rem|em)?$/i);
  if (m) {
    const n = parseFloat(m[1]);
    const unit = (m[2] || "px").toLowerCase();
    if (unit === "px" && n >= 500) return true;
    if ((unit === "rem" || unit === "em") && n >= 30) return true;
  }
  return false;
}

/**
 * The most-used radius value (mode across the record's values). Ties break by
 * insertion order, preferring a value that is neither zero nor a full/pill radius.
 * Returns null when no radii are defined.
 */
function mostUsedRadius(radius: Record<string, string> | undefined): string | null {
  const values = Object.values(radius ?? {})
    .map((v) => (v ?? "").trim())
    .filter(Boolean);
  if (values.length === 0) return null;

  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const v of values) {
    if (!counts.has(v)) order.push(v);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }

  const preferred = order.filter((v) => !isZeroRadius(v) && !isPillRadius(v));
  const pool = preferred.length ? preferred : order;

  let best = pool[0];
  let bestCount = counts.get(best) ?? 0;
  for (const v of pool) {
    const c = counts.get(v) ?? 0;
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

// ── section blurbs ────────────────────────────────────────────────────────────

function colourBlurb(tokens: DesignTokens): string | undefined {
  const { primary, secondary, neutrals } = tokens.colours;
  const dominant = primary[0];
  if (!dominant) return undefined;

  const out: string[] = [`The palette leads with ${lower(dominant.name)}, the primary brand colour.`];

  const supporting = [...secondary, ...neutrals]
    .filter((c) => c.usage && c.usage.trim())
    .slice(0, 4)
    .map((c) => `${lower(c.name)} for ${lowerFirst(trimDot(c.usage))}`);
  if (supporting.length) {
    out.push(`Supporting colours cover the rest: ${supporting.join("; ")}.`);
  }

  // 60/30/10 guidance only when there are enough groups to justify it.
  if (secondary.length > 0 && neutrals.length > 0) {
    out.push(
      "As a rough split, lead with the primary colour across about 60% of a screen, neutrals 30%, and an accent the final 10%.",
    );
  }
  return out.join(" ");
}

function typographyBlurb(tokens: DesignTokens): string {
  const { displayFont, bodyFont, monoFont } = tokens.typography;
  const out = [`${displayFont} sets headings and numbers, and ${bodyFont} carries body copy and UI text.`];
  if (monoFont && monoFont.trim()) {
    out.push(`${monoFont} is reserved for captions, labels and code.`);
  }
  return out.join(" ");
}

function gridSpacingBlurb(tokens: DesignTokens): string {
  const base = tokens.spacing.base;
  return `Spacing follows ${article(base)} ${base}-point rhythm, so sizes and gaps step in multiples of ${base}px. Keeping to the scale holds the layout even.`;
}

function cornerRadiusBlurb(tokens: DesignTokens): string | undefined {
  const radius = mostUsedRadius(tokens.radius);
  if (!radius) return undefined;
  return `The default corner radius is ${radius}. Keep it consistent within a screen so components feel part of one system.`;
}

function componentsBlurb(tokens: DesignTokens): string | undefined {
  const buttons = tokens.buttons;
  if (!buttons || buttons.length === 0) return undefined;

  let s = `Buttons and cards inherit the corner radius and use ${tokens.typography.displayFont} for their labels.`;
  const primary = buttons[0]?.name.trim();
  const secondary = buttons[1]?.name.trim();
  if (primary && secondary) {
    s += ` The ${primary} style leads the main action, with the ${secondary} style for lower-priority actions.`;
  } else if (primary) {
    s += ` The ${primary} style is the main action.`;
  }
  return s;
}

function logoBlurb(tokens: DesignTokens): string | undefined {
  const lr = tokens.logoRules;
  if (!lr) return undefined;

  const out = [
    "The logo is the primary expression of the brand. Give it clear space and strong contrast, and never redraw, recolour or restyle it.",
  ];
  if (lr.clearSpace && lr.clearSpace.trim()) {
    out.push(`Keep clear space of ${lowerFirst(trimDot(lr.clearSpace))} around it.`);
  }
  if (lr.minSizes && Object.keys(lr.minSizes).length) {
    const sizes = Object.entries(lr.minSizes).map(([k, v]) => `${lower(k)} at ${v}`);
    out.push(`Do not place it below its minimum size (${joinList(sizes)}).`);
  }
  return out.join(" ");
}

function buildSectionBlurbs(tokens: DesignTokens): GuidelinesSectionBlurbs {
  const blurbs: GuidelinesSectionBlurbs = {};
  const logo = logoBlurb(tokens);
  const colour = colourBlurb(tokens);
  const cornerRadius = cornerRadiusBlurb(tokens);
  const components = componentsBlurb(tokens);
  if (logo) blurbs.logo = logo;
  if (colour) blurbs.colour = colour;
  blurbs.typography = typographyBlurb(tokens);
  blurbs.gridSpacing = gridSpacingBlurb(tokens);
  if (cornerRadius) blurbs.cornerRadius = cornerRadius;
  if (components) blurbs.components = components;
  // iconography is intentionally never emitted — DesignTokens has no icon group.
  return blurbs;
}

// ── logo do's + do/don't lists ──────────────────────────────────────────────────

function buildLogoRulesText(tokens: DesignTokens): string[] {
  const lr = tokens.logoRules;
  if (!lr) return [];

  const bullets: string[] = [];
  bullets.push(
    lr.clearSpace && lr.clearSpace.trim()
      ? `Give the logo clear space of ${lowerFirst(trimDot(lr.clearSpace))} on every side.`
      : "Give the logo clear space on every side so nothing crowds it.",
  );
  bullets.push("Place the logo on a background with strong contrast so it stays legible.");

  if (lr.colourRules && lr.colourRules.length) {
    for (const cr of lr.colourRules) {
      bullets.push(`On ${lower(cr.surface)} surfaces, use the ${lower(cr.logoVersion)}.`);
    }
  }
  if (lr.minSizes && Object.keys(lr.minSizes).length) {
    const sizes = Object.entries(lr.minSizes).map(([k, v]) => `${lower(k)} at ${v}`);
    bullets.push(`Never place the logo below its minimum size (${joinList(sizes)}).`);
  }
  if (lr.rules && lr.rules.length) {
    for (const rule of lr.rules) {
      const r = rule.trim();
      if (r) bullets.push(/[.!?]$/.test(r) ? r : `${r}.`);
    }
  }
  return bullets;
}

function buildDosAndDonts(tokens: DesignTokens): GuidelinesDosAndDonts {
  const { colours, typography, radius, logoRules } = tokens;
  const dominant = colours.primary[0];
  const hasRadius = mostUsedRadius(radius) !== null;

  const dos: string[] = [];
  if (dominant) dos.push(`Lead with ${lower(dominant.name)}, the primary colour.`);
  dos.push(`Use ${typography.displayFont} for headings and numbers.`);
  if (hasRadius) dos.push("Keep the standard corner radius across a screen.");
  if (logoRules) dos.push("Give the logo clear space and strong contrast.");
  dos.push("Keep to the spacing scale so screens stay uncrowded.");

  const donts: string[] = [];
  if (logoRules) donts.push("Do not recolour, stretch or add effects to the logo.");
  donts.push("Do not introduce colours from outside the palette.");
  donts.push(`Do not mix in typefaces other than ${typography.displayFont} and ${typography.bodyFont}.`);
  donts.push("Do not drop text below AA contrast.");
  donts.push("Do not crowd screens by breaking the spacing scale.");

  return { dos, donts };
}

// ── main ────────────────────────────────────────────────────────────────────────

/**
 * Produce the editable narrative content for a client's brand guidelines from their
 * DesignTokens. Everything returned is a default the user can later override.
 */
export function generateGuidelinesContent(tokens: DesignTokens): GuidelinesContent {
  const brandName = tokens.clientName;
  const voice = tokens.brandVoice?.trim();

  const content: GuidelinesContent = {
    brandName,
    intro: `This is the brand guide for ${brandName}. It covers the logo, colour, typography, spacing and UI foundations that keep the brand consistent wherever it appears. Use it as the reference whenever you design or build anything in the ${brandName} name.`,
    sectionBlurbs: buildSectionBlurbs(tokens),
    logoRulesText: buildLogoRulesText(tokens),
    dosAndDonts: buildDosAndDonts(tokens),
    closingLine: voice ? voice : `${brandName} — Brand Guidelines`,
  };
  if (voice) content.tagline = voice;
  return content;
}
