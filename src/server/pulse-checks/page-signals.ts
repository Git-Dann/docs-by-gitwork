// Evidence readers for four core page checks emitted from pulse-scan.ts, kept here so
// they can be tested without running a scan.

import type { PulseScanCheckInput } from "@/types/pulse";
import type { CheckCategory } from "./categories";
import { findClaim, proseRuns } from "./page-claims";

type Base = { category: CheckCategory; checkKey: string; label: string };

// ── app_icon_sizes ───────────────────────────────────────────────────────────

/**
 * The apple-touch-icon <link> elements the page declares. The old check counted the
 * STRING "apple-touch-icon", which one `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`
 * contains twice, so a single icon read as two sizes.
 */
export function appleTouchIcons(html: string): Array<{ href: string; sizes: number[] }> {
  const out: Array<{ href: string; sizes: number[] }> = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1] ?? "";
    if (!/\bapple-touch-icon(?:-precomposed)?\b/i.test(rel)) continue;
    const href = /\bhref\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1] ?? "";
    const sizesAttr = /\bsizes\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1] ?? "";
    const sizes = [...sizesAttr.matchAll(/(\d{2,4})\s*x\s*\d{2,4}/gi)].map((m) => parseInt(m[1], 10));
    out.push({ href, sizes });
  }
  return out;
}

/** iOS scales a 180×180 icon down for every older device, so one large icon covers them all. */
export const RETINA_TOUCH_ICON = 180;

export function appIconSizesVerdict(base: Base, html: string): PulseScanCheckInput {
  const icons = appleTouchIcons(html);
  if (icons.length === 0) {
    return {
      ...base,
      status: "INCONCLUSIVE",
      confidence: "LOW",
      detail: "The page declares no apple-touch-icon. iOS also looks for /apple-touch-icon.png at the site root, which this check does not request, so whether the home-screen icon exists could not be established.",
    };
  }
  const sizes = [...new Set(icons.flatMap((i) => i.sizes))].sort((a, b) => a - b);
  const largest = sizes.length ? sizes[sizes.length - 1] : null;
  if (largest !== null && largest >= RETINA_TOUCH_ICON) {
    return { ...base, status: "PASS", detail: `Apple touch icon declared at ${sizes.map((s) => `${s}x${s}`).join(", ")}. iOS scales a ${RETINA_TOUCH_ICON}x${RETINA_TOUCH_ICON} or larger icon down for every device.` };
  }
  if (sizes.length >= 2) {
    return { ...base, status: "PASS", detail: `Apple touch icons declared at ${sizes.map((s) => `${s}x${s}`).join(", ")}.` };
  }
  if (largest !== null) {
    return { ...base, status: "WARN", detail: `The only apple-touch-icon is declared at ${largest}x${largest}, smaller than the ${RETINA_TOUCH_ICON}x${RETINA_TOUCH_ICON} that current iPhones use, so the home-screen icon will be upscaled and blurred.` };
  }
  return {
    ...base,
    status: "INCONCLUSIVE",
    confidence: "LOW",
    detail: `The page declares ${icons.length === 1 ? "an apple-touch-icon" : `${icons.length} apple-touch-icons`} without a sizes attribute, so its resolution cannot be read without downloading the image. Apple recommends ${RETINA_TOUCH_ICON}x${RETINA_TOUCH_ICON}.`,
  };
}

// ── company_registration_info ────────────────────────────────────────────────

/**
 * A statement of the legal entity's registration in readable text: a company or VAT
 * number, "registered in England and Wales", a registered office, or a national
 * register reference. A bare suffix does not count: '© … Inc.' may name a third party,
 * and 'AB' is a word in many languages.
 */
export const COMPANY_REGISTRATION = new RegExp([
  String.raw`\bcompany\s+(?:registration\s+)?(?:number|no\.?|reg(?:istration)?\.?\s*(?:number|no\.?)?)\s*[:#.]?\s*(?:[A-Z]{2})?\s?\d{5,8}\b`,
  String.raw`\b(?:company\s+)?registered\s+(?:in|under\s+the\s+laws\s+of)\s+(?:England|Scotland|Wales|Northern\s+Ireland|(?:the\s+Republic\s+of\s+)?Ireland|the\s+Netherlands|Germany|France|Delaware)\b`,
  String.raw`\bregistered\s+office\b`,
  String.raw`\b(?:VAT|BTW|USt-?IdNr\.?|TVA|IVA)\s*(?:reg(?:istration)?\.?\s*)?(?:number|no\.?|ID|nr\.?)?\s*[:#.]?\s*(?:[A-Z]{2})?\s?\d[\d\s]{6,13}\b`,
  String.raw`\b(?:Handelsregister|Amtsgericht|HRB\s*\d{2,7}|KvK(?:-nummer)?\s*[:#]?\s*\d{8}|SIRE[NT]\s*[:#]?\s*\d{9}|RCS\s+[A-Z][a-z]+|ABN\s*[:#]?\s*\d{2}\s?\d{3}|ACN\s*[:#]?\s*\d{3}|CIN\s*[:#]?\s*[A-Z]\d{5}|Companies\s+House)\b`,
].join("|"), "i");

export function companyRegistrationVerdict(base: Base, html: string): PulseScanCheckInput {
  const quote = findClaim(proseRuns(html), COMPANY_REGISTRATION);
  if (quote) {
    return { ...base, status: "PASS", detail: `The page states the company's registration details: "${quote}"` };
  }
  return {
    ...base,
    status: "INCONCLUSIVE",
    confidence: "LOW",
    detail: "The scanned page does not state a company number, VAT number or registered office. UK and EU companies must publish these on their website, but they are often in the footer of other pages or in the terms and imprint, which this check does not read, so this does not show they are missing.",
  };
}

// ── cookie_consent_granular ──────────────────────────────────────────────────

/** Script hosts that set cookies or similar identifiers for analytics or advertising. */
const COOKIE_TRACKERS: Array<[RegExp, string]> = [
  [/googletagmanager\.com\/(?:gtag\/js|gtm\.js)|google-analytics\.com\/(?:analytics|ga)\.js/i, "Google Analytics / Tag Manager"],
  [/connect\.facebook\.net\/[^"']*fbevents\.js/i, "Meta Pixel"],
  [/static\.hotjar\.com/i, "Hotjar"],
  [/clarity\.ms\/tag/i, "Microsoft Clarity"],
  [/googleads\.g\.doubleclick\.net|pagead2\.googlesyndication\.com/i, "Google Ads"],
  [/snap\.licdn\.com\/li\.lms-analytics/i, "LinkedIn Insight"],
  [/analytics\.tiktok\.com/i, "TikTok Pixel"],
  [/cdn\.segment\.com\/analytics\.js/i, "Segment"],
  [/js\.hs-(?:scripts|analytics)\.com/i, "HubSpot"],
  [/cdn\.mxpnl\.com/i, "Mixpanel"],
  [/cdn\.amplitude\.com/i, "Amplitude"],
  [/heapanalytics\.com/i, "Heap"],
  [/bat\.bing\.com\/bat\.js/i, "Microsoft Advertising"],
];

/**
 * Cookie-setting trackers the served page loads unconditionally: the src of a <script>
 * tag. A tracker URL inside an inline script is not counted, because that is how a site
 * loads one conditionally, after consent or only for some visitors (cal.com appends Tag
 * Manager from inline code only for US visitors).
 */
export function cookieTrackersLoaded(html: string): string[] {
  const srcs = (html.match(/<script\b[^>]*>/gi) ?? [])
    .map((tag) => /\bsrc\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1] ?? "")
    .filter(Boolean)
    .join("\n");
  return COOKIE_TRACKERS.filter(([re]) => re.test(srcs)).map(([, name]) => name);
}

/**
 * What a cookie banner shows, read from readable text (a button label counts) rather than
 * the raw HTML, where a script identifier such as `cookieBanner` or `cookieSettings` would
 * pass for a banner. Machine-readable consent controls are still read from the markup.
 */
export function cookieBannerSignals(html: string): { granular: boolean; notice: boolean } {
  const runs = proseRuns(html);
  const granular = findClaim(runs, /\b(?:reject|decline|refuse|deny)\s+(?:all\s+|additional\s+|non-essential\s+|optional\s+|analytics\s+)?cookies?\b|\b(?:reject|decline|refuse)\s+all\b|\baccept\s+(?:all|additional|selected)\b|\b(?:only\s+)?(?:strictly\s+)?(?:essential|necessary|required)\s+cookies?\s+only\b|\bonly\s+(?:strictly\s+)?(?:essential|necessary|required)\s+cookies?\b|\b(?:manage|customi[sz]e|adjust|change|review)\s+(?:your\s+)?(?:cookie|consent|privacy)\s*(?:settings|preferences|choices|options)\b|\bcookie\s*(?:settings|preferences|choices)\b/i) !== null
    || /data-(?:reject|decline|deny)-cookies|data-cookie-(?:types|preferences)|onclick="[^"]*reject[^"]*cookie/i.test(html);
  const notice = findClaim(runs, /\bcookie\s+(?:consent|banner|notice)\b|\bwe\s+use\s+cookies\b|\bthis\s+(?:site|website)\s+uses\s+cookies\b|\buses?\s+cookies\s+to\b/i) !== null;
  return { granular, notice };
}

/**
 * Granular consent, judged on what the page shows. A banner with a decline or manage
 * control passes; a banner without one warns; NO banner warns only when a cookie-setting
 * tracker is actually loaded. A consent manager whose banner was not rendered in what Pulse
 * read cannot be judged. With none of these, the site may set no non-essential cookie at
 * all, in which case no banner is needed, so it is not a finding.
 */
export function cookieConsentGranularVerdict(
  base: Base,
  input: { hasGranular: boolean; hasBanner: boolean; hasMechanism?: boolean; trackers: string[] },
): PulseScanCheckInput {
  if (input.hasGranular) {
    return { ...base, status: "PASS", detail: "The page offers granular cookie choices (reject, essential only, or manage preferences)." };
  }
  const loaded = input.trackers.length ? ` The page loads ${input.trackers.join(", ")}, which set cookies that need consent.` : "";
  if (input.hasBanner) {
    return { ...base, status: "WARN", detail: `A cookie notice is shown, but it offers no way to reject or manage non-essential cookies.${loaded} UK and EU rules require refusing to be as easy as accepting.` };
  }
  if (input.hasMechanism) {
    return {
      ...base,
      status: "INCONCLUSIVE",
      confidence: "LOW",
      detail: "The page carries a cookie consent manager, but its banner was not shown in the page Pulse read, so the choices it offers could not be checked.",
    };
  }
  if (input.trackers.length) {
    return { ...base, status: "WARN", detail: `No cookie consent control was found, yet the page loads ${input.trackers.join(", ")}. UK and EU rules require consent, with a real choice to refuse, before these set cookies.` };
  }
  return {
    ...base,
    status: "INCONCLUSIVE",
    confidence: "LOW",
    detail: "No cookie banner was found, and the served page loads no known analytics or advertising script directly. A site that sets only strictly necessary cookies needs no banner, and trackers added later by the site's own code cannot be seen here, so whether consent choices are needed could not be established.",
  };
}

// ── cors_not_wildcard ────────────────────────────────────────────────────────

/**
 * `Access-Control-Allow-Origin: *` on the scanned response. Browsers never send cookies
 * or credentials with a wildcard, so it exposes only what anyone could already fetch;
 * the risk is the same header on a response that depends on a session or on the
 * caller's network. That is worth a warning, not a failure.
 */
export function corsWildcardVerdict(base: Base, headers: Record<string, string>): PulseScanCheckInput {
  const acao = (headers["access-control-allow-origin"] ?? "").trim();
  if (acao === "*") {
    const credentials = (headers["access-control-allow-credentials"] ?? "").trim().toLowerCase() === "true";
    return {
      ...base,
      status: "WARN",
      detail: credentials
        ? "This response sends Access-Control-Allow-Origin: * with Access-Control-Allow-Credentials: true. Browsers refuse that combination, so it does not leak data, but it shows the CORS policy was not thought through. Name the trusted origins instead."
        : "This response sends Access-Control-Allow-Origin: *, so any website can read it in a visitor's browser. Browsers never send cookies with a wildcard, so this exposes only what anyone could already fetch; make sure the same header is not sent on responses that depend on a signed-in user or on an internal network.",
    };
  }
  return {
    ...base,
    status: "PASS",
    detail: acao ? `The scanned response limits cross-origin reads to "${acao}".` : "The scanned response sends no Access-Control-Allow-Origin header, so other websites cannot read it in a visitor's browser.",
  };
}
