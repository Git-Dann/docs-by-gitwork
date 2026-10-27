// ─────────────────────────────────────────────────────────────────────────────
// CONSENT BEFORE TRACKING — the verdicts.
//
// The static checks (legal-pages, legal-extended) read HTML and can tell whether a
// cookie banner is MENTIONED. They cannot tell whether the site waits for the
// answer. This family is measured in a fresh browser by consent-tracking-agent.ts:
// it loads the page with no stored state, records every request and cookie before
// anyone touches anything, then presses the banner's Reject control, reloads, and
// records again.
//
// The rule being tested is PECR reg. 6 / ePrivacy art. 5(3): storing or reading
// non-essential data on the visitor's device needs consent FIRST. So the family is
// tagged EU + UK in jurisdictions.ts and only applies where those markets do.
//
// ADVERTISING and ANALYTICS are judged differently, because the law now differs:
//   - advertising before a choice fails everywhere;
//   - analytics before a choice fails where the EU applies, but since 5 Feb 2026
//     UK PECR (Sch. A1 para 5, added by the Data (Use and Access) Act 2025) allows
//     analytics used to improve the service without consent if visitors are told
//     and can easily object. A UK-only site gets a WARN that states those terms.
//
// Collect-only agent, pure verdicts here. Honesty rules (CLAUDE.md §35, §44):
//   - no browser or no page → INCONCLUSIVE, never PASS;
//   - only KNOWN tracking endpoints and cookie names count. An unknown request is
//     not called a tracker, which is why a clean result says "no known trackers";
//   - cookieless analytics (Plausible, Fathom, Simple Analytics) is not a finding;
//   - a Google Consent Mode ping with storage denied sets no cookie and is reported
//     as a WARN, not a FAIL: the ICO has not said whether it is exempt.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";

export const CONSENT_TRACKING_KEYS = [
  "consent_no_tracking_before_choice",
  "consent_no_tracking_cookies_before_choice",
  "consent_reject_honoured",
] as const;
export type ConsentTrackingKey = (typeof CONSENT_TRACKING_KEYS)[number];

export const CONSENT_TRACKING_LABELS: Record<ConsentTrackingKey, string> = {
  consent_no_tracking_before_choice: "No tracking requests are sent before a consent choice",
  consent_no_tracking_cookies_before_choice: "No tracking cookies are set before a consent choice",
  consent_reject_honoured: "Rejecting cookies stops tracking",
};

// ── Known trackers ───────────────────────────────────────────────────────────

/**
 * A request that sends data to an analytics or advertising service. Loading a
 * vendor's script is NOT counted (googletagmanager.com/gtag/js, connect.facebook.net),
 * because a well-built consent setup loads the script and holds it; only the beacon
 * that actually transmits a visit counts.
 */
export type TrackerKind = "advertising" | "analytics";

interface TrackerRule {
  vendor: string;
  kind: TrackerKind;
  host: RegExp;
  path?: RegExp;
}

const TRACKER_RULES: TrackerRule[] = [
  { vendor: "Google Analytics", kind: "analytics", host: /(^|\.)google-analytics\.com$/, path: /\/(g\/)?collect\b|\/j\/collect\b/ },
  { vendor: "Google Analytics", kind: "analytics", host: /(^|\.)analytics\.google\.com$/, path: /\/g\/collect\b/ },
  { vendor: "Google Ads", kind: "advertising", host: /(^|\.)googleadservices\.com$/, path: /\/pagead\/conversion/ },
  // Beacons only: securepubads' /pagead/purl_config and /tag/js are ad-serving set-up,
  // not a visit being reported (seen on which.co.uk, intermittently).
  { vendor: "Google Ads", kind: "advertising", host: /(^|\.)doubleclick\.net$/, path: /^\/(g\/collect|activity|ddm\/|pagead\/(viewthroughconversion|conversion)|pixel)/ },
  { vendor: "Google Ads", kind: "advertising", host: /^pagead2\.googlesyndication\.com$/, path: /^\/pagead\/conversion\b/ },
  { vendor: "Google Ads", kind: "advertising", host: /^www\.google\.[a-z.]+$/, path: /^\/(pagead|ads)\// },
  { vendor: "Meta Pixel", kind: "advertising", host: /(^|\.)facebook\.com$/, path: /^\/tr\/?/ },
  // static.hotjar.com is the script; these hosts receive the recording and events.
  { vendor: "Hotjar", kind: "analytics", host: /^(in\.hotjar\.com|vc\.hotjar\.io|content\.hotjar\.io|metrics\.hotjar\.io)$/ },
  { vendor: "Microsoft Clarity", kind: "analytics", host: /(^|\.)clarity\.ms$/, path: /\/collect\b/ },
  { vendor: "Microsoft Advertising", kind: "advertising", host: /^bat\.bing\.com$/, path: /^\/action\// },
  { vendor: "LinkedIn Insight", kind: "advertising", host: /^px\.ads\.linkedin\.com$/ },
  { vendor: "TikTok Pixel", kind: "advertising", host: /^analytics\.tiktok\.com$/, path: /\/pixel\b|\/api\/v2\// },
  { vendor: "X (Twitter) Pixel", kind: "advertising", host: /^(analytics\.twitter\.com|t\.co)$/, path: /\/i\/adsct|\/1\/i\/adsct/ },
  { vendor: "Pinterest Tag", kind: "advertising", host: /^ct\.pinterest\.com$/ },
  { vendor: "Snap Pixel", kind: "advertising", host: /^tr\.snapchat\.com$/ },
  { vendor: "Reddit Pixel", kind: "advertising", host: /^alb\.reddit\.com$/ },
  { vendor: "HubSpot", kind: "analytics", host: /^track\.hubspot\.com$/ },
  { vendor: "Segment", kind: "analytics", host: /^api\.segment\.io$/ },
  { vendor: "Mixpanel", kind: "analytics", host: /(^|\.)mixpanel\.com$/, path: /^\/(track|engage)\b/ },
  { vendor: "Amplitude", kind: "analytics", host: /^api2?\.amplitude\.com$/ },
  { vendor: "Heap", kind: "analytics", host: /(^|\.)heapanalytics\.com$/, path: /^\/h\b/ },
  { vendor: "Chartbeat", kind: "analytics", host: /^ping\.chartbeat\.net$/ },
  { vendor: "Piano Analytics", kind: "analytics", host: /(^|\.)(xiti\.com|ati-host\.net|pa-cd\.com)$/ },
  { vendor: "DotMetrics", kind: "analytics", host: /(^|\.)dotmetrics\.net$/, path: /\/(ping|collect|gemius|DotMetrics)/i },
  { vendor: "PostHog", kind: "analytics", host: /(^|\.)posthog\.com$/, path: /^\/(e|i\/v0\/e|batch|capture)\b/ },
];

export interface ClassifiedRequest {
  vendor: string;
  kind: TrackerKind;
  url: string;
  /** Google Consent Mode reported both ad and analytics storage denied. */
  consentModeDenied: boolean;
}

/**
 * Google's `gcs` parameter: `G1` + ad_storage + analytics_storage, each `1` granted,
 * `0` denied, `-` unset (which behaves as granted). Only `G100` is the cookieless ping.
 */
export function consentModeDenied(url: URL): boolean {
  return url.searchParams.get("gcs") === "G100";
}

export function classifyRequest(raw: string): ClassifiedRequest | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  for (const rule of TRACKER_RULES) {
    if (!rule.host.test(host)) continue;
    if (rule.path && !rule.path.test(url.pathname)) continue;
    return { vendor: rule.vendor, kind: rule.kind, url: `${url.origin}${url.pathname}`, consentModeDenied: consentModeDenied(url) };
  }
  return null;
}

/** Cookie names that only an analytics or advertising tool sets. */
const TRACKING_COOKIE_RULES: { vendor: string; kind: TrackerKind; name: RegExp }[] = [
  { vendor: "Google Analytics", kind: "analytics", name: /^(_ga|_ga_[A-Z0-9]+|_gid|_gat(_.*)?|__utm[abcz])$/ },
  { vendor: "Google Ads", kind: "advertising", name: /^(_gcl_(au|aw|dc|gb|gs)|IDE|test_cookie|DSID|__gads|__gpi)$/ },
  { vendor: "Meta Pixel", kind: "advertising", name: /^(_fbp|_fbc|fr)$/ },
  { vendor: "Hotjar", kind: "analytics", name: /^_hj/ },
  { vendor: "Microsoft Clarity", kind: "analytics", name: /^(_clck|_clsk|CLID)$/ },
  { vendor: "Microsoft Advertising", kind: "advertising", name: /^(_uetsid|_uetvid|MUID)$/ },
  { vendor: "LinkedIn Insight", kind: "advertising", name: /^(li_fat_id|lidc|bcookie|UserMatchHistory|AnalyticsSyncHistory|li_sugr)$/ },
  { vendor: "TikTok Pixel", kind: "advertising", name: /^(_ttp|_tt_enable_cookie)$/ },
  { vendor: "Pinterest Tag", kind: "advertising", name: /^_pin_unauth$/ },
  { vendor: "Snap Pixel", kind: "advertising", name: /^_scid/ },
  { vendor: "Reddit Pixel", kind: "advertising", name: /^_rdt_uuid$/ },
  { vendor: "HubSpot", kind: "analytics", name: /^(hubspotutk|__hstc|__hssc)$/ },
  { vendor: "Segment", kind: "analytics", name: /^ajs_(anonymous_id|user_id)$/ },
  { vendor: "Mixpanel", kind: "analytics", name: /^mp_[a-f0-9]+_mixpanel$/ },
  { vendor: "Amplitude", kind: "analytics", name: /^(amp_[a-f0-9]+|AMP_[A-Za-z0-9_]+)$/ },
  { vendor: "Heap", kind: "analytics", name: /^_hp2_/ },
  { vendor: "PostHog", kind: "analytics", name: /^ph_.+_posthog$/ },
  { vendor: "Chartbeat", kind: "analytics", name: /^(_cb|_cb_svref|_chartbeat2)$/ },
  { vendor: "Piano Analytics", kind: "analytics", name: /^(atuserid|atidvisitor|_pcid|_pctx)$/ },
  { vendor: "DotMetrics", kind: "analytics", name: /^DotMetrics\./ },
];

export interface ObservedCookie {
  name: string;
  domain: string;
}

export function classifyCookie(cookie: ObservedCookie): string | null {
  return classifyCookieKind(cookie)?.vendor ?? null;
}

export function classifyCookieKind(cookie: ObservedCookie): { vendor: string; kind: TrackerKind } | null {
  for (const rule of TRACKING_COOKIE_RULES) if (rule.name.test(cookie.name)) return { vendor: rule.vendor, kind: rule.kind };
  return null;
}

// ── Raw observations (what the agent collects) ───────────────────────────────

export interface ConsentPhase {
  /** Every request URL the page made during the phase. */
  requests: string[];
  /** Every cookie in the browser at the end of the phase. */
  cookies: ObservedCookie[];
}

export interface ConsentControl {
  text: string;
  selector: string;
  /** The control sat in an embedded frame (a consent platform's iframe). */
  inFrame: boolean;
}

export interface ConsentObservation {
  url: string;
  /** Visible words on the rendered page. */
  renderedWords: number;
  /** The page read like a bot check or access-denied wall rather than the site. */
  blockedPage?: boolean;
  /** How long the page was watched before anyone could have chosen (ms). */
  windowMs: number;
  before: ConsentPhase | null;
  /** A visible first-layer Reject (or "necessary only") control. */
  rejectControl: ConsentControl | null;
  /** A visible Accept control — reported, never pressed. */
  acceptControl: ConsentControl | null;
  /** null when no Reject control was found or pressing it failed. */
  afterReject: ConsentPhase | null;
  stepErrors: Record<string, string>;
  /**
   * The scan's target markets. Empty = not known, and then the EU is assumed to
   * apply, because the stricter rule is the one a site cannot be sure it escapes.
   */
  markets?: string[];
}

// ── Verdicts ─────────────────────────────────────────────────────────────────

function row(
  key: ConsentTrackingKey,
  status: PulseScanCheckInput["status"],
  detail: string,
  confidence: "HIGH" | "MEDIUM" | "LOW",
  confidenceReason: string,
  evidence?: unknown,
): PulseScanCheckInput {
  return {
    category: CATEGORIES.LEGAL,
    checkKey: key,
    label: CONSENT_TRACKING_LABELS[key],
    status,
    detail,
    confidence,
    confidenceReason,
    evidenceStrength: status === "INCONCLUSIVE" || status === "NOT_APPLICABLE" ? undefined : "VERIFIED",
    ...(evidence !== undefined ? { evidence: JSON.stringify(evidence).slice(0, 1500) } : {}),
  };
}

function inconclusive(key: ConsentTrackingKey, why: string): PulseScanCheckInput {
  return row(key, "INCONCLUSIVE", why, "LOW", "The consent measurement did not run for this control.");
}

/** Every key INCONCLUSIVE, for a browser that did not start or a page that did not load. */
export function consentTrackingUnavailable(reason: string): PulseScanCheckInput[] {
  return CONSENT_TRACKING_KEYS.map((key) =>
    inconclusive(key, `Not measured: ${reason} This is a gap in the scan, not a finding about the page.`),
  );
}

interface VendorHits {
  tracking: Map<string, string[]>;
  consentModeOnly: Map<string, string[]>;
  kinds: Map<string, TrackerKind>;
}

function vendorHits(requests: string[]): VendorHits {
  const tracking = new Map<string, string[]>();
  const consentModeOnly = new Map<string, string[]>();
  const kinds = new Map<string, TrackerKind>();
  for (const raw of requests) {
    const hit = classifyRequest(raw);
    if (!hit) continue;
    kinds.set(hit.vendor, hit.kind);
    const bucket = hit.consentModeDenied ? consentModeOnly : tracking;
    const list = bucket.get(hit.vendor) ?? [];
    if (!list.includes(hit.url) && list.length < 3) list.push(hit.url);
    bucket.set(hit.vendor, list);
  }
  // A vendor that sent a real hit is a tracker, whatever else it also sent.
  for (const vendor of tracking.keys()) consentModeOnly.delete(vendor);
  return { tracking, consentModeOnly, kinds };
}

function cookieHits(cookies: ObservedCookie[], kind?: TrackerKind): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const cookie of cookies) {
    const hit = classifyCookieKind(cookie);
    if (!hit || (kind && hit.kind !== kind)) continue;
    const vendor = hit.vendor;
    const list = out.get(vendor) ?? [];
    if (!list.includes(cookie.name)) list.push(cookie.name);
    out.set(vendor, list);
  }
  return out;
}

function names(map: Map<string, unknown>): string {
  const all = [...map.keys()];
  if (all.length <= 1) return all.join("");
  return `${all.slice(0, -1).join(", ")} and ${all[all.length - 1]}`;
}

/** Where the EU applies, or markets are unknown, analytics needs consent too. */
export function euRulesApply(markets: string[] | undefined): boolean {
  return !markets || markets.length === 0 || markets.includes("EU");
}

const UK_ANALYTICS_EXEMPTION =
  "Since 5 February 2026 UK law (PECR, as amended by the Data (Use and Access) Act 2025) allows analytics used only to improve the site without consent, provided visitors are clearly told and given a simple way to object, and the data is not used for anything else. If you rely on that, make sure the notice and the objection are on the site; if you serve EU visitors, consent is still required first.";

function filterMap(map: Map<string, string[]>, keep: (vendor: string) => boolean): Map<string, string[]> {
  return new Map([...map].filter(([vendor]) => keep(vendor)));
}

function seconds(ms: number): string {
  return `${Math.round(ms / 1000)} seconds`;
}

function evaluateRequestsBefore(obs: ConsentObservation, before: ConsentPhase): PulseScanCheckInput {
  const key = "consent_no_tracking_before_choice";
  const { tracking, consentModeOnly, kinds } = vendorHits(before.requests);
  const evidence = { tracking: Object.fromEntries(tracking), consentModeOnly: Object.fromEntries(consentModeOnly) };
  const advertising = filterMap(tracking, (v) => kinds.get(v) === "advertising");
  const analytics = filterMap(tracking, (v) => kinds.get(v) === "analytics");
  const fix = "Hold these tags until the visitor accepts: in a tag manager, fire them on the consent-granted trigger, not on page view.";
  const window = `within ${seconds(obs.windowMs)} of a first visit, with nothing clicked`;

  if (advertising.size > 0) {
    const also = analytics.size > 0 ? ` ${names(analytics)} also received analytics data.` : "";
    return row(
      key,
      "FAIL",
      `${names(advertising)} received advertising data before the visitor made any choice: the page sent these requests ${window}.${also} Advertising tracking needs consent first in the UK and EU (PECR, ePrivacy), with no exemption. ${fix}`,
      "HIGH",
      "Observed requests from a fresh browser with no stored consent.",
      evidence,
    );
  }
  if (analytics.size > 0) {
    if (euRulesApply(obs.markets)) {
      return row(
        key,
        "FAIL",
        `${names(analytics)} received analytics data before the visitor made any choice: the page sent these requests ${window}. In the EU (ePrivacy) analytics needs consent first. ${fix} ${UK_ANALYTICS_EXEMPTION}`,
        "HIGH",
        "Observed requests from a fresh browser with no stored consent.",
        evidence,
      );
    }
    return row(
      key,
      "WARN",
      `${names(analytics)} received analytics data before the visitor made any choice (${window}). ${UK_ANALYTICS_EXEMPTION}`,
      "HIGH",
      "Observed requests; whether the UK exemption's conditions are met is not visible to a scan.",
      evidence,
    );
  }
  if (consentModeOnly.size > 0) {
    return row(
      key,
      "WARN",
      `Before any choice, the page sent Google Consent Mode pings with storage denied (${names(consentModeOnly)}). No cookie is set, but a request still leaves the visitor's browser, and regulators have not said that Consent Mode's cookieless pings are exempt. To remove the question, use Basic Consent Mode, which sends nothing until consent.`,
      "HIGH",
      "Observed Consent Mode parameters (gcs) on the requests.",
      evidence,
    );
  }
  return row(
    key,
    "PASS",
    `No known analytics or advertising requests in the first ${seconds(obs.windowMs)} of a first visit. Only known tracking endpoints are recognised, so a home-built tracker would not be seen.`,
    "MEDIUM",
    "Only known endpoints are matched, over a fixed watch window.",
  );
}

function evaluateCookiesBefore(obs: ConsentObservation, before: ConsentPhase): PulseScanCheckInput {
  const key = "consent_no_tracking_cookies_before_choice";
  const advertising = cookieHits(before.cookies, "advertising");
  const analytics = cookieHits(before.cookies, "analytics");
  const all = cookieHits(before.cookies);
  const list = (m: Map<string, string[]>) => [...m.values()].flat().slice(0, 8).join(", ");
  const fix = "These usually come from a tag that fires on page view; move it behind the consent-granted trigger.";
  if (advertising.size > 0 || (analytics.size > 0 && euRulesApply(obs.markets))) {
    const kind = advertising.size > 0 ? "Advertising" : "Analytics";
    return row(
      key,
      "FAIL",
      `${kind} cookies were set before the visitor made any choice: ${list(all)} (${names(all)}). PECR and ePrivacy require consent before ${advertising.size > 0 ? "an advertising" : "an analytics"} cookie is stored${advertising.size > 0 ? "" : " where EU rules apply"}. ${fix}`,
      "HIGH",
      "Cookies read from a fresh browser with no stored consent.",
      Object.fromEntries(all),
    );
  }
  if (analytics.size > 0) {
    return row(
      key,
      "WARN",
      `Analytics cookies were set before the visitor made any choice: ${list(analytics)} (${names(analytics)}). ${UK_ANALYTICS_EXEMPTION}`,
      "HIGH",
      "Cookies observed; whether the UK exemption's conditions are met is not visible to a scan.",
      Object.fromEntries(analytics),
    );
  }
  return row(
    key,
    "PASS",
    "No known analytics or advertising cookies were set before a choice. Cookies with names Pulse does not recognise are not judged.",
    "MEDIUM",
    "Only known tracking cookie names are matched.",
  );
}

function evaluateReject(obs: ConsentObservation, before: ConsentPhase): PulseScanCheckInput {
  const key = "consent_reject_honoured";
  const trackedBefore = vendorHits(before.requests).tracking.size > 0 || cookieHits(before.cookies).size > 0;

  if (!obs.rejectControl) {
    if (!obs.acceptControl && !trackedBefore) {
      return row(
        key,
        "NOT_APPLICABLE",
        "There is no consent banner on the page and no known tracking was seen, so there is no rejection to test.",
        "MEDIUM",
        "No banner controls and no tracker activity were observed.",
      );
    }
    return inconclusive(
      key,
      obs.acceptControl
        ? `A consent banner was found ("${obs.acceptControl.text}") but no Reject or "necessary only" button on its first layer, so rejection could not be tested. The UK and EU regulators expect rejecting to be as easy as accepting.`
        : "Known tracking ran on the page but no consent banner with a Reject button was found, so rejection could not be tested.",
    );
  }

  const after = obs.afterReject;
  if (!after) {
    const why = obs.stepErrors.reject ? ` (${obs.stepErrors.reject})` : "";
    return inconclusive(key, `Pressing "${obs.rejectControl.text}" did not complete${why}, so what happens after rejecting was not observed.`);
  }

  const { tracking, kinds } = vendorHits(after.requests);
  const priorCookies = new Set(before.cookies.map((c) => `${c.domain}|${c.name}`));
  const fresh = after.cookies.filter((c) => !priorCookies.has(`${c.domain}|${c.name}`));
  const newCookies = cookieHits(fresh);
  if (tracking.size > 0 || newCookies.size > 0) {
    const parts: string[] = [];
    if (tracking.size > 0) parts.push(`${names(tracking)} still received data`);
    if (newCookies.size > 0) parts.push(`new tracking cookies were set (${[...newCookies.values()].flat().slice(0, 6).join(", ")})`);
    const advertising = [...tracking.keys()].some((v) => kinds.get(v) === "advertising") || cookieHits(fresh, "advertising").size > 0;
    const evidence = { tracking: Object.fromEntries(tracking), newCookies: Object.fromEntries(newCookies) };
    const said = `After pressing "${obs.rejectControl.text}" and reloading, ${parts.join(" and ")}.`;
    if (!advertising && !euRulesApply(obs.markets)) {
      return row(
        key,
        "WARN",
        `${said} This is analytics only. UK law allows analytics without consent if visitors are told and can easily object; if "${obs.rejectControl.text}" is meant to be that objection, the tags are ignoring it. If visitors object somewhere else, make sure that is clearly signposted.`,
        "HIGH",
        "Observed after pressing Reject; whether a separate objection route exists is not visible to a scan.",
        evidence,
      );
    }
    return row(
      key,
      "FAIL",
      `${said} The banner records the choice but the tags ignore it. Check the tags are wired to the consent state, not just the banner.`,
      "HIGH",
      "Observed in the same browser after the Reject control was pressed.",
      evidence,
    );
  }
  return row(
    key,
    "PASS",
    `After pressing "${obs.rejectControl.text}" and reloading, no known analytics or advertising requests were sent and no new tracking cookies were set.`,
    "MEDIUM",
    "Only known trackers are matched; the page was observed once after rejecting.",
  );
}

/**
 * Fewer words than this and no consent controls: what loaded is a bot check, an
 * access-denied wall or a holding page, not the site. Retailers behind Akamai or
 * Imperva serve exactly that to a headless browser (15–26 words, two requests),
 * and judging it would report the block page's silence as the site being clean.
 */
export const MIN_PAGE_WORDS = 50;

/** Turn one page's observations into the family's checks. Pure. */
export function evaluateConsentTracking(obs: ConsentObservation): PulseScanCheckInput[] {
  const controls = Boolean(obs.rejectControl || obs.acceptControl);
  if (obs.blockedPage && !controls) {
    return consentTrackingUnavailable("the site served a bot check or access-denied page to the scanner, not the real page.");
  }
  if (obs.renderedWords < MIN_PAGE_WORDS && !controls) {
    return consentTrackingUnavailable(`the page rendered only ${obs.renderedWords} words, which looks like a bot check or holding page rather than the site.`);
  }
  const before = obs.before;
  if (!before) {
    const why = obs.stepErrors.before ? `the first-visit observation failed (${obs.stepErrors.before}).` : "the first-visit observation did not run.";
    return CONSENT_TRACKING_KEYS.map((k) => inconclusive(k, `Not measured: ${why}`));
  }
  return [evaluateRequestsBefore(obs, before), evaluateCookiesBefore(obs, before), evaluateReject(obs, before)];
}

// ── Finding the controls (page script text, run in each frame) ───────────────

/** First-layer reject wording, in the languages UK/EU banners actually use. */
export const REJECT_TEXT =
  /^(reject|reject all|reject all cookies|reject cookies|reject (all )?(optional|non-essential|additional|analytics) cookies|decline|decline all|decline cookies|refuse|refuse all|deny|deny all|disagree|i do not accept|do not accept|don't accept|only (necessary|essential|required)( cookies)?|(use |allow |accept )?(strictly )?(necessary|essential|required) (cookies )?only|necessary cookies only|continue without accepting|alle ablehnen|ablehnen|nur notwendige( cookies)?|tout refuser|refuser|continuer sans accepter|rechazar|rechazar todo|rechazar todas|rifiuta|rifiuta tutto|alles weigeren|weigeren|rejeitar|rejeitar tudo|odrzuć|avvisa|afvis|hylkää)$/i;

/** Accept wording — only ever reported, never pressed. */
export const ACCEPT_TEXT =
  /^(accept|accept all|accept all cookies|accept cookies|allow all|allow all cookies|allow cookies|agree|i agree|agree and continue|accept and continue|alle akzeptieren|akzeptieren|tout accepter|accepter|aceptar|aceptar todo|accetta|accetta tutto|alles accepteren|accepteren|aceitar)$/i;

/** Ids the big consent platforms give their first-layer reject button. */
export const REJECT_IDS = [
  "onetrust-reject-all-handler",
  "CybotCookiebotDialogBodyButtonDecline",
  "didomi-notice-disagree-button",
  "truste-consent-required",
  "cmpwelcomebtnno",
  "cookie-reject",
];

/**
 * Finds visible Reject / Accept controls in one document, including open shadow
 * roots (Usercentrics renders there). A string so it runs as-is in any frame.
 */
export const FIND_CONTROLS_SCRIPT = `(() => {
  const REJECT = ${REJECT_TEXT.toString()};
  const ACCEPT = ${ACCEPT_TEXT.toString()};
  const IDS = ${JSON.stringify(REJECT_IDS)};
  const roots = [document];
  const seen = new Set();
  for (let r = 0; r < roots.length && r < 50; r++) {
    for (const el of roots[r].querySelectorAll('*')) { if (el.shadowRoot && !seen.has(el)) { seen.add(el); roots.push(el.shadowRoot); } }
  }
  const visible = (el) => {
    const s = getComputedStyle(el); const b = el.getBoundingClientRect();
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05 && b.width > 4 && b.height > 4;
  };
  const label = (el) => (el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim();
  const path = (el) => {
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = []; let n = el;
    while (n && n.nodeType === 1 && parts.length < 4) {
      let p = n.tagName.toLowerCase();
      if (n.classList && n.classList.length) p += '.' + [...n.classList].slice(0, 2).map((c) => CSS.escape(c)).join('.');
      parts.unshift(p); n = n.parentElement;
    }
    return parts.join(' > ');
  };
  let reject = null, accept = null, rejectIndex = -1;
  const all = [];
  for (const root of roots) for (const el of root.querySelectorAll('button, a, [role=button], input[type=button], input[type=submit]')) all.push(el);
  all.forEach((el, i) => {
    if (!visible(el)) return;
    const text = label(el).replace(/[.!]$/, '');
    if (!reject && (IDS.includes(el.id) || (text.length <= 48 && REJECT.test(text)))) { reject = { text: text || el.id, selector: path(el) }; rejectIndex = i; }
    if (!accept && text.length <= 48 && ACCEPT.test(text)) accept = { text, selector: path(el) };
  });
  window.__pulseConsentReject = rejectIndex >= 0 ? all[rejectIndex] : null;
  const text = ((document.title || '') + ' ' + (document.body ? document.body.innerText.slice(0, 3000) : ''));
  const blocked = /access denied|just a moment|verify (that )?you(?: a|')re (a )?human|are you a robot|attention required|request unsuccessful|pardon our interruption|checking your browser|enable javascript and cookies to continue/i.test(text);
  return { reject, accept, blocked, words: document.body ? document.body.innerText.split(/\\s+/).filter(Boolean).length : 0 };
})()`;

/** Presses the control FIND_CONTROLS_SCRIPT remembered in this frame. */
export const PRESS_REJECT_SCRIPT = `(() => {
  const el = window.__pulseConsentReject;
  if (!el || !el.isConnected) return false;
  el.click();
  return true;
})()`;
