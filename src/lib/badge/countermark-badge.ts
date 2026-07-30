/**
 * Renders the public Countermark badge — the embeddable face of a Provenance
 * attestation (`src/server/provenance/`, `docs/provenance.md`).
 *
 * Pure and dependency-free: it takes plain values, never a Prisma row, so every
 * state below is unit-testable without a database.
 *
 * ## The three honesty rules, which are the whole point
 *
 * Provenance exists because an unverifiable claim about software is worth nothing. A
 * badge is the most likely place for that claim to get overstated, so:
 *
 * 1. **Validity dominates grade.** A LAPSED, REVOKED or SUPERSEDED mark asserts
 *    nothing, so it must never show its grade as the headline. The badge leads
 *    with the status word in a muted tone instead — a badge still reading
 *    "CERTIFIED" three months after expiry is precisely the failure the product
 *    is built to prevent.
 * 2. **INCOMPLETE is not NOT_CERTIFIED.** "We could not establish this" and
 *    "this is provably broken" are different facts with different fixes, so they
 *    never share a colour. INCOMPLETE is neutral; NOT_CERTIFIED is danger. This
 *    mirrors `CLAUDE.md` §35 — a failed lookup must never read as an absence.
 * 3. **An unsealed mark says so.** `sealed: false` means no signing secret was
 *    configured, so the certificate cannot be verified. The badge carries an
 *    UNSEALED marker rather than looking identical to a signed one.
 *
 * Motion and self-containment follow `./svg-kit.ts`.
 */
import {
  cardFace,
  entrance,
  mono,
  monoWidth,
  PING,
  serif,
  sheenDef,
  tokensFor,
  wrap,
  INK,
  WHITE,
  type BadgeTheme,
  type RenderedBadge,
  type Tokens,
} from "./svg-kit";

export type CountermarkStyle = "shield" | "disc" | "card";

/** Mirrors CountermarkGrade in src/server/provenance/types.ts. */
export type CountermarkBadgeGrade = "CERTIFIED" | "CONDITIONAL" | "NOT_CERTIFIED" | "INCOMPLETE";

/** Mirrors CountermarkStatus in src/server/provenance/types.ts. */
export type CountermarkBadgeStatus = "VALID" | "EXPIRING" | "LAPSED" | "REVOKED" | "SUPERSEDED";

export interface CountermarkBadgeInput {
  grade: CountermarkBadgeGrade;
  status: CountermarkBadgeStatus;
  /** Clamped at 0 — a lapsed mark is not "-12 days remaining". */
  daysRemaining: number;
  /** The full validity window, so the disc can draw how much is left. */
  validityDays: number;
  /** False when no ASSAY_SIGNING_SECRET is configured on the server. */
  sealed: boolean;
  /** Shown on `card`. */
  subject?: string;
  /** e.g. "SAS-1 v1.0". Shown on `card` and `disc`. */
  standard?: string;
  style?: CountermarkStyle;
  theme?: BadgeTheme;
  motion?: boolean;
}

/** A mark only asserts something while it is inside its validity window. */
export function isLive(status: CountermarkBadgeStatus): boolean {
  return status === "VALID" || status === "EXPIRING";
}

const GRADE_LABEL: Record<CountermarkBadgeGrade, string> = {
  CERTIFIED: "CERTIFIED",
  CONDITIONAL: "CONDITIONAL",
  NOT_CERTIFIED: "NOT CERTIFIED",
  INCOMPLETE: "INCOMPLETE",
};

const STATUS_LABEL: Record<CountermarkBadgeStatus, string> = {
  VALID: "VALID",
  EXPIRING: "EXPIRING",
  LAPSED: "LAPSED",
  REVOKED: "REVOKED",
  SUPERSEDED: "SUPERSEDED",
};

export interface MarkState {
  /** What the badge leads with. */
  headline: string;
  tone: string;
  live: boolean;
}

/**
 * Resolve what the badge should actually say. Rules 1 and 2 from the file header
 * live here, so every style inherits them rather than re-deriving them.
 */
export function markState(
  grade: CountermarkBadgeGrade,
  status: CountermarkBadgeStatus,
  t: Tokens,
): MarkState {
  if (!isLive(status)) {
    return { headline: STATUS_LABEL[status], tone: t.neutral, live: false };
  }
  const tone =
    grade === "CERTIFIED" ? t.ok
    : grade === "CONDITIONAL" ? t.warn
    : grade === "NOT_CERTIFIED" ? t.bad
    : t.neutral; // INCOMPLETE — not established, not failed
  return { headline: GRADE_LABEL[grade], tone, live: true };
}

function remaining(input: CountermarkBadgeInput): number {
  return Math.max(0, Math.round(input.daysRemaining));
}

// ── styles ──────────────────────────────────────────────────────────────────

/** CM-01 · inline, carries its own dark ground so it works on any page. */
function renderShield(input: CountermarkBadgeInput, t: Tokens, motion: boolean): RenderedBadge {
  const H = 22, PAD = 9, FS = 9.5, TR = 0.8;
  const state = markState(input.grade, input.status, t);
  const label = "COUNTERMARK";
  const value = state.headline;
  const left = monoWidth(label, FS, TR) + PAD * 2;
  const right = monoWidth(value, FS, TR) + PAD * 2;
  const W = Math.round((left + right) * 10) / 10;

  const body =
    `<clipPath id="c"><rect width="${W}" height="${H}" rx="4"/></clipPath>` +
    `<g clip-path="url(#c)"><rect width="${left}" height="${H}" fill="${INK}"/>` +
    `<rect x="${left}" width="${right}" height="${H}" fill="${state.tone}"/>` +
    `<rect width="${W}" height="${H}" fill="url(#sh)"/>` +
    // An expired mark is struck through, so it reads as void at a glance rather
    // than merely grey.
    (state.live ? "" : `<path d="M${left} ${H / 2} H${W}" stroke="${WHITE}" stroke-width="1" opacity="0.5"/>`) +
    `</g>` +
    mono(label, FS, PAD, 14.6, "#E2E8F0", { tracking: TR }) +
    mono(value, FS, left + right / 2, 14.6, WHITE, { tracking: TR, anchor: "middle" }) +
    `<defs>${sheenDef()}</defs>`;

  const style = PING + ".dot{animation:ping 3s ease-in-out infinite}";
  return wrap(W, H, body, style, ariaLabel(input), motion);
}

/**
 * CM-02 · a disc whose ring is the validity window burning down — the one piece
 * of information a badge can carry that a static certificate link cannot.
 */
function renderDisc(input: CountermarkBadgeInput, t: Tokens, motion: boolean): RenderedBadge {
  const W = 152, H = 184, cx = 76, cy = 76, r = 52;
  const state = markState(input.grade, input.status, t);
  const days = remaining(input);
  const circ = 2 * Math.PI * r;
  const frac = state.live && input.validityDays > 0
    ? Math.max(0, Math.min(1, days / input.validityDays))
    : 0;
  const filled = frac * circ;

  const body =
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${t.track}" stroke-width="9"/>` +
    (filled > 0
      ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${state.tone}" stroke-width="9" ` +
        `transform="rotate(-90 ${cx} ${cy})" class="arc" stroke-dasharray="${filled.toFixed(2)} ${circ.toFixed(2)}"/>`
      : "") +
    (state.live
      ? `<g class="figg">${serif(String(days), 40, cx, cy + 4, t.ink, { anchor: "middle" })}</g>` +
        mono(days === 1 ? "DAY LEFT" : "DAYS LEFT", 8, cx, cy + 24, t.faint, { tracking: 1.1, anchor: "middle" })
      : mono(state.headline, 11, cx, cy + 4, t.ink, { tracking: 1.2, anchor: "middle" })) +
    mono(state.live ? state.headline : "NO LONGER ASSERTS", 9, cx, 155, state.tone,
         { tracking: 1.3, anchor: "middle" }) +
    mono(input.standard ? `COUNTERMARK · ${input.standard}` : "COUNTERMARK", 7.5, cx, 172, t.muted,
         { tracking: 1.1, anchor: "middle" }) +
    // Inside the ring, below the countdown: at the top of the disc it sat on
    // the 9px stroke and was cut in half.
    unsealedNote(input, t, cx, cy + 40);

  const style =
    entrance("sweep", 12, `stroke-dasharray:0 ${circ.toFixed(2)}`,
             `stroke-dasharray:${filled.toFixed(2)} ${circ.toFixed(2)}`) +
    entrance("figp", 50, "opacity:0;transform:scale(.82)", "opacity:1;transform:scale(1)",
             "80%{transform:scale(1.04)}") +
    ".arc{animation:sweep 1.25s cubic-bezier(.3,.9,.3,1)}" +
    `.figg{transform-origin:${cx}px ${cy}px;animation:figp 1s cubic-bezier(.2,.8,.3,1)}`;

  return wrap(W, H, body, style, ariaLabel(input), motion);
}

/** CM-03 · the trust-page unit, in the house widget grammar. */
function renderCard(input: CountermarkBadgeInput, t: Tokens, motion: boolean): RenderedBadge {
  const W = 300, H = 200;
  const state = markState(input.grade, input.status, t);
  const days = remaining(input);
  const statusW = monoWidth(STATUS_LABEL[input.status], 9, 0.8);

  const line = (label: string, value: string, y: number) =>
    mono(label, 7.5, 16, y, t.faint, { tracking: 0.8 }) +
    mono(value, 8.5, W - 16, y, t.muted, { tracking: 0.6, anchor: "end" });

  const body =
    cardFace(W, H, t) +
    `<path d="M0.5 36.5 H${W - 0.5}" stroke="${t.hair}"/>` +
    mono("01 // COUNTERMARK", 10, 16, 23, t.ink, { tracking: 1.2 }) +
    `<circle cx="${W - 22 - statusW}" cy="19.5" r="3" fill="${state.tone}" class="dot"/>` +
    mono(STATUS_LABEL[input.status], 9, W - 16, 23, state.tone, { tracking: 0.8, anchor: "end" }) +
    // Headline: the grade while live, the reason it is void otherwise.
    `<rect x="16" y="52" width="4" height="26" rx="2" fill="${state.tone}"/>` +
    mono(state.headline, 15, 28, 72, t.ink, { tracking: 1.1 }) +
    (state.live
      ? mono(`${days} ${days === 1 ? "DAY" : "DAYS"} REMAINING`, 8, 28, 88, t.muted, { tracking: 0.9 })
      : mono("THIS MARK NO LONGER ASSERTS ANYTHING", 7.5, 28, 88, t.muted, { tracking: 0.7 })) +
    `<path d="M16 102 H${W - 16}" stroke="${t.hair}"/>` +
    line("SUBJECT", (input.subject ?? "—").slice(0, 22).toUpperCase(), 118) +
    line("STANDARD", (input.standard ?? "—").toUpperCase(), 134) +
    line("SEAL", input.sealed ? "SIGNED" : "UNSEALED", 150) +
    (input.sealed
      ? ""
      : `<rect x="${W - 16 - monoWidth("UNSEALED", 8.5, 0.6) - 5}" y="142" ` +
        `width="${monoWidth("UNSEALED", 8.5, 0.6) + 10}" height="12" rx="3" fill="${t.warn}" opacity="0.14"/>` +
        mono("UNSEALED", 8.5, W - 16, 150, t.warn, { tracking: 0.6, anchor: "end" })) +
    `<path d="M16 172 H${W - 16}" stroke="${t.hair}"/>` +
    mono("GITWORK PROVENANCE · FOUNDRY", 7.5, 16, 186, t.faint, { tracking: 1 }) +
    mono("VERIFY", 7.5, W - 26, 186, t.accent, { tracking: 1, anchor: "end" }) +
    // Drawn, not typed: the mono table is caps-only and carries no arrow glyph.
    `<path d="M${W - 23} 183.4 h6 m-2.4 -2.4 l2.4 2.4 l-2.4 2.4" fill="none" stroke="${t.accent}" stroke-width="1"/>`;

  const style = PING + ".dot{animation:ping 2.4s 1.2s ease-in-out infinite}";
  return wrap(W, H, body, style, ariaLabel(input), motion);
}

/** A small amber marker so an unverifiable mark never looks like a signed one. */
function unsealedNote(input: CountermarkBadgeInput, t: Tokens, cx: number, y: number): string {
  if (input.sealed) return "";
  return mono("UNSEALED", 7, cx, y, t.warn, { tracking: 1.2, anchor: "middle" });
}

/**
 * The accessible label. Screen readers and link previews get the full truth —
 * grade, validity and seal — even where the artwork abbreviates it.
 */
function ariaLabel(input: CountermarkBadgeInput): string {
  const live = isLive(input.status);
  const grade = GRADE_LABEL[input.grade].toLowerCase();
  const head = live
    ? `Gitwork Countermark — ${grade}, ${remaining(input)} days remaining`
    : `Gitwork Countermark — ${STATUS_LABEL[input.status].toLowerCase()}, no longer asserting`;
  return `${head}${input.sealed ? "" : " (unsealed)"}`;
}

export function renderCountermarkBadge(input: CountermarkBadgeInput): RenderedBadge {
  const t = tokensFor(input.theme);
  const motion = input.motion === true;
  switch (input.style ?? "shield") {
    case "disc":
      return renderDisc(input, t, motion);
    case "card":
      return renderCard(input, t, motion);
    case "shield":
    default:
      return renderShield(input, t, motion);
  }
}
