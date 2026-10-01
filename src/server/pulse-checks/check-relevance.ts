// ─────────────────────────────────────────────────────────────────────────────
// CHECK RELEVANCE — a check is shown only when it is about this product.
//
// The rule, from the product owner: "The checks need to be contextual and only show
// IF related to the specific platform; we don't show irrelevant data or results if
// not needed."
//
// Measured before this existed (scripts/pulse-platform-matrix.ts, 176 real scans):
//   • example.com — one static page — reported 857 findings as a web app, including
//     20 payments checks, 30 SaaS checks and 21 API-quality checks for features it
//     does not have, and 368 generic "verify manually" catalogue items.
//   • An iOS repo returned the same 458 checks whether the dropdown said iOS, web
//     app or CLI tool.
//   • A website scanned as an iOS / Android / desktop / extension / CLI product
//     returned one check.
//
// So a check is SHOWN only when all three hold, and otherwise it is not persisted,
// not scored and not displayed — it is counted, once, in the scan's coverage note:
//
//   1. SURFACE  — it measures the artefact that was scanned (a website, an API, a
//                 store listing, or source code of a given shape).
//   2. PLATFORM — the question matters for the product type that was selected.
//   3. FEATURE  — when it is about a feature (payments, sign-in, AI, sending email,
//                 a public API…), the product demonstrably has that feature.
//
// Plus one rule for the standards catalogue: a control is shown only when Pulse
// has evidence for it. "Verify this manually" is a to-do, not a finding, and 368 of
// them on every scan buried everything that was.
//
// The decision is made in ONE place — runLiteScan's ingest — so no collector can
// route around it, and it is pure, so it is tested without a network.
// ─────────────────────────────────────────────────────────────────────────────

import type { PulseScanCheckInput } from "@/types/pulse";
import type { PulsePlatform } from "./platform-applicability";

/** What a check reads. One per check. */
export type CheckSurface =
  | "WEB_PAGE"      // the site's HTML / rendered content / same-origin pages
  | "WEB_HTTP"      // response headers, TLS, redirects, cookies of the host
  | "WEB_DOMAIN"    // DNS of the domain (SPF, DKIM, DMARC, CAA…)
  | "WEB_PROBE"     // extra paths requested on the host (/.env, /api/…, robots)
  | "API_HTTP"      // behaviour of an API endpoint
  | "STORE_LISTING" // an app-store listing
  | "REPO_ANY"      // any repository
  | "REPO_WEB_SOURCE" | "REPO_BACKEND"
  | "REPO_IOS" | "REPO_ANDROID" | "REPO_FLUTTER" | "REPO_RN"
  | "REPO_DESKTOP" | "REPO_EXTENSION" | "REPO_CLI"
  | "REPO_CONTAINER" | "REPO_CI"
  | "STANDARDS_CATALOG"
  | "META";         // about the scan itself — always shown

/** A product feature a check can depend on. */
export type ProductFeature =
  | "payments" | "accounts" | "saas_multitenant" | "ecommerce" | "ai_features"
  | "sends_email" | "public_api" | "marketing_content" | "i18n" | "user_content"
  | "supabase" | "firebase"
  /** The product has an iOS / Android app of its own (gates universal links, app banners…). */
  | "mobile_app";

export interface RelevanceRule {
  surface: CheckSurface;
  /** Platforms for which the question matters. */
  platforms: readonly PulsePlatform[];
  /**
   * True when the check still matters on the marketing / support WEBSITE of a non-web
   * product (an iOS app's site still needs a privacy policy and TLS; it does not need
   * a SaaS billing portal).
   */
  presence: boolean;
  /** The feature the product must have for this to be a question at all. */
  feature: ProductFeature | null;
}

/** What was scanned. */
export type ScanTarget =
  | { kind: "website" }
  | { kind: "api" }
  | { kind: "store" }
  | { kind: "repo"; shape: RepoShape }
  | { kind: "none" };

/** The snapshot shapes (native-repo.ts) plus the two generic ones. */
export type RepoShape =
  | "ios" | "android" | "flutter" | "react-native"
  | "electron" | "tauri" | "cli" | "chrome-extension"
  | "web" | "backend" | "none";

export interface ScanContext {
  platform: PulsePlatform;
  target: ScanTarget;
  /** Features the scan established. A feature not in the set is treated as absent. */
  features: ReadonlySet<ProductFeature>;
}

export type HiddenReason =
  | "not_this_artefact"   // measures something other than what was scanned
  | "not_this_platform"   // the question does not apply to this product type
  | "feature_absent"      // about a feature the product does not have
  | "needs_evidence"      // a catalogue control Pulse has no evidence for
  | "not_applicable"      // the check itself reported that it does not apply
  | "withheld";           // cannot be assessed from here, or withheld until a known defect is fixed

export interface RelevanceDecision {
  show: boolean;
  reason?: HiddenReason;
  feature?: ProductFeature;
}

/**
 * The scan's notes about itself — coverage, what it could and could not reach. Always
 * shown, whatever the data file says: hiding them would hide the honesty statements
 * the rest of the report depends on.
 */
export const SCAN_NOTE_KEYS: ReadonlySet<string> = new Set([
  "scan_collector_completeness",
  "platform_family_coverage",
  "repo_intelligence",
  "repo_accessible",
  "target_content_accessible",
  "spa_content_rendered_for_scan",
]);

export const WEB_PLATFORMS: ReadonlySet<PulsePlatform> = new Set(["WEB_APP", "SAAS", "MARKETING_SITE", "OTHER"]);

const SURFACES_BY_TARGET: Record<Exclude<ScanTarget["kind"], "repo">, ReadonlySet<CheckSurface>> = {
  website: new Set(["WEB_PAGE", "WEB_HTTP", "WEB_DOMAIN", "WEB_PROBE", "API_HTTP"]),
  api: new Set(["WEB_HTTP", "WEB_PROBE", "API_HTTP"]),
  // A Chrome Web Store listing publishes the extension's manifest, so the manifest checks
  // (REPO_EXTENSION rules, CHROME_EXTENSION-only) are part of what a listing shows.
  store: new Set(["STORE_LISTING", "REPO_EXTENSION"]),
  none: new Set(),
};

const REPO_SURFACES_BY_SHAPE: Record<RepoShape, ReadonlySet<CheckSurface>> = {
  ios: new Set(["REPO_ANY", "REPO_IOS", "REPO_CI", "REPO_CONTAINER"]),
  android: new Set(["REPO_ANY", "REPO_ANDROID", "REPO_CI", "REPO_CONTAINER"]),
  flutter: new Set(["REPO_ANY", "REPO_FLUTTER", "REPO_CI", "REPO_CONTAINER"]),
  "react-native": new Set(["REPO_ANY", "REPO_RN", "REPO_CI", "REPO_CONTAINER"]),
  electron: new Set(["REPO_ANY", "REPO_DESKTOP", "REPO_CI", "REPO_CONTAINER"]),
  tauri: new Set(["REPO_ANY", "REPO_DESKTOP", "REPO_CI", "REPO_CONTAINER"]),
  cli: new Set(["REPO_ANY", "REPO_CLI", "REPO_CI", "REPO_CONTAINER"]),
  "chrome-extension": new Set(["REPO_ANY", "REPO_EXTENSION", "REPO_CI", "REPO_CONTAINER"]),
  web: new Set(["REPO_ANY", "REPO_WEB_SOURCE", "REPO_BACKEND", "REPO_CI", "REPO_CONTAINER"]),
  backend: new Set(["REPO_ANY", "REPO_BACKEND", "REPO_CI", "REPO_CONTAINER"]),
  none: new Set(["REPO_ANY", "REPO_CI", "REPO_CONTAINER"]),
};

/** Surfaces this scan's artefact can answer. */
export function surfacesFor(target: ScanTarget): ReadonlySet<CheckSurface> {
  return target.kind === "repo" ? REPO_SURFACES_BY_SHAPE[target.shape] : SURFACES_BY_TARGET[target.kind];
}

/**
 * Decide whether one check is shown. Pure — no I/O.
 *
 * `rule` is null for a key with no relevance entry; such a check is SHOWN, so a missing
 * entry can never silently delete findings. The completeness test fails instead.
 */
export function decideRelevance(
  check: Pick<PulseScanCheckInput, "checkKey" | "status">,
  rule: RelevanceRule | null,
  ctx: ScanContext,
): RelevanceDecision {
  if (rule?.surface === "META" || SCAN_NOTE_KEYS.has(check.checkKey)) return { show: true };

  // A check that says of itself "this does not apply" adds nothing to the report —
  // whether or not it has a rule. (The scan's own notes are META and shown above.)
  if (check.status === "SKIPPED" || check.status === "NOT_APPLICABLE") return { show: false, reason: "not_applicable" };

  // Withheld checks (check-relevance-data.ts WITHHELD) are never shown, whatever they say.
  if (WITHHELD[check.checkKey]) return { show: false, reason: "withheld" };

  if (!rule) return { show: true };

  if (rule.surface === "STANDARDS_CATALOG") {
    // Shown only when Pulse has a verdict from evidence. A generic "verify manually" item
    // (WARN / EVIDENCE_REQUIRED / NOT_TESTED) is a to-do, not a finding.
    if (check.status !== "PASS" && check.status !== "FAIL") return { show: false, reason: "needs_evidence" };
    if (!rule.platforms.includes(ctx.platform)) return { show: false, reason: "not_this_platform" };
    return { show: true };
  }

  if (!surfacesFor(ctx.target).has(rule.surface)) return { show: false, reason: "not_this_artefact" };

  // A WEBSITE of a non-web product (an iOS app's marketing site, an API's docs site) is
  // that product's public presence: judged by the presence rules, not by the platform's.
  const isPresenceSite = ctx.target.kind === "website" && !WEB_PLATFORMS.has(ctx.platform);
  const platformOk = isPresenceSite ? rule.presence : rule.platforms.includes(ctx.platform);
  if (!platformOk) return { show: false, reason: "not_this_platform" };

  if (rule.feature && !ctx.features.has(rule.feature)) return { show: false, reason: "feature_absent", feature: rule.feature };
  return { show: true };
}

/** A running tally of what was hidden and why — the scan's one-line "not assessed" note. */
export interface RelevanceSummary {
  shown: number;
  hidden: number;
  byReason: Partial<Record<HiddenReason, number>>;
  byFeature: Partial<Record<ProductFeature, number>>;
}

export function emptyRelevanceSummary(): RelevanceSummary {
  return { shown: 0, hidden: 0, byReason: {}, byFeature: {} };
}

export function recordDecision(summary: RelevanceSummary, decision: RelevanceDecision): void {
  if (decision.show) {
    summary.shown += 1;
    return;
  }
  summary.hidden += 1;
  if (decision.reason) summary.byReason[decision.reason] = (summary.byReason[decision.reason] ?? 0) + 1;
  if (decision.feature) summary.byFeature[decision.feature] = (summary.byFeature[decision.feature] ?? 0) + 1;
}

// ── Rule lookup ──────────────────────────────────────────────────────────────

import { CHECK_RELEVANCE, WITHHELD } from "./check-relevance-data";
import { SUPPORTED_PULSE_PLATFORMS, isStandardsControlApplicable } from "./platform-applicability";

const standardsRuleCache = new Map<string, RelevanceRule>();

/**
 * Catalogue areas that are only questions for a product WITH the feature: account
 * recovery and MFA controls for a product with no accounts, commerce controls for one
 * that takes no payments, model-safety controls for one with no AI.
 */
function standardsAreaFeature(checkKey: string): ProductFeature | null {
  const area = checkKey.replace(/^standards_/, "").replace(/^deep_/, "").replace(/_\d+$/, "");
  if (area === "identity" || area === "authorization") return "accounts";
  if (area === "commerce") return "payments";
  if (area === "ai_behavior" || area === "ai_tools" || area === "ai_data") return "ai_features";
  if (area === "api") return "public_api";
  return null;
}

/**
 * The relevance rule for a check key. The standards catalogue is generated (≈537 keys),
 * so its rule is derived from the key's area via the same applicability table that
 * already governs which catalogue areas apply to which platform.
 */
export function relevanceRuleFor(checkKey: string): RelevanceRule | null {
  const explicit = CHECK_RELEVANCE[checkKey];
  if (explicit) return explicit;
  if (checkKey.startsWith("standards_")) {
    const cached = standardsRuleCache.get(checkKey);
    if (cached) return cached;
    const rule: RelevanceRule = {
      surface: "STANDARDS_CATALOG",
      platforms: SUPPORTED_PULSE_PLATFORMS.filter((platform) => isStandardsControlApplicable(platform, checkKey)),
      presence: false,
      feature: standardsAreaFeature(checkKey),
    };
    standardsRuleCache.set(checkKey, rule);
    return rule;
  }
  return null;
}
