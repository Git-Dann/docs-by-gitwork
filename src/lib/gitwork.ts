/**
 * Gitwork's own company details — the single source of truth.
 *
 * These are legal identifiers that appear on documents clients sign, on the public portal footer,
 * and in the contractual preamble of every NDA/MSA. They were hard-coded at five sites in three
 * different formats, which is the same failure mode as the model-name literals in §31 of
 * `CLAUDE.md`: change the company number in one place and the other four keep quoting the old one,
 * silently, on paperwork.
 *
 * ⚠️ They had ALREADY drifted when this module was written — three different registered-office
 * addresses were in use across eight files:
 *
 *   cover letterhead   3rd Floor, Anchorage One, Anchorage Quay, Salford Quays, M50 3YJ
 *   parties editor     3rd Floor, Anchorage One, Salford Quays, M50 3YJ          ← drops Anchorage Quay
 *   NDA template       3rd Floor, Anchorage One, Anchorage Quay, Salford Quays, Manchester M50 3YJ
 *
 * The NDA template's form is taken as canonical, because that one is the wording inside an actual
 * contract rather than a page decoration. **If it is wrong, fix it HERE** — every surface follows,
 * and `gitwork-identity.test.ts` fails the build if anyone pastes a copy back out.
 *
 * ── What belongs in this file, and what does not ──────────────────────────────────────────
 *
 * This is GITWORK's identity, not the workspace's. A white-label or demo workspace overrides the
 * letterhead through `branding.companyFooter`, and that override still wins everywhere — these are
 * the DEFAULTS behind it, not a replacement for it. Do not reach for this module to render a
 * client's details; those come from the document's own parties/cover data.
 */

export const GITWORK = {
  /** Trading name — what a reader sees in prose. */
  name: "Gitwork",
  /** Registered company name — what goes on anything legal. */
  legalName: "Gitwork Group Ltd",
  companyNumber: "15756347",
  vatNumber: "468314867",
  jurisdiction: "England and Wales",
  registeredOffice:
    "3rd Floor, Anchorage One, Anchorage Quay, Salford Quays, Manchester M50 3YJ",
  /** The letterhead drops "Manchester" for line length; the contractual clause keeps it. */
  registeredOfficeShort: "3rd Floor, Anchorage One, Anchorage Quay, Salford Quays, M50 3YJ",
  website: "gitwork.co.uk",
  url: "https://gitwork.co.uk",
  email: "hello@gitwork.co.uk",
  /** Gitwork's own public positioning line — used on the cover letterhead's right column. */
  strapline: "Global build capacity. UK quality control.",
} as const;

/**
 * "Gitwork Group Ltd · Company No. 15756347 · VAT 468314867 · Registered in England and Wales"
 *
 * The public disclosure line. ⚠️ Load-bearing on `/portal/login`: `/` redirects there and a Pulse
 * scan FOLLOWS the redirect, so that is the page graded for the company/VAT disclosure checks.
 */
export function companyDisclosureLine(): string {
  return [
    GITWORK.legalName,
    `Company No. ${GITWORK.companyNumber}`,
    `VAT ${GITWORK.vatNumber}`,
    `Registered in ${GITWORK.jurisdiction}`,
  ].join(" · ");
}

/**
 * The two-line letterhead block for a document cover, upper-cased in the house mono style.
 *
 * `separator` differs by surface for typographic reasons that predate this module — the cover uses
 * `/` and the running page header uses `·` — so it is a parameter rather than a second literal.
 */
export function letterheadLines(separator: "/" | "·" = "/"): [string, string] {
  const gap = `  ${separator}  `;
  return [
    [
      GITWORK.legalName,
      `Company no. ${GITWORK.companyNumber}`,
      `VAT reg. ${GITWORK.vatNumber}`,
    ]
      .join(gap)
      .toUpperCase(),
    GITWORK.registeredOfficeShort.toUpperCase(),
  ];
}

/** The short form for a running page header — name and company number only. */
export function letterheadShort(): string {
  return `${GITWORK.legalName}  ·  Company no. ${GITWORK.companyNumber}`.toUpperCase();
}

/**
 * The contractual identification clause, as it reads inside a party's preamble:
 * "a company registered in England and Wales under number 15756347, whose registered office is at …"
 *
 * Returned as separate lines because `PartyItem.details` is a line array and the renderer joins it.
 */
export function registeredPartyDetailLines(): string[] {
  return [
    `a company registered in ${GITWORK.jurisdiction} under number ${GITWORK.companyNumber}`,
    `whose registered office is at ${GITWORK.registeredOffice}`,
  ];
}
