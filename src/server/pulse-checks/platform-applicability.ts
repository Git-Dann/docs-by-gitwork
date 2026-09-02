import { CATEGORIES, type CheckCategory } from "./categories";

/** Every platform value exposed by the Pulse scan form. */
export const SUPPORTED_PULSE_PLATFORMS = [
  "WEB_APP",
  "SAAS",
  "MARKETING_SITE",
  "IOS_APP",
  "ANDROID_APP",
  "CROSS_PLATFORM_MOBILE",
  "DESKTOP_APP",
  "CHROME_EXTENSION",
  "API_BACKEND",
  "CLI_TOOL",
  "OTHER",
] as const;

export type PulsePlatform = (typeof SUPPORTED_PULSE_PLATFORMS)[number];
export type UrlSurfaceKind = "DEPLOYED_PRODUCT" | "BUNDLED_PROTOTYPE" | "ACCESS_INTERSTITIAL";
export type CategoryApplicability = "APPLICABLE" | "CONDITIONAL" | "NOT_APPLICABLE";
type ApplicabilityProfile = Record<CheckCategory, CategoryApplicability>;

export const SUPPORTED_STANDARDS_AREAS = [
  "security_core", "inclusive_access", "performance_core", "privacy_core",
  "release_core", "reliability_core", "distribution_core", "api_ai_core",
  "identity", "authorization", "input", "data", "secrets", "network", "api",
  "content", "commerce", "ai_behavior", "ai_tools", "ai_data", "privacy",
  "accessibility", "ux_recovery", "performance", "resilience", "observability",
  "integrity", "release", "supply", "device", "host", "distribution", "business",
] as const;
export type StandardsArea = (typeof SUPPORTED_STANDARDS_AREAS)[number];
type StandardsProfile = Record<StandardsArea, CategoryApplicability>;

const PLATFORM_SET = new Set<string>(SUPPORTED_PULSE_PLATFORMS);

/**
 * The baseline is deliberately exhaustive. Adding a category to categories.ts
 * is therefore a compile error here until its default relevance is decided.
 */
const BASE_APPLICABILITY: ApplicabilityProfile = {
  [CATEGORIES.STORE_LISTING]: "CONDITIONAL",
  [CATEGORIES.SEO]: "CONDITIONAL",
  [CATEGORIES.AEO]: "CONDITIONAL",
  [CATEGORIES.INFRASTRUCTURE]: "APPLICABLE",
  [CATEGORIES.SECURITY]: "APPLICABLE",
  [CATEGORIES.SECRETS_KEYS]: "CONDITIONAL",
  [CATEGORIES.PERFORMANCE]: "APPLICABLE",
  [CATEGORIES.PAYMENTS]: "CONDITIONAL",
  [CATEGORIES.AUTHENTICATION]: "CONDITIONAL",
  [CATEGORIES.OBSERVABILITY]: "CONDITIONAL",
  [CATEGORIES.LEGAL]: "CONDITIONAL",
  [CATEGORIES.MISSING_PAGES]: "CONDITIONAL",
  [CATEGORIES.SAAS]: "CONDITIONAL",
  [CATEGORIES.MOBILE]: "CONDITIONAL",
  [CATEGORIES.ACCESSIBILITY]: "CONDITIONAL",
  [CATEGORIES.CODE_QUALITY]: "CONDITIONAL",
  [CATEGORIES.APP_STORE]: "CONDITIONAL",
  [CATEGORIES.GLOBAL_DISTRIBUTION]: "CONDITIONAL",
  [CATEGORIES.TRUST_BRAND]: "CONDITIONAL",
  [CATEGORIES.ROLES]: "CONDITIONAL",
  [CATEGORIES.EMAIL]: "CONDITIONAL",
  [CATEGORIES.BUSINESS_OPS]: "CONDITIONAL",
  [CATEGORIES.API_QUALITY]: "CONDITIONAL",
  [CATEGORIES.AI_READINESS]: "CONDITIONAL",
  [CATEGORIES.AI_SAFETY]: "CONDITIONAL",
  [CATEGORIES.VIBE_HYGIENE]: "CONDITIONAL",
  [CATEGORIES.BUILD_PIPELINE]: "CONDITIONAL",
  [CATEGORIES.STANDARDS_VERIFICATION]: "APPLICABLE",
};

const profile = (overrides: Partial<ApplicabilityProfile> = {}): ApplicabilityProfile => ({
  ...BASE_APPLICABILITY,
  ...overrides,
});

const NATIVE_APP_PROFILE = profile({
  [CATEGORIES.SEO]: "NOT_APPLICABLE",
  [CATEGORIES.AEO]: "NOT_APPLICABLE",
  [CATEGORIES.PAYMENTS]: "NOT_APPLICABLE",
  [CATEGORIES.AUTHENTICATION]: "NOT_APPLICABLE",
  [CATEGORIES.MISSING_PAGES]: "NOT_APPLICABLE",
  [CATEGORIES.SAAS]: "NOT_APPLICABLE",
  [CATEGORIES.GLOBAL_DISTRIBUTION]: "NOT_APPLICABLE",
  [CATEGORIES.ROLES]: "NOT_APPLICABLE",
  [CATEGORIES.EMAIL]: "NOT_APPLICABLE",
  [CATEGORIES.BUSINESS_OPS]: "NOT_APPLICABLE",
  [CATEGORIES.API_QUALITY]: "NOT_APPLICABLE",
});

/**
 * Exhaustive platform × category contract. APPLICABLE means the family is
 * generally useful, CONDITIONAL means feature/evidence detection must decide,
 * and NOT_APPLICABLE means it must never affect that platform's scan.
 */
export const PLATFORM_CATEGORY_APPLICABILITY: Record<PulsePlatform, ApplicabilityProfile> = {
  WEB_APP: profile(),
  SAAS: profile(),
  MARKETING_SITE: profile({
    [CATEGORIES.AUTHENTICATION]: "NOT_APPLICABLE",
    [CATEGORIES.PAYMENTS]: "NOT_APPLICABLE",
    [CATEGORIES.SAAS]: "NOT_APPLICABLE",
    [CATEGORIES.ROLES]: "NOT_APPLICABLE",
    [CATEGORIES.API_QUALITY]: "NOT_APPLICABLE",
  }),
  IOS_APP: NATIVE_APP_PROFILE,
  ANDROID_APP: NATIVE_APP_PROFILE,
  CROSS_PLATFORM_MOBILE: NATIVE_APP_PROFILE,
  DESKTOP_APP: profile({
    [CATEGORIES.STORE_LISTING]: "NOT_APPLICABLE",
    [CATEGORIES.SEO]: "NOT_APPLICABLE",
    [CATEGORIES.AEO]: "NOT_APPLICABLE",
    [CATEGORIES.MISSING_PAGES]: "NOT_APPLICABLE",
    [CATEGORIES.MOBILE]: "NOT_APPLICABLE",
    [CATEGORIES.APP_STORE]: "NOT_APPLICABLE",
    [CATEGORIES.GLOBAL_DISTRIBUTION]: "NOT_APPLICABLE",
    [CATEGORIES.EMAIL]: "NOT_APPLICABLE",
    [CATEGORIES.API_QUALITY]: "NOT_APPLICABLE",
  }),
  CHROME_EXTENSION: profile({
    [CATEGORIES.STORE_LISTING]: "NOT_APPLICABLE",
    [CATEGORIES.SEO]: "NOT_APPLICABLE",
    [CATEGORIES.AEO]: "NOT_APPLICABLE",
    [CATEGORIES.PAYMENTS]: "NOT_APPLICABLE",
    [CATEGORIES.MISSING_PAGES]: "NOT_APPLICABLE",
    [CATEGORIES.SAAS]: "NOT_APPLICABLE",
    [CATEGORIES.MOBILE]: "NOT_APPLICABLE",
    [CATEGORIES.APP_STORE]: "NOT_APPLICABLE",
    [CATEGORIES.GLOBAL_DISTRIBUTION]: "NOT_APPLICABLE",
    [CATEGORIES.EMAIL]: "NOT_APPLICABLE",
    [CATEGORIES.BUSINESS_OPS]: "NOT_APPLICABLE",
    [CATEGORIES.API_QUALITY]: "NOT_APPLICABLE",
  }),
  API_BACKEND: profile({
    [CATEGORIES.STORE_LISTING]: "NOT_APPLICABLE",
    [CATEGORIES.SEO]: "NOT_APPLICABLE",
    [CATEGORIES.AEO]: "NOT_APPLICABLE",
    [CATEGORIES.PAYMENTS]: "NOT_APPLICABLE",
    [CATEGORIES.MISSING_PAGES]: "NOT_APPLICABLE",
    [CATEGORIES.SAAS]: "NOT_APPLICABLE",
    [CATEGORIES.MOBILE]: "NOT_APPLICABLE",
    [CATEGORIES.ACCESSIBILITY]: "NOT_APPLICABLE",
    [CATEGORIES.APP_STORE]: "NOT_APPLICABLE",
    [CATEGORIES.GLOBAL_DISTRIBUTION]: "NOT_APPLICABLE",
    [CATEGORIES.TRUST_BRAND]: "NOT_APPLICABLE",
    [CATEGORIES.ROLES]: "NOT_APPLICABLE",
    [CATEGORIES.EMAIL]: "NOT_APPLICABLE",
    [CATEGORIES.BUSINESS_OPS]: "NOT_APPLICABLE",
  }),
  CLI_TOOL: profile({
    [CATEGORIES.STORE_LISTING]: "NOT_APPLICABLE",
    [CATEGORIES.SEO]: "NOT_APPLICABLE",
    [CATEGORIES.AEO]: "NOT_APPLICABLE",
    [CATEGORIES.PAYMENTS]: "NOT_APPLICABLE",
    [CATEGORIES.AUTHENTICATION]: "NOT_APPLICABLE",
    [CATEGORIES.MISSING_PAGES]: "NOT_APPLICABLE",
    [CATEGORIES.SAAS]: "NOT_APPLICABLE",
    [CATEGORIES.MOBILE]: "NOT_APPLICABLE",
    [CATEGORIES.ACCESSIBILITY]: "NOT_APPLICABLE",
    [CATEGORIES.APP_STORE]: "NOT_APPLICABLE",
    [CATEGORIES.GLOBAL_DISTRIBUTION]: "NOT_APPLICABLE",
    [CATEGORIES.TRUST_BRAND]: "NOT_APPLICABLE",
    [CATEGORIES.ROLES]: "NOT_APPLICABLE",
    [CATEGORIES.EMAIL]: "NOT_APPLICABLE",
    [CATEGORIES.BUSINESS_OPS]: "NOT_APPLICABLE",
    [CATEGORIES.API_QUALITY]: "NOT_APPLICABLE",
  }),
  OTHER: profile({
    [CATEGORIES.STORE_LISTING]: "NOT_APPLICABLE",
  }),
};

const standardsProfile = (notApplicable: Partial<Record<StandardsArea, true>>): StandardsProfile => Object.fromEntries(
  SUPPORTED_STANDARDS_AREAS.map((area) => [
    area,
    notApplicable[area] ? "NOT_APPLICABLE" : "CONDITIONAL",
  ]),
) as StandardsProfile;

/** Platform-only exclusions for the evidence-required catalogue. */
export const PLATFORM_STANDARDS_APPLICABILITY: Record<PulsePlatform, StandardsProfile> = {
  WEB_APP: standardsProfile({ device: true, host: true }),
  SAAS: standardsProfile({ device: true, host: true }),
  MARKETING_SITE: standardsProfile({
    identity: true,
    authorization: true,
    api: true,
    commerce: true,
    ai_behavior: true,
    ai_tools: true,
    ai_data: true,
    device: true,
    host: true,
  }),
  IOS_APP: standardsProfile({ api: true, host: true }),
  ANDROID_APP: standardsProfile({ api: true, host: true }),
  CROSS_PLATFORM_MOBILE: standardsProfile({ api: true, host: true }),
  DESKTOP_APP: standardsProfile({ api: true }),
  CHROME_EXTENSION: standardsProfile({ api: true, commerce: true, device: true }),
  API_BACKEND: standardsProfile({
    inclusive_access: true,
    content: true,
    commerce: true,
    accessibility: true,
    ux_recovery: true,
    device: true,
    host: true,
  }),
  CLI_TOOL: standardsProfile({ commerce: true, device: true }),
  OTHER: standardsProfile({}),
};

const PROTOTYPE_INAPPLICABLE = new Set<CheckCategory>([
  CATEGORIES.STORE_LISTING,
  CATEGORIES.AEO,
  CATEGORIES.PAYMENTS,
  CATEGORIES.AUTHENTICATION,
  CATEGORIES.OBSERVABILITY,
  CATEGORIES.LEGAL,
  CATEGORIES.MISSING_PAGES,
  CATEGORIES.SAAS,
  CATEGORIES.APP_STORE,
  CATEGORIES.GLOBAL_DISTRIBUTION,
  CATEGORIES.TRUST_BRAND,
  CATEGORIES.ROLES,
  CATEGORIES.EMAIL,
  CATEGORIES.BUSINESS_OPS,
  CATEGORIES.API_QUALITY,
  CATEGORIES.AI_READINESS,
  CATEGORIES.AI_SAFETY,
]);

export function normalizePulsePlatform(platform: string | undefined): PulsePlatform {
  const normalized = (platform ?? "").trim().toUpperCase();
  return PLATFORM_SET.has(normalized) ? normalized as PulsePlatform : "OTHER";
}

export function standardsAreaForControl(checkKey: string): StandardsArea | null {
  const area = checkKey.replace(/^standards_/, "").replace(/^deep_/, "").replace(/_\d+$/, "");
  return (SUPPORTED_STANDARDS_AREAS as readonly string[]).includes(area) ? area as StandardsArea : null;
}

export function isStandardsControlApplicable(platform: string | undefined, checkKey: string): boolean {
  const area = standardsAreaForControl(checkKey);
  if (!area) return false;
  return PLATFORM_STANDARDS_APPLICABILITY[normalizePulsePlatform(platform)][area] !== "NOT_APPLICABLE";
}

/** Detects portable design/prototype bundles by their document format, not host. */
export function detectUrlSurfaceKind(html: string): UrlSurfaceKind {
  const lower = html.toLowerCase();
  const isVercelCheckpoint =
    lower.includes("vercel security checkpoint") &&
    (lower.includes("verifying your browser") || lower.includes("enable javascript to continue"));
  const isCloudflareChallenge =
    (lower.includes("cf-chl-") || lower.includes("challenge-platform")) &&
    (lower.includes("checking your browser") || lower.includes("just a moment"));
  const isGenericBotChallenge =
    lower.includes("checking if the site connection is secure") ||
    lower.includes("performing security verification");
  if (isVercelCheckpoint || isCloudflareChallenge || isGenericBotChallenge) {
    return "ACCESS_INTERSTITIAL";
  }

  const hasManifest = /<script\s+type=["']__bundler\/manifest["']/i.test(html);
  const hasTemplate = /<script\s+type=["']__bundler\/template["']/i.test(html);
  return hasManifest && hasTemplate ? "BUNDLED_PROTOTYPE" : "DEPLOYED_PRODUCT";
}

export function getInapplicableCategories(
  platform: string | undefined,
  surfaceKind: UrlSurfaceKind = "DEPLOYED_PRODUCT",
): CheckCategory[] {
  const resolved = normalizePulsePlatform(platform);
  const profileForPlatform = PLATFORM_CATEGORY_APPLICABILITY[resolved];
  if (surfaceKind === "ACCESS_INTERSTITIAL") return Object.keys(profileForPlatform) as CheckCategory[];
  return (Object.keys(profileForPlatform) as CheckCategory[]).filter((category) =>
    profileForPlatform[category] === "NOT_APPLICABLE" ||
    (surfaceKind === "BUNDLED_PROTOTYPE" && PROTOTYPE_INAPPLICABLE.has(category)),
  );
}

export function isCategoryApplicable(
  platform: string | undefined,
  category: CheckCategory,
  surfaceKind: UrlSurfaceKind = "DEPLOYED_PRODUCT",
): boolean {
  return !getInapplicableCategories(platform, surfaceKind).includes(category);
}

/** Remove non-applicable rows entirely when composing an artefact-specific scan. */
export function keepApplicableChecks<T extends { category: CheckCategory }>(
  checks: T[],
  platform: string | undefined,
  surfaceKind: UrlSurfaceKind = "DEPLOYED_PRODUCT",
): T[] {
  const excluded = new Set(getInapplicableCategories(platform, surfaceKind));
  return checks.filter((check) => !excluded.has(check.category));
}

export function getInapplicableCategoryDetails(
  platform: string | undefined,
  surfaceKind: UrlSurfaceKind = "DEPLOYED_PRODUCT",
): Array<{ category: CheckCategory; reason: string }> {
  const resolved = normalizePulsePlatform(platform);
  return getInapplicableCategories(resolved, surfaceKind).map((category) => ({
    category,
    reason: surfaceKind === "BUNDLED_PROTOTYPE" && PROTOTYPE_INAPPLICABLE.has(category)
      ? "Not applicable — this URL is a self-contained prototype bundle, so production operational controls cannot be verified against it. Scan the deployed product or source repository for this family."
      : `Not applicable to the selected ${resolved.toLowerCase().replace(/_/g, " ")} platform.`,
  }));
}
