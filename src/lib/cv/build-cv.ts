/**
 * Candidate → `CvData`. Pure: no Prisma, no dates-as-now, no I/O, so the whole
 * "minimal profile vs fully-populated profile" matrix is unit-testable.
 *
 * Two jobs, and the second is the interesting one:
 *
 *  1. **Select.** Take only the fields a client-facing CV may carry (see
 *     `types.ts` for the three families that must never arrive here).
 *  2. **Fit one page.** Dan asked for a one-page PDF, always. The Gitwork
 *     Document System's own rule is "content never overflows — cut copy or add a
 *     page, never shrink type", and since a second page is not on offer, cutting
 *     is the only honest lever. `fitToOnePage` does it deterministically by a
 *     stated priority, and RECORDS what it cut in `omitted` so the operator is
 *     told rather than silently handed a shorter CV.
 *
 * ⚠️ The budget is a line count, not a pixel measurement — a pure function cannot
 * measure text. It is calibrated against the rendered page (see the PR's measured
 * numbers) and deliberately conservative: the failure mode of a budget that is a
 * little tight is a CV missing its oldest engagement, which `omitted` names. The
 * failure mode of one that is too loose is a second page, which is the thing the
 * feature exists to prevent.
 */

import type { CvData, CvEngagement, CvLink } from "./types";

/**
 * ⚠️ **A pixel budget, measured, not a line count.** The first cut of this priced
 * content in "lines" and let a 14-engagement profile through: it overflowed the
 * page by 595px and ran straight through the footer. A line count cannot model a
 * 66px engagement row sitting next to a 25px body line, and the error compounds
 * per row.
 *
 * Every constant below was measured in headless Chromium against the rendered
 * 1000 x 1414 page (the numbers are in the PR). They are a contract with
 * `render-cv.ts`: change a padding, a font size or a section's margin there and
 * these must be re-measured, which `cv-fit.test.ts` cannot tell you — only
 * re-rendering can.
 */

/**
 * Page padding-top (76px) to the delivery rule (1266px) is 1190px; this is that
 * less a 24px safety margin. ⚠️ The margin is not padding-for-its-own-sake: the
 * costs below are estimates of text that wraps, so a name or a client that wraps
 * one line further than estimated has to land somewhere other than on top of the
 * footer. Measured without it, the worst case came to 1264 against a 1266 rule.
 */
export const CONTENT_BUDGET_PX = 1166;

/** Head plus the name block, with a meta line present and a one-line name. */
export const IDENTITY_PX = 233;

/** Each extra line the name wraps to, at 44px Fraunces / 1.08. */
export const NAME_LINE_PX = 47;

/**
 * Characters of the name that fit on one line: 44px Fraunces averages ~24.6px a
 * character against the 832px content width. ⚠️ Without charging for this, a name
 * that wraps pushes every section down 47px and the budget silently overruns —
 * the identity block is the one part of the page the fitter cannot shrink.
 */
export const NAME_CHARS_PER_LINE = 33;

/** Per section: 34 margin-top + 34 padding-top + 12 label + 12 content margin. */
export const SECTION_PX = 92;

/** `.body` at 15.5px / 1.62. */
export const BODY_LINE_PX = 25;

/** One `.work` row: 11 + 11 padding, a 20px client line, a 20px project line, 1px rule. */
export const ENGAGEMENT_PX = 66;

/** A wrapped row of `.chips`, and the 8px gap above a second row. */
export const CHIP_ROW_PX = 32;
export const CHIP_GAP_PX = 8;

/** A row of `.links`. Three links fit on one row at this page width. */
export const LINK_ROW_PX = 34;

/** Usable width inside the page margins: 1000 - 84 - 84. */
export const CONTENT_WIDTH_PX = 832;

/**
 * Measured at `.body`'s 68ch max-width: ~87 characters land on a line. Chosen at
 * the low end of the 87-96 the measurements showed, because over-estimating this
 * under-charges the summary and the page overflows, while under-estimating it only
 * clamps the lede a little early.
 */
export const SUMMARY_CHARS_PER_LINE = 87;

/** A lede longer than this is a profile, not a CV summary. */
export const MAX_SUMMARY_LINES = 6;

/** Chips wrap; more than two rows and the band dominates the page. */
export const MAX_CHIP_ROWS = 2;

export interface CandidateForCv {
  name: string;
  /** INTERNAL = a Gitwork team member; EXTERNAL = sourced for the marketplace. */
  origin?: "INTERNAL" | "EXTERNAL" | null;
  primaryStack: string;
  techStacks?: string[] | null;
  location?: string | null;
  timezone?: string | null;
  yearsExperience?: number | null;
  bio?: string | null;
  githubHandle?: string | null;
  linkedinUrl?: string | null;
  portfolioUrl?: string | null;
}

export interface PlacementForCv {
  clientName: string;
  projectName?: string | null;
  clientPlatformName?: string | null;
  startDate: string;
  endDate?: string | null;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "Mar 2025". Returns null for anything unparseable rather than "Invalid Date". */
export function monthYear(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * ⚠️ No em dash: the brand's hard copy rules forbid them everywhere, so the range
 * separator is an en dash. A CV is exactly the kind of file where an em dash slips
 * in unnoticed, so there is a test for this one character.
 */
export function periodLabel(start: string, end: string | null | undefined): string {
  const from = monthYear(start);
  const to = monthYear(end);
  if (!from) return to ? `to ${to}` : "";
  if (!end) return `${from} – present`;
  if (!to) return from;
  return from === to ? from : `${from} – ${to}`;
}

/** Lower-cased, punctuation-stripped, single-spaced — for comparing two names
 *  that describe the same client written slightly differently. */
function normaliseName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The neutral label for an engagement we cannot describe without the client. */
export const NEUTRAL_ENGAGEMENT_LABEL = "Client engagement";

/**
 * What an engagement row says, given that the client's name may never appear.
 *
 * Prefers the platform ("iOS app"), then the project. ⚠️ Either can carry the
 * client's name — `projectName` is free text and in practice is often just the
 * client ("Big Wedge Golf", "Wedge phase 2") — so a candidate label is rejected
 * when the client's name, or any distinctive word of it, is inside it. Rejecting
 * on a *word* rather than the whole string is what catches "Wedge phase 2"; a
 * whole-string test would pass it straight through.
 *
 * Words of two characters or fewer are ignored, and so are the generic company
 * suffixes, or a client called "The Group Ltd" would veto every label containing
 * "the".
 */
const GENERIC_NAME_WORDS = new Set([
  "the", "and", "ltd", "limited", "llp", "plc", "inc", "llc", "co", "company",
  "group", "holdings", "labs", "studio", "studios", "digital", "technologies",
  "tech", "solutions", "services", "global", "international",
]);

export function engagementLabel(
  platform: string | null | undefined,
  project: string | null | undefined,
  client: string,
): string {
  const clientWords = normaliseName(client)
    .split(" ")
    .filter((w) => w.length > 2 && !GENERIC_NAME_WORDS.has(w));

  const carriesClient = (candidate: string): boolean => {
    const words = new Set(normaliseName(candidate).split(" "));
    return clientWords.some((w) => words.has(w));
  };

  for (const candidate of [platform, project]) {
    const t = candidate?.trim();
    if (!t) continue;
    if (carriesClient(t)) continue;
    return t;
  }
  return NEUTRAL_ENGAGEMENT_LABEL;
}

/** Strips a scheme and any trailing slash for the printed form. A CV is paper. */
export function displayUrl(raw: string): string {
  return raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");
}

function normaliseUrl(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  // A profile field holding a bare host ("linkedin.com/in/alice") is common and
  // must not become a relative link in the rendered document.
  return `https://${t.replace(/^\/+/, "")}`;
}

/**
 * Cut prose to a whole sentence where possible, else a whole word, never
 * mid-word. Returns the text unchanged when it already fits.
 */
export function clampProse(text: string, maxChars: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= maxChars) return t;
  const head = t.slice(0, maxChars);
  // Prefer ending on a sentence; a CV lede that stops mid-thought reads worse
  // than a shorter one that lands.
  const sentence = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
  if (sentence > maxChars * 0.5) return head.slice(0, sentence + 1);
  const word = head.lastIndexOf(" ");
  return `${(word > 0 ? head.slice(0, word) : head).replace(/[,;:]$/, "")}…`;
}

export interface FitResult {
  summary: string;
  engagements: CvEngagement[];
  stack: string[];
  omitted: string[];
}

/**
 * The priority order, stated so it can be argued with rather than inferred:
 *
 *   1. **Current engagements** — what the dev is doing now is the single thing a
 *      client reading this cares most about. Never cut.
 *   2. **The summary**, clamped. A dev with no engagements is carried entirely by
 *      their profile paragraph, so it gets the space engagements do not use.
 *   3. **Past engagements**, newest first.
 *   4. **Stack chips** — cheapest to lose, since the primary stack is already in
 *      the role line under the name.
 */
/**
 * Estimated width of one chip: 13px Inter averages ~7.1px a character, plus 13px
 * padding each side and a 1px border each side.
 */
export function chipRows(stack: string[]): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let width = 0;
  for (const chip of stack) {
    const w = chip.length * 7.1 + 28;
    if (row.length && width + CHIP_GAP_PX + w > CONTENT_WIDTH_PX) {
      rows.push(row);
      row = [];
      width = 0;
    }
    row.push(chip);
    width += (row.length > 1 ? CHIP_GAP_PX : 0) + w;
  }
  if (row.length) rows.push(row);
  return rows;
}

function stackCost(rows: string[][]): number {
  if (!rows.length) return 0;
  return SECTION_PX + rows.length * CHIP_ROW_PX + (rows.length - 1) * CHIP_GAP_PX;
}

/**
 * The priority order, stated so it can be argued with rather than inferred:
 *
 *   1. **Current engagements** — what the dev is doing now is the single thing a
 *      client reading this cares most about. Never cut.
 *   2. **The summary**, clamped. A dev with no engagements is carried entirely by
 *      their profile paragraph, so it gets the space engagements do not use.
 *   3. **Past engagements**, newest first.
 *   4. **Stack chips** — cheapest to lose, since the primary stack is already in
 *      the role line under the name.
 *
 * ⚠️ Current engagements being uncuttable means a dev on a great many concurrent
 * placements can still overflow. That is a real limit, not an oversight: the
 * alternative is a CV that silently omits work the dev is doing right now. The
 * caller is told through `omitted`, and the honest fix is to close stale
 * placements rather than to hide them.
 */
export function fitToOnePage(input: {
  summary: string;
  engagements: CvEngagement[];
  stack: string[];
  linkCount: number;
  /** Lines the name wraps to; the identity block grows with it. */
  nameLines?: number;
}): FitResult {
  const omitted: string[] = [];

  // Chips are priced first because they are the cheapest thing to give up, but
  // they are trimmed last — the cap here is only the "more than two rows" rule.
  let rows = chipRows(input.stack);
  if (rows.length > MAX_CHIP_ROWS) {
    rows = rows.slice(0, MAX_CHIP_ROWS);
  }
  const stack = rows.flat();
  if (input.stack.length > stack.length) {
    omitted.push(`${input.stack.length - stack.length} more tech stack entries`);
  }

  const linksCost = input.linkCount > 0 ? SECTION_PX + LINK_ROW_PX : 0;
  const nameOverflow = Math.max(0, (input.nameLines ?? 1) - 1) * NAME_LINE_PX;
  let budget = CONTENT_BUDGET_PX - IDENTITY_PX - nameOverflow - linksCost - stackCost(rows);

  const current = input.engagements.filter((e) => e.current);
  const past = input.engagements.filter((e) => !e.current);
  const anyWork = input.engagements.length > 0;

  // Current work is charged first and never cut, so the summary lives on what is
  // left rather than the other way round.
  if (anyWork) budget -= SECTION_PX;
  budget -= current.length * ENGAGEMENT_PX;

  const summarySpace = input.summary ? Math.max(0, budget - SECTION_PX) : 0;
  const summaryLines = Math.min(
    MAX_SUMMARY_LINES,
    Math.max(0, Math.floor(summarySpace / BODY_LINE_PX)),
  );
  const summary =
    input.summary && summaryLines > 0
      ? clampProse(input.summary, summaryLines * SUMMARY_CHARS_PER_LINE)
      : "";
  if (summary) {
    budget -= SECTION_PX + Math.ceil(summary.length / SUMMARY_CHARS_PER_LINE) * BODY_LINE_PX;
  }

  const pastAllowed = Math.max(0, Math.floor(budget / ENGAGEMENT_PX));
  const keptPast = past.slice(0, pastAllowed);
  if (past.length > keptPast.length) {
    const n = past.length - keptPast.length;
    omitted.push(`${n} earlier engagement${n === 1 ? "" : "s"}`);
  }

  const fullSummary = input.summary.trim().replace(/\s+/g, " ");
  if (fullSummary && summary.length < fullSummary.length) {
    omitted.push("part of the profile summary");
  }

  return { summary, engagements: [...current, ...keptPast], stack, omitted };
}

export function buildCvData(
  candidate: CandidateForCv,
  placements: PlacementForCv[] = [],
): CvData {
  const meta: string[] = [];
  if (candidate.location?.trim()) meta.push(candidate.location.trim());
  if (candidate.timezone?.trim()) meta.push(candidate.timezone.trim());
  if (typeof candidate.yearsExperience === "number" && candidate.yearsExperience > 0) {
    meta.push(`${candidate.yearsExperience} yrs experience`);
  }

  // Primary stack first, then the rest, de-duped case-insensitively — the two
  // fields overlap constantly in the real data ("React Native" in both).
  const seen = new Set<string>();
  const stack: string[] = [];
  for (const raw of [candidate.primaryStack, ...(candidate.techStacks ?? [])]) {
    const t = raw?.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    stack.push(t);
  }

  const engagements: CvEngagement[] = placements
    .filter((p) => p.clientName?.trim())
    .map((p) => ({
      // The client name is read to know this is a real placement, and to veto a
      // label that carries it. It is never carried into the CV.
      label: engagementLabel(p.clientPlatformName, p.projectName, p.clientName),
      period: periodLabel(p.startDate, p.endDate),
      startedAt: p.startDate,
      current: !p.endDate,
    }))
    // Newest first. An unparseable start date sorts last rather than throwing the
    // whole list into an arbitrary order.
    .sort((a, b) => {
      const av = Date.parse(a.startedAt);
      const bv = Date.parse(b.startedAt);
      return (Number.isNaN(bv) ? -Infinity : bv) - (Number.isNaN(av) ? -Infinity : av);
    });

  const links: CvLink[] = [];
  const gh = candidate.githubHandle?.trim().replace(/^@/, "");
  if (gh) links.push({ label: "GitHub", text: `github.com/${gh}`, href: `https://github.com/${gh}` });
  const li = normaliseUrl(candidate.linkedinUrl);
  if (li) links.push({ label: "LinkedIn", text: displayUrl(li), href: li });
  const pf = normaliseUrl(candidate.portfolioUrl);
  if (pf) links.push({ label: "Portfolio", text: displayUrl(pf), href: pf });

  const name = candidate.name.trim();
  const fitted = fitToOnePage({
    summary: candidate.bio?.trim() ?? "",
    engagements,
    stack,
    linkCount: links.length,
    nameLines: Math.max(1, Math.ceil(name.length / NAME_CHARS_PER_LINE)),
  });

  // Reported to the operator, never drawn on the page. Order is the order they
  // would fix them in.
  const missing: string[] = [];
  if (!candidate.bio?.trim()) missing.push("profile summary");
  if (!engagements.length) missing.push("client engagements");
  if (stack.length <= 1) missing.push("tech stack");
  // A row that fell back to the neutral label carries only a date range. We will
  // not invent a descriptor for it — the brand's own rule is that nothing goes on
  // a document unverified — so the operator is told instead, and setting a
  // platform or project name on that placement fixes it.
  const unlabelled = fitted.engagements.filter(
    (e) => e.label === NEUTRAL_ENGAGEMENT_LABEL,
  ).length;
  if (unlabelled > 0) {
    missing.push(
      `a project or platform name on ${unlabelled} engagement${unlabelled === 1 ? "" : "s"}`,
    );
  }
  if (!candidate.location?.trim()) missing.push("location");
  if (typeof candidate.yearsExperience !== "number" || candidate.yearsExperience <= 0) {
    missing.push("years of experience");
  }
  if (links.length <= 1) missing.push("LinkedIn or portfolio link");

  return {
    eyebrow: candidate.origin === "EXTERNAL" ? "Engineer" : "Gitwork engineer",
    name,
    role: candidate.primaryStack.trim(),
    meta,
    summary: fitted.summary,
    stack: fitted.stack,
    engagements: fitted.engagements,
    links,
    omitted: fitted.omitted,
    missing,
  };
}
