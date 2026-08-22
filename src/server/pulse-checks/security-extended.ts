import { CATEGORIES } from "./categories";
import { restrictsFraming } from "./csp-sources";
import { type ExtendedCheckContext, type PulseScanCheckInput, fetchWithTimeout, headRequest, verifyFileExposure, resolveDnsRecord, probeInconclusive, skip, platformIs, CATCH_ALL_NOTE } from "./_types";

const CHECKS: Array<[string, string]> = [
  ["cross_origin_opener_policy", "Cross-Origin-Opener-Policy (COOP)"],
  ["cross_origin_resource_policy", "Cross-Origin-Resource-Policy (CORP)"],
  ["cross_origin_embedder_policy", "Cross-Origin-Embedder-Policy (COEP)"],
  ["csp_report_directive", "CSP report-uri / report-to configured"],
  ["rate_limiting_headers", "Rate-limiting headers present"],
  ["caa_dns_record", "CAA DNS record (cert authority restriction)"],
  ["dnssec_enabled", "DNSSEC enabled on domain"],
  ["certificate_expiry_30d", "SSL cert not expiring within 30 days"],
  ["no_exposed_ds_store", ".DS_Store not publicly accessible"],
  ["no_exposed_composer_json", "composer.json not at web root"],
  ["no_exposed_package_json_root", "package.json not served at root"],
  ["no_exposed_swagger_open", "Swagger UI not open in production"],
  ["no_exposed_actuator", "/actuator endpoints not public"],
  ["no_exposed_prometheus_metrics", "/metrics endpoint not public"],
  ["no_graphql_introspection_prod", "GraphQL introspection disabled in prod"],
  ["no_exposed_source_maps", "Source maps not served with page"],
  ["no_api_keys_in_html", "No API key patterns in HTML source"],
  ["csrf_protection_signals", "CSRF token protection detected"],
  ["bot_protection_present", "Bot protection (Cloudflare / reCAPTCHA)"],
  ["sql_error_exposure", "No SQL errors exposed in responses"],
  ["brute_force_protection", "Brute force / rate limit on auth"],
  ["session_cookie_httponly", "HttpOnly flag on session cookies"],
  ["session_cookie_samesite", "SameSite attribute on cookies"],
  ["csp_frame_ancestors", "frame-ancestors in CSP policy"],
  ["no_exposed_env_variants", ".env.prod / .env.docker not accessible"],
  ["secret_scanning_github", "No secrets / keys in page HTML"],
  ["cors_credentials_restricted", "CORS credentials not open to all origins"],
  ["dependency_audit_clean", "No obvious vulnerable library versions"],
  ["subdomain_takeover_risk", "No dangling CNAME / subdomain takeover risk"],
  ["content_security_policy_nonce", "CSP uses nonces (not unsafe-inline)"],
];

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers. Exported so they can be unit-tested against the real headers and
// policies that produced false positives, rather than against fixtures written
// to agree with the matcher.
// ─────────────────────────────────────────────────────────────────────────────

/** A check that was not asked of this response, and says which question it could not answer. */
function notAssessed(checkKey: string, label: string, reason: string): PulseScanCheckInput {
  return { category: CATEGORIES.SECURITY, checkKey, label, status: "SKIPPED", detail: reason };
}

/**
 * Split a Set-Cookie header value into individual cookies.
 *
 * A bare `,` split is wrong: `Expires=Wed, 21 Oct 2025 07:28:00 GMT` contains one.
 * A comma only starts a new cookie when what follows is a `name=` pair.
 *
 * ⚠️ Upstream limitation, not this function's: `fetchPage` builds its header map
 * with `Headers.forEach`, which emits each `set-cookie` separately, so the map
 * keeps only the LAST one. This parser handles a one-cookie string and a joined
 * multi-cookie string identically, so it becomes fully effective the moment the
 * transport passes `Headers.getSetCookie()` through.
 */
export function splitSetCookieHeader(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/,(?=\s*[^\s;,=]+\s*=)/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export type ParsedCookie = { name: string; httpOnly: boolean; secure: boolean; sameSite: string | null };

/** Parse each cookie separately. The joined-header test it replaces let ONE HttpOnly cookie pass the whole set. */
export function parseSetCookieHeader(raw: string): ParsedCookie[] {
  const cookies: ParsedCookie[] = [];
  for (const entry of splitSetCookieHeader(raw)) {
    const [pair, ...attributes] = entry.split(";");
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    if (!name) continue;
    const flags = attributes.map((attribute) => attribute.trim().toLowerCase());
    const sameSiteAttribute = flags.find((flag) => flag === "samesite" || flag.startsWith("samesite="));
    cookies.push({
      name,
      httpOnly: flags.includes("httponly"),
      secure: flags.includes("secure"),
      sameSite: sameSiteAttribute ? (sameSiteAttribute.split("=")[1]?.trim() ?? "") : null,
    });
  }
  return cookies;
}

/**
 * Cookie-name tokens that carry a session or a credential, matched WHOLE.
 *
 * ⚠️ Whole-token, not substring, and that is the entire point of this shape. The
 * previous version was a substring/suffix regex and it fired on ordinary cookies:
 * `auth` matched inside `author` and `authorized_locale`, `logged` matched inside
 * `logged_out`, and an `_at$` rule matched every `created_at` / `updated_at` /
 * `expires_at` / `last_seen_at` timestamp cookie there is. Since these keys are
 * HIGH-confidence, each of those was a P2 "your session cookie is exposed to XSS"
 * on correct configuration.
 *
 * `user`/`uid`/`id` are deliberately absent: an anonymous-id cookie is routinely
 * named `uid`/`user_id` and MUST stay JS-readable.
 */
const SESSION_NAME_TOKENS = new Set([
  "sess", "session", "sid",
  "auth", "authorization", "authn", "oauth",
  "token", "jwt", "csrf", "xsrf",
  "login", "remember", "identity",
]);

/**
 * Anchored patterns for the run-together forms a separator split cannot reach.
 * Each is anchored at BOTH ends against one token, so it can only ever match a
 * whole word — `^[a-z]{0,6}sess…` reaches `phpsessid` and `jsessionid` without
 * reaching `assessment_id`'s neighbours the way a bare `sess` substring did.
 *
 * ⚠️ FOURTH-PASS FALSE NEGATIVE. `^…sess(?:ion)?s?(?:id)?$` could not reach
 * Drupal's session cookie, whose name is `SESS`/`SSESS` followed by an md5 of the
 * site identifier — `SSESS8c1b8f5e3d2a4b6c7d8e9f0a1b2c3d4e` classified FALSE, so
 * a Drupal site with a JS-readable session cookie was reported "not assessed".
 * Drupal is one of the largest CMS platforms in the world, so that was a miss
 * across a very large population. Added as its own ANCHORED pattern (sess/ssess
 * plus a hex run of digest length), never by widening a substring.
 */
const SESSION_TOKEN_PATTERNS = [
  /^[a-z]{0,6}sess(?:ion)?s?(?:id|key|token)?$/, // sess · session · sessionid · sessid · sessionkey · phpsessid · jsessionid
  /^s?sess[0-9a-f]{32,64}$/,             // Drupal: SESS<md5> · SSESS<md5>
  /^[a-z0-9]{0,6}sid$/,                  // sid · ssid · Google's __Secure-1PSID
  /^[a-z0-9]{0,8}token$/,                // token · csrftoken (Django) · authtoken · accesstoken
];

/**
 * Words that describe something ABOUT a credential, or a wholly different
 * artefact that merely borrows a credential noun. A name carrying one of these is
 * not itself a credential, so it must not be graded as one.
 *
 * ⚠️ FOURTH-PASS FALSE POSITIVE, re-opened through a narrower door. Whole-token
 * matching fixed `logged_out`/`created_at`, but `token`, `login` and `identity`
 * are weak nouns on their own, so `consent_token`, `cookie_consent_token`,
 * `token_expiry`, `last_login`, `login_hint`, `login_redirect` and
 * `identity_provider` all classified as session-shaped. A consent record, a
 * timestamp, an IdP name and a return URL are not session credentials, and
 * WARNing on them is audit item 12's class of finding all over again.
 *
 * ⚠️ Entries are added only where the word cannot appear in a real credential
 * name — the veto direction is a FALSE NEGATIVE on a live credential, which is
 * worse. `next` is deliberately absent: `next-auth.session-token` is real.
 */
const NON_CREDENTIAL_QUALIFIERS = new Set([
  "consent", "hint", "provider", "redirect",
  "expiry", "expires", "expiration", "timeout", "ttl",
  "last", "count", "prompt", "banner", "dismissed", "preference", "preferences",
]);

/**
 * A cookie name split into whole words.
 *
 * ⚠️ Case boundaries are separators too. `sessionKey` and `jwtAccessToken` are
 * ordinary camelCase cookie names and both classified FALSE while the split was
 * on punctuation alone, because the whole name became one unrecognised token.
 * Splitting `([a-z0-9])([A-Z])` reaches them AND puts the qualifier veto in play
 * for `consentToken`, which a widened substring rule would have missed. All-caps
 * names have no such boundary, so `PHPSESSID` and `SSESS<md5>` are untouched.
 */
function splitCookieName(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Adjacent token PAIRS. `logged` on its own cannot separate `logged_in` (a real
 * GitHub/WordPress auth cookie) from `logged_out` (a flag), so the pair is the
 * unit that carries the meaning.
 */
const SESSION_TOKEN_PAIRS: Array<[string, string]> = [
  ["logged", "in"],
  ["signed", "in"],
];

/**
 * Full names no token rule can reach, because the name is not composed of words.
 * `li_at` is LinkedIn's session cookie; a generic `_at` suffix rule is what made
 * every `created_at` cookie a finding, so known names go here one at a time.
 *
 * ⚠️ A name nothing here knows is a SKIP, so every miss is a false negative on a
 * real credential. Add observed names — never a broad suffix rule.
 */
const SESSION_COOKIE_NAMES = new Set(["li_at"]);

/**
 * Names that plausibly carry a session. HttpOnly is a defect only on these:
 * a consent, analytics or anonymous-id cookie has to be readable by the script
 * that owns it, so warning about it is warning about correct configuration.
 *
 * Verified against the observed names in both directions — `sessionid`,
 * `connect.sid`, `PHPSESSID`, `JSESSIONID`, `auth_token`, `jwt`, `remember_me`,
 * Laravel's `remember_web_<hash>`, `wordpress_logged_in_<hash>`, `li_at` and
 * `logged_in` match; `created_at`, `updated_at`, `expires_at`, `last_seen_at`,
 * `author`, `authorized_locale`, `logged_out`, `_ga`, `_gid`, `_v-consent`,
 * `_v-anonymous-id`, `cf_bm` and `_tracker` do not.
 *
 * Also verified: Drupal's `SESS<md5>`/`SSESS<md5>`, `sessionKey` and
 * `jwtAccessToken` match; `consent_token`, `cookie_consent_token`, `token_expiry`,
 * `last_login`, `login_hint`, `login_redirect` and `identity_provider` do not.
 */
export function looksLikeSessionCookie(name: string): boolean {
  const lowered = name.toLowerCase();
  // The curated exact names are explicit, so they outrank every rule below.
  if (SESSION_COOKIE_NAMES.has(lowered)) return true;
  const tokens = splitCookieName(name);
  // A credential noun qualified by a non-credential word describes something
  // about a credential, not the credential. Checked before the token rules so it
  // vetoes `token`/`login`/`identity` wherever they appear in the name.
  if (tokens.some((token) => NON_CREDENTIAL_QUALIFIERS.has(token))) return false;
  for (const token of tokens) {
    if (SESSION_NAME_TOKENS.has(token)) return true;
    if (SESSION_TOKEN_PATTERNS.some((pattern) => pattern.test(token))) return true;
  }
  return tokens.some((token, index) =>
    SESSION_TOKEN_PAIRS.some(([first, second]) => token === first && tokens[index + 1] === second));
}

/**
 * Parse a CSP into its directives. Per CSP §"parse a serialized policy", a
 * directive repeated in one policy is honoured on its FIRST occurrence only.
 */
export function parseCspDirectives(policy: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const segment of policy.split(";")) {
    const parts = segment.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    const name = parts[0].toLowerCase();
    if (!directives.has(name)) directives.set(name, parts.slice(1));
  }
  return directives;
}

// CSP Level 3 fallback chains. `script-src-elem` governs <script> ELEMENTS;
// `script-src-attr` governs inline event-handler ATTRIBUTES (onclick=, onerror=).
// Both fall back to `script-src`, then `default-src`.
const SCRIPT_ELEMENT_FALLBACK = ["script-src-elem", "script-src", "default-src"] as const;
const SCRIPT_ATTRIBUTE_FALLBACK = ["script-src-attr", "script-src", "default-src"] as const;

export type InlineScriptLane = {
  /** The directive that governs this lane, or null when the policy names none. */
  directive: string | null;
  hasUnsafeInline: boolean;
  hasNonce: boolean;
  hasHash: boolean;
  /** True when arbitrary injected script in this lane cannot execute. */
  strict: boolean;
};

export type InlineScriptPolicy = InlineScriptLane & {
  /** The lane governing inline event-handler attributes, which can differ from the element lane. */
  attribute: InlineScriptLane;
};

function evaluateLane(directives: Map<string, string[]>, chain: readonly string[]): InlineScriptLane {
  for (const name of chain) {
    const values = directives.get(name);
    if (!values) continue;
    const lowered = values.map((value) => value.toLowerCase().replace(/^'|'$/g, ""));
    const hasUnsafeInline = lowered.includes("unsafe-inline");
    const hasNonce = lowered.some((value) => value.startsWith("nonce-"));
    const hasHash = lowered.some((value) => /^sha(256|384|512)-/.test(value));
    return {
      directive: name,
      hasUnsafeInline,
      hasNonce,
      hasHash,
      // No unsafe-inline at all ⇒ inline script is blocked outright, which is
      // stricter than a nonce, not weaker. The old code WARNed on exactly that.
      // A nonce or hash also blocks event-handler attributes, which can never
      // carry one — so the same rule reads correctly in both lanes.
      strict: hasNonce || hasHash || !hasUnsafeInline,
    };
  }
  return { directive: null, hasUnsafeInline: false, hasNonce: false, hasHash: false, strict: false };
}

/**
 * Decide whether a policy actually controls inline script.
 *
 * ⚠️ CSP Level 3: `'unsafe-inline'` is ignored only when a nonce or hash appears
 * in the SAME directive. A nonce on `style-src` does nothing for scripts — which
 * is why this parses per-directive instead of testing the whole header for the
 * substring `nonce-`. developer.mozilla.org (hash-pinned `script-src`, and
 * `unsafe-inline` only on `style-src`) was reported as unrestricted; linear.app
 * (`script-src 'unsafe-inline' 'self' blob:`, no nonce or hash anywhere) is a
 * genuine finding and must keep failing.
 *
 * ⚠️ And a strict `script-src-elem` is NOT on its own proof that inline script
 * cannot run: it governs `<script>` elements only. With
 * `script-src 'unsafe-inline'; script-src-elem 'self'` an injected
 * `<img onerror=…>` still executes, because event handlers resolve through
 * `script-src-attr` → `script-src`. `strict` therefore requires BOTH lanes.
 */
export function evaluateInlineScriptPolicy(policy: string): InlineScriptPolicy {
  const directives = parseCspDirectives(policy);
  const element = evaluateLane(directives, SCRIPT_ELEMENT_FALLBACK);
  const attribute = evaluateLane(directives, SCRIPT_ATTRIBUTE_FALLBACK);
  return { ...element, attribute, strict: element.strict && attribute.strict };
}

/**
 * Elements the HTML parser keeps in the head. Anything else — or character data —
 * means the body has started, which is where a `<meta>` CSP stops being honoured.
 * (HTML Standard, "the in head insertion mode".)
 */
const HEAD_PERMITTED_TAGS = new Set([
  "html", "head", "base", "basefont", "bgsound", "link", "meta", "noscript",
  "script", "style", "template", "title",
]);

/** The index just past the tag opening at `open`, ignoring any `>` inside a quoted attribute. */
function tagEnd(html: string, open: number): number {
  let quote = "";
  for (let i = open + 1; i < html.length; i += 1) {
    const char = html[i];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return i + 1;
    }
  }
  return html.length;
}

/**
 * Blank the text that is not document content — comments, and the contents of
 * elements whose children are text or an inert fragment — so it cannot be read
 * as body text or mistaken for the start of the body.
 *
 * `template`/`noscript` are included because their contents are inert: markup
 * inside them is not in the document, so a `<div>` in a head `<template>` must
 * not end the head. This only moves the BOUNDARY — which `<meta>` tags are read
 * out of the head slice is still decided by stripInertRegions, unchanged.
 *
 * Replacements are the SAME LENGTH as what they replace, so every index still
 * refers to the original string and the caller can slice that instead.
 */
function blankNonContent(html: string): string {
  return html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, (match) => " ".repeat(match.length))
    .replace(/(<(title|script|style|textarea|template|noscript)\b[^>]*>)([\s\S]*?)(<\/\2\s*>|$)/gi,
      (_match, open: string, _tag: string, body: string, close: string) => open + " ".repeat(body.length) + close);
}

/**
 * The document head, which is the only place a `<meta http-equiv>` CSP is honoured.
 *
 * ⚠️ Unscoped, this read is a false PASS waiting to happen: a documentation page
 * that shows a meta-CSP example inside `<pre>` in the BODY would turn a site with
 * no CSP at all into "inline script is blocked outright". Browsers ignore a meta
 * CSP outside the head, so scoping is both the fix and the spec.
 *
 * ⚠️ And the boundary cannot be `</head>`-or-`<body>`-or-give-up: a document that
 * emits NEITHER tag (both are optional in HTML, and a fragment or a hand-written
 * page routinely omits them) fell back to scanning the WHOLE document, so
 * `<html><h1>docs</h1><meta http-equiv=…>` was read as a live policy. The implied
 * head is walked instead, and it always ends somewhere: at the first element the
 * parser cannot keep in head, or at the first non-whitespace character data. A
 * document with neither really is all head — `<html><meta http-equiv=…>` IS an
 * enforced policy in a browser — so that one is still read, correctly.
 */
function documentHead(html: string): string {
  const closing = /<\/head\s*>/i.exec(html);
  if (closing) return html.slice(0, closing.index);
  const scan = blankNonContent(html);
  let i = 0;
  while (i < scan.length) {
    if (scan[i] !== "<") {
      if (!/\s/.test(scan[i])) return html.slice(0, i); // character data starts the body
      i += 1;
      continue;
    }
    if (scan[i + 1] === "!" || scan[i + 1] === "?") { // doctype, CDATA, processing instruction
      i = tagEnd(scan, i);
      continue;
    }
    const name = /^<\/?([a-z][a-z0-9-]*)/i.exec(scan.slice(i, i + 32))?.[1]?.toLowerCase();
    if (!name) return html.slice(0, i); // a bare "<" is character data
    if (scan[i + 1] !== "/" && !HEAD_PERMITTED_TAGS.has(name)) return html.slice(0, i);
    i = tagEnd(scan, i);
  }
  return html;
}

/** Regions whose text is markup-inert (a sample, a comment, or script data), so a tag inside them is not a tag. */
function stripInertRegions(html: string): string {
  return html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, " ")
    .replace(/<(script|style|textarea|pre|code|samp|xmp|template)\b[\s\S]*?(?:<\/\1\s*>|$)/gi, " ");
}

/**
 * A CSP delivered by `<meta http-equiv>`. It is genuinely enforced, so a policy
 * found here must not be reported as "no CSP" — but `frame-ancestors`,
 * `report-uri` and `sandbox` are ignored in meta delivery, so only the inline-script
 * verdict may read it. HTML-escaped prose (`&lt;meta …`) cannot match, because the
 * pattern requires a literal `<`.
 */
export function readMetaCsp(html: string): string {
  const scoped = stripInertRegions(documentHead(html));
  const tag = /<meta[^>]*http-equiv\s*=\s*(?:"content-security-policy"|'content-security-policy'|content-security-policy(?=[\s>]))[^>]*>/i.exec(scoped);
  if (!tag) return "";
  const content = /content\s*=\s*"([^"]*)"/i.exec(tag[0]) ?? /content\s*=\s*'([^']*)'/i.exec(tag[0]);
  return content?.[1]?.trim() ?? "";
}

/**
 * Schemes that can serve an ARBITRARY REMOTE PAGE, which is the only kind of
 * origin this check measures: "could an attacker's website frame you?"
 *
 * ⚠️ FOURTH-PASS FALSE POSITIVE. The bare-scheme rule below was unconditional
 * (`/^[a-z][a-z0-9+.-]*:$/`), so a policy that genuinely restricts web framing
 * while additionally admitting an app or extension context was WARNed with an
 * explanation that was untrue of it:
 *
 *   frame-ancestors 'self' chrome-extension:   → "permits every origin"
 *   frame-ancestors 'self' blob:               → same
 *   frame-ancestors 'self' data:               → same
 *
 * `blob:`, `data:` and `filesystem:` are derived contexts with no remote
 * publisher; `chrome-extension:`, `moz-extension:`, `capacitor:`, `tauri:` and
 * `file:` are locally-installed contexts the visitor's own machine already
 * trusts. None of them lets a WEBSITE frame the page.
 *
 * `pulse-scan.ts`'s `permitsEveryOrigin` was gated this way in the third pass;
 * this copy is the same rule and was missed. Keep the two sets in step.
 */

/**
 * A `frame-ancestors` source that permits every origin, so its presence is not
 * clickjacking protection: a bare wildcard host (`*`, `*:*`, `*:443`), a bare
 * remote-page scheme (`https:`), or a scheme with a wildcard host (`https://*`,
 * `//*`, `https://*:*`, `https://*:443`).
 *
 * ⚠️ `*:443` is every origin on that port, not a restriction — it PASSed here
 * (and still does in `pulse-scan.ts`, which is a cross-file follow-up) because
 * the wildcard-host rule required the `//`.
 */


/**
 * Whether a `frame-ancestors` source list actually restricts who may frame the page.
 * The list is a union, so ONE permit-all source makes the whole directive permissive
 * — `frame-ancestors 'self' *` restricts nothing. An empty list is not evidence of
 * protection either.
 */
export { restrictsFraming } from "./csp-sources";

export type ExposedKeyMatch = { kind: string; redacted: string };

// Extensions a build tool fingerprints. A `sk-`-prefixed hex run sitting in front
// of one of these is a content digest in a filename, not a credential.
const ASSET_EXTENSION = /^\.(?:svg|png|jpe?g|gif|webp|avif|ico|css|m?js|cjs|map|woff2?|ttf|otf|eot|json|xml|txt|pdf|wasm)(?![a-z0-9])/i;

/** The nearest URL/attribute delimiter before `index`, or null within the look-back window. */
function precedingDelimiter(html: string, index: number): string | null {
  for (let i = index - 1; i >= 0 && index - i <= 200; i -= 1) {
    if (/[/?=&#"'\s(),;:]/.test(html[i])) return html[i];
  }
  return null;
}

/**
 * Whether a digest-shaped match is a FILENAME FINGERPRINT rather than a key.
 *
 * gov.uk's P1 "rotate credentials immediately" was the letters `sk-` inside
 * `govuk-icon-mask-cdf42651…bb6.svg` plus that file's public SHA-256 digest.
 *
 * ⚠️ Being all-hex is NOT sufficient on its own to reject, and the first cut of
 * this guard got that wrong: DeepSeek and several other OpenAI-compatible issuers
 * mint keys as `sk-` + 32 lowercase hex, so rejecting every hex tail silently
 * DISCARDED a genuinely leaked key — a false negative in place of a false
 * positive. So the reject also requires the match to sit in an asset-path
 * position: immediately in front of a file extension, or as the fingerprint
 * suffix of a filename inside a URL PATH segment (never a query value, which is
 * where a leaked key legitimately shows up).
 */
export function isFilenameFingerprint(html: string, match: string, index: number): boolean {
  if (!/^[0-9a-f]+$/i.test(match.slice(3))) return false; // not digest-shaped at all
  const after = html.slice(index + match.length, index + match.length + 16);
  if (ASSET_EXTENSION.test(after)) return true;
  // `…/govuk-icon-mask-<hex>` with no extension: still a path segment whose stem
  // ends in a separator, i.e. `<name>-<digest>`. A query value (`?key=sk-…`) has
  // `=` or `&` as its nearest delimiter and is never rejected here.
  return precedingDelimiter(html, index) === "/" && /[-_.]$/.test(html.slice(Math.max(0, index - 1), index));
}

// Every prefix is anchored on its left. Without `(?<![A-Za-z0-9])` the `sk-`
// alternative matches mid-token — mask-/task-/disk-/desk-/risk-/kiosk-/flask-
// followed by a fingerprint hash all matched, and filename fingerprinting is the
// default in Vite/webpack/Rails.
const API_KEY_RULES: Array<{
  kind: string;
  pattern: RegExp;
  reject?: (html: string, match: string, index: number) => boolean;
}> = [
  { kind: "Google API key", pattern: /(?<![A-Za-z0-9])AIza[0-9A-Za-z_-]{35}/g },
  { kind: "AWS access key id", pattern: /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}/g },
  { kind: "GitHub personal access token", pattern: /(?<![A-Za-z0-9])ghp_[A-Za-z0-9]{36}/g },
  { kind: "OpenAI-style secret key", pattern: /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{32,}/g, reject: isFilenameFingerprint },
];

/** Credential-shaped strings in the page source, redacted so the report never republishes one. */
export function findExposedApiKeys(html: string): ExposedKeyMatch[] {
  const found: ExposedKeyMatch[] = [];
  for (const rule of API_KEY_RULES) {
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    for (const match of html.matchAll(pattern)) {
      const secret = match[0];
      if (rule.reject?.(html, secret, match.index ?? 0)) continue;
      found.push({ kind: rule.kind, redacted: `${secret.slice(0, 6)}… (${secret.length} chars)` });
      break; // one instance per rule is enough to act on
    }
  }
  return found;
}

/** Group names declared by a `Reporting-Endpoints` response header (`name="url", other="url"`). */
export function reportingEndpointGroups(header: string): string[] {
  return header
    .split(",")
    .map((entry) => /^\s*([A-Za-z0-9_.-]+)\s*=/.exec(entry)?.[1] ?? "")
    .filter(Boolean);
}

/** The group NEL sends its reports to, per the `NEL` header's `report_to` member. */
export function nelReportGroup(header: string): string | null {
  return /"report_to"\s*:\s*"([^"]+)"/.exec(header)?.[1] ?? null;
}

/**
 * Whether a reporting endpoint exists that CSP could plausibly be using.
 *
 * ⚠️ `Report-To` is deliberately NOT accepted here. It is the generic Reporting
 * API v0 header, not a CSP header, and Cloudflare emits it together with `NEL`
 * on a very large share of its zones for Network Error Logging — so treating its
 * presence as "CSP reporting is configured" PASSes every Cloudflare-fronted site
 * that reports nothing about CSP at all. A `report-to` GROUP counts only when the
 * policy itself names it in a `report-to` directive, and that case is already
 * covered by reading the policy.
 *
 * `Reporting-Endpoints` (Reporting API v1) IS accepted, because a CSP `report-to`
 * cannot resolve without it — but not when its only group is the one the `NEL`
 * header claims, which is the same false PASS one header along.
 */
export function cspReportingEndpointPresent(reportingEndpoints: string, nelHeader: string): boolean {
  const groups = reportingEndpointGroups(reportingEndpoints);
  if (groups.length === 0) return false;
  const nelGroup = nelReportGroup(nelHeader);
  if (!nelGroup) return true;
  return groups.some((group) => group !== nelGroup);
}

/** Header names that advertise a rate limit, RFC 9331 draft naming plus the common X- variants. */
export function rateLimitHeaderNames(headers: Record<string, string>): string[] {
  return Object.keys(headers).filter((key) =>
    /^(ratelimit(-|$)|x-ratelimit-|x-rate-limit-|retry-after$)/.test(key.toLowerCase()));
}

/**
 * Whether this response is an API response rather than a document. `X-RateLimit-*`
 * is an API convention and `Retry-After` is a 429/503 header, so their absence on
 * a cached `text/html` page is not a finding — it is the wrong response class.
 */
export function isApiResponseClass(contentType: string): boolean {
  const value = contentType.toLowerCase();
  if (!value || value.includes("html")) return false;
  return /json|xml|graphql|grpc|protobuf/.test(value);
}

export async function runSecurityExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { pageResult, httpsUrl, hostname, htmlLower, catchAll200 } = ctx;
  const h = pageResult.headers;

  if (platformIs(ctx.platform, "IOS_APP", "ANDROID_APP", "CROSS_PLATFORM_MOBILE")) {
    return skip(CATEGORIES.SECURITY, CHECKS, "Not applicable — native mobile apps are not web servers.");
  }

  const checks: PulseScanCheckInput[] = [];

  // COOP
  const hasCoop = !!h["cross-origin-opener-policy"];
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "cross_origin_opener_policy", label: "Cross-Origin-Opener-Policy (COOP)", status: hasCoop ? "PASS" : "WARN", detail: hasCoop ? `COOP header present: ${h["cross-origin-opener-policy"]}` : "No COOP header — a window this document opens, or that opens it, keeps a cross-origin reference to it, and cross-origin isolation stays off (so Spectre-class side channels are not mitigated). Set Cross-Origin-Opener-Policy: same-origin, or same-origin-allow-popups if you open OAuth popups." });

  // CORP
  const hasCorp = !!h["cross-origin-resource-policy"];
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "cross_origin_resource_policy", label: "Cross-Origin-Resource-Policy (CORP)", status: hasCorp ? "PASS" : "WARN", detail: hasCorp ? `CORP header: ${h["cross-origin-resource-policy"]}` : "No CORP header — resources can be embedded by any origin. Set to same-site or same-origin to prevent cross-origin information leakage." });

  // COEP
  const hasCoep = !!h["cross-origin-embedder-policy"];
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "cross_origin_embedder_policy", label: "Cross-Origin-Embedder-Policy (COEP)", status: hasCoep ? "PASS" : "WARN", detail: hasCoep ? `COEP header: ${h["cross-origin-embedder-policy"]}` : "No COEP header — required alongside COOP to enable cross-origin isolation and SharedArrayBuffer." });

  // ── CSP context, shared by the three checks that are entailed by csp_header ──
  // Reporting is conventionally attached to a REPORT-ONLY policy, and since
  // Chrome 96 `report-to` needs a companion `reporting-endpoints` response header
  // to resolve its group name at all. Reading only the enforced header made a
  // working pipeline (vercel.com) invisible.
  const csp = h["content-security-policy"] ?? "";
  const cspReportOnly = h["content-security-policy-report-only"] ?? "";
  const metaCsp = readMetaCsp(pageResult.html);
  const reportingEndpoints = h["reporting-endpoints"] ?? "";
  const reportToHeader = h["report-to"] ?? "";
  const nelHeader = h["nel"] ?? "";

  // CSP report directive. When there is no policy at all this is not a second
  // finding — you cannot have a report-uri in a policy that does not exist, so it
  // defers to csp_header rather than counting the same fact twice.
  const reportDirectiveIn = (policy: string) => /report-uri|report-to/i.test(policy);
  const policyReports = reportDirectiveIn(csp) || reportDirectiveIn(cspReportOnly);
  // See cspReportingEndpointPresent: a bare `Report-To` response header is NOT
  // evidence of CSP reporting (Cloudflare sets it for NEL, zone-wide).
  const endpointHeaderPresent = cspReportingEndpointPresent(reportingEndpoints, nelHeader);
  if (policyReports || (endpointHeaderPresent && (csp || cspReportOnly))) {
    const where = reportDirectiveIn(cspReportOnly) && !reportDirectiveIn(csp)
      ? "the report-only policy"
      : "the enforced policy";
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "csp_report_directive",
      label: "CSP report-uri / report-to configured",
      status: "PASS",
      confidence: policyReports ? undefined : "MEDIUM",
      confidenceReason: policyReports ? undefined : "A Reporting-Endpoints header was read, but no report-to/report-uri was visible in the policy on this response.",
      detail: policyReports
        ? `CSP report endpoint configured in ${where}${endpointHeaderPresent ? ", with a matching Reporting-Endpoints response header" : ""} — policy violations are captured.`
        : "A Reporting-Endpoints response header declares a reporting group, so a violation-reporting pipeline is configured. Pulse did not see report-to or report-uri inside the policy on this response — some hosts send these headers on a sample of requests only.",
      evidence: policyReports ? (reportingEndpoints || reportToHeader || undefined) : (reportingEndpoints || undefined),
    });
  } else if (!csp && !cspReportOnly) {
    checks.push(notAssessed("csp_report_directive", "CSP report-uri / report-to configured",
      "Not assessed — this response sent no Content-Security-Policy (enforced or report-only), so there is no policy that could carry a report-uri/report-to. See the Content-Security-Policy finding; this is the same fact, not a second one."));
  } else {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "csp_report_directive",
      label: "CSP report-uri / report-to configured",
      status: "WARN",
      confidence: "MEDIUM",
      confidenceReason: "Derived from the absence of a directive and of a Reporting-Endpoints header on a single response; some hosts sample these headers.",
      detail: `No CSP reporting configured on this response — the policy carries no report-uri/report-to and there is no Reporting-Endpoints group for it to resolve against, so policy violations and injection attempts are not reported anywhere.${reportToHeader || nelHeader ? " This response does carry a `Report-To`/`NEL` header, but that is the Network Error Logging pipeline (Cloudflare sets it zone-wide) — it collects nothing about CSP unless the policy itself names its group." : " Note `report-to` also needs a `Reporting-Endpoints` header to resolve its group name."}`,
    });
  }

  // Rate limiting headers. `X-RateLimit-*` is an API convention and `Retry-After`
  // is a 429/503 header, so asking a cached text/html document for them can only
  // ever produce a finding. The probed equivalent — api_rate_limit_headers in
  // api-behaviour.ts — owns this against a real API request.
  const rateLimitHeaders = rateLimitHeaderNames(h);
  const hasRateLimit = rateLimitHeaders.length > 0;
  if (hasRateLimit) {
    checks.push({ category: CATEGORIES.SECURITY, checkKey: "rate_limiting_headers", label: "Rate-limiting headers present", status: "PASS", detail: `Rate-limiting headers returned on this response (${rateLimitHeaders.slice(0, 4).join(", ")}) — clients can pace themselves before being throttled.`, evidence: rateLimitHeaders.slice(0, 4).join(", ") });
  } else if (!isApiResponseClass(h["content-type"] ?? "")) {
    checks.push(notAssessed("rate_limiting_headers", "Rate-limiting headers present",
      `Not assessed — this response is a document (${h["content-type"] || "no content-type"}), not an API response, and rate-limit headers are an API convention. Whether your API advertises a limit is graded by the API rate-limit check, which asks a real API endpoint.`));
  } else {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "rate_limiting_headers",
      label: "Rate-limiting headers present",
      status: "WARN",
      confidence: "MEDIUM",
      confidenceReason: "Derived from the absence of a header on one response; a header alone is not proof of a limit either way.",
      detail: "No rate-limit headers (`RateLimit-*`, `X-RateLimit-*`, `Retry-After`) on this API response, so a client has no way to pace itself and discovers your limit by hitting it. Their absence is also consistent with there being no limit at all.",
    });
  }

  // CAA DNS record. Both this and DNSSEC below conclude from an EMPTY answer, so
  // a failed lookup must not reach them — it would report a record the domain may
  // well have as missing.
  const caa = await resolveDnsRecord(hostname, "CAA");
  if (!caa.ok) {
    checks.push(probeInconclusive(CATEGORIES.SECURITY, "caa_dns_record", "CAA DNS record (cert authority restriction)",
      `The CAA lookup for ${hostname} did not complete (${caa.reason}).`));
  } else {
    const hasCaa = caa.records.length > 0;
    checks.push({ category: CATEGORIES.SECURITY, checkKey: "caa_dns_record", label: "CAA DNS record (cert authority restriction)", status: hasCaa ? "PASS" : "WARN", detail: hasCaa ? `CAA record found — only authorised CAs can issue certificates for this domain.` : "No CAA record — any certificate authority can issue SSL certificates for your domain. Add a CAA record to restrict issuance to your CA." });
  }

  // DNSSEC
  const ds = await resolveDnsRecord(hostname, "DS");
  if (!ds.ok) {
    checks.push(probeInconclusive(CATEGORIES.SECURITY, "dnssec_enabled", "DNSSEC enabled on domain",
      `The DS lookup for ${hostname} did not complete (${ds.reason}).`));
  } else {
    const hasDnssec = ds.records.length > 0;
    checks.push({ category: CATEGORIES.SECURITY, checkKey: "dnssec_enabled", label: "DNSSEC enabled on domain", status: hasDnssec ? "PASS" : "WARN", detail: hasDnssec ? "DNSSEC DS record found — DNS responses are cryptographically signed." : "No DNSSEC detected — DNS responses are unauthenticated and vulnerable to cache poisoning attacks." });
  }

  // Certificate expiry (check for Strict-Transport-Security max-age or server header)
  const stsHeader = h["strict-transport-security"] ?? "";
  const maxAgeMatch = stsHeader.match(/max-age=(\d+)/);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;
  const certExpirySoon = maxAge > 0 && maxAge < 30 * 24 * 3600;
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "certificate_expiry_30d", label: "SSL cert not expiring within 30 days", status: certExpirySoon ? "WARN" : "PASS", detail: certExpirySoon ? "HSTS max-age is very short — may indicate certificate expiring soon. Verify renewal is automated (Let's Encrypt / certbot)." : "Certificate appears valid with adequate HSTS max-age." });

  // ── Exposed-file / endpoint probes ───────────────────────────────────────────
  // Two failure modes to avoid on SPA / Vercel / Next.js hosts that serve their
  // app shell (200) for ANY path:
  //   • Direct files (.env.prod, .DS_Store, composer.json, package.json) are
  //     content-verified — a real exposure serves its own bytes, not the HTML
  //     shell — so verifyFileExposure() rejects a soft-200.
  //   • Endpoints (/swagger-ui, /actuator, /metrics, /graphql) can legitimately
  //     return HTML/JSON, so content alone can't disambiguate; when the host is a
  //     catch-all (catchAll200) these probes are inconclusive → PASS with a note.
  const isJsonBody = (body: string, ct: string) =>
    ct.includes("json") || /^\s*[[{]/.test(body);
  const [dsStoreExposed, composerExposed, packageJsonExposed, swaggerStatus, actuatorStatus, prometheusStatus, graphqlStatus, envProdExposed, envDockerExposed] = await Promise.all([
    verifyFileExposure(`${httpsUrl}/.DS_Store`),
    verifyFileExposure(`${httpsUrl}/composer.json`, isJsonBody),
    verifyFileExposure(`${httpsUrl}/package.json`, isJsonBody),
    headRequest(`${httpsUrl}/swagger-ui`),
    headRequest(`${httpsUrl}/actuator`),
    headRequest(`${httpsUrl}/metrics`),
    headRequest(`${httpsUrl}/graphql`),
    verifyFileExposure(`${httpsUrl}/.env.prod`),
    verifyFileExposure(`${httpsUrl}/.env.docker`),
  ]);

  // Endpoint exposure only counts when the host is NOT a catch-all 200 host.
  const swaggerExposed   = !catchAll200 && swaggerStatus === 200;
  const actuatorExposed  = !catchAll200 && actuatorStatus === 200;
  const metricsExposed   = !catchAll200 && prometheusStatus === 200;
  const graphqlPresent   = !catchAll200 && graphqlStatus === 200;
  const endpointNote = catchAll200 ? CATCH_ALL_NOTE : "";

  checks.push({ category: CATEGORIES.SECURITY, checkKey: "no_exposed_ds_store", label: ".DS_Store not publicly accessible", status: dsStoreExposed ? "FAIL" : "PASS", detail: dsStoreExposed ? "CRITICAL: .DS_Store file accessible — exposes directory structure and filenames to attackers." : ".DS_Store not accessible." });
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "no_exposed_composer_json", label: "composer.json not at web root", status: composerExposed ? "WARN" : "PASS", detail: composerExposed ? "composer.json accessible at web root — exposes PHP dependency list and potential vulnerable package versions." : "composer.json not accessible at web root." });
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "no_exposed_package_json_root", label: "package.json not served at root", status: packageJsonExposed ? "WARN" : "PASS", detail: packageJsonExposed ? "package.json accessible — exposes dependency list, scripts, and potentially internal tooling details." : "package.json not served at web root." });
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "no_exposed_swagger_open", label: "Swagger UI not open in production", status: swaggerExposed ? "WARN" : "PASS", detail: swaggerExposed ? "Swagger UI appears publicly accessible — ensure API documentation requires authentication in production." : "Swagger UI not found at /swagger-ui." + endpointNote });
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "no_exposed_actuator", label: "/actuator endpoints not public", status: actuatorExposed ? "FAIL" : "PASS", detail: actuatorExposed ? "CRITICAL: Spring Boot Actuator endpoint publicly accessible — exposes heap dumps, env vars, and internal metrics." : "/actuator not publicly accessible." + endpointNote });
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "no_exposed_prometheus_metrics", label: "/metrics endpoint not public", status: metricsExposed ? "WARN" : "PASS", detail: metricsExposed ? "/metrics endpoint is publicly accessible — may expose internal infrastructure details and business metrics." : "/metrics endpoint not publicly accessible." + endpointNote });

  // GraphQL introspection. The probe failing is NOT evidence that introspection is
  // off — that inversion previously turned any timeout into a clean PASS.
  let gqlIntrospectionOff = true;
  let gqlProbeError: string | null = null;
  if (graphqlPresent) {
    try {
      const gqlRes = await fetchWithTimeout(`${httpsUrl}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ __schema { types { name } } }" }),
        signal: AbortSignal.timeout(5000),
      });
      const body = await gqlRes.text();
      gqlIntrospectionOff = !body.includes("__schema");
    } catch (error) {
      gqlProbeError = error instanceof Error ? error.message : "introspection query failed";
    }
  }
  if (gqlProbeError) {
    checks.push(probeInconclusive(CATEGORIES.SECURITY, "no_graphql_introspection_prod", "GraphQL introspection disabled in prod",
      `A GraphQL endpoint responded at /graphql but the introspection query did not complete (${gqlProbeError}). Re-run the scan, or send the introspection query by hand.`));
  } else {
    checks.push({ category: CATEGORIES.SECURITY, checkKey: "no_graphql_introspection_prod", label: "GraphQL introspection disabled in prod", status: graphqlPresent && !gqlIntrospectionOff ? "WARN" : "PASS", detail: graphqlPresent && !gqlIntrospectionOff ? "GraphQL introspection is enabled — attackers can enumerate your entire API schema. Disable introspection in production." : "GraphQL introspection appears disabled or endpoint not present." });
  }

  // Source maps
  const hasSourceMaps = /\.js\.map["']/i.test(pageResult.html) || /sourceMappingURL=/i.test(pageResult.html);
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "no_exposed_source_maps", label: "Source maps not served with page", status: hasSourceMaps ? "WARN" : "PASS", detail: hasSourceMaps ? "Source map references detected in page HTML — production source maps expose your application source code to anyone who opens DevTools." : "No source map references detected in page HTML." });

  // API keys in HTML. This verdict tells an owner to rotate a credential, so it
  // must not fire on a filename fingerprint — see findExposedApiKeys.
  const exposedKeys = findExposedApiKeys(pageResult.html);
  checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "no_api_keys_in_html",
    label: "No API key patterns in HTML source",
    status: exposedKeys.length > 0 ? "FAIL" : "PASS",
    detail: exposedKeys.length > 0
      ? `CRITICAL: credential-shaped string in the page source — ${exposedKeys.map((key) => `${key.kind} ${key.redacted}`).join("; ")}. Confirm it against the redacted value below, then rotate it; a key served in HTML is readable by anyone who views source.`
      : "No obvious API key patterns detected in HTML source.",
    evidence: exposedKeys.length > 0 ? exposedKeys.map((key) => `${key.kind}: ${key.redacted}`).join("; ") : undefined,
  });

  // CSRF tokens
  const hasCsrf = /name=["']_csrf["']|name=["']csrf_token["']|name=["']authenticity_token["']|csrf-token/i.test(pageResult.html);
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "csrf_protection_signals", label: "CSRF token protection detected", status: hasCsrf ? "PASS" : "WARN", detail: hasCsrf ? "CSRF token detected in page HTML — form submissions are protected against cross-site request forgery." : "No CSRF token detected — ensure state-changing requests use CSRF protection (synchroniser tokens or SameSite cookies)." });

  // Bot protection
  const hasCfBot = !!h["cf-mitigated"] || htmlLower.includes("__cf_bm") || htmlLower.includes("cf-turnstile");
  const hasRecaptcha = htmlLower.includes("recaptcha") || htmlLower.includes("hcaptcha");
  const hasBotProtection = hasCfBot || hasRecaptcha;
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "bot_protection_present", label: "Bot protection (Cloudflare / reCAPTCHA)", status: hasBotProtection ? "PASS" : "WARN", detail: hasBotProtection ? "Bot protection signals detected (Cloudflare / reCAPTCHA / hCaptcha)." : "No bot protection detected — consider Cloudflare Turnstile, hCaptcha, or similar to protect forms and auth endpoints." });

  // SQL error exposure
  const hasSqlError = /SQL syntax|mysql_fetch|ORA-\d{5}|pg_query|You have an error in your SQL syntax/i.test(pageResult.html);
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "sql_error_exposure", label: "No SQL errors exposed in responses", status: hasSqlError ? "FAIL" : "PASS", detail: hasSqlError ? "CRITICAL: SQL error message detected in page response — exposes database structure and confirms SQL injection vectors." : "No SQL error messages detected in page response." });

  // Brute force protection
  const hasBruteForce = htmlLower.includes("account locked") || htmlLower.includes("too many attempts") || htmlLower.includes("temporarily disabled") || hasRateLimit;
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "brute_force_protection", label: "Brute force / rate limit on auth", status: hasBruteForce ? "PASS" : "WARN", detail: hasBruteForce ? "Account lockout or rate limiting signals detected on authentication." : "No brute force protection signals found — ensure login endpoints have rate limiting and lockout policies." });

  // ── Cookie flags, evaluated per cookie ──────────────────────────────────────
  // The previous version tested /httponly/i against the JOINED header, which is
  // wrong in both directions: one HttpOnly cookie among ten passed the whole set
  // (the damaging direction — a genuinely exposed session cookie reported clean),
  // and three consent/analytics cookies that MUST be JS-readable were reported as
  // session cookies exposed to XSS theft.
  const setCookie = h["set-cookie"] ?? "";
  const cookies = parseSetCookieHeader(setCookie);
  const names = (list: ParsedCookie[]) => list.map((cookie) => `\`${cookie.name}\``).join(", ");

  const sessionCookies = cookies.filter((cookie) => looksLikeSessionCookie(cookie.name));
  const exposedSessionCookies = sessionCookies.filter((cookie) => !cookie.httpOnly);
  if (cookies.length === 0) {
    checks.push(notAssessed("session_cookie_httponly", "HttpOnly flag on session cookies",
      "Not assessed — this response set no cookies, so there is no cookie to check the HttpOnly flag on."));
  } else if (sessionCookies.length === 0) {
    checks.push(notAssessed("session_cookie_httponly", "HttpOnly flag on session cookies",
      `Not assessed — this response set ${cookies.length} cookie(s) (${names(cookies)}) and none is named like a session cookie. A consent, analytics or anonymous-id cookie has to be readable by the script that owns it, so HttpOnly is not expected on it.`));
  } else {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "session_cookie_httponly",
      label: "HttpOnly flag on session cookies",
      status: exposedSessionCookies.length > 0 ? "WARN" : "PASS",
      detail: exposedSessionCookies.length > 0
        ? `Session-shaped cookie(s) set without HttpOnly: ${names(exposedSessionCookies)} — readable by any injected script, so an XSS becomes a session hijack. (Checked each cookie separately: ${names(sessionCookies)}.)`
        : `HttpOnly set on every session-shaped cookie on this response (${names(sessionCookies)}) — JavaScript cannot read them.`,
      evidence: names(sessionCookies),
    });
  }

  // SameSite applies to every cookie, not only session cookies — a cross-site
  // request carries all of them — so this one is not name-filtered.
  const noSameSite = cookies.filter((cookie) => cookie.sameSite === null);
  if (cookies.length === 0) {
    checks.push(notAssessed("session_cookie_samesite", "SameSite attribute on cookies",
      "Not assessed — this response set no cookies, so there are no cookie attributes to check."));
  } else {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "session_cookie_samesite",
      label: "SameSite attribute on cookies",
      status: noSameSite.length > 0 ? "WARN" : "PASS",
      detail: noSameSite.length > 0
        ? `Cookie(s) set without a SameSite attribute: ${names(noSameSite)} — set SameSite=Lax or Strict explicitly. Chromium now defaults an unmarked cookie to Lax, but that default is not universal and is not something to rely on. (Checked each of the ${cookies.length} cookie(s) separately.)`
        : `Every cookie on this response carries a SameSite attribute (${names(cookies)}) — CSRF via cross-site navigation is mitigated.`,
      evidence: names(cookies),
    });
  }

  // CSP frame-ancestors. Header-only on purpose: frame-ancestors is ignored when a
  // policy is delivered by <meta http-equiv>, so a meta policy cannot satisfy it.
  const frameAncestorSources = parseCspDirectives(csp).get("frame-ancestors");
  const hasCspFrameAncestors = !!frameAncestorSources;
  const hasXfo = !!h["x-frame-options"];
  if (hasCspFrameAncestors) {
    const allowed = frameAncestorSources.join(" ");
    const restricting = restrictsFraming(frameAncestorSources);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "csp_frame_ancestors",
      label: "frame-ancestors in CSP policy",
      // ⚠️ Presence is not protection. `frame-ancestors *` (or a bare scheme, or
      // `https://*`) permits every origin, so the directive is present and framing
      // is unrestricted. PASSing it also contradicted clickjackingVerdict in
      // pulse-scan.ts, which WARNs on the same response.
      status: restricting ? "PASS" : "WARN",
      detail: restricting
        ? `CSP frame-ancestors directive present${allowed ? ` (${allowed})` : ""} — clickjacking protection via CSP, which supersedes X-Frame-Options.`
        : `CSP sets frame-ancestors${allowed ? ` \`${allowed}\`, which permits every origin` : " with no source list, which browsers reject as a parse error"} — so it does not restrict who may frame this page and is not clickjacking protection. Name the origins that may embed you, or use 'none'/'self'.${hasXfo ? " X-Frame-Options is set on this response, but frame-ancestors supersedes it where both are honoured." : ""}`,
      evidence: allowed || undefined,
    });
  } else if (!csp) {
    checks.push(notAssessed("csp_frame_ancestors", "frame-ancestors in CSP policy",
      `Not assessed — this response sent no Content-Security-Policy header, so there is no policy that could carry frame-ancestors. See the Content-Security-Policy finding; this is the same fact, not a second one.${hasXfo ? " X-Frame-Options is set on this response and is still honoured by browsers, so framing is restricted." : " Framing is graded separately by the X-Frame-Options check."}`));
  } else {
    checks.push({ category: CATEGORIES.SECURITY, checkKey: "csp_frame_ancestors", label: "frame-ancestors in CSP policy", status: "WARN", detail: `CSP present but it sets no frame-ancestors directive${hasXfo ? ", so framing rests on X-Frame-Options alone" : ", and no X-Frame-Options header was sent either — nothing restricts who may frame this page"}. Add frame-ancestors: it is the modern, per-origin form of clickjacking protection.` });
  }

  // .env variants
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "no_exposed_env_variants", label: ".env.prod / .env.docker not accessible", status: (envProdExposed || envDockerExposed) ? "FAIL" : "PASS", detail: (envProdExposed || envDockerExposed) ? "CRITICAL: .env.prod or .env.docker accessible — environment secrets are exposed." : ".env variant files not publicly accessible." });

  // Secrets / keys in HTML (broader check)
  const hasSecretPatterns = /password\s*=\s*["'][^"']{8,}["']|secret\s*=\s*["'][^"']{8,}["']/i.test(pageResult.html);
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "secret_scanning_github", label: "No secrets / keys in page HTML", status: hasSecretPatterns ? "FAIL" : "PASS", detail: hasSecretPatterns ? "Potential hardcoded secret or password detected in page source. Review and rotate if confirmed." : "No hardcoded secret patterns detected in page HTML." });

  // CORS credentials
  const corsOrigin = h["access-control-allow-origin"] ?? "";
  const corsCredentials = h["access-control-allow-credentials"] ?? "";
  const badCors = corsOrigin === "*" && corsCredentials.toLowerCase() === "true";
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "cors_credentials_restricted", label: "CORS credentials not open to all origins", status: badCors ? "FAIL" : "PASS", detail: badCors ? "CRITICAL: CORS allows all origins (*) with credentials — this configuration is invalid and dangerous. Specify explicit allowed origins." : "CORS credentials configuration appears safe." });

  // Vulnerable library versions (basic jQuery check from existing + old Angular)
  const hasOldLib = /jquery[/-]1\.[0-6]\./i.test(pageResult.html) || /angular\.js.*1\.[0-3]\./i.test(pageResult.html);
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "dependency_audit_clean", label: "No obvious vulnerable library versions", status: hasOldLib ? "WARN" : "PASS", detail: hasOldLib ? "Outdated library version detected — check npm audit / Dependabot for known CVEs." : "No obviously vulnerable library versions detected in page source." });

  // Subdomain takeover (CNAME to common unclaimed services). The PASS here rests on
  // an EMPTY answer, so a failed lookup must not reach it — see resolveDnsRecord.
  const cname = await resolveDnsRecord(hostname, "CNAME");
  if (!cname.ok) {
    checks.push(probeInconclusive(CATEGORIES.SECURITY, "subdomain_takeover_risk", "No dangling CNAME / subdomain takeover risk",
      `The CNAME lookup for ${hostname} did not complete (${cname.reason}), so dangling-CNAME risk could not be assessed.`));
  } else {
    const dangling = ["s3.amazonaws.com", "azurewebsites.net", "herokuapp.com", "pages.github.io", "ghost.io", "cargo.site", "surge.sh", "bitbucket.io"];
    const subTakeoverRisk = cname.records.some((r) => dangling.some((d) => r.includes(d)));
    checks.push({ category: CATEGORIES.SECURITY, checkKey: "subdomain_takeover_risk", label: "No dangling CNAME / subdomain takeover risk", status: subTakeoverRisk ? "FAIL" : "PASS", detail: subTakeoverRisk ? "CNAME points to a cloud service that may be unclaimed — subdomain takeover risk. Verify the target resource still exists." : "No obvious dangling CNAME records detected." });
  }

  // ── Inline-script control (nonce / hash / no unsafe-inline) ─────────────────
  // Parsed per directive. The old whole-header substring test could not tell
  // script-src from style-src, said "uses unsafe-inline" about policies that
  // contain none, and did not recognise CSP Level 3 hashes as strict CSP.
  const enforcedPolicy = csp || metaCsp;
  if (!enforcedPolicy) {
    checks.push(notAssessed("content_security_policy_nonce", "CSP uses nonces (not unsafe-inline)",
      `Not assessed — this response sent no enforced Content-Security-Policy, so there is no policy that could carry a nonce or a hash. See the Content-Security-Policy finding; this is the same fact, not a second one.${cspReportOnly ? " A report-only policy is present, which observes violations but enforces nothing." : ""}`));
  } else {
    const inline = evaluateInlineScriptPolicy(enforcedPolicy);
    const source = csp ? "the Content-Security-Policy header" : "a <meta http-equiv> Content-Security-Policy";
    let detail: string;
    if (!inline.directive) {
      detail = `CSP present in ${source} but it sets no script-src, script-src-elem or default-src, so the policy does not restrict script execution at all.`;
    } else if (!inline.attribute.strict && inline.directive !== inline.attribute.directive) {
      // The element lane is strict but the ATTRIBUTE lane is not. `script-src-elem`
      // governs <script> elements only; an injected `<img onerror=…>` resolves
      // through script-src-attr → script-src, where 'unsafe-inline' still permits
      // it. Claiming "inline script is blocked outright" here would be false.
      const attrGoverns = inline.attribute.directive === "script-src-attr"
        ? "inline EVENT HANDLERS are governed by `script-src-attr`, which allows 'unsafe-inline' with no nonce or hash"
        : `inline EVENT HANDLERS are governed by \`script-src-attr\`, which this policy does not set — so they fall back to \`${inline.attribute.directive}\`, which allows 'unsafe-inline' with no nonce or hash`;
      detail = `\`${inline.directive}\` restricts inline \`<script>\` elements, but ${attrGoverns}. An injected \`onerror=\`/\`onclick=\` attribute therefore still executes, so CSP does not block inline script outright. Set \`script-src-attr 'none'\` (or remove 'unsafe-inline' from \`${inline.attribute.directive}\`).`;
    } else if (inline.hasNonce || inline.hasHash) {
      const mechanism = inline.hasNonce && inline.hasHash ? "a nonce and hashes" : inline.hasNonce ? "a nonce" : "hashes (sha256/384/512)";
      detail = `\`${inline.directive}\` pins inline scripts with ${mechanism}, so injected inline script cannot execute.${inline.hasUnsafeInline ? " The directive also lists 'unsafe-inline', which supporting browsers ignore in the presence of a nonce or hash — that is the standard backwards-compatible form, not a weakness." : ""}`;
    } else if (!inline.hasUnsafeInline) {
      detail = `\`${inline.directive}\` does not allow 'unsafe-inline', so inline script is blocked outright — stricter than a nonce, and nothing to change.`;
    } else {
      detail = `\`${inline.directive}\` allows 'unsafe-inline' with no nonce and no hash in that same directive, so any injected inline script executes and CSP gives no XSS protection for scripts. CSP Level 3 only lets a nonce or hash neutralise 'unsafe-inline' within the same directive — a nonce on style-src does not cover scripts. Add a per-response nonce (or hashes) to \`${inline.directive}\`.`;
    }
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "content_security_policy_nonce",
      label: "CSP uses nonces (not unsafe-inline)",
      status: inline.strict ? "PASS" : "WARN",
      detail,
      evidence: inline.directive ? `${inline.directive}: ${parseCspDirectives(enforcedPolicy).get(inline.directive)?.slice(0, 8).join(" ") ?? ""}` : undefined,
    });
  }

  return checks;
}
