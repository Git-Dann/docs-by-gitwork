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
export function detectMarketsFromPage(args: {
  hostname: string;
  html: string;
  htmlLower: string;
}): JurisdictionCode[] {
  const { hostname, html, htmlLower } = args;
  const found = new Set<JurisdictionCode>();
  const host = hostname.toLowerCase();
  const tld = (suffix: string) => host.endsWith(suffix);

  // EU (incl. major member-state TLDs).
  if (tld(".eu") || tld(".de") || tld(".fr") || tld(".nl") || tld(".es") || tld(".it") || tld(".ie")
    || htmlLower.includes("european union") || htmlLower.includes("€") || /\beur\b/i.test(html)) found.add("EU");
  // UK.
  if (tld(".uk") || htmlLower.includes("united kingdom") || htmlLower.includes("£") || /\bgbp\b/i.test(html)) found.add("UK");
  // US (conservative — .com is ambiguous so requires an explicit signal).
  if (tld(".us") || htmlLower.includes("united states") || /\busd\b/i.test(html) || htmlLower.includes("california")
    || htmlLower.includes("ccpa")) {
    found.add("US");
    if (htmlLower.includes("california") || htmlLower.includes("ccpa") || htmlLower.includes("cpra")) found.add("US-CA");
  }
  if (tld(".ca") || htmlLower.includes("canada") || htmlLower.includes("canadian")) found.add("CA");
  if (tld(".au") || htmlLower.includes("australia") || /\baud\b/i.test(html)) found.add("AU");
  if (tld(".br") || /lang=["']pt/i.test(html) || htmlLower.includes("brasil")) found.add("BR");
  if (tld(".sg") || htmlLower.includes("singapore") || /\bsgd\b/i.test(html)) found.add("SG");
  if (tld(".th") || /lang=["']th/i.test(html) || htmlLower.includes("thailand")) found.add("TH");
  if (tld(".za") || htmlLower.includes("south africa") || /\bzar\b/i.test(html)) found.add("ZA");
  if (tld(".jp") || /lang=["']ja/i.test(html) || htmlLower.includes("japan") || htmlLower.includes("¥")) found.add("JP");
  if (tld(".cn") || /lang=["']zh/i.test(html) || htmlLower.includes("人民币") || /\bcny\b/i.test(html)) found.add("CN");
  if (tld(".kr") || /lang=["']ko/i.test(html) || htmlLower.includes("₩")) found.add("KR");
  if (tld(".in") || /lang=["']hi/i.test(html) || htmlLower.includes("₹")) found.add("IN");

  return Array.from(found);
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
