// ─────────────────────────────────────────────────────────────────────────────
// STORE LINKS — one rule for "is this an iOS link or an Android link?"
//
// An App Store link IS an iOS app and a Google Play link IS an Android app. That
// is not a guess about the product, it is what the link points at, so it must
// decide the scan's platform everywhere: the form's platform picker, the platform
// stored on the scan, the checks that run, the release policy the scan is judged
// against, the name it is filed under and what the AI write-up is told it is.
//
// It used to decide almost none of that. The form defaulted to "Web app" and
// nothing corrected it, so a scan of an iOS listing was stored as a WEB_APP named
// `apps.apple.com`, judged against the website launch policy, and told it had
// failed to run the website checks — "scan the product's own URL". The one fact
// the user supplied (this is an iOS app) was the one fact the report lost.
//
// Framework-free on purpose: the client form and the server both import it, so
// the two can never disagree about what a link is.
// ─────────────────────────────────────────────────────────────────────────────

export type StoreTarget = "app_store" | "play_store" | "chrome_web_store";
export type StorePlatform = "IOS_APP" | "ANDROID_APP" | "CHROME_EXTENSION";

/** A Chrome Web Store item id: 32 characters from a–p. */
const CWS_ID = /^[a-p]{32}$/i;

function parse(url: string): URL | null {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return null;
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

/**
 * Which store a link points at, decided by its HOST — never by a substring.
 *
 * ⚠️ The previous test was `url.includes("apps.apple.com")`, which classified
 * `https://example.com/?next=apps.apple.com` as an App Store listing and sent it
 * down the store path, skipping every website check on a website.
 */
export function detectStoreTarget(url: string): StoreTarget | null {
  const parsed = parse(url);
  if (!parsed) return null;
  const host = parsed.hostname.toLowerCase();
  if (host === "apps.apple.com" || host === "itunes.apple.com") return "app_store";
  if (host === "play.google.com" && parsed.pathname.toLowerCase().startsWith("/store/apps")) return "play_store";
  if (chromeWebStoreId(parsed)) return "chrome_web_store";
  return null;
}

/**
 * The item id from a Chrome Web Store link — /detail/<slug>/<id> or /detail/<id> on
 * chromewebstore.google.com, and the legacy chrome.google.com/webstore/detail/… form.
 */
function chromeWebStoreId(parsed: URL): string | null {
  const host = parsed.hostname.toLowerCase();
  const parts = parsed.pathname.split("/").filter(Boolean);
  const detail = host === "chromewebstore.google.com" && parts[0] === "detail"
    ? parts.slice(1)
    : host === "chrome.google.com" && parts[0] === "webstore" && parts[1] === "detail"
      ? parts.slice(2)
      : null;
  const id = detail?.find((part) => CWS_ID.test(part));
  return id ? id.toLowerCase() : null;
}

/** The Chrome Web Store item id in a link, or null when it is not one. */
export function chromeWebStoreItemId(url: string): string | null {
  const parsed = parse(url);
  return parsed ? chromeWebStoreId(parsed) : null;
}

export function storePlatformForTarget(target: StoreTarget): StorePlatform {
  return target === "app_store" ? "IOS_APP" : target === "play_store" ? "ANDROID_APP" : "CHROME_EXTENSION";
}

/** IOS_APP for an App Store link, ANDROID_APP for a Google Play link, else null. */
export function storePlatformForUrl(url: string | null | undefined): StorePlatform | null {
  const target = url ? detectStoreTarget(url) : null;
  return target ? storePlatformForTarget(target) : null;
}

/**
 * The platform a scan must run and be reported as. A store link overrides the
 * picker, because the link is a fact and the picker is a default; anything else
 * keeps what the user chose.
 */
export function resolveScanPlatform(
  inputUrl: string | null | undefined,
  selected: string | null | undefined,
): string | undefined {
  return storePlatformForUrl(inputUrl) ?? (selected || undefined);
}

export const STORE_NAME: Record<StoreTarget, string> = {
  app_store: "App Store",
  play_store: "Google Play",
  chrome_web_store: "Chrome Web Store",
};

export const STORE_PLATFORM_LABEL: Record<StoreTarget, string> = {
  app_store: "iOS app",
  play_store: "Android app",
  chrome_web_store: "Chrome extension",
};

/**
 * A readable name taken from the link itself, for the moment before the listing
 * has been read. Apple's URL carries a slug (`/app/beyond-nutrition-uk/id…`);
 * Google's carries only a package id, whose last segment is the best it offers.
 *
 * It is a PLACEHOLDER: once the scan reads the listing, the store's own name
 * replaces it (see `isPlaceholderStoreName`). Title-casing a slug cannot know that
 * "uk" is "UK", which is exactly why it is not the final answer.
 */
export function provisionalStoreProjectName(url: string): string | null {
  const parsed = parse(url);
  const target = detectStoreTarget(url);
  if (!parsed || !target) return null;
  if (target === "app_store") {
    const slug = /\/app\/([^/]+)\/id\d+/i.exec(parsed.pathname)?.[1];
    if (!slug) return null;
    let decoded = slug;
    try { decoded = decodeURIComponent(slug); } catch { /* keep raw */ }
    return titleCase(decoded.replace(/[-_]+/g, " "));
  }
  if (target === "chrome_web_store") {
    const parts = parsed.pathname.split("/").filter(Boolean);
    const slug = parts.find((part, i) => i > 0 && part !== "detail" && part !== "webstore" && !CWS_ID.test(part));
    // "empty-title" is what the store puts in the URL for an item it no longer lists.
    if (!slug || slug === "empty-title") return null;
    let decoded = slug;
    try { decoded = decodeURIComponent(slug); } catch { /* keep raw */ }
    return titleCase(decoded.replace(/[-_]+/g, " "));
  }
  const pkg = parsed.searchParams.get("id");
  if (!pkg) return null;
  const last = pkg.split(".").filter(Boolean).pop();
  return last ? titleCase(last.replace(/[-_]+/g, " ")) : null;
}

function titleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * True when a project name is one Pulse made up rather than one a person typed —
 * the store host, or the provisional slug name — so the listing's real name may
 * replace it. A name the user typed is never overwritten.
 */
export function isPlaceholderStoreName(name: string | null | undefined, url: string): boolean {
  const target = detectStoreTarget(url);
  if (!target) return false;
  const value = (name ?? "").trim();
  if (!value) return true;
  const parsed = parse(url);
  const hosts = new Set<string>(["apps.apple.com", "itunes.apple.com", "play.google.com", "chromewebstore.google.com", "chrome.google.com"]);
  if (parsed) hosts.add(parsed.hostname.toLowerCase().replace(/^www\./, ""));
  if (hosts.has(value.toLowerCase())) return true;
  // ⚠️ Case-SENSITIVE against the provisional name. The slug of "Beyond Nutrition UK"
  // title-cases to "Beyond Nutrition Uk"; compared case-insensitively, the app's true
  // name matched its own placeholder and was discarded as invented.
  return provisionalStoreProjectName(url) === value;
}

/** Display names for the platform values the scan form offers. */
export const PULSE_PLATFORM_LABEL: Record<string, string> = {
  WEB_APP: "Web app",
  SAAS: "SaaS",
  MARKETING_SITE: "Marketing site",
  IOS_APP: "iOS app",
  ANDROID_APP: "Android app",
  CROSS_PLATFORM_MOBILE: "Cross-platform mobile",
  DESKTOP_APP: "Desktop app",
  CHROME_EXTENSION: "Chrome extension",
  API_BACKEND: "API / backend",
  CLI_TOOL: "CLI tool",
  OTHER: "Other",
};

/**
 * What a scan assessed, in the words a report should use — "iOS app · App Store
 * listing" for a store link, the platform's name otherwise, null when unknown.
 * One function so the hero, the pipeline and any export describe it identically.
 */
export function describeScanSubject(inputUrl: string | null | undefined, platform: string | null | undefined): string | null {
  const store = inputUrl ? detectStoreTarget(inputUrl) : null;
  if (store) return `${STORE_PLATFORM_LABEL[store]} · ${STORE_NAME[store]} listing`;
  return platform ? PULSE_PLATFORM_LABEL[platform.toUpperCase()] ?? null : null;
}

/** "an iOS app", "an Android app", "a Chrome extension". */
export function withArticle(label: string): string {
  return /^[aeiou]/i.test(label) ? `an ${label}` : `a ${label}`;
}
