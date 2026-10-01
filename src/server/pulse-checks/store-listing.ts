// ─────────────────────────────────────────────────────────────────────────────
// STORE LISTINGS — read what the store publishes about the app, not its page text.
//
// Every store check used to be a keyword search over the whole listing page:
// `lower.includes("rating")`, `lower.includes("age")`, `lower.includes("screenshot")`.
// Apple's page contains every one of those words on EVERY listing — "Ratings &
// Reviews" is a section heading, "age" is inside "language" and "image" — so those
// checks passed for any app that exists. The subtitle check passed whenever the
// title contained " - ", and Apple's title always ends " - App Store". An iOS scan
// scored 98–100 whatever the app was like, which is a score that measures nothing.
//
// Both stores ship the listing as structured data in the page itself:
//
//   • Apple — `serialized-server-data` (the page's own view model) and a
//     schema.org `SoftwareApplication` block. Ratings, age rating, screenshots per
//     device, the privacy "nutrition label", the privacy-policy link and the
//     subtitle are all named fields.
//   • Google — a schema.org `SoftwareApplication` block (name, publisher, content
//     rating, aggregate rating, short description), plus labelled regions for the
//     full description, screenshots, Data safety and the privacy-policy link.
//
// The rules, each of which exists because the old code broke it:
//
//   1. A field that could not be read is UNKNOWN, never absent. If the structured
//      block is missing (a changed page format, a consent wall, the wrong page),
//      the parser returns null and every check SKIPs with the reason — it does not
//      fall back to guessing from the page text.
//   2. Apple's page also carries OTHER apps' data (the "You might also like"
//      shelf, with their own subtitles). Only the listing's own fields are read.
//   3. Apple shows the app's CATEGORY where a subtitle would be when there is none.
//      A subtitle equal to the category is therefore no subtitle.
//
// Pure: parsers take HTML, the check builder takes a parsed listing. No I/O.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { StoreTarget } from "@/lib/pulse-store-url";
import { evaluateExtensionManifest } from "./chrome-extension";

export interface StoreRating {
  average: number;
  count: number;
}

export interface StoreListing {
  store: StoreTarget;
  name: string | null;
  /** The account the listing is published under — "Provider" on Apple, the developer on Play. */
  developer: string | null;
  genre: string | null;
  /** Apple only. null = the listing has none (Apple shows the category in its place). */
  subtitle: string | null;
  description: string | null;
  /** Play only — the ≤80-character line shown under the name in search. */
  shortDescription: string | null;
  /** null = the store shows no rating for this listing yet. */
  rating: StoreRating | null;
  screenshots: { total: number; byDevice: Record<string, number> };
  hasPreviewVideo: boolean;
  ageRating: string | null;
  privacyPolicyUrl: string | null;
  /** Apple's privacy label or Play's Data safety. `declared` false = the section is not there. */
  privacyDeclaration: { declared: boolean; lines: string[] };
  /** Play only — what the developer declared about deleting user data. null = not stated. */
  dataDeletable: boolean | null;
  /** null = the listing does not say either way. */
  hasInAppPurchases: boolean | null;
  copyright: string | null;
  bundleId: string | null;
  /** Chrome Web Store only — the extension-specific facts the listing publishes. */
  extension?: ExtensionListing;
}

export interface ExtensionListing {
  /** Item id, from the store's own data — never inferred from the URL alone. */
  id: string;
  users: number | null;
  featured: boolean;
  establishedPublisher: boolean;
  byGoogle: boolean;
  /** EU trader declaration: true trader, false non-trader, null not stated. */
  trader: boolean | null;
  legalEntity: string | null;
  verifiedSite: string | null;
  version: string | null;
  /** Epoch seconds. */
  lastUpdated: number | null;
  size: string | null;
  /** The published manifest.json, or null when it could not be parsed. */
  manifest: Record<string, unknown> | null;
  /** Data the developer declares the extension handles; [] declares none; null unknown. */
  dataHandled: string[] | null;
}

// ── small, safe readers ──────────────────────────────────────────────────────

type Json = unknown;

function obj(value: Json): Record<string, Json> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Json>) : null;
}

function arr(value: Json): Json[] {
  return Array.isArray(value) ? value : [];
}

function str(value: Json): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function num(value: Json): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function htmlToText(fragment: string): string {
  return decodeEntities(
    fragment
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function scriptById(html: string, id: string): string | null {
  const re = new RegExp(`<script[^>]*\\bid=["']?${id}["']?[^>]*>([\\s\\S]*?)</script>`, "i");
  return re.exec(html)?.[1] ?? null;
}

function parseJson(text: string | null): Json {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Every schema.org block on the page, flattened (a block may hold an array or an @graph). */
function ldJsonBlocks(html: string): Record<string, Json>[] {
  const out: Record<string, Json>[] = [];
  for (const match of html.matchAll(/<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    const parsed = parseJson(match[1]);
    const candidates = Array.isArray(parsed) ? parsed : [parsed, ...arr(obj(parsed)?.["@graph"])];
    for (const candidate of candidates) {
      const block = obj(candidate);
      if (block) out.push(block);
    }
  }
  return out;
}

function softwareApplication(html: string): Record<string, Json> | null {
  return ldJsonBlocks(html).find((block) => {
    const type = block["@type"];
    const types = Array.isArray(type) ? type : [type];
    return types.some((t) => t === "SoftwareApplication" || t === "MobileApplication");
  }) ?? null;
}

function ldRating(app: Record<string, Json> | null): StoreRating | null {
  const rating = obj(app?.aggregateRating);
  const average = num(rating?.ratingValue);
  const count = num(rating?.ratingCount) ?? num(rating?.reviewCount);
  return average !== null && count !== null && count > 0 ? { average, count } : null;
}

function ldAuthor(app: Record<string, Json> | null): string | null {
  return str(obj(app?.author)?.name);
}

// ── Apple ────────────────────────────────────────────────────────────────────

/**
 * Parse an App Store listing. Returns null when the page carries no listing data —
 * the caller must then report the checks as not assessed rather than infer them.
 */
export function parseAppStoreListing(html: string): StoreListing | null {
  const server = obj(parseJson(scriptById(html, "serialized-server-data")));
  const page = obj(obj(arr(server?.data)[0])?.data);
  const shelves = obj(page?.shelfMapping);
  // Without the page's own view model there is nothing structured to read. The
  // schema.org block alone cannot settle screenshots, subtitle or the privacy label.
  if (!page || !shelves) return null;

  const ld = softwareApplication(html);
  const lockup = obj(page.lockup);

  const information = new Map<string, string[]>();
  for (const item of arr(obj(shelves.information)?.items)) {
    const annotation = obj(item);
    const title = str(annotation?.title);
    if (!title) continue;
    information.set(
      title.toLowerCase(),
      arr(annotation?.items).map((entry) => str(obj(entry)?.text)).filter((t): t is string => t !== null),
    );
  }

  const genre = information.get("category")?.[0] ?? str(arr(ld?.genre)[0]) ?? null;
  const rawSubtitle = str(lockup?.subtitle);
  const subtitle = rawSubtitle && (!genre || rawSubtitle.toLowerCase() !== genre.toLowerCase()) ? rawSubtitle : null;

  const description = str(obj(obj(arr(obj(shelves.description)?.items)[0])?.paragraph)?.text);

  const ratingItem = obj(arr(obj(shelves.productRatings)?.items)[0]);
  const ratingCount = num(ratingItem?.totalNumberOfRatings);
  const ratingAverage = num(ratingItem?.ratingAverage);
  const rating = ratingCount !== null && ratingAverage !== null
    ? (ratingCount > 0 ? { average: ratingAverage, count: ratingCount } : null)
    : ldRating(ld);

  // Screenshots are per device: product_media_phone_, product_media_pad_, product_media_watch_ …
  const byDevice: Record<string, number> = {};
  let hasPreviewVideo = false;
  for (const [key, shelf] of Object.entries(shelves)) {
    const match = /^product_media_([a-z]+)_$/i.exec(key);
    if (!match) continue;
    const items = arr(obj(shelf)?.items);
    const stills = items.filter((item) => obj(obj(item)?.screenshot) !== null).length;
    if (stills > 0) byDevice[match[1]] = stills;
    if (items.some((item) => Object.keys(obj(item) ?? {}).some((k) => /video|trailer/i.test(k)))) hasPreviewVideo = true;
  }
  const total = Object.values(byDevice).reduce((sum, count) => sum + count, 0);

  let ageRating: string | null = null;
  for (const badge of arr(obj(shelves.informationRibbon)?.items)) {
    const b = obj(badge);
    if (str(b?.type) === "contentRating") ageRating = str(obj(b?.content)?.contentRating);
  }

  const privacyPolicyUrl = findPrivacyPolicyUrl(shelves.privacyHeader) ?? findPrivacyPolicyUrl(page);

  const lines: string[] = [];
  for (const type of arr(obj(shelves.privacyTypes)?.items)) {
    const t = obj(type);
    const title = str(t?.title);
    if (!title) continue;
    const categories = arr(t?.categories).map((c) => str(obj(c)?.title)).filter((c): c is string => c !== null);
    lines.push(categories.length > 0 ? `${title}: ${categories.join(", ")}` : title);
  }

  const offers = obj(page.titleOfferDisplayProperties);
  const hasInAppPurchases = typeof offers?.hasInAppPurchases === "boolean"
    ? offers.hasInAppPurchases
    : information.has("in-app purchases") ? true : null;

  return {
    store: "app_store",
    name: str(page.title) ?? str(lockup?.title) ?? str(ld?.name),
    developer: ldAuthor(ld) ?? information.get("provider")?.[0] ?? null,
    genre,
    subtitle,
    description,
    shortDescription: null,
    rating,
    screenshots: { total, byDevice },
    hasPreviewVideo,
    ageRating,
    privacyPolicyUrl,
    privacyDeclaration: { declared: lines.length > 0, lines },
    dataDeletable: null,
    hasInAppPurchases,
    copyright: information.get("copyright")?.[0] ?? null,
    bundleId: str(lockup?.bundleId),
  };
}

/** The developer's privacy-policy link — an external-URL action titled or targeted as the privacy policy. */
function findPrivacyPolicyUrl(root: Json): string | null {
  let found: string | null = null;
  const visit = (node: Json, depth: number) => {
    if (found || depth > 40) return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, depth + 1);
      return;
    }
    const o = obj(node);
    if (!o) return;
    const url = str(o.url);
    const isExternal = o.$kind === "ExternalUrlAction" || o.actionClass === "ExternalUrlAction";
    const metrics = JSON.stringify(o.actionMetrics ?? "");
    const namesPrivacy = /privacy/i.test(str(o.title) ?? "") || /"targetId":"privacyPolicy"/.test(metrics);
    if (isExternal && url && /^https?:\/\//i.test(url) && namesPrivacy) {
      found = url;
      return;
    }
    for (const value of Object.values(o)) visit(value, depth + 1);
  };
  visit(root, 0);
  return found;
}

// ── Google Play ──────────────────────────────────────────────────────────────

/**
 * Parse a Google Play listing. Returns null when the page carries no
 * SoftwareApplication block — Google puts one on every listing, so its absence
 * means this is not a readable listing (a consent page, a changed format).
 */
export function parsePlayStoreListing(html: string, url: string): StoreListing | null {
  const ld = softwareApplication(html);
  if (!ld) return null;

  const descriptionMatch = /<div[^>]*data-g-id=["']description["'][^>]*>([\s\S]*?)<\/div>/i.exec(html);
  const description = descriptionMatch ? htmlToText(descriptionMatch[1]) || null : null;

  // Screenshots: Google labels each one; count distinct images, not tags (srcset repeats them).
  const screenshotSources = new Set<string>();
  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!/alt=["']Screenshot image["']/i.test(tag[0])) continue;
    const src = /\ssrc=["']([^"']+)["']/i.exec(tag[0])?.[1];
    if (src) screenshotSources.add(src.replace(/=w\d+-h\d+.*$/, ""));
  }

  // The privacy-policy link sits in "App support", labelled by Google itself.
  let privacyPolicyUrl: string | null = null;
  for (const tag of html.matchAll(/<a\b[^>]*>/gi)) {
    const label = /aria-label=["']([^"']*)["']/i.exec(tag[0])?.[1] ?? "";
    if (!/^privacy policy\b/i.test(decodeEntities(label).trim())) continue;
    const href = /\shref=["']([^"']+)["']/i.exec(tag[0])?.[1];
    if (href && /^https?:\/\//i.test(href)) {
      privacyPolicyUrl = decodeEntities(href);
      break;
    }
  }

  // Data safety — read the section Google renders, and only that section.
  const anchor = html.search(/See more information on Data safety|>\s*Data safety\s*</i);
  let lines: string[] = [];
  let declared = false;
  let dataDeletable: boolean | null = null;
  if (anchor >= 0) {
    const start = html.lastIndexOf("<section", anchor);
    const end = html.indexOf("</section>", anchor);
    const section = start >= 0 && end > start ? html.slice(start, end) : html.slice(anchor, anchor + 4000);
    const text = htmlToText(section);
    declared = /developer provided this information/i.test(text) && !/no information available/i.test(text);
    lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) =>
        /^(no data shared|this app may (share|collect)|data (is|isn[’']t|is not) encrypted|data can[’']?t be deleted|data cannot be deleted|you can request that data be deleted|no data collected|personal info|health and fitness|location|financial info|messages|photos|app activity|device or other ids)/i
          .test(line),
      )
      .map((line) => line.replace(/data types\s+(?!:)/i, "data types: "));
    if (/data can[’']?t be deleted|data cannot be deleted/i.test(text)) dataDeletable = false;
    else if (/you can request that data be deleted/i.test(text)) dataDeletable = true;
  }

  const videoPresent = /data-trailer-url=|youtube\.com\/embed\/|aria-label=["']Play trailer/i.test(html);
  const iapPresent = /<span[^>]*>\s*In-app purchases\s*<\/span>|Contains ads\s*·\s*In-app purchases|>\s*In-app purchases\s*</i.test(html);

  const bundleId = (() => {
    try {
      return new URL(url).searchParams.get("id");
    } catch {
      return null;
    }
  })();

  return {
    store: "play_store",
    name: str(ld.name),
    developer: ldAuthor(ld),
    genre: str(ld.applicationCategory),
    subtitle: null,
    description,
    shortDescription: str(ld.description),
    rating: ldRating(ld),
    // Google does not say which device a screenshot is for, so no per-device split is claimed.
    screenshots: { total: screenshotSources.size, byDevice: {} },
    hasPreviewVideo: videoPresent,
    ageRating: str(ld.contentRating),
    privacyPolicyUrl,
    privacyDeclaration: { declared, lines },
    dataDeletable,
    hasInAppPurchases: iapPresent,
    copyright: null,
    bundleId,
  };
}

// ── Chrome Web Store ─────────────────────────────────────────────────────────

/** Data-handling codes in the listing's `d[7]`, verified against the rendered text. */
const CWS_DATA_CODES: Record<number, string> = {
  1: "Personally identifiable information",
  2: "Health information",
  3: "Financial and payment information",
  4: "Authentication information",
  5: "Personal communications",
  6: "Location",
  7: "Web history",
  8: "User activity",
  9: "Website content",
};

/** True when the page is the store's "this item does not exist" shell (RPC NOT_FOUND). */
export function isChromeWebStoreItemGone(html: string): boolean {
  return /AF_initDataCallback\(\{key:\s*'ds:0'[\s\S]{0,200}?data:\[5\],\s*errorHasStatus:\s*true/.test(html);
}

/**
 * Parse a Chrome Web Store listing.
 *
 * The store publishes no schema.org data at all; every fact is in one positional array,
 * the `ds:0` block of AF_initDataCallback. Field positions were verified against the
 * rendered text of 15 live listings (see the audit, October 2026). Returns null unless
 * that block parses AND names the same item id as the link — the store answers HTTP 200
 * with a generic shell for a removed item, so a page that merely loads proves nothing.
 */
export function parseChromeWebStoreListing(html: string, itemId: string): StoreListing | null {
  const match = /AF_initDataCallback\(\{key:\s*'ds:0'[\s\S]*?\bdata:([\s\S]*?),\s*sideChannel:/.exec(html);
  const data = parseJson(match?.[1] ?? null);
  if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
  const d = data as Json[];
  const a = d[0] as Json[];
  if (str(a[0])?.toLowerCase() !== itemId.toLowerCase()) return null;

  const developer = arr(d[10]);
  const media = arr(d[5]).map((item) => arr(item));
  const category = str(arr(a[11])[0]);
  const dataCodes = Array.isArray(d[7]) ? arr(d[7]).map((code) => num(code)).filter((code): code is number => code !== null) : null;
  const declaresNone = dataCodes === null && /has disclosed that it will not collect or use your data/i.test(html);
  const dataHandled = dataCodes && dataCodes.length > 0
    ? dataCodes.map((code) => CWS_DATA_CODES[code] ?? `Data type ${code}`)
    : declaresNone ? [] : null;

  let manifest: Record<string, unknown> | null = null;
  const manifestText = str(a[18]);
  if (manifestText) manifest = obj(parseJson(manifestText));

  const average = num(a[3]);
  const count = num(a[4]);

  return {
    store: "chrome_web_store",
    name: str(a[2]),
    developer: str(developer[5]) ?? str(developer[7]),
    genre: category,
    subtitle: null,
    description: str(d[6]),
    shortDescription: str(a[6]),
    rating: average !== null && count !== null && count > 0 ? { average, count } : null,
    screenshots: { total: media.filter((item) => num(item[0]) === 1).length, byDevice: {} },
    hasPreviewVideo: media.some((item) => num(item[0]) === 2),
    ageRating: null,
    privacyPolicyUrl: str(d[33]),
    privacyDeclaration: {
      declared: dataHandled !== null,
      lines: dataHandled === null ? [] : dataHandled.length === 0 ? ["Declares it collects no user data"] : dataHandled,
    },
    dataDeletable: null,
    hasInAppPurchases: null,
    copyright: null,
    bundleId: str(a[0]),
    extension: {
      id: str(a[0]) ?? itemId,
      users: num(a[14]),
      featured: a[9] === 1,
      establishedPublisher: a[15] === 1,
      byGoogle: a[10] === 1,
      trader: developer[3] === 1 ? true : developer.length > 0 ? false : null,
      legalEntity: str(developer[7]),
      verifiedSite: str(a[7]),
      version: str(d[13]),
      lastUpdated: num(arr(d[14])[0]),
      size: str(d[15]),
      manifest,
      dataHandled,
    },
  };
}

/**
 * The app's own name, for naming the scan. Uses the parsed listing, else the
 * schema.org name, else the page title with the store's suffix removed.
 */
export function storeAppName(html: string, listing: StoreListing | null): string | null {
  if (listing?.name) return listing.name;
  const fromLd = str(softwareApplication(html)?.name);
  if (fromLd) return fromLd;
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1];
  if (!og) return null;
  const cleaned = decodeEntities(og)
    .replace(/^‎/, "")
    .replace(/\s+App\s+-\s+App Store$/i, "")
    .replace(/\s+[-–]\s+(App Store|Apps on Google Play)$/i, "")
    .trim();
  return cleaned || null;
}

// ── Privacy-policy ownership ─────────────────────────────────────────────────

const GENERIC_NAME_WORDS = new Set([
  "ltd", "limited", "inc", "llc", "llp", "plc", "gmbh", "corp", "corporation", "company", "co",
  "group", "holdings", "studio", "studios", "apps", "app", "the", "and", "digital", "software",
  "technologies", "technology", "labs", "media", "services", "solutions", "mobile", "cba",
]);

function distinctiveTokens(value: string | null): string[] {
  return (value ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !GENERIC_NAME_WORDS.has(token));
}

/**
 * Does the privacy policy live on a domain that belongs to whoever the listing names?
 *
 * Deliberately a WEAK claim, and worded as one: a domain not matching a company name
 * does not prove the policy is wrong (brands and legal entities differ). What it does
 * show — and what a reader can check in seconds — is that the policy may be a
 * platform vendor's generic document rather than one naming the data controller.
 */
export function privacyPolicyOwner(listing: StoreListing): { matches: boolean; host: string } | null {
  if (!listing.privacyPolicyUrl) return null;
  let host: string;
  try {
    host = new URL(listing.privacyPolicyUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  const squashedHost = host.replace(/[^a-z0-9]/g, "");
  const tokens = [...distinctiveTokens(listing.developer), ...distinctiveTokens(listing.name)];
  if (tokens.length === 0) return null;
  return { matches: tokens.some((token) => squashedHost.includes(token)), host };
}

// ── Checks ───────────────────────────────────────────────────────────────────

const STORE_NAME: Record<StoreTarget, string> = { app_store: "App Store", play_store: "Google Play", chrome_web_store: "Chrome Web Store" };
/** As the subject of a sentence — "the App Store shows", but "Google Play shows". */
const THE_STORE: Record<StoreTarget, string> = { app_store: "The App Store", play_store: "Google Play", chrome_web_store: "The Chrome Web Store" };

/** Minimum screenshots each store will accept for a listing to publish. */
const MIN_SCREENSHOTS: Record<StoreTarget, number> = { app_store: 1, play_store: 2, chrome_web_store: 1 };

function formatCount(value: number): string {
  return value.toLocaleString("en-GB");
}

/**
 * The store-listing checks, from a parsed listing.
 *
 * Confidence is declared HIGH on every check that reads a named field — these are
 * facts the store itself publishes, not inferences — and MEDIUM on the one that
 * compares names, which is a heuristic and says so.
 *
 * `listing` null means the listing data could not be read: every check is
 * INCONCLUSIVE with that reason, and nothing is inferred from the page text.
 *
 * ⚠️ INCONCLUSIVE, not SKIPPED. SKIPPED means "does not apply to this app", and the
 * release gate and the score both exclude it — so an unreadable listing reported as
 * SKIPPED would leave `store_page_live` PASS as the only evidence, and pass the gate
 * having read nothing. "We could not read it" is exactly what INCONCLUSIVE means.
 */
export function buildStoreListingChecks(
  store: StoreTarget,
  listing: StoreListing | null,
  options: { descriptionFallback?: string | null } = {},
): PulseScanCheckInput[] {
  if (store === "chrome_web_store") return buildChromeWebStoreChecks(listing);
  const storeName = STORE_NAME[store];
  const isApple = store === "app_store";
  const category = CATEGORIES.STORE_LISTING;
  const high = { confidence: "HIGH" as const, confidenceReason: `Read from the ${storeName}'s own listing data.` };

  const storeSpecific: Array<[string, string]> = isApple
    ? [["appstore_subtitle", "App subtitle (keyword field)"], ["appstore_privacy_label", "Apple privacy nutrition label"]]
    : [["playstore_data_safety", "Data Safety section"], ["playstore_content_rating", "IARC content rating"]];

  if (!listing) {
    const reason =
      `Not assessed — the ${storeName} page did not include its structured listing data, so this could not be read. ` +
      `Pulse does not guess it from the page text, which mentions ratings, screenshots and privacy on every listing.`;
    const entries: Array<[string, string]> = [
      ["store_app_title", "App name / title"],
      ["store_description", "App description"],
      ["store_screenshots", "Screenshots / preview assets"],
      ["store_ratings", "Ratings & reviews"],
      ["store_privacy_policy", "Privacy policy linked"],
      ["store_privacy_policy_owner", "Privacy policy belongs to the publisher"],
      ["store_age_rating", "Age / content rating"],
      ["store_iap_disclosed", "In-app purchases disclosed"],
      ["store_preview_video", isApple ? "App preview video" : "Promo video"],
      ...storeSpecific,
    ];
    return entries.map(([checkKey, label]) => ({ category, checkKey, label, status: "INCONCLUSIVE" as const, detail: reason }));
  }

  const checks: PulseScanCheckInput[] = [];

  // Name + publisher. The publisher is worth stating plainly: on a white-label app the
  // account it is published under is often not the brand on the icon.
  checks.push({
    category,
    checkKey: "store_app_title",
    label: "App name / title",
    status: listing.name ? "PASS" : "WARN",
    detail: listing.name
      ? `Listed as "${listing.name}"${listing.developer ? `, published by ${listing.developer}` : ""}.`
      : `The ${storeName} listing data carries no app name.`,
    evidence: listing.developer ? `${listing.name ?? "—"} · ${listing.developer}` : listing.name ?? undefined,
    ...high,
  });

  // Description.
  const description = listing.description ?? options.descriptionFallback ?? null;
  if (!description) {
    checks.push({
      category,
      checkKey: "store_description",
      label: "App description",
      status: "INCONCLUSIVE",
      detail: `Not assessed — the listing's description could not be read from the ${storeName} data.`,
    });
  } else {
    const length = description.length;
    const shortLine = !isApple && listing.shortDescription
      ? ` Short description: "${listing.shortDescription}" (${listing.shortDescription.length} of the 80 characters Google allows) — the line shown under the app name in search.`
      : "";
    const weakShort = !isApple && listing.shortDescription !== null && listing.shortDescription.length < 25;
    const status = length <= 50 ? "FAIL" : length <= 200 || weakShort ? "WARN" : "PASS";
    checks.push({
      category,
      checkKey: "store_description",
      label: "App description",
      status,
      detail: (length > 200
        ? `Full description is ${formatCount(length)} characters.`
        : length > 50
          ? `Full description is ${length} characters — too short to tell a visitor what the app does or give the store much to index.`
          : `Full description is ${length} characters — effectively empty.`) + shortLine,
      evidence: `${formatCount(length)} characters`,
      ...high,
    });
  }

  // Screenshots, per device.
  const { total, byDevice } = listing.screenshots;
  const deviceSummary = Object.entries(byDevice).map(([device, count]) => `${deviceLabel(device, store)} ${count}`).join(" · ");
  checks.push({
    category,
    checkKey: "store_screenshots",
    label: "Screenshots / preview assets",
    status: total < MIN_SCREENSHOTS[store] ? "FAIL" : total < 3 ? "WARN" : "PASS",
    detail: total === 0
      ? "The listing shows no screenshots."
      : total < MIN_SCREENSHOTS[store]
        ? `${total} screenshot${total === 1 ? "" : "s"} — below the ${MIN_SCREENSHOTS[store]} ${storeName} requires.`
        : `${total} screenshot${total === 1 ? "" : "s"}${deviceSummary ? ` (${deviceSummary})` : ""}.`,
    evidence: deviceSummary || `${total}`,
    ...high,
  });

  // Ratings — stated as numbers, because "rating data detected" said nothing.
  checks.push({
    category,
    checkKey: "store_ratings",
    label: "Ratings & reviews",
    status: listing.rating ? "PASS" : "WARN",
    detail: listing.rating
      ? `Rated ${listing.rating.average.toFixed(1)} from ${formatCount(listing.rating.count)} rating${listing.rating.count === 1 ? "" : "s"}.`
      : `${THE_STORE[store]} shows no rating for this listing — too few ratings have been left for the store to display one.`,
    evidence: listing.rating ? `${listing.rating.average.toFixed(1)} · ${listing.rating.count} ratings` : "no rating shown",
    ...high,
  });

  // Privacy policy link.
  checks.push({
    category,
    checkKey: "store_privacy_policy",
    label: "Privacy policy linked",
    status: listing.privacyPolicyUrl ? "PASS" : "FAIL",
    detail: listing.privacyPolicyUrl
      ? `The listing links its privacy policy: ${listing.privacyPolicyUrl}`
      : `The listing links no privacy policy. Both Apple and Google require one for every app.`,
    evidence: listing.privacyPolicyUrl ?? undefined,
    ...high,
  });

  // Whose policy is it?
  const owner = privacyPolicyOwner(listing);
  checks.push(owner === null
    ? {
      category,
      checkKey: "store_privacy_policy_owner",
      label: "Privacy policy belongs to the publisher",
      status: "SKIPPED",
      detail: listing.privacyPolicyUrl
        ? "Not assessed — the publisher's name has nothing distinctive enough to compare against the policy's domain."
        : "Not assessed — the listing links no privacy policy.",
    }
    : {
      category,
      checkKey: "store_privacy_policy_owner",
      label: "Privacy policy belongs to the publisher",
      status: owner.matches ? "PASS" : "WARN",
      confidence: "MEDIUM",
      confidenceReason: "Compares the policy's domain with the publisher's name — a heuristic.",
      detail: owner.matches
        ? `The privacy policy is hosted on ${owner.host}, which matches the publisher${listing.developer ? ` (${listing.developer})` : ""}.`
        : `The privacy policy is hosted on ${owner.host}, which does not match the publisher${listing.developer ? ` (${listing.developer})` : ""} or the app's name. ` +
          `That often means a platform vendor's generic policy is linked rather than one naming the business that controls users' data — worth opening it and checking who it names.`,
      evidence: `${owner.host} vs ${listing.developer ?? listing.name ?? "—"}`,
    });

  // Age rating.
  checks.push({
    category,
    checkKey: "store_age_rating",
    label: "Age / content rating",
    status: listing.ageRating ? "PASS" : "WARN",
    detail: listing.ageRating ? `Rated ${listing.ageRating}.` : "The listing shows no age or content rating.",
    evidence: listing.ageRating ?? undefined,
    ...high,
  });

  // In-app purchases — informational; both states are legitimate.
  checks.push({
    category,
    checkKey: "store_iap_disclosed",
    label: "In-app purchases disclosed",
    status: listing.hasInAppPurchases === null ? "SKIPPED" : "PASS",
    detail: listing.hasInAppPurchases === null
      ? "Not assessed — the listing does not say whether the app offers in-app purchases."
      : listing.hasInAppPurchases
        ? "The listing declares in-app purchases."
        : "The listing declares no in-app purchases. If the app charges for anything inside it, that must be declared.",
    ...(listing.hasInAppPurchases === null ? {} : high),
  });

  // Preview video.
  checks.push({
    category,
    checkKey: "store_preview_video",
    label: isApple ? "App preview video" : "Promo video",
    status: listing.hasPreviewVideo ? "PASS" : "WARN",
    detail: listing.hasPreviewVideo
      ? `The listing includes ${isApple ? "an app preview" : "a promo"} video.`
      : `The listing has no ${isApple ? "app preview" : "promo"} video — every media item is a still screenshot.`,
    ...high,
  });

  if (isApple) {
    checks.push({
      category,
      checkKey: "appstore_subtitle",
      label: "App subtitle (keyword field)",
      status: listing.subtitle ? "PASS" : "WARN",
      detail: listing.subtitle
        ? `Subtitle: "${listing.subtitle}".`
        : `No subtitle — Apple shows the category${listing.genre ? ` ("${listing.genre}")` : ""} in its place. ` +
          "The subtitle is a 30-character line under the app name that the App Store indexes for search.",
      evidence: listing.subtitle ?? undefined,
      ...high,
    });

    checks.push({
      category,
      checkKey: "appstore_privacy_label",
      label: "Apple privacy nutrition label",
      status: listing.privacyDeclaration.declared ? "PASS" : "FAIL",
      detail: listing.privacyDeclaration.declared
        ? `Privacy details declared — ${listing.privacyDeclaration.lines.join("; ")}.`
        : "The listing shows no App Privacy details. Apple requires every app to declare what data it collects.",
      evidence: listing.privacyDeclaration.lines.join("; ") || undefined,
      ...high,
    });
  } else {
    const deletionNote = listing.dataDeletable === false
      ? " The developer declares that users' data can't be deleted — for an app that collects personal data, worth checking against the UK GDPR right to erasure and Google Play's account-deletion requirement for apps that let users create an account."
      : "";
    checks.push({
      category,
      checkKey: "playstore_data_safety",
      label: "Data Safety section",
      status: !listing.privacyDeclaration.declared ? "FAIL" : listing.dataDeletable === false ? "WARN" : "PASS",
      detail: listing.privacyDeclaration.declared
        ? `Data safety declared${listing.privacyDeclaration.lines.length > 0 ? ` — ${listing.privacyDeclaration.lines.join("; ")}` : ""}.${deletionNote}`
        : "The listing shows no Data safety declaration. Google Play requires every app to complete it.",
      evidence: listing.privacyDeclaration.lines.join("; ") || undefined,
      ...high,
    });

    checks.push({
      category,
      checkKey: "playstore_content_rating",
      label: "IARC content rating",
      status: listing.ageRating ? "PASS" : "WARN",
      detail: listing.ageRating
        ? `Content rating: ${listing.ageRating}.`
        : "The listing shows no content rating. Google Play requires the IARC questionnaire before an app can go live.",
      evidence: listing.ageRating ?? undefined,
      ...high,
    });
  }

  return checks;
}

/** The Chrome Web Store listing checks. Separate because most keys differ from Apple/Play. */
function buildChromeWebStoreChecks(listing: StoreListing | null): PulseScanCheckInput[] {
  const category = CATEGORIES.STORE_LISTING;
  const high = { confidence: "HIGH" as const, confidenceReason: "Read from the Chrome Web Store's own listing data." };
  const ext = listing?.extension;

  if (!listing || !ext) {
    const reason =
      "Not assessed — the Chrome Web Store page did not include its listing data (a consent page, a changed page " +
      "format, or the item is not offered here), so this could not be read. Pulse does not guess it from the page text.";
    const entries: Array<[string, string]> = [
      ["store_app_title", "App name / title"],
      ["store_description", "App description"],
      ["store_screenshots", "Screenshots / preview assets"],
      ["store_ratings", "Ratings & reviews"],
      ["store_privacy_policy", "Privacy policy linked"],
      ["cws_privacy_practices", "Privacy practices disclosed"],
      ["store_last_updated", "Listing updated in the last 12 months"],
    ];
    return entries.map(([checkKey, label]) => ({ category, checkKey, label, status: "INCONCLUSIVE" as const, detail: reason }));
  }

  const checks: PulseScanCheckInput[] = [];
  const users = ext.users !== null ? `${formatCount(ext.users)} users` : null;

  checks.push({
    category, checkKey: "store_app_title", label: "App name / title",
    status: listing.name ? "PASS" : "WARN",
    detail: listing.name
      ? `Listed as "${listing.name}"${listing.developer ? `, published by ${listing.developer}` : ""}${users ? ` — ${users}` : ""}.`
      : "The Chrome Web Store listing data carries no name.",
    evidence: [listing.name, listing.developer, users].filter(Boolean).join(" · ") || undefined,
    ...high,
  });

  if (listing.description) {
    const length = listing.description.length;
    const summary = listing.shortDescription;
    checks.push({
      category, checkKey: "store_description", label: "App description",
      status: length <= 50 ? "FAIL" : length <= 200 ? "WARN" : "PASS",
      detail: (length > 200
        ? `Full description is ${formatCount(length)} characters.`
        : `Full description is ${length} characters — too short to tell a visitor what the extension does.`)
        + (summary ? ` Summary: "${summary}" (${summary.length} of the 132 characters the store allows).` : ""),
      evidence: `${formatCount(length)} characters`,
      ...high,
    });
  }

  const shots = listing.screenshots.total;
  checks.push({
    category, checkKey: "store_screenshots", label: "Screenshots / preview assets",
    status: shots < 1 ? "FAIL" : shots < 3 ? "WARN" : "PASS",
    detail: shots === 0 ? "The listing shows no screenshots." : `${shots} screenshot${shots === 1 ? "" : "s"}.`,
    evidence: `${shots}`,
    ...high,
  });

  checks.push({
    category, checkKey: "store_ratings", label: "Ratings & reviews",
    status: listing.rating ? "PASS" : "WARN",
    detail: listing.rating
      ? `Rated ${listing.rating.average.toFixed(1)} from ${formatCount(listing.rating.count)} rating${listing.rating.count === 1 ? "" : "s"}.`
      : "The Chrome Web Store shows no rating for this listing yet.",
    ...high,
  });

  // Privacy policy — the store requires one only when the extension handles user data.
  const handles = ext.dataHandled;
  const policyStatus = listing.privacyPolicyUrl
    ? "PASS"
    : handles && handles.length > 0 ? "FAIL"
      : handles && handles.length === 0 ? "SKIPPED"
        : "INCONCLUSIVE";
  checks.push({
    category, checkKey: "store_privacy_policy", label: "Privacy policy linked",
    status: policyStatus,
    detail: policyStatus === "PASS"
      ? `The listing links its privacy policy: ${listing.privacyPolicyUrl}`
      : policyStatus === "FAIL"
        ? `The extension declares it handles user data (${handles!.join(", ")}) but links no privacy policy. The Chrome Web Store requires one for any extension that handles user data.`
        : policyStatus === "SKIPPED"
          ? "Not required: the developer declares the extension collects no user data."
          : "Not assessed — the listing's privacy declaration could not be read.",
    evidence: listing.privacyPolicyUrl ?? undefined,
    ...high,
  });

  const owner = privacyPolicyOwner(listing);
  if (owner) {
    const verifiedHost = (() => { try { return ext.verifiedSite ? new URL(ext.verifiedSite).hostname.replace(/^www\./, "") : null; } catch { return null; } })();
    const matches = owner.matches || (verifiedHost !== null && (owner.host === verifiedHost || owner.host.endsWith(`.${verifiedHost}`)));
    checks.push({
      category, checkKey: "store_privacy_policy_owner", label: "Privacy policy belongs to the publisher",
      status: matches ? "PASS" : "WARN",
      confidence: "MEDIUM",
      confidenceReason: "Compares the policy's domain with the publisher's name and verified website — a heuristic.",
      detail: matches
        ? `The privacy policy is hosted on ${owner.host}, which matches the publisher.`
        : `The privacy policy is hosted on ${owner.host}, which does not match the publisher${listing.developer ? ` (${listing.developer})` : ""}. Worth opening it and checking who it names as responsible for users' data.`,
      evidence: `${owner.host} vs ${listing.developer ?? listing.name ?? "—"}`,
    });
  }

  checks.push({
    category, checkKey: "store_preview_video", label: "Promo video",
    status: listing.hasPreviewVideo ? "PASS" : "WARN",
    detail: listing.hasPreviewVideo ? "The listing includes a promo video." : "The listing has no promo video — every media item is a still screenshot.",
    ...high,
  });

  checks.push({
    category, checkKey: "cws_privacy_practices", label: "Privacy practices disclosed",
    status: handles === null ? "INCONCLUSIVE" : "PASS",
    detail: handles === null
      ? "Not assessed — the listing's privacy-practices section could not be read."
      : handles.length === 0
        ? "The developer declares the extension collects no user data."
        : `The developer declares the extension handles: ${handles.join(", ")}.`,
    evidence: handles ? (handles.join("; ") || "none") : undefined,
    ...high,
  });

  // EU trader declaration — a legal status the store asks every developer to make.
  const companyName = ext.legalEntity && /\b(inc|ltd|llc|gmbh|plc|corp|limited|s\.?a\.?|b\.?v\.?)\b/i.test(ext.legalEntity);
  const commercial = (handles ?? []).includes("Financial and payment information") || Boolean(companyName);
  if (ext.trader === true || (ext.trader === false && commercial)) {
    checks.push({
      category, checkKey: "cws_trader_status", label: "EU trader declaration",
      status: ext.trader ? "PASS" : "WARN",
      confidence: ext.trader ? "HIGH" : "MEDIUM",
      confidenceReason: ext.trader ? high.confidenceReason : "Commercial signals on a listing declared non-trader — a judgement, not a rule.",
      detail: ext.trader
        ? `Declared as a trader${ext.legalEntity ? ` (${ext.legalEntity})` : ""}, which EU consumer law requires of businesses.`
        : `Declared NON-trader, but the listing shows commercial signals (${companyName ? `published by ${ext.legalEntity}` : "it handles payment information"}). EU law expects a business to declare itself a trader; check the declaration in the developer dashboard.`,
    });
  }

  checks.push({
    category, checkKey: "cws_trust_badges", label: "Featured / Established publisher badges",
    status: ext.featured || ext.establishedPublisher ? "PASS" : "WARN",
    detail: ext.featured || ext.establishedPublisher
      ? `The listing carries ${[ext.featured && "the Featured badge", ext.establishedPublisher && "the Established publisher badge"].filter(Boolean).join(" and ")}.`
      : "The listing carries neither the Featured nor the Established publisher badge — the store's own trust signals on the listing.",
    ...high,
  });

  if (ext.lastUpdated !== null) {
    const ageDays = Math.floor((Date.now() / 1000 - ext.lastUpdated) / 86_400);
    const updated = new Date(ext.lastUpdated * 1000).toISOString().slice(0, 10);
    checks.push({
      category, checkKey: "store_last_updated", label: "Listing updated in the last 12 months",
      status: ageDays <= 365 ? "PASS" : "WARN",
      detail: ageDays <= 365
        ? `Last updated ${updated}${ext.version ? `, version ${ext.version}` : ""}.`
        : `Last updated ${updated} — over a year ago. Browsers and store policy change faster than that; an unmaintained extension is where breakage and policy strikes come from.`,
      evidence: [updated, ext.version, ext.size].filter(Boolean).join(" · "),
      ...high,
    });
  }

  // The published manifest — what the store actually distributes.
  if (ext.manifest) checks.push(...evaluateExtensionManifest(ext.manifest, "store"));

  return checks;
}

function deviceLabel(device: string, store: StoreTarget): string {
  const labels: Record<string, string> = store === "app_store"
    ? { phone: "iPhone", pad: "iPad", watch: "Apple Watch", mac: "Mac", tv: "Apple TV", vision: "Vision Pro" }
    : { phone: "Phone" };
  return labels[device.toLowerCase()] ?? device;
}
