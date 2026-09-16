// Jurisdiction taxonomy + the central check→jurisdiction registry.
//
// This is the spine of Pulse's "is this compliant for the markets it serves?"
// capability. It is deliberately AI-free and dependency-free so the deterministic
// scan core and the scorecard can import it without pulling in anything heavy.
//
// Design choices (see the plan):
//  • A CENTRAL registry (CHECK_JURISDICTIONS) maps checkKey → applicable
//    jurisdictions, instead of a per-check field. This touches none of the ~40
//    `checks.push({...})` call-sites and is one auditable table. A checkKey that
//    is ABSENT from the registry is treated as GLOBAL (applies to every market and
//    is never jurisdiction-skipped) — so coverage gaps fail safe (always shown),
//    never wrongly hidden.
//  • Declared markets are authoritative for scoping. Auto-detection is a best-
//    effort fallback for legacy / "I don't know my markets" scans.

export type JurisdictionCode =
  | "EU"
  | "UK"
  | "US"
  | "US-CA"
  | "US-VA"
  | "US-CO"
  | "US-CT"
  | "US-UT"
  | "CA"
  | "AU"
  | "BR"
  | "SG"
  | "TH"
  | "ZA"
  | "JP"
  | "CN"
  | "KR"
  | "IN";

export interface Jurisdiction {
  code: JurisdictionCode;
  label: string;
  /** Country-level parent for state/region codes (US-CA → US). */
  parent?: JurisdictionCode;
  /** The headline law a reviewer associates with this market. */
  primaryLaw: string;
}

export const JURISDICTIONS: Record<JurisdictionCode, Jurisdiction> = {
  EU: { code: "EU", label: "European Union", primaryLaw: "GDPR" },
  UK: { code: "UK", label: "United Kingdom", primaryLaw: "UK GDPR / PECR" },
  US: { code: "US", label: "United States (federal)", primaryLaw: "FTC / sectoral" },
  "US-CA": { code: "US-CA", label: "California (US)", parent: "US", primaryLaw: "CCPA / CPRA" },
  "US-VA": { code: "US-VA", label: "Virginia (US)", parent: "US", primaryLaw: "VCDPA" },
  "US-CO": { code: "US-CO", label: "Colorado (US)", parent: "US", primaryLaw: "CPA" },
  "US-CT": { code: "US-CT", label: "Connecticut (US)", parent: "US", primaryLaw: "CTDPA" },
  "US-UT": { code: "US-UT", label: "Utah (US)", parent: "US", primaryLaw: "UCPA" },
  CA: { code: "CA", label: "Canada", primaryLaw: "PIPEDA / Law 25" },
  AU: { code: "AU", label: "Australia", primaryLaw: "Privacy Act 1988" },
  BR: { code: "BR", label: "Brazil", primaryLaw: "LGPD" },
  SG: { code: "SG", label: "Singapore", primaryLaw: "PDPA" },
  TH: { code: "TH", label: "Thailand", primaryLaw: "PDPA" },
  ZA: { code: "ZA", label: "South Africa", primaryLaw: "POPIA" },
  JP: { code: "JP", label: "Japan", primaryLaw: "APPI" },
  CN: { code: "CN", label: "China", primaryLaw: "PIPL" },
  KR: { code: "KR", label: "South Korea", primaryLaw: "PIPA" },
  IN: { code: "IN", label: "India", primaryLaw: "DPDP Act" },
};

export const JURISDICTION_CODES = Object.keys(JURISDICTIONS) as JurisdictionCode[];

export function isJurisdictionCode(value: string): value is JurisdictionCode {
  return Object.prototype.hasOwnProperty.call(JURISDICTIONS, value);
}

/** Convenience presets surfaced in the scan form. */
export const JURISDICTION_PRESETS: Record<string, JurisdictionCode[]> = {
  EU: ["EU"],
  UK: ["UK"],
  USA: ["US", "US-CA", "US-VA", "US-CO", "US-CT", "US-UT"],
  "EU+UK": ["EU", "UK"],
};

// ── The central registry ──────────────────────────────────────────────────────
// checkKey → jurisdictions it is a legal requirement for. ABSENT key = global.
// Only LAW/compliance checks are tagged; i18n best-practices (hreflang, currency,
// language switcher) stay untagged/global so they always run.
export const CHECK_JURISDICTIONS: Record<string, JurisdictionCode[]> = {
  // GDPR core — mirrored by UK GDPR, so EU + UK.
  gdpr_article13_notice: ["EU", "UK"],
  gdpr_right_to_access: ["EU", "UK"],
  gdpr_right_to_erasure_ui: ["EU", "UK"],
  gdpr_right_to_portability: ["EU", "UK"],
  gdpr_right_to_object: ["EU", "UK"],
  gdpr_lawful_basis_stated: ["EU", "UK"],
  gdpr_breach_notification: ["EU", "UK"],
  gdpr_records_processing: ["EU", "UK"],
  gdpr_ropa_maintained: ["EU", "UK"],
  gdpr_dpo_contact: ["EU", "UK"],
  gdpr_dpa_list_public: ["EU", "UK"],
  cookie_consent_granular: ["EU", "UK"],
  transfer_impact_assessment: ["EU", "UK"],
  vat_number_displayed: ["EU", "UK"],

  // EU-specific.
  eu_representative_contact: ["EU"],
  eu_art27_representative: ["EU"],
  digital_markets_act: ["EU"],
  eu_ai_act_disclosure: ["EU"],
  cooling_off_period_eu: ["EU"],
  price_vat_inclusive: ["EU"],
  distance_selling_notice: ["EU"],
  eu_vat: ["EU"],
  vat_moss_oss_signals: ["EU"],
  eu_data_residency: ["EU"],
  cnil_france_compliant: ["EU"],
  local_legal_notice: ["EU"],
  eu_director_info: ["EU"],
  accessibility_statement_eaa: ["EU", "UK"],

  // UK-specific.
  uk_gdpr_ico_registration: ["UK"],
  eprivacy_pecr_compliance: ["EU", "UK"],
  uk_pecr_cookie_law: ["UK"],
  uk_companies_house_number: ["UK"],
  modern_slavery_statement: ["UK"],
  bribery_act_policy: ["UK"],

  // US federal / sectoral.
  hipaa_signals: ["US"],
  ferpa_signals: ["US"],
  dmca_policy: ["US"],
  can_spam_address: ["US"],

  // US state privacy (existing + new in us-privacy-extended.ts).
  ccpa_compliance: ["US-CA"],
  ccpa_do_not_sell: ["US-CA"],
  ccpa_notice_at_collection: ["US-CA"],
  us_privacy_rights_request: ["US-CA", "US-VA", "US-CO", "US-CT", "US-UT"],
  us_state_optout_signals: ["US-VA", "US-CO", "US-CT", "US-UT"],

  // Other national privacy laws (self-gated by page signals in legal-extended).
  pipeda_canada: ["CA"],
  casl_double_optin: ["CA"],
  australian_privacy_act: ["AU"],
  consumer_law_aus: ["AU"],
  lgpd_brazil: ["BR"],
  pdpa_singapore: ["SG"],
  pdpa_thailand: ["TH"],
  popia_south_africa: ["ZA"],
  appi_japan: ["JP"],
  pipl_china: ["CN"],
  pipa_korea: ["KR"],
  dpdp_india: ["IN"],
};

/** Two codes are compatible when equal, or one is the country-parent of the other
 *  (selecting US covers US-CA; selecting US-CA pulls in US-federal requirements). */
function compatible(a: JurisdictionCode, b: JurisdictionCode): boolean {
  if (a === b) return true;
  return JURISDICTIONS[a]?.parent === b || JURISDICTIONS[b]?.parent === a;
}

/** Jurisdictions a check is tagged for, or [] when global/untagged. */
export function jurisdictionsForCheck(checkKey: string): JurisdictionCode[] {
  return CHECK_JURISDICTIONS[checkKey] ?? [];
}

/** True when a check should run for the given markets: global (untagged) checks
 *  always apply; tagged checks apply when any tag is compatible with any market. */
export function checkAppliesToMarkets(checkKey: string, markets: JurisdictionCode[]): boolean {
  const tags = jurisdictionsForCheck(checkKey);
  if (tags.length === 0) return true; // global
  if (markets.length === 0) return true; // no market context → don't filter
  return tags.some((t) => markets.some((m) => compatible(t, m)));
}

// ── Auto-detection (best-effort fallback) ─────────────────────────────────────
// Centralises the TLD / lang / currency heuristics that were scattered through
// legal-extended.ts. Only used when the user declares no target markets.
//
// ⚠️ DETECTION MAY ONLY WIDEN OR ABSTAIN — IT MUST NEVER NARROW ON WEAK EVIDENCE.
// `applyJurisdictionFilter` (pulse-scan.ts) treats a NON-EMPTY market set as
// authoritative and rewrites every check tagged for another market to SKIPPED. An
// EMPTY set filters nothing. So the asymmetry is total:
//   []            → every compliance check runs.            fail-safe
//   a superset    → more checks run than strictly needed.   noisy, never a miss
//   a small WRONG set → whole bodies of law silently vanish from the report, and
//                    they do not read as wrong findings — they read as "not
//                    applicable", which is the invisible kind of miss.
//
// Both rules below were learned from a real scan of developer.mozilla.org — a
// US-headquartered, `lang="en-US"` site whose only inferred market was BRAZIL:
//
//  1. CONTEXT. `htmlLower.includes("brasil")` matched
//     `&quot;native&quot;:&quot;Português (do Brasil)&quot;` inside MDN's own Next.js
//     JSON payload. The report then dismissed CCPA and EU VAT as "not applicable to
//     your selected markets (BR)". Locale metadata — script payloads, hreflang
//     alternates, locale switchers — is evidence of which LANGUAGES a site is
//     translated into, never of which markets it sells into. Same class of bug as
//     §34.3's "comments were matched as code": a string found in the wrong context.
//
//  2. CORROBORATION. A bare country-name mention cannot narrow the set on its own;
//     it needs an ANCHOR. And a page advertising three or more locales is asserting
//     breadth, so it can never be reduced to a single market. Note the inversion
//     that makes this cheap: the very locale list that used to CAUSE the false
//     narrowing is now the thing that FORBIDS it.
//
// ⚠️ THE DOCUMENT LANGUAGE IS NOT AN ANCHOR. `<html lang>` — both its primary
// subtag (`es`, `fr`, `ja`) and its region subtag (`en-US`, `en-GB`, `de-CH`) — is
// CORROBORATION ONLY. It says what language the markup is written in, which is a
// fact about the text and not about the markets the business sells into, and it is
// a template default in most scaffolds: WordPress ships `lang="en-US"`, so does
// create-next-app, so does almost every generator. Treating it as an anchor made a
// plain `<html lang="en-US">` page on a `.com` scope to ["US"] and silently rewrote
// 46 of the 55 jurisdiction-tagged checks — every GDPR check and
// `cookie_consent_granular` among them — to "not applicable to your selected
// markets". That is the SAME harm as the `brasil` bug above, in the same direction,
// on WEAKER evidence, and it is invisible on the report because the checks read as
// inapplicable rather than wrong. It also made the MDN fix hinge entirely on
// MULTI_LOCALE_BREADTH: with one hreflang alternate removed, MDN was mis-scoped
// again. Anchors are therefore only things a site chooses market-by-market:
//   · a country-code TLD                (`.uk`, `.de`, `.br`, `.jp` …)
//   · a currency it prices in           (`£`, `€`, `¥`, `₹`, `usd`, `gbp` …)
//   · a named statute in its own prose  (`ccpa` / `cpra`)
// Removing an anchor pathway can only move detection toward ABSTAIN, which runs
// every compliance check. Adding one is what deletes bodies of law.

/**
 * Distinct locales must reach this many before a page counts as multi-market.
 *
 * ⚠️ A SECOND belt, never the only one. This number is a judgement call, not a
 * measurement, so nothing load-bearing may depend on it: the MDN regression is
 * caught by rule 2a (its only market signal is `<html lang="en-US">`, which is
 * corroboration, so there is no anchor to narrow on) and stays caught with every
 * hreflang alternate deleted. Rule 2b exists for the different case of a site that
 * DOES have a hard anchor — a `.de` domain pricing in € — while advertising eight
 * languages: the anchor is real, and reducing that site to one market would still
 * be wrong. Changing this constant must not be able to re-open item 16.
 */
const MULTI_LOCALE_BREADTH = 3;

/**
 * Strip the regions whose text is machine payload or locale chrome rather than a
 * claim about the markets this site serves. Everything removed here is a place a
 * country name can appear without meaning anything about jurisdiction.
 *
 * Removing too much is safe (fewer signals → abstain → nothing filtered); leaving a
 * payload in is what produced the MDN false negative.
 */
export function stripNonMarketContext(html: string): string {
  return html
    // Machine payloads and non-prose blocks. `<script type="application/json">` is
    // where framework page data (and therefore every locale endonym) lives.
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<template\b[^>]*>[\s\S]*?<\/template\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // A whole page payload smuggled through a data-* attribute (Inertia, Livewire,
    // Alpine) is HTML-escaped, so the script strip above never reaches it.
    .replace(/\sdata-[\w-]+=("|')\s*(?:\{|\[|&quot;|&#34;|%7b|%5b)[\s\S]*?\1/gi, " ")
    // <link rel="alternate" hreflang="pt-br"> — pure metadata, no prose.
    .replace(/<link\b[^>]*>/gi, " ")
    // A locale switcher's own label is the language's endonym ("Português (do
    // Brasil)"), which says nothing about where the business operates.
    .replace(/<a\b[^>]*\bhreflang\s*=[^>]*>[\s\S]*?<\/a\s*>/gi, " ")
    .replace(/<option\b[^>]*\b(?:hreflang|lang)\s*=[^>]*>[\s\S]*?<\/option\s*>/gi, " ")
    .replace(/<option\b[^>]*\bvalue\s*=("|')[a-z]{2,3}(?:[-_][a-z0-9]{2,4})?\1[^>]*>[\s\S]*?<\/option\s*>/gi, " ")
    // Any remaining hreflang attribute value.
    .replace(/\shreflang\s*=\s*("|')[^"']*\1/gi, " ");
}

/**
 * How many distinct languages the page advertises a translation for.
 *
 * Read from the RAW html on purpose, including the payloads `stripNonMarketContext`
 * removes: a locale list is worthless as evidence of a MARKET and excellent evidence
 * of BREADTH. Counted by primary subtag, so `en` + `en-GB` + `en-US` is one language,
 * not three.
 */
export function countAdvertisedLocales(html: string): number {
  const languages = new Set<string>();
  const add = (tag: string | undefined) => {
    const primary = (tag ?? "").toLowerCase().split(/[-_]/)[0];
    // `x-default` is a routing hint, not a language.
    if (/^[a-z]{2,3}$/.test(primary) && primary !== "x") languages.add(primary);
  };
  // hreflang, in markup or inside an escaped payload.
  for (const m of html.matchAll(/hreflang\s*(?:=|&#61;)\s*(?:["']|&quot;|&#34;)\s*([A-Za-z][\w-]*)/gi)) add(m[1]);
  // A `"locale": "pt-BR"` key, raw or HTML-escaped (MDN's shape).
  for (const m of html.matchAll(/(?:&quot;|&#34;|["'])locales?(?:&quot;|&#34;|["'])\s*(?::|&#58;)\s*(?:&quot;|&#34;|["'])([A-Za-z][\w-]*)/gi)) add(m[1]);
  for (const m of html.matchAll(/(?:&quot;|&#34;|["'])locale(?:&quot;|&#34;|["'])\s*(?::|&#58;)\s*(?:&quot;|&#34;|["'])([A-Za-z][\w-]*)/gi)) add(m[1]);
  return languages.size;
}

/** The document's own declared language, e.g. "en-us" — NOT any `lang=` anywhere in
 *  the page. The old `/lang=["']pt/` form matched a locale switcher's `<option
 *  lang="pt">`, which is the same context bug as the `brasil` match. */
export function documentLanguage(html: string): string | null {
  const openTag = /<html\b[^>]*>/i.exec(html)?.[0];
  if (!openTag) return null;
  const m = /\blang\s*=\s*["']?\s*([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*)/i.exec(openTag);
  return m ? m[1].toLowerCase().replace(/_/g, "-") : null;
}

export interface MarketDetection {
  /** Markets the scan will actually be scoped to ([] = do not filter anything). */
  markets: JurisdictionCode[];
  /** Markets backed by a ccTLD, a currency, or a statute named in the site's own
   *  prose. Deliberately NOT the document language — see the ⚠️ above. */
  anchored: JurisdictionCode[];
  /** Corroboration only: a bare country-name mention in prose, or the `<html lang>`
   *  primary/region subtag. Never narrows on its own; widens an anchored set. */
  mentioned: JurisdictionCode[];
  /** Distinct languages the page advertises. */
  advertisedLocales: number;
  /** Why detection abstained, when it did. */
  abstainedReason?: "no-signal" | "no-anchor" | "multi-locale";
}

/** The full detection, with the evidence tiers kept separate so the abstention rules
 *  are testable and the reasoning is visible. `detectMarketsFromPage` is the thin
 *  wrapper the scan calls. */
export function detectMarketEvidence(args: { hostname: string; html: string }): MarketDetection {
  const { hostname, html } = args;
  // Prose only — a country name inside a script payload or a locale switcher is not
  // a market signal (rule 1 above).
  const proseLower = stripNonMarketContext(html).toLowerCase();
  const host = hostname.toLowerCase();
  const tld = (suffix: string) => host.endsWith(suffix);
  const docLang = documentLanguage(html);
  const langIs = (primary: string) => docLang?.split("-")[0] === primary;
  const regionIs = (region: string) => docLang?.split("-")[1] === region;
  const prose = (needle: string) => proseLower.includes(needle);
  const word = (token: string) => new RegExp(`\\b${token}\\b`, "i").test(proseLower);

  const anchored = new Set<JurisdictionCode>();
  const mentioned = new Set<JurisdictionCode>();

  // ── Anchors: ccTLD, currency, statute named in the site's own prose ──────────
  // Nothing derived from `<html lang>` may go in this tier. See the ⚠️ above.

  // EU (incl. major member-state TLDs).
  if (tld(".eu") || tld(".de") || tld(".fr") || tld(".nl") || tld(".es") || tld(".it") || tld(".ie")
    || prose("€") || prose("&euro;") || word("eur")) anchored.add("EU");
  if (prose("european union")) mentioned.add("EU");

  // UK.
  if (tld(".uk") || prose("£") || prose("&pound;") || word("gbp")) anchored.add("UK");
  if (prose("united kingdom")) mentioned.add("UK");

  // US (conservative — .com is ambiguous so requires an explicit signal). CCPA/CPRA
  // named in prose is legal text about California, not a passing mention.
  const ccpaNamed = word("ccpa") || word("cpra");
  if (tld(".us") || word("usd") || ccpaNamed) anchored.add("US");
  if (prose("united states")) mentioned.add("US");
  if (ccpaNamed) anchored.add("US-CA");
  else if (prose("california")) { mentioned.add("US"); mentioned.add("US-CA"); }

  // NOTE: the currency-code anchors below are exactly the ones the original
  // heuristic used (eur/gbp/usd/aud/sgd/zar/cny). Do not "complete the set" — `CAD`
  // is computer-aided design far more often than it is a Canadian dollar, and a new
  // anchor is a new way to narrow wrongly.
  if (tld(".ca")) anchored.add("CA");
  if (prose("canada") || prose("canadian")) mentioned.add("CA");

  if (tld(".au") || word("aud")) anchored.add("AU");
  if (prose("australia")) mentioned.add("AU");

  if (tld(".br")) anchored.add("BR");
  if (prose("brasil") || prose("brazil")) mentioned.add("BR");

  if (tld(".sg") || word("sgd")) anchored.add("SG");
  if (prose("singapore")) mentioned.add("SG");

  if (tld(".th")) anchored.add("TH");
  if (prose("thailand")) mentioned.add("TH");

  if (tld(".za") || word("zar")) anchored.add("ZA");
  if (prose("south africa")) mentioned.add("ZA");

  if (tld(".jp") || prose("¥")) anchored.add("JP");
  if (prose("japan")) mentioned.add("JP");

  if (tld(".cn") || prose("人民币") || word("cny")) anchored.add("CN");
  if (tld(".kr") || prose("₩")) anchored.add("KR");
  if (tld(".in") || prose("₹")) anchored.add("IN");

  // ── Corroboration: the document language ────────────────────────────────────
  // Recorded so an already-anchored set can WIDEN (safe, merely noisy) and so the
  // evidence is visible in the report — never so it can narrow. A page whose only
  // market signal is its own `lang` attribute falls out at rule 2a below with
  // `abstainedReason: "no-anchor"`, exactly as a bare country name does.
  const langMentions: Array<[JurisdictionCode, boolean]> = [
    ["EU", ["de", "fr", "nl", "es", "it", "ga", "pl", "sv", "da", "fi", "el", "cs", "ro", "hu"].some(langIs)
      || ["de", "fr", "nl", "es", "it", "ie", "at", "be", "pl", "se", "dk", "fi", "pt", "gr"].some(regionIs)],
    ["UK", regionIs("gb") || regionIs("uk")],
    ["US", regionIs("us")],
    ["CA", regionIs("ca")],
    ["AU", regionIs("au")],
    // `pt-PT` is Portugal (EU, above); only an unregioned `pt` or `pt-BR` points at Brazil.
    ["BR", regionIs("br") || (langIs("pt") && !regionIs("pt"))],
    ["SG", regionIs("sg")],
    ["TH", regionIs("th") || langIs("th")],
    ["ZA", regionIs("za")],
    ["JP", regionIs("jp") || langIs("ja")],
    ["CN", regionIs("cn") || langIs("zh")],
    ["KR", regionIs("kr") || langIs("ko")],
    ["IN", regionIs("in") || langIs("hi")],
  ];
  for (const [code, matched] of langMentions) if (matched) mentioned.add(code);

  const advertisedLocales = countAdvertisedLocales(html);
  const union = new Set<JurisdictionCode>([...anchored, ...mentioned]);
  const base = {
    anchored: normalise([...anchored]),
    mentioned: normalise([...mentioned]),
    advertisedLocales,
  };

  if (union.size === 0) return { ...base, markets: [], abstainedReason: "no-signal" };
  // Rule 2a — corroboration with nothing to corroborate. A bare country name, a
  // shipping-country list, a single "we have an office in Canada" line, or the
  // document's own `lang` attribute is not a market scope, and scoping to it would
  // silently drop every other body of law. This is the rule that catches the
  // template-default `<html lang="en-US">` on a `.com`.
  if (anchored.size === 0) return { ...base, markets: [], abstainedReason: "no-anchor" };
  // Rule 2b — a page advertising several languages is asserting breadth. It must
  // never be reduced to ONE market; abstain and let every compliance check run.
  if (advertisedLocales >= MULTI_LOCALE_BREADTH && countCountries(union) <= 1) {
    return { ...base, markets: [], abstainedReason: "multi-locale" };
  }
  // Otherwise the union (never just the anchors): widening is safe, narrowing is not.
  return { ...base, markets: normalise([...union]) };
}

/** Distinct COUNTRIES in a market set — US and US-CA are one country, so a set of
 *  {US, US-CA} is still a single-market narrowing for rule 2b's purposes. */
function countCountries(codes: Iterable<JurisdictionCode>): number {
  const countries = new Set<JurisdictionCode>();
  for (const c of codes) countries.add(JURISDICTIONS[c]?.parent ?? c);
  return countries.size;
}

export function detectMarketsFromPage(args: {
  hostname: string;
  html: string;
  /** @deprecated Unused — detection re-derives a lowercased PROSE-ONLY view of the
   *  page, because the raw lowercased HTML is exactly what made a JSON payload look
   *  like a market signal. Kept so existing call-sites still type-check. */
  htmlLower?: string;
}): JurisdictionCode[] {
  return detectMarketEvidence({ hostname: args.hostname, html: args.html }).markets;
}

/** Normalise + dedupe a list of codes in canonical order; drop unknowns. */
function normalise(codes: readonly string[]): JurisdictionCode[] {
  const set = new Set<JurisdictionCode>();
  for (const c of codes) if (isJurisdictionCode(c)) set.add(c);
  return JURISDICTION_CODES.filter((c) => set.has(c));
}

/**
 * Effective markets to scope the scan to. Declared markets win outright; detected
 * markets are only used as the fallback when nothing was declared (legacy scans /
 * "I don't know my markets"). Detected is still returned separately for display
 * ("we also saw signals for X — did you mean to include it?").
 */
export function resolveTargetMarkets(
  declared: readonly string[] | null | undefined,
  detected: readonly JurisdictionCode[],
): { effective: JurisdictionCode[]; source: "declared" | "detected" | "none" } {
  const dec = normalise(declared ?? []);
  if (dec.length > 0) return { effective: dec, source: "declared" };
  const det = normalise(detected);
  if (det.length > 0) return { effective: det, source: "detected" };
  return { effective: [], source: "none" };
}
