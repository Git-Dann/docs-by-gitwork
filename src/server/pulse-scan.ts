import { CATEGORIES, type CheckCategory } from "./pulse-checks/categories";
import { safeGithubRequest, parseGithubRepo, hasGithubToken } from "@/lib/github";
import type { PulseCheckStatus, PulseScanCheckInput, PulseScanInputType } from "@/types/pulse";
import { runExtendedChecks } from "./pulse-scan-extended";
import { collectorCompletenessCheck } from "./pulse-checks/collector-health";
import {
  type JurisdictionCode,
  CHECK_JURISDICTIONS,
  checkAppliesToMarkets,
  detectMarketsFromPage,
} from "./pulse-checks/jurisdictions";
import { computeScoreBreakdown } from "./pulse-checks/score-breakdown";
import { detectAiBuilder } from "./pulse-checks/vibe-code-hygiene";
import { detectSpaContext, isEmptyShell as isEmptyRenderShell, reclassifySpaChecks, staticTextWordCount } from "./pulse-lite/spa-detect";
import { permitsEveryOrigin } from "./pulse-checks/csp-sources";
import { analyzeHost, boundedDmarcCandidates, organizationalDomainCandidates, registrableDomain } from "./pulse-lite/registrable-domain";
import { isMateriallyRicher, runRenderAgent, type RenderResult } from "./pulse-agents/render-agent";
import {
  applyNativeApplicability,
  nativeTechStack,
  type NativePlatform,
} from "./pulse-checks/native-mobile";
import { detectRepoShape, getRepoSnapshot, type SnapshotShape } from "./pulse-checks/native-repo";
import { runStandardsVerificationCatalog } from "./pulse-checks/standards-verification";
import { fetchScannableUrl } from "./pulse-lite/url-guard";
import {
  detectUrlSurfaceKind,
  getInapplicableCategoryDetails,
  isCategoryApplicable,
  keepApplicableChecks,
  type UrlSurfaceKind,
} from "./pulse-checks/platform-applicability";
import {
  effectivePlatformForRepoShape,
  shouldRunDeepUrlChecks,
} from "./pulse-checks/scan-execution-plan";

export const SCAN_VERSION = "pulse-v3";

const FETCH_TIMEOUT_MS = 10_000;

type UrlType = "web" | "app_store" | "play_store";

function detectUrlType(url: string): UrlType {
  const lower = url.toLowerCase();
  if (lower.includes("apps.apple.com") || lower.includes("itunes.apple.com")) return "app_store";
  if (lower.includes("play.google.com/store/apps")) return "play_store";
  return "web";
}

type FetchResult = {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  html: string;
  responseTimeMs: number;
  finalUrl: string;
};

async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  /** Passed through to the SSRF-guarded transport. See fetchScannableUrl's options. */
  guard?: { followRedirects?: boolean },
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetchScannableUrl(url, { ...options, signal: controller.signal }, {}, guard);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPage(url: string): Promise<FetchResult | null> {
  try {
    const start = Date.now();
    const response = await fetchWithTimeout(url, {
      redirect: "follow",
      headers: { "User-Agent": "Gitwork-Pulse/1.0" },
    });
    const responseTimeMs = Date.now() - start;
    const html = await response.text().catch(() => "");
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    return { ok: response.ok, status: response.status, headers, html, responseTimeMs, finalUrl: response.url };
  } catch {
    return null;
  }
}

async function headRequest(url: string): Promise<number> {
  try {
    const response = await fetchWithTimeout(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": "Gitwork-Pulse/1.0" },
    });
    return response.status;
  } catch {
    return 0;
  }
}

// Inspect how an HTTP URL responds WITHOUT following redirects, so we can see the
// redirect itself (301/302/307/308 + Location) instead of its final destination.
// With redirect:"follow", an http→https redirect resolves to the final 200 and a
// naive "is it 3xx?" test wrongly concludes the site doesn't redirect. Server-side
// (undici) returns the real 3xx status + headers under redirect:"manual". Falls
// back to GET when HEAD is rejected (405/501).
async function inspectRedirect(url: string): Promise<{ status: number; location: string }> {
  const probe = async (method: "HEAD" | "GET") => {
    const response = await fetchWithTimeout(
      url,
      { method, redirect: "manual", headers: { "User-Agent": "Gitwork-Pulse/1.0" } },
      // Essential, not cosmetic: the guarded transport follows redirects itself, so
      // without this the 3xx this function exists to observe is invisible and every
      // correctly-configured site reads as "does not redirect to HTTPS".
      { followRedirects: false },
    );
    return { status: response.status, location: response.headers.get("location") ?? "" };
  };
  try {
    let res = await probe("HEAD");
    if (res.status === 405 || res.status === 501 || res.status === 0) {
      res = await probe("GET");
    }
    return res;
  } catch {
    return { status: 0, location: "" };
  }
}

// GET a path and return enough to distinguish a real exposed file from a
// soft-200. SPA / Vercel / Next.js hosts commonly serve the app-shell HTML with
// status 200 for ANY unknown path, so a status-only probe would false-positive
// on every "exposed file" check. The body + content-type let us tell them apart.
async function probePath(
  url: string,
  // 2000 bytes is enough to tell a raw file from an HTML shell, which is what
  // every exposure probe needs. A caller that must read a rendered PAGE (the
  // legal-document verifier below reads <title>/<h1>) asks for more, because a
  // heading can sit past 2KB of <head>.
  maxChars = 2000,
): Promise<{ status: number; contentType: string; body: string }> {
  try {
    const response = await fetchWithTimeout(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "Gitwork-Pulse/1.0" },
    });
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    let body = "";
    try {
      body = (await response.text()).slice(0, maxChars);
    } catch {
      /* body unreadable — treat as empty */
    }
    return { status: response.status, contentType, body };
  } catch {
    return { status: 0, contentType: "", body: "" };
  }
}

// True when a 200 response is actually the site's HTML shell (an SPA / catch-all
// soft-200) rather than the raw file we asked for.
function isHtmlShell(contentType: string, body: string): boolean {
  if (contentType.includes("text/html")) return true;
  const head = body.trimStart().slice(0, 300).toLowerCase();
  return (
    head.startsWith("<!doctype html") ||
    head.startsWith("<html") ||
    head.includes("<head") ||
    head.includes("__next_data__") ||
    head.includes('id="root"') ||
    head.includes('id="__next"')
  );
}

// Content-verified existence probe: a 200 only counts if the body is the actual
// resource (not the SPA/catch-all HTML shell), optionally matching an expected
// shape (e.g. XML for a sitemap, JSON for a manifest). This makes "does file X
// exist?" checks CORRECT on catch-all hosts (Vercel/Lovable/Replit/Bolt) rather
// than merely suppressed — a real robots.txt/sitemap/manifest still passes.
async function fileServed(
  url: string,
  looksRight?: (body: string, contentType: string) => boolean,
): Promise<boolean> {
  const r = await probePath(url);
  if (r.status !== 200) return false;
  if (isHtmlShell(r.contentType, r.body)) return false;
  return looksRight ? looksRight(r.body, r.contentType) : true;
}

// ─── Legal documents: privacy policy + terms of service ──────────────────────
//
// These two checks are the only ones in the URL family that a release gate
// treats as non-negotiable (`release-decision.ts` blockingKeys) and that
// `priority.ts` ranks as launch-blocking. So both error directions are
// expensive, in opposite ways:
//
//   · a false FAIL tells a prospect their launch is blocked by a document that
//     is linked from the footer Pulse just parsed. Two of the six sites in the
//     July 2026 false-positive audit got exactly that as their headline P1;
//   · a false PASS silently unblocks the gate for a site with no policy at all.
//
// The old implementation was a single regex over the static HTML, which produced
// the first error on two real shapes and could only ever guess at the second:
//
//   1. HYPHENATION. `href="/help/terms-conditions"` — the standard UK form, used
//      across GOV.UK. The token list held `terms-and-conditions`, and the
//      matcher required a `/` before the token and a terminator after it, so
//      "terms" (followed by `-`) and "conditions" (preceded by `-`) both missed.
//   2. A LEGAL HUB. `href="https://www.ycombinator.com/legal/"` — one page
//      holding both documents. The `/legal/…privacy` fallback needed the word
//      inside the href, so a bare hub missed.
//
// Widening the regex alone would have fixed (1) and made (2) worse: matching a
// bare `/legal/` link as proof PASSES a site whose Legal page contains no
// privacy policy. So the widened matcher is paired with a CONTENT VERIFY — the
// same discipline `security_txt` already uses at its `fileServed` call — and a
// link is only ever upgraded to PASS on evidence read out of the fetched page.
//
// Three rules hold the honesty line, and each has a unit test:
//   · CONFIRMATION IS PROMINENT-TEXT ONLY. The signal must appear in a <title>
//     or an <h1>–<h3>, never anywhere in the body. Almost every homepage footer
//     contains the literal words "Privacy Policy" as link text, so a body-wide
//     match would let a catch-all host confirm its own shell.
//   · A HUB MUST BE THE SAME ORGANISATION. Candidate URLs are restricted to the
//     scanned host's registrable domain, so a link to a VENDOR's `/legal` page
//     can never be credited to the scanned site.
//   · "COULD NOT READ" IS INCONCLUSIVE, NOT FAIL AND NOT PASS. On a catch-all
//     host, or an SPA route whose policy text is rendered by JS, neither
//     presence nor absence is establishable from outside — so the check says so
//     (§35).
//
// AND THE RELEASE GATE NOW CARRIES THAT ACROSS — verify the mechanism before
// trusting this paragraph, because it was false for a while. An INCONCLUSIVE on
// either of these two keys reaches `evaluateReleaseGate` in `release-decision.ts`
// via its `unestablishedBlockers` filter (any `policy.blockingKeys` member whose
// status is INCONCLUSIVE / ERROR / NOT_TESTED — SKIPPED and NOT_APPLICABLE are
// deliberately excluded), which pushes the GateReason `BLOCKING_CONTROL_UNESTABLISHED`
// onto `unverified`; a non-EVIDENCE_REQUIRED entry in `unverified` forces the
// decision to INCONCLUSIVE, and INCONCLUSIVE outranks READY. Measured on a scan
// differing only in these two verdicts:
//
//   privacy_policy/terms_of_service = FAIL          → CONDITIONAL, score 50
//                                                     (HEALTH_BELOW_FLOOR + UNRESOLVED_FAILURES)
//   the same scan, both = INCONCLUSIVE              → INCONCLUSIVE, BLOCKING_CONTROL_UNESTABLISHED
//
// Before that filter existed the second row returned READY, score 100, unverified []
// — byte-identical to an all-PASS run — because `unverified` was populated only by
// COVERAGE_BELOW_FLOOR, REQUIRED_COLLECTOR_UNAVAILABLE and EVIDENCE_REQUIRED, and two
// checks out of ~800 cannot pull coverage under the 70% floor. So an INCONCLUSIVE here
// is now genuinely "the gate holds and says why", not merely "the score stopped
// counting it". `release-gate-unestablished.test.ts` pins it.
//
// ⚠️ The WARN branch (a policy published but linked from nowhere) is a different
// matter and still reads READY: `reservations` filters on `status === "FAIL"`. That is
// deliberate — the document exists — but do not read this paragraph as covering it.

export type LegalDocKind = "privacy" | "terms";

/**
 * Path-token patterns identifying a link to each document.
 *
 * Multi-word tokens accept `-`, `_` or nothing as the internal separator, and an
 * optional `and`, so `terms-conditions`, `terms-and-conditions`, `terms_of_use`
 * and `termsofservice` are one pattern rather than four list entries that a
 * fifth real-world spelling can slip between.
 *
 * The single-word forms (`privacy`, `terms`) still require a TERMINATOR, which
 * is what keeps `/privacy-shield-explained` and `/terms-glossary` out.
 */
const LEGAL_HREF_TOKENS: Record<LegalDocKind, string> = {
  privacy: [
    // Combined documents satisfy both kinds — listed first so the longer form wins.
    "privacy[-_]?and[-_]?terms",
    "terms[-_]?and[-_]?privacy",
    // ⚠️ Deliberately NOT here: `privacy-choices` and `privacy-cent(re|er)`. The
    // first is the CCPA opt-out CONTROL, the second a hub that may or may not hold
    // the document — accepting either would let a site with no policy at all PASS a
    // launch-blocking legal check. A hub gets a content-verified fetch instead.
    "privacy(?:[-_]?(?:policy|policies|notice|notices|statement))?",
    "privacypolicy",
    // ⚠️ Must be in THIS list as well as LEGAL_PREFIXABLE_TOKENS. It was added only
    // to the prefixable list, which requires a preceding `(?:[a-z0-9]+[-_])+` prefix
    // segment — so `/legal/our-data-protection-notice` matched while the far commoner
    // UK/EU footer form `href="/data-protection-policy"` returned FALSE and still took
    // a P1 launch blocker. Reproduced against the shipped matcher before this line.
    "data[-_]protection[-_](?:policy|notice|statement)",
    "datenschutz(?:erklaerung|erklarung)?",
    "politique[-_]?de[-_]?confidentialite",
    "confidentialite",
    "privacidad",
    "privacybeleid",
    "privacyverklaring",
    "personvern",
    "tietosuoja",
  ].join("|"),
  terms: [
    "privacy[-_]?and[-_]?terms",
    "terms[-_]?and[-_]?privacy",
    "terms(?:[-_]?(?:and[-_]?)?(?:of[-_]?(?:service|use|sale|business)|conditions|service|use))?",
    "termsofservice",
    "termsandconditions",
    "tos",
    "conditions(?:[-_]?(?:of[-_]?use|generales))?",
    "agb",
    "nutzungsbedingungen",
    // ⚠️ `mentions-legales` is deliberately absent: it is the French IMPRINT
    // (company identification), not terms of service, so accepting it would pass
    // a site that has one and no CGV.
  ].join("|"),
};

/**
 * The UNAMBIGUOUS multi-word forms, which may additionally carry a brand or scope
 * PREFIX on their own path segment.
 *
 * Found by sweeping ten real homepages after the first fix landed: the hyphenation
 * problem has two sides and only the right-hand one had been fixed.
 * `/help/terms-conditions` (a suffix variant) matched; `github-terms-of-service` did
 * not, because the matcher requires the token to start immediately after a `/` and
 * that segment starts with `github-`. Verified live 2026-08-22 — GitHub's footer links
 * `docs.github.com/site-policy/github-terms/github-terms-of-service` (HTTP 200) and
 * Pulse reported `terms_of_service: FAIL`, a P1 launch blocker.
 *
 * ⚠️ ONLY the multi-word forms may take a prefix, and that restriction is the whole
 * design. Allowing a prefix before the bare words would match `/glossary-of-terms`,
 * `/search-terms`, `/payment-terms` and `/company-privacy-first-approach` — PASSing a
 * site that publishes no policy at all, which on a launch-blocking legal gate is a far
 * worse outcome than the false positive being fixed. `privacy-policy` and
 * `terms-of-service` are not ambiguous; `terms` on its own very much is.
 */
const LEGAL_PREFIXABLE_TOKENS: Record<LegalDocKind, string> = {
  privacy: [
    "privacy[-_](?:policy|policies|notice|notices|statement|statements)",
    "data[-_]protection[-_](?:policy|notice|statement)",
  ].join("|"),
  terms: [
    "terms[-_](?:and[-_])?(?:of[-_])?(?:service|use|sale|business|conditions)",
    "terms[-_]and[-_]conditions",
  ].join("|"),
};

/**
 * Last-segment patterns for a LEGAL HUB — one page holding several documents.
 *
 * A hub is never proof on its own; matching one only earns the page a single
 * fetch, after which the verdict comes from what the page actually said.
 */
const LEGAL_HUB_TOKENS = [
  "legal",
  "legals",
  "legal[-_]notice",
  "legal[-_]notices",
  "legal[-_]information",
  "legal[-_]info",
  "legal[-_]terms",
  "policies",
  "policy",
].join("|");

/**
 * Phrases that identify each document when they appear in a heading or title.
 *
 * Deliberately the DOCUMENT'S OWN NAME, not the topic: "privacy" alone appears
 * in headings such as "Your privacy matters" on marketing pages.
 */
const LEGAL_CONTENT_SIGNALS: Record<LegalDocKind, RegExp> = {
  privacy:
    /privacy\s+(?:policy|policies|notice|statement)|data\s+protection\s+(?:policy|notice|statement)|datenschutzerkl|politique\s+de\s+confidentialit|pol[íi]tica\s+de\s+privacidad|privacyverklaring|privacybeleid/i,
  terms:
    /terms\s+(?:of\s+(?:service|use|sale|business)|and\s+conditions|&(?:amp;)?\s*conditions)|terms\s*&(?:amp;)?\s*conditions|conditions\s+of\s+use|allgemeine\s+gesch|nutzungsbedingungen|conditions\s+g[ée]n[ée]rales/i,
};

/** Every `href` value in the markup, in document order. */
export function extractHrefs(html: string): string[] {
  const out: string[] = [];
  const re = /href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) out.push(match[1]);
  return out;
}

/**
 * Elements whose CONTENT is not part of the rendered, navigable page.
 *
 * `script` and `textarea` hold raw/escapable-raw text — a browser never parses tags
 * out of them. `template` content is inert until something instantiates it, and
 * `noscript` content is not parsed as markup at all when scripting is enabled.
 */
const INERT_ELEMENTS: ReadonlySet<string> = new Set(["script", "template", "noscript", "textarea"]);

/**
 * Drop the parts of a document a browser never renders: HTML comments, and the
 * contents of `<script>` / `<template>` / `<noscript>` / `<textarea>`.
 *
 * ⚠️ THIS EXISTS BECAUSE A COMMENTED-OUT LINK CLEARED A LAUNCH-BLOCKING LEGAL GATE.
 * The legal matcher and `extractHrefs` both ran over the whole raw document, so
 *
 *     <!-- <a href="https://privacy.example.com">old link</a> -->
 *
 * satisfied `privacy_policy` — a release-gate blocking key that also hard-caps the
 * score at 65. Commenting the footer out is what a site looks like halfway through a
 * redesign, i.e. the one moment it genuinely has no reachable policy was the moment
 * Pulse reported that it had one. Same class as §34.3's "comments were matched as
 * code", one layer out from source files into markup.
 *
 * ⚠️ AND IT IS A SCANNER, NOT A REGEX, FOR THE SAME REASON `stripSwiftComments` HAD
 * TO PRESERVE STRING LITERALS. A `<` inside a QUOTED ATTRIBUTE VALUE is ordinary text
 * to a browser, so `/<!--[\s\S]*?-->/` starts matching at the `<!--` in
 *
 *     <a data-tpl="<!--" href="/privacy-policy">Privacy</a><!-- gone --><a …>
 *
 * and runs to the next real `-->`, swallowing the LIVE privacy link between them.
 * That is the fix buying the false negative it was written to remove. So tags are
 * copied verbatim with quote awareness, and only a `<!--` outside a tag opens a
 * comment. An unterminated comment runs to the end of the document, exactly as a
 * browser treats it. A `<` that opens nothing (`1 < 2`) is ordinary text and is kept.
 *
 * Removed regions are replaced by a single space so the text either side cannot fuse
 * into a token that was never in the document.
 */
export function stripInertMarkup(html: string): string {
  const tagName = /\/?([a-zA-Z][a-zA-Z0-9:-]*)/y;
  let out = "";
  let i = 0;
  const n = html.length;

  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);

    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      out += " ";
      i = end < 0 ? n : end + 3;
      continue;
    }

    tagName.lastIndex = lt + 1;
    const name = tagName.exec(html)?.[1]?.toLowerCase();
    if (!name) {
      // Not a tag start: a bare `<` in text, a `<!DOCTYPE`, a `<?xml`. Keep it and
      // carry on reading — skipping past it would drop real markup after it.
      out += "<";
      i = lt + 1;
      continue;
    }

    // Copy the tag through, honouring quoted attribute values so neither a `>` nor a
    // `<!--` inside one can end the tag or open a comment.
    let j = lt + 1;
    let quote: '"' | "'" | null = null;
    while (j < n) {
      const ch = html[j];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        j += 1;
        break;
      }
      j += 1;
    }
    const tag = html.slice(lt, j);
    out += tag;
    i = j;

    // A close tag, an ordinary element or a self-closed one encloses nothing to drop.
    if (html[lt + 1] === "/" || !INERT_ELEMENTS.has(name) || tag.endsWith("/>")) continue;

    const close = new RegExp(`</${name}\\s*>`, "i").exec(html.slice(i));
    if (!close) {
      // Unclosed: like a browser, treat the rest of the document as its content.
      out += " ";
      i = n;
      continue;
    }
    out += ` ${close[0]}`;
    i += close.index + close[0].length;
  }

  return out;
}

/**
 * Extensions a legal DOCUMENT is plausibly served as.
 *
 * ⚠️ This list is the whole reason the dot is allowed as a terminator at all, and
 * it must never be widened to "any extension". The terminator was briefly `[/.]`
 * — a bare dot — to support `href="privacy.html"` (Hacker News writes its footer
 * that way). That also made every ASSET whose filename merely STARTS with a legal
 * token satisfy a LAUNCH-BLOCKING check, with no fetch anywhere in the path, so no
 * content-verify could catch it. Reproduced against the shipped matcher:
 *
 *   href="/assets/terms.css"      → terms_of_service   PASS
 *   href="/build/privacy.min.css" → privacy_policy     PASS
 *   href="/css/conditions.css"    → terms_of_service   PASS
 *   href="/js/tos.min.js"         → terms_of_service   PASS
 *   href="/img/privacy.svg"       → privacy_policy     PASS
 *
 * A build that emits a `terms.<hash>.css` chunk, or a footer with a `privacy.svg`
 * icon, therefore cleared both release-gate blocking keys and lifted the 65-point
 * score cap on a site with no policies at all. `.pdf` stays: a PDF terms of
 * service is a real, common shape.
 */
const LEGAL_DOC_EXTENSIONS = "html|htm|xhtml|shtml|php|aspx?|jsp|pdf|txt|md";

/**
 * True when the page links the named document directly.
 *
 * Accepts a locale prefix, a trailing slash, an absolute URL, a query or
 * fragment, a document extension (see LEGAL_DOC_EXTENSIONS), and a bare relative
 * href with no leading slash (`href="privacy.html"`, which is how Hacker News
 * writes its footer).
 *
 * ⚠️ Reads the RENDERABLE document only — see `stripInertMarkup`. A link inside an
 * HTML comment, a `<script>` string literal or an uninstantiated `<template>` is not
 * a link, and crediting one cleared a launch-blocking legal gate. Both paths below
 * and the host-label branch all run on the stripped markup; `linksLegalDocument` is
 * also the entry point callers use directly, so the strip has to happen HERE and not
 * only in `resolveLegalDocumentChecks`.
 */
export function linksLegalDocument(html: string, kind: LegalDocKind, scannedHost?: string): boolean {
  const renderable = stripInertMarkup(html);
  const lower = renderable.toLowerCase();
  // A `/`, a quote, a `#`, a `?` or end-of-href ends the token. A DOT ends it only
  // when what follows is a document extension — never `.css`, `.js`, `.svg`, `.png`,
  // `.json`, `.map`, `.woff2`, `.xml` or an intermediate segment such as `.min.css`.
  //
  // ⚠️ `\\.` — a LITERAL dot, and the escape has to survive the template literal.
  // Written `\.` here it collapsed to a bare `.` before the RegExp ever saw it, i.e.
  // "any one character", so the terminator was <any char> + document extension and
  // these four all matched:
  //     /terms-html   /privacy_md   /tos9pdf   /privacyQtxt
  // Harmless in practice only because real assets end in a NON-document extension —
  // but the guarantee the LEGAL_DOC_EXTENSIONS note above states was not the
  // guarantee the code provided, and one `.html`-adjacent asset name would have been
  // enough to clear both launch-blocking keys.
  const terminator = `(?:/|["'#?]|$|\\.(?:${LEGAL_DOC_EXTENSIONS})(?:["'#?/]|$))`;

  // (a) The token begins a path segment: /privacy, /help/terms-conditions, privacy.html.
  const cleanSegment = new RegExp(
    `href=["'](?:[^"']*/)?(?:${LEGAL_HREF_TOKENS[kind]})${terminator}`,
    "i",
  );
  if (cleanSegment.test(lower)) return true;

  // (b) An unambiguous multi-word form preceded by a brand/scope prefix on the same
  //     segment: github-terms-of-service, company-privacy-policy. Restricted to the
  //     multi-word forms — see LEGAL_PREFIXABLE_TOKENS for why that matters.
  const prefixedSegment = new RegExp(
    `href=["'](?:[^"']*/)?(?:[a-z0-9]+[-_])+(?:${LEGAL_PREFIXABLE_TOKENS[kind]})${terminator}`,
    "i",
  );
  if (prefixedSegment.test(lower)) return true;

  // (c) The document lives on its OWN SUBDOMAIN, so the token is in the HOST and
  //     there is nothing in the path for (a) or (b) to match.
  return linksLegalHostLabel(renderable, kind, scannedHost);
}

/**
 * True when the page links a same-organisation host whose leading label IS the
 * document token — `https://privacy.example.com`, `https://terms.example.com`.
 *
 * A residual false positive from the path-matcher work: both of those returned false
 * and took a P1 launch blocker, while `https://legal.example.com/privacy`,
 * `https://www.example.com/privacy` and `//example.com/privacy` all matched — the
 * token was only ever looked for in the PATH.
 *
 * Three guards, and each one is load-bearing on a launch-blocking legal gate:
 *
 *  1. SAME ORGANISATION, via the same `sameOrganisation()` helper the hub candidates
 *     use. A stranger's `privacy.` host is not this site's policy, and where the
 *     registrable domain cannot be established the helper declines rather than
 *     guessing (see `registrable-domain.ts`'s honesty contract).
 *  2. THE WHOLE LABEL must be the token. `privacy-blog.example.com` is a blog;
 *     anchoring the match to the full label is what keeps it out.
 *  3. NOT THE SCANNED HOST ITSELF. Scanning `privacy.example.com` would otherwise let
 *     any self-link on the page satisfy the check — the page's own address is not
 *     evidence that a policy document is published.
 *
 * Without a `scannedHost` there is no way to run guard 1, so this returns false: a
 * missing argument must not be the thing that clears a release gate.
 */
function linksLegalHostLabel(html: string, kind: LegalDocKind, scannedHost?: string): boolean {
  // ⚠️ `html` here is ALREADY `stripInertMarkup`ed by the only caller. `extractHrefs`
  // is a naive regex over whatever it is handed, so passing raw markup would re-open
  // the commented-out-link hole on this branch alone.
  const host = (scannedHost ?? "").trim().toLowerCase();
  if (!host) return false;
  const wholeLabel = new RegExp(`^(?:${LEGAL_HREF_TOKENS[kind]})$`, "i");

  for (const href of extractHrefs(html)) {
    // Only hrefs that actually carry a host can put the token in one. A
    // protocol-relative `//privacy.example.com/x` does, and resolves against the
    // scanned origin.
    if (!/^(?:[a-z][a-z0-9+.\-]*:)?\/\//i.test(href)) continue;
    let url: URL;
    try {
      url = new URL(href, `https://${host}/`);
    } catch {
      continue;
    }
    if (!/^https?:$/i.test(url.protocol)) continue;
    const candidateHost = url.hostname.toLowerCase();
    if (candidateHost === host) continue; // guard 3
    if (!sameOrganisation(url.toString(), host)) continue; // guard 1
    const [label] = candidateHost.split(".");
    if (label && wholeLabel.test(label)) return true; // guard 2
  }
  return false;
}

/** True when this href points at a legal hub rather than a specific document. */
/**
 * True when the page LINKS a path containing one of these tokens.
 *
 * ⚠️ Why this exists, and why several checks were wrong without it. A family of
 * compliance checks probed a FIXED ROOT PATH and never looked at the page's own links:
 * `accessibility_statement` HEADed `/accessibility` and `/accessibility-statement`,
 * `cookie_policy_page` HEADed `/cookie-policy` and `/cookies`. Live-scanned www.gov.uk
 * on 2026-08-22 and both came back as findings — while the markup Pulse had just parsed
 * contained `href="/help/accessibility-statement"` and `href="/help/cookies"`. Telling
 * the UK government its site has no accessibility statement, on the strength of a path
 * we guessed wrong, is the same defect as the legal-link matcher above: probing a guess
 * while ignoring the evidence in hand.
 *
 * Reads the INERT-STRIPPED markup, so a commented-out or `<template>`d link does not
 * count — the same rule the legal matcher uses.
 */
export function linksPathContaining(html: string, tokens: string[]): boolean {
  const pattern = new RegExp(`(?:^|/)[^/?#]*(?:${tokens.join("|")})`, "i");
  return extractHrefs(stripInertMarkup(html)).some((href) => {
    const path = href.split("#")[0].split("?")[0].toLowerCase();
    return pattern.test(path);
  });
}

/**
 * True when the page carries a cookie-consent mechanism.
 *
 * ⚠️ This was a CLOSED VENDOR LIST (cookiebot / osano / onetrust / cookie-consent /
 * cookieconsent / cookie_notice / gdpr), so a SELF-HOSTED banner was invisible.
 * Live-scanned www.gov.uk on 2026-08-22 and it was reported as having no cookie consent
 * mechanism — while the page ships the reference UK implementation, with
 * `id="global-cookie-message"`, `govuk-cookie-banner` / `gem-c-cookie-banner`, and
 * accept/reject confirmation copy. Same shape as the CDN five-vendor list in §44.2:
 * a closed fingerprint list reported as directly-observed absence.
 *
 * Detects the MECHANISM — a container named for what it is, or the copy a visitor
 * actually reads — and keeps the vendor names as additional signals rather than as the
 * definition of the thing.
 */
const COOKIE_BANNER_VENDORS = [
  "cookiebot", "osano", "onetrust", "termly", "iubenda", "cookieyes", "complianz",
  "consentmanager", "trustarc", "quantcast", "didomi", "usercentrics", "klaro",
  "tarteaucitron", "orejime",
];

const COOKIE_BANNER_CONTAINER =
  /(?:class|id)="[^"]*cookie[-_]?(?:banner|consent|notice|message|bar|law|prompt|dialog)[^"]*"/i;

const CONSENT_CONTAINER =
  /(?:class|id)="[^"]*(?:consent|cookie)[-_]?(?:manager|modal|overlay)[^"]*"/i;

const COOKIE_BANNER_COPY =
  /accept (?:all )?cookies|reject (?:all )?cookies|cookie settings|manage cookies|we use cookies|essential cookies/i;

export function hasCookieConsentMechanism(html: string): boolean {
  const lower = html.toLowerCase();
  if (COOKIE_BANNER_VENDORS.some((vendor) => lower.includes(vendor))) return true;
  if (COOKIE_BANNER_CONTAINER.test(lower) || CONSENT_CONTAINER.test(lower)) return true;
  // The copy test is gated on the page mentioning cookies at all, so a page saying
  // "manage cookies" in a blog post about baking does not qualify on its own.
  return lower.includes("cookie") && COOKIE_BANNER_COPY.test(lower);
}

export function isLegalHubHref(href: string): boolean {
  const path = href.split("#")[0].split("?")[0].toLowerCase();
  return new RegExp(`(?:^|/)(?:${LEGAL_HUB_TOKENS})/?$`).test(path);
}

/**
 * True when a FETCHED page names the document in its title or a top heading.
 *
 * Prominent text only — see the module note. A body-wide match would confirm
 * any homepage that links its own policy in the footer, which is most of them.
 *
 * ⚠️ Reads the RENDERABLE body only, for the same reason the link matcher does: a
 * `<!-- <h1>Privacy Policy</h1> -->` left in a template, or that heading inside a
 * `<script>` string or an uninstantiated `<template>`, would otherwise CONFIRM a
 * document the fetched page does not publish — a false PASS on a launch-blocking gate,
 * reached by the very fetch that exists to prevent one.
 */
export function legalPageConfirms(kind: LegalDocKind, body: string): boolean {
  const signal = LEGAL_CONTENT_SIGNALS[kind];
  const renderable = stripInertMarkup(body);
  const re = /<title[^>]*>([\s\S]{0,400}?)<\/title>|<h[1-3][^>]*>([\s\S]{0,400}?)<\/h[1-3]>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(renderable)) !== null) {
    const text = (match[1] ?? match[2] ?? "").replace(/<[^>]*>/g, " ");
    if (signal.test(text)) return true;
  }
  return false;
}

/** Conventional paths tried when the page's own links could not be read. */
const LEGAL_WELL_KNOWN_PATHS: Record<LegalDocKind, string[]> = {
  privacy: ["/privacy", "/privacy-policy", "/legal/privacy"],
  terms: ["/terms", "/terms-of-service", "/legal/terms"],
};

export interface LegalProbeResult {
  status: number;
  contentType: string;
  body: string;
}

export interface LegalDocOutcome {
  status: "PASS" | "WARN" | "FAIL" | "INCONCLUSIVE";
  detail: string;
  evidence?: string;
  /** Set only where the verdict is weaker than a direct read. */
  confidence?: "HIGH" | "MEDIUM";
}

function sameOrganisation(candidate: string, scannedHost: string): boolean {
  let host: string;
  try {
    host = new URL(candidate).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === scannedHost) return true;
  const scannedOrg = registrableDomain(scannedHost);
  // `null` means the module declined to answer, so we must NOT treat the two as
  // related — crediting a stranger's policy page is the failure this guards.
  return scannedOrg !== null && registrableDomain(host) === scannedOrg;
}

/**
 * Decide `privacy_policy` and `terms_of_service` from evidence.
 *
 * `probe` is injected so the whole decision tree is unit-testable without a
 * network: every branch below is exercised in `legal-link-detection.test.ts`.
 */
export async function resolveLegalDocumentChecks(input: {
  /** The HTML actually read — the rendered DOM when a render was adopted. */
  html: string;
  /** Scanned origin, no trailing slash. */
  baseUrl: string;
  /** True when a random path returns 200, so a 200 proves nothing. */
  catchAll200: boolean;
  /** True when the static HTML is an unrendered SPA shell (links unreadable). */
  unreadableShell: boolean;
  probe: (url: string) => Promise<LegalProbeResult>;
  /** Hard ceiling on fetches, shared across both documents. */
  maxProbes?: number;
}): Promise<Record<LegalDocKind, LegalDocOutcome>> {
  let scannedHost = "";
  try {
    scannedHost = new URL(input.baseUrl).hostname.toLowerCase();
  } catch {
    /* unparseable base — hub candidates are then rejected, which is the safe way */
  }

  // ⚠️ Strip once, up front, and read the stripped copy everywhere below. A hub link
  // inside an HTML comment or a `<script>` string is not a link the visitor can
  // follow, and fetching it would spend a probe to manufacture a PASS from markup the
  // browser never rendered (see `stripInertMarkup`).
  const renderableHtml = stripInertMarkup(input.html);

  const hubCandidates: string[] = [];
  for (const href of extractHrefs(renderableHtml)) {
    if (!isLegalHubHref(href)) continue;
    let absolute: string;
    try {
      absolute = new URL(href, `${input.baseUrl}/`).toString();
    } catch {
      continue;
    }
    if (!/^https?:/i.test(absolute)) continue;
    if (!sameOrganisation(absolute, scannedHost)) continue;
    if (!hubCandidates.includes(absolute)) hubCandidates.push(absolute);
    if (hubCandidates.length >= 2) break;
  }

  // 8 is the exact worst case, not a guess: at most 2 hub candidates (deduped in
  // `seen`, so one fetch serves BOTH documents) plus 3 conventional paths per
  // document. So no candidate is ever dropped for want of budget — which would read
  // as "we checked and found nothing" when we had in fact stopped looking. Raising
  // either cap is therefore a budget change; `legal-link-detection.test.ts` pins the
  // arithmetic so it cannot drift silently.
  let probesLeft = input.maxProbes ?? 8;
  const seen = new Map<string, LegalProbeResult | null>();
  const fetchOnce = async (url: string): Promise<LegalProbeResult | null> => {
    if (seen.has(url)) return seen.get(url) ?? null;
    if (probesLeft <= 0) {
      seen.set(url, null);
      return null;
    }
    probesLeft -= 1;
    const result = await input.probe(url).catch(() => null);
    seen.set(url, result);
    return result;
  };

  const shellSuffix = input.unreadableShell
    ? " The page's own links could not be read: the static HTML is a client-rendered shell, so Pulse probed the conventional paths instead."
    : "";

  const resolveOne = async (kind: LegalDocKind): Promise<LegalDocOutcome> => {
    const noun = kind === "privacy" ? "privacy policy" : "terms of service";

    // `scannedHost` is what lets the matcher credit a same-organisation
    // `privacy.<domain>` host; without it that branch declines (see
    // `linksLegalHostLabel`).
    if (linksLegalDocument(renderableHtml, kind, scannedHost)) {
      return {
        status: "PASS",
        detail: `A ${noun} link was found in the page markup.`,
        evidence: "Linked from the scanned page",
      };
    }

    // Probe the conventional paths for EVERY site, not only unrendered shells.
    //
    // Found by sweeping ten live homepages: stripe.com's served HTML links `/gb/privacy`
    // and no terms page at all, so `terms_of_service` came back FAIL — a P1 launch
    // blocker — while `https://stripe.com/terms` returns HTTP 200. "Not linked from the
    // homepage" and "does not exist" are different facts, and only the second one is
    // worth blocking a release over.
    //
    // The cost is bounded and lands only on sites that would otherwise take a P1: at
    // most three extra requests, shared against the same `maxProbes` ceiling, and only
    // once the markup test has already failed. Every probe is content-verified, so a
    // catch-all 200 still cannot manufacture a pass.
    //
    // ⚠️ Not on a catch-all-200 host. There a 200 proves nothing (the code below
    // correctly refuses to read it as evidence), so the probes would spend three
    // requests to learn nothing AND would downgrade a well-evidenced FAIL — "no legal
    // link in markup we could read" — into INCONCLUSIVE. A caught regression: the
    // rendered-footer test asserts exactly this case.
    // Skip the probes ONLY when the markup was readable AND a 200 would prove nothing.
    // Then "no legal link in markup we could read" is solid evidence and the probes add
    // none. For an unreadable SHELL on a catch-all host we have no evidence in either
    // direction, so the probes must still run — that is what produces the honest
    // INCONCLUSIVE instead of a FAIL we cannot support. Both halves of this condition
    // were put here by a failing test.
    const wellKnown = input.catchAll200 && !input.unreadableShell
      ? []
      : LEGAL_WELL_KNOWN_PATHS[kind].map((path) => `${input.baseUrl}${path}`);
    const candidates = [...hubCandidates, ...wellKnown.filter((url) => !hubCandidates.includes(url))];

    if (candidates.length === 0) {
      return {
        status: "FAIL",
        detail:
          kind === "privacy"
            ? "No privacy policy link found in the page markup — required for GDPR, CCPA, and app store distribution."
            : "No terms of service link found in the page markup — required for any product collecting payments or user data.",
        evidence: "No matching link, and no legal index page to check",
      };
    }

    // ⚠️ TWO KINDS OF "UNREADABLE", AND THEY DO NOT RANK THE SAME. They were one
    // variable, set by whichever candidate hit first and then outranking every
    // conclusive answer collected afterwards — so ONE transient probe failure turned
    // an established FAIL into a silent INCONCLUSIVE, non-deterministically, run to
    // run. Reproduced: page links nothing, `/privacy` returns status 0 while
    // `/privacy-policy` AND `/legal/privacy` both 404 ⇒ privacy INCONCLUSIVE while
    // terms (all three 404) FAILed, off the same evidence.
    //
    //   · `servedButUnreadable` — we asked and the server answered 200; we simply
    //     cannot read the answer (catch-all routing, or the body is itself an empty
    //     render shell). That IS information: something is served at that path, so it
    //     outranks the conclusive absences. FAIL would assert more than we know.
    //   · `transportFailure` — we never got an answer at all (timeout, reset, DNS).
    //     That is information about the NETWORK, not about the site, so it must NOT
    //     outrank a conclusive answer from another candidate. It is disclosed in the
    //     FAIL's evidence instead of erasing it.
    //
    // ⚠️ AND THERE IS MORE THAN ONE OF EITHER. `transportFailure` was a single string
    // set with `??=`, so with two or more unreachable candidates the FAIL disclosed
    // the first and silently dropped the rest — "One further candidate could not be
    // reached" while two had not been. Reproduced: page links nothing, `/privacy`
    // 404s while `/privacy-policy` AND `/legal/privacy` both fail to connect ⇒
    // evidence named one of the two. Understating how much of the probe set went
    // unanswered makes a FAIL look better-evidenced than it is, which is the same
    // dishonesty as overstating it.
    let servedButUnreadable: string | null = null;
    const transportFailures: string[] = [];
    const checkedAndAbsent: string[] = [];

    for (const url of candidates) {
      const result = await fetchOnce(url);
      if (!result || result.status === 0) {
        transportFailures.push(`${url} could not be fetched`);
        continue;
      }
      if (result.status !== 200) {
        checkedAndAbsent.push(`${url} → HTTP ${result.status}`);
        continue;
      }
      // A 200 on a host that 200s everything, or a body that is itself an empty
      // app shell, is not an answer in either direction.
      if (input.catchAll200) {
        // On a catch-all host EVERY further probe returns the same non-evidence — the
        // 200 branch below refuses to read it and, by definition, no candidate can
        // 404. So stop here rather than spending up to four more 60KB fetches to
        // reach the identical verdict.
        servedButUnreadable = `${url} returned 200, but this host returns 200 for any path (catch-all routing), so the response is not evidence`;
        break;
      }
      if (isEmptyRenderShell(result.body)) {
        // NOT a break: a shell at `/privacy` says nothing about `/privacy-policy`,
        // which may well serve the real document.
        servedButUnreadable ??= `${url} returned a client-rendered shell, so its text is not in the static HTML`;
        continue;
      }
      if (legalPageConfirms(kind, result.body)) {
        // Reached from a hub the page actually linked: the visitor can get there, so
        // this is a pass.
        if (hubCandidates.includes(url)) {
          return {
            status: "PASS",
            detail: `A ${noun} was confirmed by fetching ${url} and reading its heading — the scanned page links it via a legal index rather than directly.`,
            evidence: `Confirmed at ${url}`,
          };
        }
        // ⚠️ Only downgrade when the page's links were actually READABLE. On an
        // unrendered SPA shell we could not read them, so "nothing links to it" is a
        // claim with no evidence behind it — the link may well be in the rendered
        // footer. There, a confirmed document is a clean PASS.
        if (input.unreadableShell) {
          return {
            status: "PASS",
            detail: `A ${noun} was confirmed by fetching ${url} and reading its heading.${shellSuffix}`,
            evidence: `Confirmed at ${url}`,
          };
        }
        // Found at a conventional path that NOTHING on the readable page linked. The
        // document exists, so this is not the launch blocker a FAIL would claim — but a
        // policy a user cannot navigate to is not fully published either, so it is not a
        // clean pass. Saying exactly that is more useful than either extreme.
        return {
          status: "WARN",
          detail: `A ${noun} is published at ${url}, but nothing on the scanned page links to it — so a visitor (or an app-store reviewer) has no way to find it. Add a footer link.${shellSuffix}`,
          evidence: `Confirmed at ${url}; not linked from ${input.baseUrl}`,
          confidence: "HIGH",
        };
      }
      checkedAndAbsent.push(`${url} → 200, but no ${noun} heading`);
    }

    // A 200 we could not read outranks the conclusive absences (see above).
    // A transport failure only speaks when NOTHING else answered conclusively.
    //
    // ⚠️ RESIDUAL: THIS REPORTED ONE KIND WHEN BOTH OCCURRED. Written
    // `servedButUnreadable ?? (…transportFailures…)`, a shell served at `/privacy`
    // PLUS two candidates that could not be reached at all disclosed only the shell.
    // The FAIL branch below was already fixed for exactly this ("never silently drop a
    // candidate we could not reach"); the INCONCLUSIVE branch was not, and understating
    // how much of the probe set went unanswered makes an unproven verdict look
    // better-evidenced than it is.
    //
    // What must NOT change: a transport failure still never CREATES an INCONCLUSIVE
    // when another candidate answered conclusively — that is the `??=`-flake bug above,
    // and it is why the second clause keeps its `checkedAndAbsent.length === 0` guard.
    // It is only ever ADDED to a verdict that is already unproven.
    const unreadableReasons: string[] = [];
    if (servedButUnreadable) unreadableReasons.push(servedButUnreadable);
    if (transportFailures.length > 0 && (servedButUnreadable || checkedAndAbsent.length === 0)) {
      unreadableReasons.push(...transportFailures);
    }
    const unreadable = unreadableReasons.length > 0 ? unreadableReasons.join("; ") : null;
    if (unreadable) {
      return {
        status: "INCONCLUSIVE",
        detail: `Pulse could not establish whether this site publishes a ${noun}: ${unreadable}.${shellSuffix} This is reported as unproven rather than as a failure — neither presence nor absence was observed.`,
        evidence: unreadable,
        confidence: "MEDIUM",
      };
    }

    return {
      status: "FAIL",
      detail:
        (kind === "privacy"
          ? "No privacy policy found — required for GDPR, CCPA, and app store distribution."
          : "No terms of service found — required for any product collecting payments or user data.") +
        ` Pulse checked the page's links and then fetched ${checkedAndAbsent.length} candidate page${checkedAndAbsent.length === 1 ? "" : "s"} directly; none served one.${shellSuffix}` +
        // Never silently drop a candidate we could not reach: the verdict is FAIL on
        // the evidence we DO have, and the gap is stated in full — the real count, and
        // every URL, not just the first.
        (transportFailures.length > 0
          ? ` ${transportFailures.length} further candidate${transportFailures.length === 1 ? "" : "s"} could not be reached (${transportFailures.join("; ")}), so ${transportFailures.length === 1 ? "it is" : "they are"} not part of this verdict.`
          : ""),
      evidence: [...checkedAndAbsent, ...transportFailures].filter(Boolean).join("; ") || "No matching link or page",
    };
  };

  return {
    privacy: await resolveOne("privacy"),
    terms: await resolveOne("terms"),
  };
}

export function detectTechStack(headers: Record<string, string>, html: string, hostname?: string): string[] {
  const stack: string[] = [];

  // AI/no-code builder origin (Lovable, Bolt, v0, Replit, ...) — hostname-suffix + HTML watermark
  // detection already exists in vibe-code-hygiene.ts; merge it in here so it's part of the
  // persisted techStack, not just a separate check row (see effectiveTechStack() in
  // pulse-scan-results.tsx, which used to be the only place this got surfaced — and only when
  // techStack was otherwise empty, so it silently dropped out whenever anything else was
  // detected, e.g. Cloudflare).
  if (hostname) {
    const builder = detectAiBuilder(hostname, html.toLowerCase());
    if (builder) stack.push(builder);
  }

  if (headers["x-vercel-id"]) stack.push("Vercel");
  if (headers["x-powered-by"]?.toLowerCase().includes("next")) stack.push("Next.js");
  if (headers["x-powered-by"]?.toLowerCase().includes("express")) stack.push("Express");
  if (headers["cf-ray"]) stack.push("Cloudflare");
  if (headers["server"]?.toLowerCase().includes("nginx")) stack.push("Nginx");
  if (headers["server"]?.toLowerCase().includes("apache")) stack.push("Apache");

  // ⚠️ USE, not MENTION. Every line below used to be a naked `html.includes("<brand>")`,
  // which asks "does this word appear anywhere on the page" — not "is this technology
  // in use". On the B2B marketing sites Pulse mostly scans, that is routinely false:
  //
  //   · stripe.com/gb mentions "supabase" 14 times because Supabase is a Stripe
  //     CUSTOMER (`/gb/customers/supabase`, `Supabase.png`). Pulse concluded the site
  //     runs on Supabase and raised a P2 telling Stripe to verify their Row-Level
  //     Security. Verified outside Pulse with curl.
  //   · `includes("vue")`   matched "a**venue**", "re**vue**", "Belle**vue**".
  //   · `includes("clerk")` matched the ordinary English word "clerk".
  //   · `includes("react")` matched "reaction", "reactive", "reacted".
  //
  // This is not cosmetic: techStack drives `hasBackend` and platform detection, which
  // decide WHICH CHECK FAMILIES RUN. A wrong stack manufactures wrong findings
  // downstream — the Stripe case is exactly that chain.
  //
  // So each signal is now something only actual use produces: a first-party asset
  // path, a vendor script host, or a runtime fingerprint. Where a bare product name
  // is genuinely the only signal available, it is matched on a word boundary AND
  // alongside a corroborating asset reference.
  const has = (re: RegExp) => re.test(html);

  // Framework runtime fingerprints — emitted by the build, impossible to mention.
  if (has(/__NEXT_DATA__|_next\/static/)) stack.push("Next.js");
  if (has(/__NUXT__|\/_nuxt\//)) stack.push("Nuxt.js");
  if (has(/\/_app\/immutable\/|__sveltekit_|data-svelte-h=/)) stack.push("Svelte");
  if (has(/\/page-data\/app-data\.json|gatsby-image-wrapper|___gatsby/)) stack.push("Gatsby");
  if (has(/data-reactroot|__REACT_DEVTOOLS_|\/react(?:-dom)?[.@][\d.]*\/?[a-z.]*\.js/)) stack.push("React");
  if (has(/__VUE__|data-v-[0-9a-f]{8}|\/vue(?:@|\.runtime|\.min)/)) stack.push("Vue");

  // Third-party services — identified by the host they load from, not their name.
  if (has(/js\.stripe\.com|checkout\.stripe\.com|api\.stripe\.com/)) stack.push("Stripe");
  // `(?![a-z])` matters: without it this matches inside `.supabase.company`, which is
  // literally present in stripe.com/gb's i18n keys.
  if (has(/[a-z0-9-]+\.supabase\.(?:co|in)(?![a-z])|supabase-js/)) stack.push("Supabase");
  if (has(/firebaseio\.com|firebaseapp\.com|googleapis\.com\/identitytoolkit|firebase-app\.js/)) stack.push("Firebase");
  if (has(/clerk\.[a-z0-9-]+\.(?:dev|com)|clerk\.accounts\.|@clerk\//)) stack.push("Clerk");
  if (has(/\/api\/auth\/(?:session|providers|csrf)|next-auth\.session-token/)) stack.push("NextAuth");
  if (has(/plausible\.io/)) stack.push("Plausible");
  if (has(/posthog\.com|posthog\.js|\/static\/array\.js/)) stack.push("PostHog");
  if (has(/googletagmanager\.com|google-analytics\.com|gtag\(/)) stack.push("Google Analytics");
  if (has(/sentry-cdn\.com|\.ingest\.sentry\.io|@sentry\//)) stack.push("Sentry");
  if (has(/widget\.intercom\.io|intercomcdn\.com|intercomSettings/)) stack.push("Intercom");

  return [...new Set(stack)];
}

type ProjectContext = {
  isPaymentEnabled: boolean;
  isAuthEnabled: boolean;
  isSaas: boolean;
  isMobileApp: boolean;
  hasBackend: boolean;
  authMethod: "password" | "otp" | "both" | "unknown";
};

function detectProjectContext(html: string, headers: Record<string, string>): ProjectContext {
  const lower = html.toLowerCase();

  const isPaymentEnabled =
    lower.includes("js.stripe.com") || lower.includes("stripe") || lower.includes("paddle") ||
    lower.includes("lemon squeezy") ||
    ["/pricing", "/billing", "/checkout", "/subscribe", "/plans"].some(
      (p) => lower.includes(`href="${p}`) || lower.includes(`href='${p}`),
    );

  const isAuthEnabled =
    ["/login", "/signin", "/sign-in", "/signup", "/sign-up", "/auth", "/register"].some(
      (p) => lower.includes(`href="${p}`) || lower.includes(`href='${p}`),
    )
    // Auth-provider evidence, not the provider's NAME. `lower.includes("clerk")`
    // matched the English word, `"supabase"` matched a customer logo, and `"lucia"`
    // matched a person's name — each of which switched on the whole auth check family
    // for a site with no auth at all. Same USE-not-MENTION rule as detectTechStack.
    || /clerk\.[a-z0-9-]+\.(?:dev|com)|@clerk\/|next-auth\.session-token|\/api\/auth\/(?:session|providers|csrf)|[a-z0-9-]{8,}\.supabase\.(?:co|in)(?![a-z])|supabase-js|[a-z0-9-]+\.auth0\.com|lucia-auth|[a-z0-9-]+\.kinde\.com/i.test(html);

  // Auth *method* — password vs. OTP/passwordless — so checks that only make
  // sense for traditional passwords (strength rules, breach-password lookups)
  // don't ding projects built around OTP/magic-link auth, and so OTP-specific
  // checks (code expiry, resend cooldown) only fire when relevant. "unknown"
  // (auth enabled via a provider, method not visible in static HTML) must NOT
  // be treated the same as "otp" downstream — only skip on a confident "otp".
  const hasPasswordField = /type=["']password["']/i.test(html);
  const hasOtpSignal = [
    "one-time password", "one time password", "verification code", "enter the code",
    "enter your code", "we sent you a code", "we've sent a code", "we have sent a code",
    "magic link", "passwordless", "sign in with a code", "otp code", "6-digit code",
    "authentication code", "check your email for a code", "check your phone for a code",
  ].some((s) => lower.includes(s));
  const authMethod: ProjectContext["authMethod"] = !isAuthEnabled
    ? "unknown"
    : hasPasswordField && hasOtpSignal
      ? "both"
      : hasOtpSignal
        ? "otp"
        : hasPasswordField
          ? "password"
          : "unknown";

  const isSaas =
    (isPaymentEnabled || isAuthEnabled) &&
    (lower.includes("subscription") || lower.includes("/mo") || lower.includes("per month") ||
      lower.includes("free trial") || lower.includes("dashboard") || lower.includes("/app/") ||
      lower.includes(`href="/app"`) || lower.includes("upgrade") || lower.includes("pricing plan") ||
      lower.includes("your account"));

  const isMobileApp =
    lower.includes("apps.apple.com") || lower.includes("play.google.com/store/apps") ||
    /rel=["']apple-touch-icon["']/i.test(html) || lower.includes("app store") ||
    lower.includes("google play") || lower.includes("download the app") ||
    lower.includes("download on the") || /name=["']apple-itunes-app["']/i.test(html);

  const hasBackend =
    !!headers["x-powered-by"] || !!headers["x-vercel-id"] || !!headers["cf-ray"] ||
    lower.includes("/api/") || isAuthEnabled || isPaymentEnabled;

  return { isPaymentEnabled, isAuthEnabled, isSaas, isMobileApp, hasBackend, authMethod };
}

function skipChecks(
  checks: PulseScanCheckInput[],
  category: CheckCategory,
  entries: Array<[string, string]>,
  reason: string,
): void {
  for (const [checkKey, label] of entries) {
    checks.push({ category, checkKey, label, status: "SKIPPED", detail: reason });
  }
}

async function runMobileStoreChecks(url: string, storeType: "app_store" | "play_store"): Promise<{ checks: PulseScanCheckInput[]; techStack: string[] }> {
  const checks: PulseScanCheckInput[] = [];
  const pageResult = await fetchPage(url);

  const html = pageResult?.html ?? "";
  const lower = html.toLowerCase();
  const isAppStore = storeType === "app_store";
  const storeLabel = isAppStore ? "App Store" : "Google Play";

  // App listed + reachable
  checks.push({
    category: CATEGORIES.STORE_LISTING,
    checkKey: "store_page_live",
    label: `${storeLabel} listing is live`,
    status: pageResult && pageResult.status < 400 ? "PASS" : "FAIL",
    detail: pageResult && pageResult.status < 400
      ? `${storeLabel} listing is publicly accessible.`
      : `${storeLabel} listing returned ${pageResult?.status ?? "no response"} — app may be unlisted or removed.`,
  });

  if (!pageResult || pageResult.status >= 400) {
    return { checks: checks.map((c, i) => ({ ...c, sortOrder: i })), techStack: [] };
  }

  // App name / title
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1];
  const hasTitle = Boolean(ogTitle && ogTitle.length > 2);
  checks.push({
    category: CATEGORIES.STORE_LISTING,
    checkKey: "store_app_title",
    label: "App name / title",
    status: hasTitle ? "PASS" : "WARN",
    detail: hasTitle ? `App title detected: "${ogTitle}".` : "Could not detect app title in store listing.",
    evidence: ogTitle ?? undefined,
  });

  // Description quality
  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{20,})["']/i)?.[1]
    ?? html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{20,})["']/i)?.[1];
  const descLength = ogDesc?.length ?? 0;
  checks.push({
    category: CATEGORIES.STORE_LISTING,
    checkKey: "store_description",
    label: "App description",
    status: descLength > 200 ? "PASS" : descLength > 50 ? "WARN" : "FAIL",
    detail: descLength > 200
      ? "App description is detailed and complete."
      : descLength > 50
        ? "App description is short — a longer description improves store discovery."
        : "No meaningful app description detected — required for store approval and discoverability.",
  });

  // Screenshots (og:image count as a signal)
  const ogImages = (html.match(/<meta[^>]+property=["']og:image["']/gi) ?? []).length;
  const hasScreenshots = isAppStore
    ? lower.includes("screenshot") || lower.includes("preview") || ogImages >= 1
    : lower.includes("screenshot") || ogImages >= 1;
  checks.push({
    category: CATEGORIES.STORE_LISTING,
    checkKey: "store_screenshots",
    label: "Screenshots / preview assets",
    status: hasScreenshots ? "PASS" : "FAIL",
    detail: hasScreenshots
      ? "Screenshot or preview assets detected in the listing."
      : "No screenshot assets detected — stores require at least 3–4 screenshots.",
  });

  // Ratings / reviews
  const hasRating = lower.includes("rating") || lower.includes("stars") || lower.includes("reviews")
    || lower.includes("rated") || /\d+(\.\d)?\s*(out of|\/)\s*5/i.test(html);
  checks.push({
    category: CATEGORIES.STORE_LISTING,
    checkKey: "store_ratings",
    label: "Ratings & reviews",
    status: hasRating ? "PASS" : "WARN",
    detail: hasRating
      ? "Rating or review data detected — social proof is present."
      : "No ratings detected. New apps won't have ratings, but they drive conversion significantly.",
  });

  // Privacy policy
  const hasPrivacy = lower.includes("privacy policy") || lower.includes("privacy-policy")
    || lower.includes("privacypolicy") || lower.includes("privacy_policy")
    || /privacy/i.test(html) && /policy/i.test(html);
  checks.push({
    category: CATEGORIES.STORE_LISTING,
    checkKey: "store_privacy_policy",
    label: "Privacy policy linked",
    status: hasPrivacy ? "PASS" : "FAIL",
    detail: hasPrivacy
      ? "Privacy policy reference detected — required by both stores."
      : "No privacy policy detected. Both Apple and Google require a privacy policy URL — this will block publishing.",
  });

  // Age / content rating
  const hasAgeRating = isAppStore
    ? lower.includes("rated") || lower.includes("age") || lower.includes("4+") || lower.includes("17+") || lower.includes("12+")
    : lower.includes("pegi") || lower.includes("rated for") || lower.includes("content rating") || lower.includes("everyone");
  checks.push({
    category: CATEGORIES.STORE_LISTING,
    checkKey: "store_age_rating",
    label: "Age / content rating",
    status: hasAgeRating ? "PASS" : "WARN",
    detail: hasAgeRating
      ? "Age/content rating detected in the listing."
      : "No content rating signals found — required by both stores and affects discoverability filters.",
  });

  // In-app purchases disclosure
  const hasIAP = lower.includes("in-app purchase") || lower.includes("in app purchase")
    || lower.includes("subscription") || lower.includes("offers in-app");
  checks.push({
    category: CATEGORIES.STORE_LISTING,
    checkKey: "store_iap_disclosed",
    label: "In-app purchases disclosed",
    status: "PASS", // presence or absence are both valid; just noting the state
    detail: hasIAP
      ? "In-app purchases or subscriptions are disclosed in the listing."
      : "No in-app purchase disclosures detected — if the app monetises, ensure this is declared.",
  });

  // App preview video (Apple) / promo video (Play)
  const hasVideo = lower.includes("preview") && (lower.includes("video") || lower.includes("mp4"))
    || lower.includes("app preview") || lower.includes("promo video");
  checks.push({
    category: CATEGORIES.STORE_LISTING,
    checkKey: "store_preview_video",
    label: isAppStore ? "App preview video" : "Promo video",
    status: hasVideo ? "PASS" : "WARN",
    detail: hasVideo
      ? "App preview/promo video detected — video significantly improves conversion."
      : "No preview video detected — a 15–30s video can increase install rates by 20–35%.",
  });

  if (isAppStore) {
    // App Store: subtitle (shown under title in search)
    const hasSubtitle = lower.includes("subtitle") || (ogTitle && ogTitle.includes(" - "));
    checks.push({
      category: CATEGORIES.STORE_LISTING,
      checkKey: "appstore_subtitle",
      label: "App subtitle (keyword field)",
      status: hasSubtitle ? "PASS" : "WARN",
      detail: hasSubtitle
        ? "App subtitle detected — this 30-character field is a key keyword placement."
        : "No subtitle detected — the App Store subtitle is valuable keyword real-estate for search ranking.",
    });

    // Apple privacy nutrition label
    const hasNutritionLabel = lower.includes("data used") || lower.includes("data not collected")
      || lower.includes("privacy practices") || lower.includes("data linked to you");
    checks.push({
      category: CATEGORIES.STORE_LISTING,
      checkKey: "appstore_privacy_label",
      label: "Apple privacy nutrition label",
      status: hasNutritionLabel ? "PASS" : "FAIL",
      detail: hasNutritionLabel
        ? "Privacy nutrition label sections detected — Apple requires this before publishing."
        : "No privacy nutrition label detected — Apple requires you to declare all data collection. Missing this will block App Review.",
    });
  } else {
    // Play Store: data safety section
    const hasDataSafety = lower.includes("data safety") || lower.includes("data shared")
      || lower.includes("data collected") || lower.includes("safety section");
    checks.push({
      category: CATEGORIES.STORE_LISTING,
      checkKey: "playstore_data_safety",
      label: "Data Safety section",
      status: hasDataSafety ? "PASS" : "FAIL",
      detail: hasDataSafety
        ? "Data Safety section detected — Google requires this to publish."
        : "No Data Safety section detected — Google Play requires all apps to declare data collection practices. Missing this blocks publishing.",
    });

    // Play Store: content rating (IARC)
    const hasIARC = lower.includes("iarc") || lower.includes("everyone") || lower.includes("teen")
      || lower.includes("mature 17+") || lower.includes("rated for 3+");
    checks.push({
      category: CATEGORIES.STORE_LISTING,
      checkKey: "playstore_content_rating",
      label: "IARC content rating",
      status: hasIARC ? "PASS" : "WARN",
      detail: hasIARC
        ? "Content rating detected — IARC questionnaire completed."
        : "No IARC content rating detected. Google Play requires a content rating questionnaire before the app can go live.",
    });
  }

  // Tech stack inference for mobile
  const techStack: string[] = [];
  if (isAppStore) {
    techStack.push("iOS");
    if (lower.includes("flutter")) techStack.push("Flutter");
    else if (lower.includes("react native")) techStack.push("React Native");
    else techStack.push("Swift / SwiftUI");
  } else {
    techStack.push("Android");
    if (lower.includes("flutter")) techStack.push("Flutter");
    else if (lower.includes("react native")) techStack.push("React Native");
    else techStack.push("Kotlin");
  }

  return {
    checks: checks.map((c, i) => ({ ...c, sortOrder: i })),
    techStack: [...new Set(techStack)],
  };
}

/**
 * Returns the categories that are irrelevant for the declared platform.
 * Exported for the exhaustive applicability contract tests.
 */
export function getSkippedCategoriesForPlatformForTest(platform: string) {
  return getInapplicableCategoryDetails(platform);
}

function getSkippedCategoriesForPlatform(platform: string, surfaceKind: UrlSurfaceKind) {
  return getInapplicableCategoryDetails(platform, surfaceKind);
}
function applyPlatformFilter(
  checks: PulseScanCheckInput[],
  platform: string | undefined,
  surfaceKind: UrlSurfaceKind,
): PulseScanCheckInput[] {
  const skipped = getSkippedCategoriesForPlatform(platform ?? "OTHER", surfaceKind);
  if (skipped.length === 0) return checks;

  const excluded = new Set(skipped.map((s) => s.category));
  return checks.filter((check) => !excluded.has(check.category));
}

/**
 * Apply jurisdiction-aware filtering (parallel to applyPlatformFilter): a
 * compliance check tagged for markets the product doesn't serve is replaced with
 * SKIPPED. Because calculateHealthScore excludes SKIPPED, this neither penalises
 * nor inflates the score — it just stops e.g. Brazil LGPD from showing on a
 * US/EU-only product. Untagged (global) checks always pass through. With no
 * market context (markets empty) nothing is filtered.
 */
function applyJurisdictionFilter(
  checks: PulseScanCheckInput[],
  markets: JurisdictionCode[],
): PulseScanCheckInput[] {
  if (markets.length === 0) return checks;
  return checks.map((check) => {
    if (checkAppliesToMarkets(check.checkKey, markets)) return check;
    const tags = CHECK_JURISDICTIONS[check.checkKey] ?? [];
    return {
      ...check,
      status: "SKIPPED" as const,
      detail: `Not applicable to your selected markets (${markets.join(", ")}) — this requirement targets ${tags.join(", ") || "another region"}.`,
    };
  });
}

/**
 * The single pipeline every URL check passes through — whether it is streamed in a wave or
 * returned at the end of the scan.
 *
 * ⚠️ These were two separate code paths and they disagreed. The waves applied the platform and
 * jurisdiction filters only; SPA reclassification happened just once, on the final return. And
 * because `runLiteScan`'s ingest keeps the FIRST result it sees for a checkKey, the wave always
 * won and the corrected status was silently discarded. Net effect: every Lovable/Bolt/v0 site —
 * exactly the population Pulse targets — was scored with `has_word_count`, `has_heading_hierarchy`
 * and `internal_links_present` FAILing at HIGH confidence, while `spa_client_rendered` correctly
 * WARNed one row above. The mechanism existed, was unit-tested, and never reached a single scan.
 *
 * Reclassification runs FIRST so the applicability filters keep the last word: a check the
 * platform says does not apply must stay out of the denominator, not be re-admitted as unknown.
 */
/**
 * Say what the render attempt did. Emitted only when the served HTML was a shell — there is
 * nothing to report about a page that arrived complete.
 *
 * Every outcome other than "we read the content" is INCONCLUSIVE, never PASS and never FAIL.
 * A failed hydration is not a defect in the customer's product, and it is certainly not proof
 * their page is fine: it is Pulse saying it could not see. Reporting it any other way is how a
 * coverage gap gets laundered into a verdict.
 */
export function renderCoverageCheck(input: {
  rendered: RenderResult | null;
  staticWords: number;
  adopted: boolean;
  requested: boolean;
}): PulseScanCheckInput {
  const base = {
    category: CATEGORIES.VIBE_HYGIENE,
    checkKey: "spa_content_rendered_for_scan",
    label: "Client-rendered content was read for this scan",
  } as const;

  if (input.adopted && input.rendered) {
    return {
      ...base,
      status: "PASS",
      confidence: "HIGH",
      detail: `The page was rendered in a browser before its content was assessed: ${input.staticWords.toLocaleString()} words in the served HTML, ${input.rendered.renderedWords.toLocaleString()} after JavaScript ran. The content and SEO checks below measure what a visitor sees. Search crawlers and AI answer engines vary in how reliably they do the same, so server-rendering still matters.`,
    };
  }
  if (!input.requested) {
    return {
      ...base,
      status: "INCONCLUSIVE",
      detail:
        "This page's content is rendered by JavaScript, and this scan did not run a browser, so the content and SEO checks could not read it. Re-run it as a full scan to have the page rendered first.",
    };
  }
  if (input.rendered?.error) {
    return {
      ...base,
      status: "INCONCLUSIVE",
      detail: `The page's content is rendered by JavaScript and the browser render did not complete (${input.rendered.error}), so the content and SEO checks could not read it. This says nothing about the page itself.`,
    };
  }
  return {
    ...base,
    status: "INCONCLUSIVE",
    detail: `The browser render returned no more content than the served HTML (${input.staticWords.toLocaleString()} words in the source, ${input.rendered?.renderedWords.toLocaleString() ?? 0} after rendering), so it was not used. That usually means hydration failed or the content needs a sign-in. The content checks remain unassessed rather than being measured against an empty shell.`,
  };
}

// ─── Response-header security verdicts ───────────────────────────────────────
//
// Extracted from `runUrlChecks` so each decision tree is unit-testable. Every one
// of them was a nested ternary that asserted more than the header it read.

/**
 * `cors_policy` — Access-Control-Allow-Origin on the scanned DOCUMENT.
 *
 * ⚠️ Two defects lived in one expression here, and they had to be fixed together
 * — fixing either alone makes the check net-worse.
 *
 *   · ABSENCE WAS WARNED. No Access-Control-Allow-Origin on an HTML document is
 *     the LOCKED-DOWN state: the browser refuses cross-origin reads by default.
 *     All six sites in the July 2026 audit were verified header-less and all six
 *     were told to go fix it — while Pulse's own probed API check says the
 *     opposite about identical evidence (`api-behaviour.ts`: "No CORS headers
 *     returned — the API is same-origin only, which is the safest default"). The
 *     advice also named "API routes" this check never probed.
 *   · ANY EXPLICIT ORIGIN SCORED PASS. `corsHeader ? "PASS"` meant a homepage
 *     answering `Access-Control-Allow-Origin: https://attacker.example` was
 *     UPGRADED from WARN to PASS. Only the literal `*` was ever caught. Going
 *     quiet on the safe case while still rubber-stamping origin reflection would
 *     be strictly worse than the original noise.
 *
 * So: absent ⇒ SKIPPED with a reason (the `secure_cookie_attributes` shape),
 * `*` ⇒ WARN, own origin ⇒ PASS, any OTHER origin ⇒ WARN naming it. The API
 * verdict belongs to the family that actually probes an API with an Origin
 * header, not to a homepage read.
 */
export function corsPolicyVerdict(headers: Record<string, string>, scannedUrl: string): DnsCheckVerdict {
  const value = headers["access-control-allow-origin"]?.trim();
  const credentials = /^true$/i.test(headers["access-control-allow-credentials"] ?? "");
  const evidence = value ? `access-control-allow-origin: ${value}` : "Header not present";

  if (!value) {
    return {
      status: "SKIPPED",
      detail:
        "Not assessed — this response sent no Access-Control-Allow-Origin header, which is both the default and the restrictive state: browsers refuse cross-origin reads of it. Cross-origin policy is a property of an API endpoint answering a request that carries an Origin header, so it is graded there rather than on an HTML document.",
      evidence,
    };
  }

  if (value === "*") {
    return {
      status: "WARN",
      detail: `This document is served with Access-Control-Allow-Origin: * — any website can read its content from a visitor's browser.${credentials ? " Access-Control-Allow-Credentials is also true; browsers reject that combination outright, so cross-origin credentialed requests will simply fail." : ""} Restrict the header to the origins that need it, or drop it.`,
      evidence,
    };
  }

  let scannedOrigin = "";
  try {
    scannedOrigin = new URL(scannedUrl).origin.toLowerCase();
  } catch {
    /* unparseable — fall through to the "some other origin" branch */
  }

  if (value.toLowerCase() === scannedOrigin) {
    return {
      status: "PASS",
      detail: `Access-Control-Allow-Origin names this site's own origin (${value}) — no third-party origin is granted read access.`,
      evidence,
    };
  }

  return {
    status: "WARN",
    detail: `This document grants cross-origin read access to ${value}${credentials ? ", WITH credentials (Access-Control-Allow-Credentials: true), so a page on that origin can read authenticated responses" : ""}. A single request cannot tell a deliberate grant from origin REFLECTION — an echo of whatever Origin the requester sent, which effectively grants every site. Confirm this is a fixed allow-list and not reflected.`,
    evidence,
  };
}

/**
 * `x_frame_options` — a HEADER check that used to wear a POSTURE label.
 *
 * CSP Level 2 `frame-ancestors` obsoletes X-Frame-Options and every current
 * browser honours it; where both are present, frame-ancestors wins. Proved by
 * driving real Chrome at linear.app, which sends no XFO:
 *   "Framing 'https://linear.app/' violates ... frame-ancestors 'self'
 *    https://cms.linear.app. The request has been blocked."
 * (with https://example.com as the discriminating control — not blocked.)
 * Meanwhile `csp_frame_ancestors` in security-extended.ts PASSED the identical
 * response with "clickjacking protection via CSP (supersedes X-Frame-Options)",
 * so one scan asserted both halves of a contradiction.
 *
 * ⚠️ A source list that permits every origin is NOT protection, and the bare `*`
 * token is only ONE of the three ways to write that. The first cut of this guard
 * tested `/(?:^|\s)\*(?:\s|$)/`, which catches only the bare token, so
 * `frame-ancestors https://*` and `frame-ancestors http: https:` both PASSed — each
 * permitting every origin on its scheme, i.e. framing is not restricted at all, on
 * sites that would otherwise have taken a correct WARN for having no XFO.
 *
 * A CSP source list is a UNION, so ONE permissive source defeats the whole list:
 * `frame-ancestors 'self' https://*` is as open as `https://*` alone. Hence
 * `.some()`, not `.every()`.
 *
 * `https://*.example.com` is NOT in this class — it wildcards the host label under a
 * named domain, which is a real restriction.
 *
 * Only the ENFORCED policy counts: `frame-ancestors` in a report-only policy reports
 * and does not block, which is why only `content-security-policy` is read here.
 *
 * ⚠️ AND THE FIX FOR THAT OVER-MATCHED IN TURN, which is the residual this note
 * records. The scheme rule was written as "any bare scheme source", `/^[a-z][a-z0-9+.-]*:$/`,
 * so a policy that genuinely restricts WEB framing while additionally admitting an app
 * or extension scheme was WARNed with an explanation that was simply untrue of it:
 *
 *   frame-ancestors 'self' chrome-extension:   → WARN "permits every origin"
 *   frame-ancestors 'self' blob:               → WARN
 *   frame-ancestors 'self' data:               → WARN
 *
 * None of those lets an attacker frame the page FROM A WEBSITE, which is what this
 * check measures and what its sentence claims. `blob:`, `data:` and `filesystem:` are
 * derived-context schemes with no remote publisher; `chrome-extension:`,
 * `moz-extension:`, `capacitor:`, `ionic:`, `tauri:` and `file:` are locally-installed
 * contexts a visitor's own machine already trusts. So only a scheme that can host an
 * ARBITRARY REMOTE PAGE counts as "every origin" — and the same test governs the
 * `scheme://*` form, for the same reason.
 */



export function clickjackingVerdict(headers: Record<string, string>): DnsCheckVerdict {
  const xfo = headers["x-frame-options"]?.trim();
  const frameAncestors = /(?:^|;)\s*frame-ancestors\s+([^;]+)/i
    .exec(headers["content-security-policy"] ?? "")?.[1]
    ?.trim()
    .toLowerCase();
  const permissiveSources = (frameAncestors ?? "").split(/\s+/).filter(permitsEveryOrigin);
  const restricts = Boolean(frameAncestors) && permissiveSources.length === 0;
  const evidence = xfo
    ? `x-frame-options: ${xfo}`
    : frameAncestors
      ? `content-security-policy: frame-ancestors ${frameAncestors}`
      : "Neither X-Frame-Options nor CSP frame-ancestors present";

  if (xfo) {
    return {
      status: "PASS",
      detail: `X-Frame-Options: ${xfo} — legacy framing protection is set${frameAncestors ? `, and the CSP also restricts framing (frame-ancestors ${frameAncestors})` : ""}.`,
      evidence,
    };
  }
  if (restricts) {
    return {
      status: "PASS",
      detail: `No X-Frame-Options header, and none is needed: the Content-Security-Policy restricts framing with \`frame-ancestors ${frameAncestors}\`, which supersedes X-Frame-Options in every current browser — a foreign origin's frame is refused.`,
      evidence,
    };
  }
  if (frameAncestors) {
    return {
      status: "WARN",
      detail: `No X-Frame-Options header, and the CSP's \`frame-ancestors ${frameAncestors}\` does not restrict framing: \`${permissiveSources.join("`, `")}\` permits every origin, and a source list is a union — so one permissive source opens the whole list. Set \`frame-ancestors 'self'\`, or list the specific origins allowed to embed this page.`,
      evidence,
    };
  }
  return {
    status: "WARN",
    detail:
      "No X-Frame-Options header and no CSP frame-ancestors directive — nothing tells the browser to refuse being framed, so this page can be embedded by any site (clickjacking). Prefer `frame-ancestors` in the CSP; X-Frame-Options is the legacy equivalent.",
    evidence,
  };
}

/**
 * `permissions_policy` — the absent-header sentence said the OPPOSITE of the spec.
 *
 * It claimed camera/microphone/geolocation were "unrestricted" with no header.
 * The Permissions Policy default allowlist for all three is `self`: the document's
 * own origin may use them and an embedded third-party frame may not. Asked
 * directly via `document.featurePolicy` in real Chrome on linear.app (no header):
 *   camera / microphone / geolocation → self=true, foreign-origin=false
 * What a header actually buys is tightening beyond that default and governing what
 * EMBEDDED frames may do.
 *
 * The predecessor header was read nowhere in the tree (`grep -rn 'feature-policy'
 * src/` → no matches), so vercel.com — which sends `feature-policy: fullscreen
 * 'self'; camera 'none'` and no permissions-policy — was told the one feature it
 * explicitly denies was unrestricted.
 */
/**
 * The features whose SPEC DEFAULT allowlist is `self`, so writing `=*` for them is a
 * WIDENING rather than a scoping act.
 *
 * ⚠️ Deliberately narrow, and it must stay narrow. The check used to PASS any
 * non-empty header with the sentence "powerful browser features are explicitly
 * scoped", so `permissions-policy: camera=*, microphone=*, geolocation=*` — a policy
 * granting the three most sensitive capabilities to every origin — was reported as
 * scoped. But `=*` is ROUTINE and harmless for client-hint delegation: Google's own
 * header is `ch-ua-arch=*, ch-ua-bitness=*, …`, and flagging any `=*` at all would
 * fire on it. So only the capability features below are read, and only their `*`
 * allowlist is adverse.
 */
const POWERFUL_PERMISSION_FEATURES = new Set([
  "camera",
  "microphone",
  "geolocation",
  "display-capture",
  "payment",
  "usb",
  "serial",
  "bluetooth",
  "hid",
  "midi",
  "idle-detection",
  "screen-wake-lock",
  "local-fonts",
  "window-management",
]);

/** One `name=allowlist` (or legacy `name allowlist`) pair read out of the header. */
interface PermissionDirective {
  name: string;
  allowlist: string[];
  /**
   * True when the pair only parsed after tolerating whitespace around the `=`
   * (`camera =*`). RFC 8941 allows none, so a browser rejects the WHOLE header and
   * the spec defaults stay in force — which the WARN sentence has to say rather than
   * asserting the author's allowlist is live.
   */
  spacedEquals: boolean;
}

/**
 * Split a Permissions-Policy / Feature-Policy header into directives.
 *
 * ⚠️ BOTH SEPARATORS, and that is the residual this exists for. The parser split on
 * `,` only — the structured-fields spelling — so two shapes reached the PASS branch
 * and were described as "powerful browser features are explicitly scoped":
 *
 *   permissions-policy: camera=*; microphone=*     (`;` separator)
 *   permissions-policy: camera *; microphone *     (legacy Feature-Policy spelling)
 *
 * The RISK is low — a browser rejects the malformed form and falls back to the secure
 * `self` default, so the site is not actually exposed — but the SENTENCE was false,
 * and a check that says "this is fine" about a header it never parsed is the same
 * failure as saying "it isn't there" about a lookup it never made (§35).
 *
 * Splitting on `[;,]` is safe for both grammars: a structured-fields allowlist's
 * members are space-separated inside parentheses and a Feature-Policy allowlist's are
 * space-separated bare, so neither character can occur inside one.
 */
function parsePermissionDirectives(policy: string): PermissionDirective[] {
  const out: PermissionDirective[] = [];
  for (const directive of policy.split(/[;,]/)) {
    const trimmed = directive.trim();
    if (!trimmed) continue;
    // Structured fields: `camera=(self)`. Legacy Feature-Policy: `camera 'self'`.
    // Whichever delimiter appears first is the one that separates name from allowlist.
    const eq = trimmed.indexOf("=");
    const space = trimmed.search(/\s/);
    const split = eq === -1 ? space : space === -1 ? eq : Math.min(eq, space);
    // No delimiter at all is not a `feature=allowlist` pair, so nothing was read.
    if (split === -1) continue;
    const name = trimmed.slice(0, split).trim().toLowerCase();
    // A feature name is a lowercase token (`camera`, `ch-ua-arch`, `sync-xhr`). Anything
    // else is not a directive Pulse read, and counting it would let the PASS branch
    // claim a header is "explicitly scoped" on the strength of unparseable junk.
    if (!/^[a-z][a-z0-9-]*$/.test(name)) continue;
    // `+ 1` skips the `=`; for the space form the leading whitespace is trimmed below.
    let rest = trimmed
      .slice(trimmed[split] === "=" ? split + 1 : split)
      .trim()
      .toLowerCase();
    // ⚠️ RESIDUAL FROM THE `;`/SPACE PARSE: `camera =*` — A SPACE BEFORE THE EQUALS.
    // `split` is the FIRST of `=` and whitespace, so the space won, the name parsed as
    // `camera` and the allowlist parsed as the literal `=*` — which the wide-open test
    // does not recognise. The check therefore PASSED with "powerful browser features
    // are explicitly scoped (camera =*)" on a header granting the camera to every
    // origin. Strip the stranded `=` so the allowlist is read, and record that the
    // header is malformed so the verdict can say so.
    const spacedEquals = trimmed[split] !== "=" && rest.startsWith("=");
    if (spacedEquals) rest = rest.slice(1).trim();
    const allowlist = rest
      // `camera=()` is a real, fully-scoped directive: the allowlist is legitimately
      // EMPTY once the parentheses come off, which is why emptiness is not a reason to
      // discard the directive.
      .replace(/^\(/, "")
      .replace(/\)$/, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    out.push({ name, allowlist, spacedEquals });
  }
  return out;
}

/**
 * Powerful features this policy grants to every origin, and whether any of them was
 * only readable by tolerating invalid whitespace around the `=`.
 */
function wideOpenPowerfulFeatures(policy: string): { features: string[]; malformed: boolean } {
  const features: string[] = [];
  let malformed = false;
  for (const { name, allowlist, spacedEquals } of parsePermissionDirectives(policy)) {
    if (!POWERFUL_PERMISSION_FEATURES.has(name) || features.includes(name)) continue;
    if (!allowlist.includes("*")) continue;
    features.push(name);
    if (spacedEquals) malformed = true;
  }
  return { features, malformed };
}

export function permissionsPolicyVerdict(headers: Record<string, string>): DnsCheckVerdict {
  const policy = headers["permissions-policy"]?.trim();
  const legacy = headers["feature-policy"]?.trim();
  if (policy) {
    const { features: wideOpen, malformed } = wideOpenPowerfulFeatures(policy);
    if (wideOpen.length > 0) {
      return {
        status: "WARN",
        detail:
          `A Permissions-Policy header is set, but it grants ${wideOpen.map((name) => `\`${name}\``).join(", ")} to EVERY origin (\`=*\`). The spec default for those features is \`self\`, so on those directives this header is looser than sending none at all — any third-party iframe this page embeds may now request them. Use \`=()\` for features the product does not use and \`=(self)\` for the ones it does.` +
          // Only say the policy is IN FORCE when it can be. With whitespace around the
          // `=` the header is not a valid structured-fields dictionary, so a browser
          // discards all of it and the `self` defaults stand — the intent is still
          // wrong and still worth fixing, but claiming the exposure is live would
          // overstate what was observed.
          (malformed
            ? " Note the syntax is also invalid — a structured-fields dictionary allows no whitespace around the `=` — so a browser is likely to reject the whole header and fall back to the spec defaults. Fix the spelling and the allowlist together."
            : ""),
        evidence: `permissions-policy: ${policy}`,
      };
    }
    // Only claim "scoped" about a header Pulse actually read directives out of. A
    // header it could not parse tells us nothing about scoping, and saying otherwise
    // is the same class of overreach as asserting an absence we never probed.
    if (parsePermissionDirectives(policy).length === 0) {
      return {
        status: "PASS",
        detail: `A Permissions-Policy header is present (${policy}), but Pulse could not read any \`feature=allowlist\` directive out of it, so it makes no claim about which browser features are scoped. Check the syntax: directives are comma-separated \`name=(origin …)\` pairs, and a header a browser cannot parse is ignored entirely — leaving the spec defaults in force.`,
        evidence: `permissions-policy: ${policy}`,
      };
    }
    return {
      status: "PASS",
      detail: `Permissions-Policy header present (${policy}) — powerful browser features are explicitly scoped.`,
      evidence: `permissions-policy: ${policy}`,
    };
  }
  if (legacy) {
    return {
      status: "WARN",
      detail: `No Permissions-Policy header, but the deprecated predecessor is present (feature-policy: ${legacy}). Browser support for Feature-Policy is being withdrawn, so migrate these directives to Permissions-Policy before they stop being honoured. The spec defaults apply meanwhile: camera, microphone and geolocation default to \`self\`, so they are already unavailable to embedded third-party frames.`,
      evidence: `feature-policy: ${legacy}`,
    };
  }
  return {
    status: "WARN",
    detail:
      "No Permissions-Policy header. The spec defaults apply — camera, microphone and geolocation default to `self`, so they are restricted to this origin and are already unavailable to embedded third-party frames. Setting an explicit policy is still worth doing: it lets you deny features this product never uses, and control what any iframe you embed may request.",
    evidence: "Neither Permissions-Policy nor Feature-Policy present",
  };
}

// ─── CDN / edge-cache detection ──────────────────────────────────────────────
//
// The old test was a five-name vendor list — `x-vercel-id`, `cf-ray`,
// `x-amz-cf-id`, `x-cache`, `x-fastly-request-id` — reported as directly
// observed absence. Two consequences, both seen in the July 2026 audit:
//
//   · It carried the LEGACY `x-cache` but not the STANDARDISED RFC 9211
//     `Cache-Status`, so any CDN that migrated to the RFC header is invisible.
//     That is a systematic blind spot, not one missing vendor. gitwork.co.uk was
//     told it had no CDN while its own response carried a proxy's machine-readable
//     account of forwarding the request:
//       cache-status: "Netlify Edge"; fwd=miss; fwd-status=200; stored
//   · It never read `Age` (RFC 9111), which is a shared cache stating in seconds
//     how long IT has held the response. Nothing but an intermediary emits it.
//
// So the standards-defined, vendor-neutral signals are tested FIRST and the
// vendor list is the fallback. Note what is deliberately NOT here: a match against
// `JSON.stringify(headers)` for `cloudflare|nginx|haproxy`, which would PASS any
// site whose unrelated header value happens to contain one of those words; and
// bare reverse proxies (nginx, Caddy, Traefik, Envoy) which are load balancers,
// not CDNs, and belong to `load_balancer_detected`.
//
// ⚠️ It must still WARN on a genuinely CDN-less host. `news.ycombinator.com` is
// one — single A record in one US colo, no CDN — and that finding was verified
// CORRECT. Its response carries none of the signals below, and a unit test pins
// that. Do not add a generic `server` value here to widen coverage.

/**
 * Standardised cache/proxy headers: emitted only by an intermediary.
 *
 * ⚠️ `CDN-Cache-Control` is deliberately absent. It is a directive the ORIGIN
 * sends TO a CDN, so its presence proves the origin expects one, not that one
 * handled this response — a framework default would PASS a CDN-less host.
 */
// Header plus the sentence that explains what reading it proves, so the check's
// detail names the observation instead of asserting a conclusion.
//
// ⚠️ Deliberately a table of objects, not an array of header names.
// `categories.reconcile.test.ts` reads any array of exactly three string
// literals as a category/key/label tuple, and a bare list of these three headers
// made it report `age` as an unregistered emitted checkKey — twice, because the
// comment first written to explain that also carried the tuple shape. Restructure
// the code, never the drift guard (CLAUDE.md §37.6).
const STANDARD_CACHE_SIGNALS: { header: string; proves: (value: string) => string }[] = [
  {
    header: "cache-status",
    proves: (value) =>
      `the RFC 9211 Cache-Status header, which is a caching proxy's own account of handling the request (${value}).`,
  },
  {
    header: "age",
    proves: (value) =>
      `an RFC 9111 Age header (${value}s), which only a shared cache holding the response can emit.`,
  },
  {
    header: "via",
    proves: (value) => `a Via header (${value}), which every conforming proxy adds as it forwards.`,
  },
];

/** Vendor headers, for CDNs that have not adopted RFC 9211 yet. */
const CDN_VENDOR_HEADERS = [
  "x-vercel-id",
  "x-vercel-cache",
  "cf-ray",
  "cf-cache-status",
  "x-amz-cf-id",
  "x-amz-cf-pop",
  "x-cache",
  "x-cache-hits",
  "x-fastly-request-id",
  "x-served-by",
  "x-nf-request-id",
  "fly-request-id",
  "x-akamai-transformed",
  "akamai-grn",
  "x-azure-ref",
  "x-iinfo",
  "x-sucuri-id",
  "x-bunny-cache-status",
] as const;

/** `Server:` values that name an edge platform outright (not a bare proxy). */
const CDN_SERVER_VALUES = [
  "cloudflare",
  "cloudfront",
  "netlify",
  "vercel",
  "fastly",
  "akamai",
  "akamaighost",
  "bunnycdn",
  "keycdn",
  "sucuri",
  "varnish",
  "esf",
] as const;

export interface EdgeCacheEvidence {
  header: string;
  value: string;
  reason: string;
}

/**
 * Evidence that a CDN or edge cache handled this response, or `null`.
 *
 * Standards-defined signals first, so detection does not depend on knowing the
 * vendor. Returns the header it read, so the check's evidence line names what was
 * actually observed rather than asserting a conclusion.
 */
export function detectEdgeCache(headers: Record<string, string>): EdgeCacheEvidence | null {
  for (const signal of STANDARD_CACHE_SIGNALS) {
    const value = headers[signal.header];
    // `Age: 0` is a legitimate value from a cache that has just stored the
    // response, so PRESENCE — not magnitude — is the signal.
    if (!value) continue;
    return { header: signal.header, value, reason: signal.proves(value) };
  }

  const serverHeader = (headers["server"] ?? "").toLowerCase();
  const vendorServer = CDN_SERVER_VALUES.find((vendor) => serverHeader.includes(vendor));
  if (vendorServer) {
    return {
      header: "server",
      value: headers["server"] ?? "",
      reason: `the Server header names an edge platform (${headers["server"]}).`,
    };
  }

  for (const header of CDN_VENDOR_HEADERS) {
    const value = headers[header];
    if (!value) continue;
    return { header, value, reason: `a CDN vendor header (${header}: ${value}).` };
  }

  return null;
}

// ─── Email-authentication DNS (SPF / DMARC) ──────────────────────────────────
//
// Both checks read DNS over HTTPS, and both used to convert three different
// situations into the same sentence: "no record found". They are not the same
// thing, and the difference decides whether a finding is true:
//
//   1. THE RECORD IS ABSENT AT A NAME THAT COULD HOLD IT — a real finding.
//   2. THE LOOKUP DID NOT COMPLETE — the resolver 5xx'd or timed out. Reporting
//      that as "no record" is the §35 failure: "we couldn't look" printed as "it
//      isn't there". `checkDnsRecord` returned `[]` for both.
//   3. THE QUESTION WAS NARROWER THAN THE STANDARD. DMARC's own discovery
//      algorithm (RFC 7489 §6.6.3) REQUIRES a receiver that finds no record at
//      the DNS domain to retry at the Organizational Domain. Pulse asked once
//      and stopped, so every subdomain of every DMARC-protected organisation was
//      told it had no impersonation protection. Verified live (2026-08):
//        _dmarc.www.gov.uk       → NXDOMAIN      ← the only query Pulse made
//        _dmarc.gov.uk           → p=reject;sp=none;np=reject
//        _dmarc.mozilla.org      → p=reject
//        _dmarc.ycombinator.com  → p=none;sp=none
//      gov.uk and mozilla.org run the strictest policy DMARC defines.
//
// ⚠️ The fallback must NOT become "a parent record found ⇒ PASS". For an
// EXISTING subdomain the effective policy is the parent's `sp=` when present,
// and gov.uk's and ycombinator.com's are both `sp=none` — so a blanket PASS
// would reassure exactly the hosts that are unprotected. `np=` is deliberately
// NOT consulted: RFC 9091 scopes it to NON-EXISTENT subdomains, and Pulse only
// scans a host it just fetched a page from.
//
// ⚠️ And it must NOT be applied to SPF. RFC 7208 §3.1 makes SPF explicitly
// non-inheriting — it is evaluated at the RFC5321.MailFrom domain, full stop.
// `news.ycombinator.com` publishes no SPF and `ycombinator.com`'s `-all` record
// genuinely does not cover it, so an org fallback there would convert a correct
// email-spoofing finding into a false negative. SPF's fix is wording only.

/** DNS answer types this module distinguishes. */
const DNS_TYPE = { CNAME: 5, MX: 15, TXT: 16 } as const;

export interface DnsAnswer {
  type: number;
  data: string;
}

/**
 * A completed-or-not DNS lookup.
 *
 * `ok: false` means the query did not resolve to an authoritative answer, which
 * is NOT the same as an empty answer and must never be reported as absence.
 * NXDOMAIN is `ok: true` with no answers — the resolver did answer.
 */
export interface DnsLookup {
  ok: boolean;
  answers: DnsAnswer[];
}

/** TXT strings from a lookup, with the resolver's quoting removed and chunks joined. */
export function txtStrings(lookup: DnsLookup): string[] {
  return lookup.answers
    .filter((answer) => answer.type === DNS_TYPE.TXT)
    .map((answer) => answer.data.replace(/"/g, "").trim());
}

export interface DmarcTags {
  p: string | null;
  sp: string | null;
  np: string | null;
  raw: string;
}

/** Parse the first `v=DMARC1` record in a TXT answer set. */
export function parseDmarcTags(records: string[]): DmarcTags | null {
  const raw = records.find((record) => /(?:^|;)\s*v\s*=\s*dmarc1\b/i.test(record));
  if (!raw) return null;
  const tags = new Map<string, string>();
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    tags.set(part.slice(0, eq).trim().toLowerCase(), part.slice(eq + 1).trim().toLowerCase());
  }
  return {
    p: tags.get("p") ?? null,
    sp: tags.get("sp") ?? null,
    np: tags.get("np") ?? null,
    raw,
  };
}

/** True for a policy a receiver actually acts on. */
function enforcingPolicy(policy: string | null): boolean {
  return policy === "quarantine" || policy === "reject";
}

export interface DnsCheckVerdict {
  status: PulseCheckStatus;
  detail: string;
  evidence?: string;
}

/**
 * `dmarc_record`, implementing RFC 7489 §6.6.3 discovery honestly.
 *
 * `parents` are the organizational-domain candidates the caller actually queried,
 * most specific first (`organizationalDomainCandidates()` order). `unresolvedReason`
 * is set when the registrable domain could not be established at all — in which
 * case the discovery algorithm could not be completed and the answer is unknown,
 * not negative.
 */
export function dmarcCheckVerdict(input: {
  hostname: string;
  atHost: DnsLookup;
  parents: { domain: string; lookup: DnsLookup }[];
  unresolvedReason: string | null;
}): DnsCheckVerdict {
  const queried = `_dmarc.${input.hostname}`;

  if (!input.atHost.ok) {
    return {
      status: "INCONCLUSIVE",
      detail: `Not assessed — the DNS lookup for ${queried} did not complete, so Pulse cannot say whether a DMARC record exists. This is reported as unknown rather than missing.`,
      evidence: `TXT ${queried}: lookup failed`,
    };
  }

  const own = parseDmarcTags(txtStrings(input.atHost));
  if (own) {
    return {
      status: "PASS",
      detail: `DMARC record published at ${queried} (p=${own.p ?? "unspecified"}) — receiving servers are told what to do with unauthenticated mail claiming to be from this domain.`,
      evidence: own.raw,
    };
  }

  for (const parent of input.parents) {
    if (!parent.lookup.ok) {
      return {
        status: "INCONCLUSIVE",
        detail: `Not assessed — no DMARC record at ${queried}, and the RFC 7489 §6.6.3 fallback lookup at _dmarc.${parent.domain} did not complete, so the inherited policy is unknown.`,
        evidence: `TXT _dmarc.${parent.domain}: lookup failed`,
      };
    }
    const inherited = parseDmarcTags(txtStrings(parent.lookup));
    if (!inherited) continue;

    // For a subdomain that EXISTS, the parent's subdomain policy governs; `p`
    // applies only when no `sp` is published. `np` is for names that do not
    // exist and is therefore irrelevant to a host we just fetched.
    const effective = inherited.sp ?? inherited.p;
    if (enforcingPolicy(effective)) {
      return {
        status: "PASS",
        detail: `No record at ${queried}, but DMARC discovery (RFC 7489 §6.6.3) falls back to the organizational domain, where _dmarc.${parent.domain} publishes ${inherited.sp ? `sp=${inherited.sp}` : `p=${inherited.p}`} — so mail claiming to be from ${input.hostname} is covered by an enforcing policy.`,
        evidence: `Inherited from _dmarc.${parent.domain}: ${inherited.raw}`,
      };
    }
    return {
      status: "WARN",
      detail: `No DMARC record at ${queried}. Discovery falls back to _dmarc.${parent.domain}, which publishes p=${inherited.p ?? "unspecified"}${inherited.sp ? ` and sp=${inherited.sp}` : ""} — and the policy that applies to a subdomain is ${inherited.sp ? `sp=${inherited.sp}` : `p=${inherited.p ?? "unspecified"}`}, which asks receivers to take no action. Mail impersonating ${input.hostname} is therefore not rejected. Publish a record at ${queried}, or tighten sp= on ${parent.domain}.`,
      evidence: `Inherited from _dmarc.${parent.domain}: ${inherited.raw}`,
    };
  }

  if (input.unresolvedReason) {
    return {
      status: "INCONCLUSIVE",
      detail: `No DMARC record at ${queried}, and Pulse could not complete the RFC 7489 §6.6.3 organizational-domain fallback: ${input.unresolvedReason} Reported as unknown rather than missing, because the record may be published on a parent name Pulse could not identify.`,
      evidence: `TXT ${queried}: no record; organizational domain not established`,
    };
  }

  const searched = [queried, ...input.parents.map((parent) => `_dmarc.${parent.domain}`)].join(", ");
  return {
    status: "WARN",
    detail: `No DMARC record found. Pulse queried ${searched} — the full RFC 7489 §6.6.3 discovery path — and found none. DMARC builds on SPF/DKIM and tells receiving servers what to do with unauthenticated email; without it, anyone can impersonate this domain and receivers have no instruction to act on.`,
    evidence: `No v=DMARC1 record at ${searched}`,
  };
}

/**
 * `spf_record` — same probe as before, honest sentences.
 *
 * The probe was never wrong; the copy was. It turned an absent TXT record into
 * "anyone can spoof your domain in phishing emails", which on `www.gov.uk` is
 * addressed to a host whose organisation publishes the strictest record SPF has
 * (`v=spf1 -all` at gov.uk, i.e. this domain sends no mail), and on
 * `developer.mozilla.org` is addressed to a CNAME owner where RFC 1034 §3.6.2
 * forbids any other record type from existing at all.
 *
 * No org-domain fallback: see the ⚠️ in the section note above.
 */
export function spfCheckVerdict(input: {
  hostname: string;
  txt: DnsLookup;
  mx: DnsLookup;
  registrable: string | null;
}): DnsCheckVerdict {
  if (!input.txt.ok) {
    return {
      status: "INCONCLUSIVE",
      detail: `Not assessed — the TXT lookup for ${input.hostname} did not complete, so Pulse cannot say whether an SPF record exists.`,
      evidence: `TXT ${input.hostname}: lookup failed`,
    };
  }

  const records = txtStrings(input.txt);
  const spf = records.find((record) => /^v=spf1\b/i.test(record));
  if (spf) {
    return {
      status: "PASS",
      detail: `SPF record published at ${input.hostname} — the mail servers allowed to send as this domain are declared.`,
      evidence: spf,
    };
  }

  const isCnameOwner =
    records.length === 0 && input.txt.answers.some((answer) => answer.type === DNS_TYPE.CNAME);
  if (isCnameOwner) {
    return {
      status: "INCONCLUSIVE",
      detail: `Not assessed — ${input.hostname} is a CNAME, and RFC 1034 §3.6.2 forbids any other record type at a CNAME owner name, so no SPF record can exist here whatever the operator does. SPF for mail sent as this organisation is published at the name that actually sends it${input.registrable ? ` (typically ${input.registrable})` : ""}, which is outside the scanned name.`,
      evidence: `TXT ${input.hostname}: CNAME owner, no TXT possible`,
    };
  }

  const nonInheritance = input.registrable && input.registrable !== input.hostname
    ? ` Note SPF does not inherit: RFC 7208 §3.1 evaluates it at the exact sending domain, so a record on ${input.registrable} does not cover ${input.hostname}.`
    : "";

  const receivesMail = input.mx.ok && input.mx.answers.some((answer) => answer.type === DNS_TYPE.MX);
  if (receivesMail) {
    return {
      status: "WARN",
      detail: `No SPF record at ${input.hostname}, which does publish MX records — so this name handles mail but declares no authorised senders, and a receiver has nothing to check a claimed sender against. Publish an SPF record listing your senders.${nonInheritance}`,
      evidence: `No v=spf1 TXT record at ${input.hostname}; MX present`,
    };
  }

  return {
    status: "WARN",
    detail: `No SPF record at ${input.hostname}, and no MX records either — consistent with a name that neither sends nor receives mail. If that is intended, say so explicitly by publishing \`v=spf1 -all\` at this name, so forged mail from it fails closed instead of being unauthenticated-but-unjudged.${nonInheritance}`,
    evidence: `No v=spf1 TXT record and no MX at ${input.hostname}`,
  };
}

export function finaliseUrlChecks(
  batch: PulseScanCheckInput[],
  opts: {
    platform?: string;
    surfaceKind: UrlSurfaceKind;
    markets: JurisdictionCode[];
    /** The static HTML is a client-rendered shell, so body-parse verdicts are not evidence. */
    spaShell: boolean;
  },
): PulseScanCheckInput[] {
  const reclassified = opts.spaShell ? reclassifySpaChecks(batch) : batch;
  return applyJurisdictionFilter(
    applyPlatformFilter(reclassified, opts.platform, opts.surfaceKind),
    opts.markets,
  );
}

export async function runUrlChecks(
  url: string,
  platform?: string,
  onWave?: (checks: PulseScanCheckInput[]) => void,
  targetMarkets?: JurisdictionCode[],
  // Signals from a companion GitHub-source scan (when the input is a connected
  // repo, runGithubChecks resolves before this runs on the homepage — see
  // orchestrator.ts / run-lite-scan.ts). Lets package.json deps correct a
  // homepage-HTML-only false negative (e.g. Stripe used server-side only).
  contextHints?: {
    githubTechStack?: string[];
    /**
     * Render a client-rendered page with headless Chromium before reading its content.
     *
     * Off by default, and the public embed path leaves it off deliberately — booting a browser
     * per anonymous scan is an abuse surface and a cost, the same reason that path also skips
     * PageSpeed. Internal scans turn it on, which is where the assessment is actually sold.
     */
    renderJs?: boolean;
  },
): Promise<{
  checks: PulseScanCheckInput[];
  techStack: string[];
  detectedMarkets: JurisdictionCode[];
  surfaceKind: UrlSurfaceKind;
}> {
  const urlType = detectUrlType(url);
  if (urlType === "app_store" || urlType === "play_store") {
    return { ...(await runMobileStoreChecks(url, urlType)), detectedMarkets: [], surfaceKind: "DEPLOYED_PRODUCT" };
  }

  const checks: PulseScanCheckInput[] = [];
  // Effective markets for filtering. Declared markets are authoritative and known
  // up front; if none were declared we fall back to markets auto-detected from the
  // page (set below, before the compliance/extended checks stream). Mutable so the
  // emit wrapper picks up the detected fallback once the page has been read.
  let effectiveMarkets: JurisdictionCode[] = targetMarkets ?? [];
  let detectedMarkets: JurisdictionCode[] = [];
  let surfaceKind: UrlSurfaceKind = "DEPLOYED_PRODUCT";
  // Set the moment the page is read, before any wave is emitted — mutable so the emit wrapper
  // picks it up, the same pattern `effectiveMarkets` and `surfaceKind` already use.
  let spaShell = false;
  // Optional incremental emitter — fires partial waves so callers (runLiteScan) can persist +
  // stream checks as they land. Goes through finaliseUrlChecks, the same function the final
  // return uses, so a streamed status cannot differ from the one the scan settles on.
  const emit = onWave
    ? (batch: PulseScanCheckInput[]) =>
        onWave(finaliseUrlChecks(batch, { platform, surfaceKind, markets: effectiveMarkets, spaShell }))
    : undefined;

  const httpsUrl = url.startsWith("http://") ? url.replace("http://", "https://") : url;
  const httpUrl = httpsUrl.replace("https://", "http://");
  const baseUrl = httpsUrl.replace(/\/$/, "");

  const pageResult = await fetchPage(httpsUrl);
  if (pageResult) {
    surfaceKind = detectUrlSurfaceKind(pageResult.html);
    spaShell = detectSpaContext({
      builder: detectAiBuilder(
        (() => {
          try {
            return new URL(pageResult.finalUrl || httpsUrl).hostname.toLowerCase();
          } catch {
            return "";
          }
        })(),
        pageResult.html.toLowerCase(),
      ),
      html: pageResult.html,
      contentType: pageResult.headers["content-type"] ?? "",
    }).isSpa;
  }

  // `contentHtml` is what every body-parse check reads. Set below, after the early returns —
  // an App Store listing or a security interstitial must never cost a browser launch.
  let contentHtml = pageResult?.html ?? "";

  // Infrastructure
  checks.push({
    category: CATEGORIES.INFRASTRUCTURE,
    checkKey: "ssl_valid",
    label: "HTTPS / SSL certificate",
    status: pageResult ? "PASS" : "FAIL",
    detail: pageResult ? "HTTPS connection succeeded." : "HTTPS connection failed or certificate error.",
    evidence: httpsUrl,
  });

  // A bot/security checkpoint is not the product. Stop here rather than grading
  // hundreds of product controls against Vercel/Cloudflare challenge markup.
  // This is the URL equivalent of an unreadable private repository: report the
  // coverage failure explicitly and make no claims about what is behind it.
  if (pageResult && surfaceKind === "ACCESS_INTERSTITIAL") {
    checks.push({
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: "target_content_accessible",
      label: "Target content is inspectable",
      status: "FAIL",
      confidence: "HIGH",
      detail:
        "The host returned a browser/security checkpoint instead of the product. Pulse stopped before running product checks, because findings from an interstitial would be irrelevant and misleading. Allow the Pulse crawler or scan a source repository, staging URL, or exported build that is directly accessible.",
      evidence: pageResult.html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "Access interstitial detected",
    });
    const hostname = new URL(pageResult.finalUrl || httpsUrl).hostname.toLowerCase();
    return {
      checks: checks.map((check, sortOrder) => ({ ...check, sortOrder })),
      techStack: detectTechStack(pageResult.headers, "", hostname),
      detectedMarkets: [],
      surfaceKind,
    };
  }

  // A native app, desktop binary, extension or CLI cannot be assessed from its
  // marketing URL. Keep only reachability evidence; the outer orchestrator adds
  // a source-required coverage finding and does not start any deep URL agents.
  if (!shouldRunDeepUrlChecks(platform, "web")) {
    const hostname = new URL(pageResult?.finalUrl || httpsUrl).hostname.toLowerCase();
    return {
      checks: applyPlatformFilter(checks, platform, surfaceKind)
        .map((check, sortOrder) => ({ ...check, sortOrder })),
      techStack: pageResult ? detectTechStack(pageResult.headers, "", hostname) : [],
      detectedMarkets: [],
      surfaceKind,
    };
  }

  if (pageResult) {
    let ctx = detectProjectContext(pageResult.html, pageResult.headers);

    // ── Render a client-rendered page, when asked ───────────────────────────────────────
    // Hydration gives the body-parse checks the page a human actually sees. On success
    // `spaShell` goes false, so those checks report real verdicts instead of being
    // reclassified as unassessable.
    //
    // ⚠️ A failed or unconvincing render must change NOTHING. Leaving `spaShell` true is what
    // keeps the honest INCONCLUSIVE; adopting a DOM we failed to hydrate would turn "we could
    // not look" back into a confident finding about an empty page — the §35 disease, arrived at
    // from the opposite direction.
    if (spaShell) {
      const rendered = contextHints?.renderJs ? await runRenderAgent(pageResult.finalUrl || httpsUrl) : null;
      const staticWords = staticTextWordCount(pageResult.html);
      const adopted = Boolean(
        rendered?.html && isMateriallyRicher(staticWords, rendered.renderedWords),
      );
      if (adopted && rendered?.html) {
        contentHtml = rendered.html;
        spaShell = false;
      }
      checks.push(renderCoverageCheck({ rendered, staticWords, adopted, requested: Boolean(contextHints?.renderJs) }));
    }

    // Catch-all baseline — probe a random nonexistent path. If the host returns
    // 200 (the app shell) for a URL that cannot exist, it serves catch-all 200s
    // (typical of SPAs / Vercel / Next.js frontends). The exposed-file checks
    // below use this so a soft-200 isn't mistaken for a real exposure.
    const baselineProbe = await probePath(`${baseUrl}/__pulse_probe_${Math.random().toString(36).slice(2, 10)}`);
    const catchAll200 = baselineProbe.status === 200;

    // Correct the payment-integration signal beyond a single homepage-HTML
    // scrape: a project can use Stripe/Paddle purely server-side (checkout
    // only on a sub-page, script injected post-hydration, or Stripe used only
    // in API routes) with no client-visible marker on the homepage — the HTML
    // scrape alone then false-negatives, and every Payments check gets
    // skipped downstream. Two independent signals correct this: the
    // companion GitHub scan's package.json deps (when connected), and a live
    // probe of the Stripe webhook route (skipped on catch-all hosts, where
    // every path 200s and presence can't be determined).
    const paymentsApplicable = isCategoryApplicable(platform, CATEGORIES.PAYMENTS, surfaceKind);
    const repoPaymentSignal = paymentsApplicable &&
      (contextHints?.githubTechStack?.some((t) => t === "Stripe" || t === "Paddle") ?? false);
    const liveStripeWebhookStatus = paymentsApplicable && !catchAll200
      ? await headRequest(`${baseUrl}/api/webhooks/stripe`)
      : 0;
    const liveStripeSignal = liveStripeWebhookStatus > 0 && liveStripeWebhookStatus < 500;
    const correctedPaymentSignal = repoPaymentSignal || liveStripeSignal;
    if (correctedPaymentSignal && !ctx.isPaymentEnabled) {
      ctx = { ...ctx, isPaymentEnabled: true, hasBackend: true };
    }

    // Build a "does this HTML route exist?" check honestly. A real page and a
    // catch-all soft-200 are both HTML, so on a catch-all host presence can't be
    // determined — report SKIPPED rather than a false PASS (or a false WARN).
    const routePageCheck = (
      category: CheckCategory,
      checkKey: string,
      label: string,
      present: boolean,
      presentDetail: string,
      absentDetail: string,
    ): PulseScanCheckInput =>
      catchAll200
        ? {
            category,
            checkKey,
            label,
            status: "SKIPPED",
            detail: "Host returns 200 for unknown paths (catch-all routing), so this page's presence can't be probed reliably.",
          }
        : {
            category,
            checkKey,
            label,
            status: present ? "PASS" : "WARN",
            detail: present ? presentDetail : absentDetail,
            evidence: present ? "Status: 200" : "Not found",
          };

    const redir = await inspectRedirect(httpUrl);
    const is3xx = redir.status >= 300 && redir.status < 400;
    // A redirect counts as HTTPS-enforcing when it 3xx's to an https:// target.
    // Treat a missing/relative Location on a 3xx as a pass too (host upgraded the
    // scheme but didn't echo an absolute URL); only a genuine non-redirect WARNs.
    const redirectsToHttps =
      is3xx && (redir.location === "" || redir.location.toLowerCase().startsWith("https://"));
    // Some hosts refuse plain HTTP entirely (connection error → status 0) while
    // HTTPS works — that's HTTPS-only, which is fine, not a warning.
    const httpRefused = redir.status === 0;
    const enforcesHttps = redirectsToHttps || httpRefused;
    checks.push({
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: "http_redirect",
      label: "HTTP → HTTPS redirect",
      status: enforcesHttps ? "PASS" : "WARN",
      detail: redirectsToHttps
        ? "HTTP redirects to HTTPS."
        : httpRefused
        ? "Plain HTTP is not served (HTTPS-only)."
        : is3xx
        ? `HTTP redirects, but not to HTTPS (→ ${redir.location || "unknown"}).`
        : "HTTP does not redirect to HTTPS.",
      evidence: `HTTP status: ${redir.status || "no response"}${redir.location ? ` → ${redir.location}` : ""}`,
    });

    const rt = pageResult.responseTimeMs;
    checks.push({
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: "response_time",
      label: "Response time",
      status: rt < 2000 ? "PASS" : rt < 5000 ? "WARN" : "FAIL",
      detail: `Page loaded in ${rt}ms.`,
      evidence: `${rt}ms`,
    });

    checks.push({
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: "status_200",
      label: "Returns 200 OK",
      status: pageResult.status === 200 ? "PASS" : pageResult.status < 400 ? "WARN" : "FAIL",
      detail: `HTTP status ${pageResult.status}.`,
      evidence: String(pageResult.status),
    });

    const hostname = new URL(httpsUrl).hostname;
    const platformSuffixes = [".vercel.app", ".netlify.app", ".railway.app", ".render.com", ".fly.dev", ".pages.dev", ".onrender.com"];
    const hasCustomDomain = !platformSuffixes.some((suffix) => hostname.endsWith(suffix));
    checks.push({
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: "custom_domain",
      label: "Custom domain",
      status: hasCustomDomain ? "PASS" : "WARN",
      detail: hasCustomDomain ? "Custom domain detected." : `Hosting on a platform subdomain (${hostname}).`,
      evidence: hostname,
    });

    const cdnEvidence = detectEdgeCache(pageResult.headers);
    checks.push({
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: "cdn_detected",
      label: "CDN / edge cache present",
      status: cdnEvidence ? "PASS" : "WARN",
      detail: cdnEvidence
        ? `A caching intermediary is serving this response: ${cdnEvidence.reason}`
        : "No CDN or edge-cache signal in the response headers — no RFC 9211 Cache-Status, no RFC 9111 Age, no Via, and no known CDN vendor header. Requests appear to reach the origin directly, so every visitor pays full origin latency and a traffic spike hits the origin unabsorbed.",
      evidence: cdnEvidence ? `${cdnEvidence.header}: ${cdnEvidence.value}` : "No CDN/edge-cache headers present",
    });

    // SEO
    const title = pageResult.html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
    checks.push({
      category: CATEGORIES.SEO,
      checkKey: "meta_title",
      label: "<title> tag",
      status: title ? "PASS" : "FAIL",
      detail: title ? `Title: "${title}"` : "No <title> tag found.",
      evidence: title ?? undefined,
    });

    const metaDesc = pageResult.html.match(/<meta\s+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1]?.trim()
      ?? pageResult.html.match(/<meta\s+content=["']([^"']*)["'][^>]*name=["']description["']/i)?.[1]?.trim();
    checks.push({
      category: CATEGORIES.SEO,
      checkKey: "meta_description",
      label: "Meta description",
      status: metaDesc ? "PASS" : "WARN",
      detail: metaDesc ? `Description found (${metaDesc.length} chars).` : "No meta description tag.",
      evidence: metaDesc ?? undefined,
    });

    const hasOg = pageResult.html.includes('property="og:') || pageResult.html.includes("property='og:");
    // Extract OG title and description values for AI classification context
    const ogTitle = pageResult.html.match(/property=["']og:title["'][^>]*content=["']([^"']{1,200})["']/i)?.[1]?.trim()
      ?? pageResult.html.match(/content=["']([^"']{1,200})["'][^>]*property=["']og:title["']/i)?.[1]?.trim();
    checks.push({
      category: CATEGORIES.SEO,
      checkKey: "og_tags",
      label: "Open Graph tags",
      status: hasOg ? "PASS" : "WARN",
      detail: hasOg
        ? `Open Graph tags found${ogTitle ? ` — og:title: "${ogTitle}"` : ""}.`
        : "No Open Graph tags detected.",
      // Store OG title in evidence so AI analysis can use it for accurate classification
      evidence: ogTitle ?? undefined,
    });

    const hasCanonical = pageResult.html.includes('rel="canonical"') || pageResult.html.includes("rel='canonical'");
    checks.push({
      category: CATEGORIES.SEO,
      checkKey: "canonical_url",
      label: "Canonical URL",
      status: hasCanonical ? "PASS" : "WARN",
      detail: hasCanonical ? "Canonical URL tag found." : "No canonical URL tag.",
    });

    const hasH1 = /<h1[\s>]/i.test(contentHtml);
    checks.push({
      category: CATEGORIES.SEO,
      checkKey: "h1_present",
      label: "H1 heading",
      status: hasH1 ? "PASS" : "WARN",
      detail: hasH1 ? "H1 heading found." : "No H1 heading found.",
    });

    // robots.txt / sitemap.xml are content-verifiable, so they stay correct on
    // catch-all hosts: a real robots.txt is text (not HTML), a sitemap is XML.
    const seoApplicable = isCategoryApplicable(platform, CATEGORIES.SEO, surfaceKind);
    const robotsFound = seoApplicable && await fileServed(
      `${httpsUrl.replace(/\/$/, "")}/robots.txt`,
      (body, ct) => ct.includes("text/plain") || /user-agent:|disallow:|sitemap:/i.test(body),
    );
    checks.push({
      category: CATEGORIES.SEO,
      checkKey: "has_robots_txt",
      label: "robots.txt",
      status: robotsFound ? "PASS" : "WARN",
      detail: robotsFound ? "robots.txt found." : "No robots.txt detected.",
      evidence: robotsFound ? "Served valid robots.txt" : "Not found (or catch-all shell)",
    });

    const sitemapFound = seoApplicable && await fileServed(
      `${httpsUrl.replace(/\/$/, "")}/sitemap.xml`,
      (body, ct) => ct.includes("xml") || /<\?xml|<urlset|<sitemapindex/i.test(body),
    );
    checks.push({
      category: CATEGORIES.SEO,
      checkKey: "has_sitemap",
      label: "sitemap.xml",
      status: sitemapFound ? "PASS" : "WARN",
      detail: sitemapFound ? "sitemap.xml found." : "No sitemap detected.",
      evidence: sitemapFound ? "Served valid sitemap.xml" : "Not found (or catch-all shell)",
    });

    // Security
    const csp = pageResult.headers["content-security-policy"];
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "csp_header",
      label: "Content-Security-Policy",
      status: csp ? "PASS" : "WARN",
      detail: csp ? "CSP header present." : "No Content-Security-Policy header.",
    });

    const hsts = pageResult.headers["strict-transport-security"];
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "hsts_header",
      label: "HSTS header",
      status: hsts ? "PASS" : "WARN",
      detail: hsts ? "HSTS header present." : "No Strict-Transport-Security header.",
      evidence: hsts ?? undefined,
    });

    // The label names the header this reads; the CSP `frame-ancestors`
    // supersession is honoured in `clickjackingVerdict` (see its note).
    const framing = clickjackingVerdict(pageResult.headers);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "x_frame_options",
      label: "X-Frame-Options header",
      status: framing.status,
      detail: framing.detail,
      evidence: framing.evidence,
    });

    // .env — a real exposure serves the raw file (KEY=VALUE, not HTML). A 200
    // that's the app shell (catch-all routing) is not an exposure.
    const envProbe = await probePath(`${httpsUrl.replace(/\/$/, "")}/.env`);
    const envIsShell = isHtmlShell(envProbe.contentType, envProbe.body);
    const envRealExposure = envProbe.status === 200 && !envIsShell && /^\s*(export\s+)?[A-Z0-9_]+\s*=/m.test(envProbe.body);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "no_exposed_env",
      label: ".env not public",
      status: envRealExposure ? "FAIL" : "PASS",
      detail: envRealExposure
        ? ".env file is publicly accessible and exposes environment variables — block it immediately."
        : envProbe.status === 200
          ? ".env path returns 200 but serves the app shell (catch-all routing), not a real file — no exposure."
          : ".env file is not publicly accessible.",
      evidence: `Status: ${envProbe.status || "no response"}${envProbe.contentType ? ` · ${envProbe.contentType}` : ""}`,
    });

    // .git — a real exposure serves a git ref ("ref: …" or a 40-char SHA), not HTML.
    const gitProbe = await probePath(`${httpsUrl.replace(/\/$/, "")}/.git/HEAD`);
    const gitRealExposure = gitProbe.status === 200 && !isHtmlShell(gitProbe.contentType, gitProbe.body) && /^(ref:\s|[0-9a-f]{40})/m.test(gitProbe.body.trim());
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "no_exposed_git",
      label: ".git directory not public",
      status: gitRealExposure ? "FAIL" : "PASS",
      detail: gitRealExposure
        ? ".git directory is exposed — source history and secrets are downloadable. Block access immediately."
        : gitProbe.status === 200
          ? ".git path returns 200 but serves the app shell (catch-all routing), not a real repository — no exposure."
          : ".git directory is not publicly accessible.",
      evidence: `Status: ${gitProbe.status || "no response"}${gitProbe.contentType ? ` · ${gitProbe.contentType}` : ""}`,
    });

    // Performance
    const encoding = pageResult.headers["content-encoding"];
    checks.push({
      category: CATEGORIES.PERFORMANCE,
      checkKey: "compression",
      label: "Gzip/Brotli compression",
      status: encoding ? "PASS" : "WARN",
      detail: encoding ? `Compression enabled (${encoding}).` : "No compression detected.",
      evidence: encoding ?? undefined,
    });

    const cacheControl = pageResult.headers["cache-control"];
    checks.push({
      category: CATEGORIES.PERFORMANCE,
      checkKey: "caching_headers",
      label: "Cache-Control headers",
      status: cacheControl ? "PASS" : "WARN",
      detail: cacheControl ? `Cache-Control: ${cacheControl}` : "No Cache-Control header.",
      evidence: cacheControl ?? undefined,
    });

    // Payments & Auth
    const hasStripeInHtml = pageResult.html.includes("js.stripe.com") || pageResult.html.includes("stripe");
    const hasStripe = hasStripeInHtml || repoPaymentSignal || liveStripeSignal;
    checks.push({
      category: CATEGORIES.PAYMENTS,
      checkKey: "stripe_signals",
      label: "Stripe integration",
      status: hasStripe ? "PASS" : "WARN",
      detail: hasStripeInHtml
        ? "Stripe detected in page source."
        : repoPaymentSignal
          ? "Stripe dependency detected in the connected repo's package.json (not referenced in the homepage HTML — likely used server-side only)."
          : liveStripeSignal
            ? `Stripe webhook route responded live (status ${liveStripeWebhookStatus}) though not referenced in the homepage HTML — integration appears server-side only.`
            : "No Stripe integration detected.",
    });

    const paymentLinks = ["/pricing", "/billing", "/subscribe", "/checkout", "/plans"];
    const hasPricingPage = paymentLinks.some((path) =>
      pageResult.html.toLowerCase().includes(`href="${path}`) ||
      pageResult.html.toLowerCase().includes(`href='${path}`),
    );
    checks.push({
      category: CATEGORIES.PAYMENTS,
      checkKey: "pricing_page",
      label: "Pricing/billing UI",
      status: hasPricingPage ? "PASS" : "WARN",
      detail: hasPricingPage ? "Pricing or billing page links detected." : "No pricing/billing page links found.",
    });

    const authLinks = ["/login", "/signin", "/sign-in", "/signup", "/sign-up", "/auth", "/register"];
    const hasAuth = authLinks.some((path) =>
      pageResult.html.toLowerCase().includes(`href="${path}`) ||
      pageResult.html.toLowerCase().includes(`href='${path}`),
    );
    checks.push({
      category: CATEGORIES.AUTHENTICATION,
      checkKey: "auth_ui_signals",
      label: "Login/signup UI",
      status: hasAuth ? "PASS" : "WARN",
      detail: hasAuth ? "Login or signup links detected." : "No login/signup links detected.",
    });

    const authProviders = ["clerk", "next-auth", "nextauth", "supabase", "auth0", "lucia", "kinde"];
    const hasOAuthSignals = authProviders.some((p) => pageResult.html.toLowerCase().includes(p));
    checks.push({
      category: CATEGORIES.AUTHENTICATION,
      checkKey: "oauth_signals",
      label: "Auth provider",
      status: hasOAuthSignals ? "PASS" : "WARN",
      detail: hasOAuthSignals ? "Auth provider detected in page source." : "No known auth provider detected.",
    });

    // Observability
    const errorTools = ["sentry", "bugsnag", "logrocket", "rollbar", "datadog"];
    const hasErrorMonitoring = errorTools.some((t) => pageResult.html.toLowerCase().includes(t));
    checks.push({
      category: CATEGORIES.OBSERVABILITY,
      checkKey: "error_monitoring",
      label: "Error monitoring",
      status: hasErrorMonitoring ? "PASS" : "WARN",
      detail: hasErrorMonitoring ? "Error monitoring tool detected." : "No error monitoring detected (Sentry, Bugsnag, etc.).",
    });

    const analyticsTools = ["gtag", "plausible.io", "posthog", "mixpanel", "amplitude", "_ga"];
    const hasAnalytics = analyticsTools.some((t) => pageResult.html.toLowerCase().includes(t));
    checks.push({
      category: CATEGORIES.OBSERVABILITY,
      checkKey: "analytics_present",
      label: "Analytics",
      status: hasAnalytics ? "PASS" : "WARN",
      detail: hasAnalytics ? "Analytics tool detected." : "No analytics detected (GA4, Plausible, PostHog, etc.).",
    });

    // Health endpoint returns JSON/text for monitors, not the app shell — so
    // content-verify (fileServed rejects the HTML shell) to stay right on catch-all.
    const base = httpsUrl.replace(/\/$/, "");
    const healthFound =
      (await fileServed(`${base}/api/health`)) || (await fileServed(`${base}/health`));
    checks.push({
      category: CATEGORIES.OBSERVABILITY,
      checkKey: "health_endpoint",
      label: "/health endpoint",
      status: healthFound ? "PASS" : "WARN",
      detail: healthFound
        ? "Health check endpoint found."
        : "No /health or /api/health endpoint detected.",
    });

    // Legal & Compliance
    const htmlLower = pageResult.html.toLowerCase();

    // Auto-detect the markets this site appears to serve (TLD / lang / currency).
    // Used as the jurisdiction-filter fallback when the user didn't declare markets;
    // always recorded for audit + the "we also detected X" UI hint. Set before the
    // extended/compliance checks stream so emitted statuses match the final set.
    detectedMarkets = detectMarketsFromPage({ hostname, html: pageResult.html, htmlLower });
    if (effectiveMarkets.length === 0) effectiveMarkets = detectedMarkets;

    // ⚠️ Launch-blocking legal checks. See the `resolveLegalDocumentChecks` note
    // at the top of this file for why both error directions are expensive and why
    // the widened matcher and the content-verify have to ship together.
    //
    // Two deliberate inputs here:
    //   · `contentHtml`, NOT `pageResult.html`. These are PARSED checks, not
    //     fetched ones, so on a client-rendered site they must read the DOM the
    //     render agent adopted. Reading the static shell is how gitwork.co.uk —
    //     which links `/privacy` from its rendered footer — got a FAIL as its top
    //     P1 while `canonical_url` and `h1_present` in the same scan were
    //     correctly marked unassessable.
    //   · `unreadableShell: spaShell`. True only when the static HTML is a shell
    //     AND no render was adopted, i.e. exactly when the page's own links were
    //     never legible.
    //
    //     ⚠️ It does NOT gate whether the conventional paths are probed — that
    //     comment used to say so and directly contradicted the code 1,700 lines
    //     earlier. The probes run for EVERY site (see `resolveOne`); the ONLY case
    //     that skips them is `catchAll200 && !unreadableShell`, where a 200 proves
    //     nothing and the readable markup is already good evidence. What this flag
    //     actually decides is three other things: it keeps the probes alive on a
    //     catch-all host, it turns a confirmed-but-unlinked document into a PASS
    //     rather than the WARN a readable page would earn ("nothing links to it" is
    //     unsupportable when the links were never legible), and it adds the
    //     shell-explaining sentence to the detail.
    const legalVerdicts = await resolveLegalDocumentChecks({
      html: contentHtml,
      baseUrl,
      catchAll200,
      unreadableShell: spaShell,
      probe: (probeUrl) => probePath(probeUrl, 60_000),
    });

    checks.push({
      category: CATEGORIES.LEGAL,
      checkKey: "privacy_policy",
      label: "Privacy Policy",
      status: legalVerdicts.privacy.status,
      detail: legalVerdicts.privacy.detail,
      evidence: legalVerdicts.privacy.evidence,
      confidence: legalVerdicts.privacy.confidence,
    });

    checks.push({
      category: CATEGORIES.LEGAL,
      checkKey: "terms_of_service",
      label: "Terms of Service",
      status: legalVerdicts.terms.status,
      detail: legalVerdicts.terms.detail,
      evidence: legalVerdicts.terms.evidence,
      confidence: legalVerdicts.terms.confidence,
    });

    // ⚠️ This used to be a CLOSED VENDOR LIST (cookiebot / osano / onetrust / ...), so a
    // SELF-HOSTED banner was invisible. Live-scanned www.gov.uk on 2026-08-22 and it was
    // reported as having no cookie consent mechanism — while the page ships the reference
    // UK implementation: `govuk-cookie-banner` / `gem-c-cookie-banner`, with accept and
    // reject confirmation messages. Same shape as the CDN five-vendor list in §44.2:
    // a closed fingerprint list reported as directly-observed absence.
    //
    // Detect the MECHANISM — a banner container named for what it is — and keep the
    // vendor names as additional signals rather than as the definition.
    const hasCookieBanner = hasCookieConsentMechanism(pageResult.html);
    const hasCookieLink = ["/cookie-policy", "/cookies", "/legal/cookies"].some((p) =>
      htmlLower.includes(`href="${p}`) || htmlLower.includes(`href='${p}`),
    );
    checks.push({
      category: CATEGORIES.LEGAL,
      checkKey: "cookie_consent",
      label: "Cookie consent / GDPR",
      status: hasCookieBanner || hasCookieLink ? "PASS" : "WARN",
      detail: hasCookieBanner || hasCookieLink
        ? "Cookie consent or GDPR compliance mechanism detected."
        : "No cookie consent mechanism — required for EU/UK markets and ad platform compliance.",
    });

    const hasRefundPolicy = ["/refund", "/refund-policy", "/cancellation", "/money-back", "/return-policy"].some((p) =>
      htmlLower.includes(`href="${p}`) || htmlLower.includes(`href='${p}`),
    );
    checks.push({
      category: CATEGORIES.LEGAL,
      checkKey: "refund_policy",
      label: "Refund / Cancellation policy",
      status: hasRefundPolicy ? "PASS" : "WARN",
      detail: hasRefundPolicy
        ? "Refund or cancellation policy link detected."
        : "No refund policy — recommended for payment processor compliance and reducing chargebacks.",
    });

    // Missing Pages — batch HEAD requests in parallel
    const missingPagesApplicable = isCategoryApplicable(platform, CATEGORIES.MISSING_PAGES, surfaceKind);
    const [aboutStatus, contactStatus, faqStatus, statusPageStatus, changelogStatus] = missingPagesApplicable
      ? await Promise.all([
          headRequest(`${baseUrl}/about`),
          headRequest(`${baseUrl}/contact`),
          headRequest(`${baseUrl}/faq`),
          headRequest(`${baseUrl}/status`),
          headRequest(`${baseUrl}/changelog`),
        ])
      : [0, 0, 0, 0, 0];

    checks.push(routePageCheck(
      "Missing Pages", "about_page", "About / Team page",
      aboutStatus === 200,
      "/about page found.",
      "No /about page — builds team credibility and brand trust with prospects.",
    ));

    checks.push(routePageCheck(
      "Missing Pages", "contact_page", "Contact page",
      contactStatus === 200,
      "/contact page found.",
      "No /contact page — users need a way to reach you for support and sales inquiries.",
    ));

    checks.push(routePageCheck(
      "Missing Pages", "faq_page", "FAQ / Help page",
      faqStatus === 200,
      "/faq page found.",
      "No /faq page — reduces support burden and improves onboarding.",
    ));

    // Status page is usually detected by an embedded statuspage/uptime script (a
    // reliable in-page signal); the route probe only counts off catch-all.
    const hasStatusSignals = htmlLower.includes("statuspage") || htmlLower.includes("status.io") ||
      htmlLower.includes("betteruptime") || htmlLower.includes("uptimerobot");
    const hasStatusPage = hasStatusSignals || (!catchAll200 && statusPageStatus === 200);
    checks.push({
      category: CATEGORIES.MISSING_PAGES,
      checkKey: "status_page",
      label: "Status / uptime page",
      status: hasStatusPage ? "PASS" : "WARN",
      detail: hasStatusPage
        ? "Status page or uptime monitoring tool detected."
        : "No status page — needed to communicate incidents and build operational trust.",
    });

    checks.push(routePageCheck(
      "Missing Pages", "changelog", "Changelog / What's new",
      changelogStatus === 200,
      "/changelog page found.",
      "No changelog — users want to know what's shipping; important for retention and credibility.",
    ));

    // SaaS Readiness
    const hasBillingPortal = ["/billing", "/billing-portal", "/subscription", "/manage-subscription"].some((p) =>
      htmlLower.includes(`href="${p}`) || htmlLower.includes(`href='${p}`),
    );
    checks.push({
      category: CATEGORIES.SAAS,
      checkKey: "billing_portal",
      label: "Billing / subscription management",
      status: hasBillingPortal ? "PASS" : "WARN",
      detail: hasBillingPortal
        ? "Billing or subscription management link found."
        : "No billing portal detected — users need self-service subscription management to reduce churn.",
    });

    const hasAccountSettings = ["/account", "/settings", "/profile", "/dashboard/settings", "/app/settings"].some((p) =>
      htmlLower.includes(`href="${p}`) || htmlLower.includes(`href='${p}`),
    );
    checks.push({
      category: CATEGORIES.SAAS,
      checkKey: "account_settings",
      label: "Account settings",
      status: hasAccountSettings ? "PASS" : "WARN",
      detail: hasAccountSettings
        ? "Account settings page link found."
        : "No account settings page — users need to manage their profile and preferences.",
    });

    const hasPasswordReset = ["/forgot-password", "/reset-password", "/auth/forgot", "/forgot", "/password-reset"].some((p) =>
      htmlLower.includes(`href="${p}`) || htmlLower.includes(`href='${p}`),
    );
    checks.push({
      category: CATEGORIES.SAAS,
      checkKey: "password_reset",
      label: "Password reset",
      status: hasPasswordReset ? "PASS" : "WARN",
      detail: hasPasswordReset
        ? "Password reset flow link detected."
        : "No password reset — essential for user account recovery; absence increases churn.",
    });

    const hasSupportWidget = ["intercom", "crisp.chat", "zendesk", "freshdesk", "tawk.to", "chatwoot"].some((s) =>
      htmlLower.includes(s),
    );
    const hasSupportLink = ["/support", "/help", "/help-center", "/helpdesk"].some((p) =>
      htmlLower.includes(`href="${p}`) || htmlLower.includes(`href='${p}`),
    );
    checks.push({
      category: CATEGORIES.SAAS,
      checkKey: "support_channel",
      label: "Support channel",
      status: hasSupportWidget || hasSupportLink ? "PASS" : "WARN",
      detail: hasSupportWidget || hasSupportLink
        ? "Support page or live chat widget detected."
        : "No support channel found — users with no help path will churn silently.",
    });

    const hasSocialProof = ["testimonial", "review", "customer stor", "case stud", "trusted by", "loved by", "join thousands", "rating"].some((s) =>
      htmlLower.includes(s),
    );
    checks.push({
      category: CATEGORIES.SAAS,
      checkKey: "social_proof",
      label: "Social proof / testimonials",
      status: hasSocialProof ? "PASS" : "WARN",
      detail: hasSocialProof
        ? "Social proof signals detected (testimonials, reviews, customer stories)."
        : "No social proof found — critical for conversion and buyer confidence.",
    });

    const hasOnboarding = ["/onboarding", "/welcome", "/get-started", "/setup", "/tour", "/quickstart"].some((p) =>
      htmlLower.includes(`href="${p}`) || htmlLower.includes(`href='${p}`),
    );
    checks.push({
      category: CATEGORIES.SAAS,
      checkKey: "onboarding_flow",
      label: "Onboarding flow",
      status: hasOnboarding ? "PASS" : "WARN",
      detail: hasOnboarding
        ? "Onboarding or welcome flow link detected."
        : "No onboarding flow — most vibe-coded apps skip this; it's the #1 activation lever.",
    });

    // Mobile & Accessibility
    const hasViewport = /name=["']viewport["']/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.MOBILE,
      checkKey: "viewport_meta",
      label: "Viewport meta tag",
      status: hasViewport ? "PASS" : "FAIL",
      detail: hasViewport
        ? "Viewport meta tag found — site is mobile-aware."
        : "No viewport meta tag — site will not render correctly on mobile devices.",
    });

    const hasHtmlLang = /<html[^>]+lang=/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.MOBILE,
      checkKey: "html_lang",
      label: "HTML language attribute",
      status: hasHtmlLang ? "PASS" : "WARN",
      detail: hasHtmlLang
        ? "HTML lang attribute found — correct for screen readers and SEO."
        : "No lang attribute on <html> element — required for screen reader accessibility.",
    });

    const hasAriaAttributes = /aria-[a-z]+=/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.MOBILE,
      checkKey: "aria_attributes",
      label: "ARIA accessibility attributes",
      status: hasAriaAttributes ? "PASS" : "WARN",
      detail: hasAriaAttributes
        ? "ARIA attributes detected — indicates accessibility consideration in markup."
        : "No ARIA attributes found — site may not be usable by screen reader users.",
    });

    const hasResponsiveImages = pageResult.html.includes("srcset") || pageResult.html.includes("<picture") ||
      pageResult.html.includes('loading="lazy"') || pageResult.html.includes("loading='lazy'");
    checks.push({
      category: CATEGORIES.MOBILE,
      checkKey: "responsive_images",
      label: "Responsive / optimised images",
      status: hasResponsiveImages ? "PASS" : "WARN",
      detail: hasResponsiveImages
        ? "Responsive image patterns detected (srcset, lazy loading, picture element)."
        : "No responsive image patterns — may cause poor performance and layout issues on mobile.",
    });

    // Social sharing SEO
    const hasOgImage = /property=["']og:image["']/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.SEO,
      checkKey: "og_image",
      label: "og:image (social preview)",
      status: hasOgImage ? "PASS" : "WARN",
      detail: hasOgImage
        ? "og:image tag found — links will display a preview image when shared."
        : "No og:image — links shared on Slack, iMessage, LinkedIn, and X will show a blank card.",
    });

    const hasTwitterCard = /name=["']twitter:card["']/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.SEO,
      checkKey: "twitter_card",
      label: "Twitter / X Card",
      status: hasTwitterCard ? "PASS" : "WARN",
      detail: hasTwitterCard
        ? "Twitter Card meta tag found."
        : "No Twitter Card — links shared on X won't expand into rich preview cards.",
    });

    // Additional security headers
    const xCto = pageResult.headers["x-content-type-options"];
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "x_content_type_options",
      label: "X-Content-Type-Options",
      status: xCto ? "PASS" : "WARN",
      detail: xCto
        ? "X-Content-Type-Options header present — MIME sniffing blocked."
        : "No X-Content-Type-Options — browsers may MIME-sniff responses, enabling content injection attacks.",
      evidence: xCto ?? undefined,
    });

    // Absent ⇒ the SPEC DEFAULTS apply (`self`), not "unrestricted", and the
    // deprecated Feature-Policy is read as a fallback. See `permissionsPolicyVerdict`.
    const permissions = permissionsPolicyVerdict(pageResult.headers);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "permissions_policy",
      label: "Permissions-Policy",
      status: permissions.status,
      detail: permissions.detail,
      evidence: permissions.evidence,
    });

    const referrerPolicy = pageResult.headers["referrer-policy"];
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "referrer_policy",
      label: "Referrer-Policy",
      status: referrerPolicy ? "PASS" : "WARN",
      detail: referrerPolicy
        ? `Referrer-Policy: ${referrerPolicy}`
        : "No Referrer-Policy — page URLs may leak to third parties via the Referer header.",
      evidence: referrerPolicy ?? undefined,
    });

    // Transactional email detection
    const emailProviderSignals = ["resend.com", "sendgrid.net", "mailgun.com", "postmarkapp.com", "sparkpostmail", "mandrillapp", "ses.amazonaws.com"];
    const hasEmailProvider = emailProviderSignals.some((p) => htmlLower.includes(p));
    checks.push({
      category: CATEGORIES.SAAS,
      checkKey: "email_provider",
      label: "Transactional email provider",
      status: hasEmailProvider ? "PASS" : "WARN",
      detail: hasEmailProvider
        ? "Transactional email provider detected (Resend, SendGrid, Mailgun, Postmark, etc.)."
        : "No email provider detected — password reset, welcome emails, and payment receipts may not be configured.",
    });

    // AI platform watermark detection
    const aiWatermarks = ["built with lovable", "made with lovable", "lovable.dev", "bolt.new", "created with bolt", "created with v0", "generated by v0", "v0.dev", "replit.com/badge"];
    const hasAiWatermark = aiWatermarks.some((s) => htmlLower.includes(s));
    checks.push({
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "ai_platform_origin",
      label: "AI platform watermark",
      status: hasAiWatermark ? "WARN" : "PASS",
      detail: hasAiWatermark
        ? "AI platform attribution detected (Lovable, Bolt, v0, Replit) — custom branding should be applied before launch."
        : "No AI platform watermarks detected in page source.",
    });

    // Parallel batch: favicon, PWA manifest
    // Favicon (an image) and manifest.json (JSON) are content-verifiable, so they
    // stay correct on catch-all hosts — a soft-200 HTML shell is not an icon/JSON.
    const mobileApplicable = isCategoryApplicable(platform, CATEGORIES.MOBILE, surfaceKind);
    const [faviconFound, manifestFound] = mobileApplicable
      ? await Promise.all([
          fileServed(`${baseUrl}/favicon.ico`),
          fileServed(`${baseUrl}/manifest.json`, (body, ct) => ct.includes("json") || /"(name|icons|start_url|display)"/.test(body)),
        ])
      : [false, false];

    const hasFaviconLink = /rel=["'](shortcut icon|icon)["']/i.test(pageResult.html);
    const hasFavicon = hasFaviconLink || faviconFound;
    checks.push({
      category: CATEGORIES.MOBILE,
      checkKey: "favicon",
      label: "Favicon / app icon",
      status: hasFavicon ? "PASS" : "WARN",
      detail: hasFavicon
        ? "Favicon found."
        : "No favicon detected — vibe-coded apps often retain the AI platform's default icon after launch.",
    });

    const hasManifestLink = /rel=["']manifest["']/i.test(pageResult.html);
    const hasManifest = hasManifestLink || manifestFound;
    checks.push({
      category: CATEGORIES.MOBILE,
      checkKey: "pwa_manifest",
      label: "Web App Manifest (PWA)",
      status: hasManifest ? "PASS" : "WARN",
      detail: hasManifest
        ? "Web app manifest found — app supports home screen installation."
        : "No manifest.json — app cannot be installed as a PWA or trigger Chrome's install prompt.",
    });

    if (ctx.isPaymentEnabled && catchAll200) {
      // Can't probe a webhook route on a catch-all host (every path 200s).
      checks.push({ category: CATEGORIES.PAYMENTS, checkKey: "stripe_webhook", label: "Stripe webhook endpoint", status: "SKIPPED", detail: "Host serves catch-all 200s — webhook route presence can't be probed reliably." });
    } else if (ctx.isPaymentEnabled) {
      // Reuses the probe already taken above (to correct the payment signal) — avoids a second request.
      checks.push({
        category: CATEGORIES.PAYMENTS,
        checkKey: "stripe_webhook",
        label: "Stripe webhook endpoint",
        status: liveStripeSignal ? "PASS" : "WARN",
        detail: liveStripeSignal
          ? "Stripe webhook endpoint found — subscription lifecycle events will be processed."
          : "No Stripe webhook detected — subscription upgrades, failures, and cancellations won't be handled automatically.",
        evidence: liveStripeWebhookStatus ? `Status: ${liveStripeWebhookStatus}` : undefined,
      });
    } else {
      checks.push({ category: CATEGORIES.PAYMENTS, checkKey: "stripe_webhook", label: "Stripe webhook endpoint", status: "SKIPPED", detail: "Skipped — no payment integration detected on this project." });
    }

    // App Store & Mobile Distribution — skip entirely (including the .well-known/ HEAD requests) if no mobile signals
    // AASA + assetlinks.json are JSON, so content-verify (a catch-all HTML shell
    // is not JSON) — keeps deep-link detection correct on Vercel/SPA hosts.
    const isJsonFile = (body: string, ct: string) => ct.includes("json") || /^\s*[[{]/.test(body);
    const appStoreApplicable = isCategoryApplicable(platform, CATEGORIES.APP_STORE, surfaceKind);
    const [aasaFound, assetLinksFound] = ctx.isMobileApp && appStoreApplicable ? await Promise.all([
      fileServed(`${baseUrl}/.well-known/apple-app-site-association`, isJsonFile),
      fileServed(`${baseUrl}/.well-known/assetlinks.json`, isJsonFile),
    ]) : [false, false];
    const hasAppleSmartBanner = /name=["']apple-itunes-app["']/i.test(pageResult.html);
    if (!ctx.isMobileApp) {
      skipChecks(checks, "App Store & Mobile", [
        ["apple_touch_icon", "Apple touch icon"],
        ["apple_app_store", "Apple App Store presence"],
        ["google_play_store", "Google Play Store presence"],
        ["universal_links", "Universal Links (iOS deep linking)"],
        ["android_asset_links", "Android App Links (deep linking)"],
        ["wallet_payments", "Apple Pay / Google Pay / Amazon Pay"],
      ], "Skipped — no mobile app signals detected on this project.");
    } else {

    const hasAppleTouchIcon = /rel=["']apple-touch-icon["']/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey: "apple_touch_icon",
      label: "Apple touch icon",
      status: hasAppleTouchIcon ? "PASS" : "WARN",
      detail: hasAppleTouchIcon
        ? "Apple touch icon found — app can be pinned to iOS home screen with correct branding."
        : "No apple-touch-icon — required for iOS home screen install and Apple App Store submission.",
    });

    const hasAppStoreLink = htmlLower.includes("apps.apple.com") || htmlLower.includes("itunes.apple.com");
    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey: "apple_app_store",
      label: "Apple App Store presence",
      status: hasAppleSmartBanner || hasAppStoreLink ? "PASS" : "WARN",
      detail: hasAppleSmartBanner || hasAppStoreLink
        ? "Apple App Store link or Smart App Banner detected."
        : "No Apple App Store signals — if targeting iOS users, consider a native app or PWA submission.",
    });

    const hasGooglePlayLink = htmlLower.includes("play.google.com/store/apps");
    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey: "google_play_store",
      label: "Google Play Store presence",
      status: hasGooglePlayLink ? "PASS" : "WARN",
      detail: hasGooglePlayLink
        ? "Google Play Store link detected."
        : "No Google Play Store link — Android distribution via Play Store or TWA (Trusted Web Activity) not detected.",
    });

    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey: "universal_links",
      label: "Universal Links (iOS deep linking)",
      status: aasaFound ? "PASS" : "WARN",
      detail: aasaFound
        ? "apple-app-site-association file found — iOS Universal Links configured for app/web handoff."
        : "No apple-app-site-association — Universal Links not set up (required for App Clips and native app ↔ web routing).",
    });

    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey: "android_asset_links",
      label: "Android App Links (deep linking)",
      status: assetLinksFound ? "PASS" : "WARN",
      detail: assetLinksFound
        ? "assetlinks.json found — Android App Links configured."
        : "No assetlinks.json — Android deep linking not set up (required for Play Store TWA submission).",
    });

    const hasApplePaySignals = htmlLower.includes("applepaysession") || htmlLower.includes("apple-pay-sdk") || htmlLower.includes("apple_pay");
    const hasGooglePaySignals = htmlLower.includes("pay.google.com") || htmlLower.includes("google.payments") || htmlLower.includes("googlepay");
    const hasAmazonPaySignals = htmlLower.includes("pay.amazon.com") || htmlLower.includes("amazonpay") || htmlLower.includes("amazon_pay");
    const hasWalletPayments = hasApplePaySignals || hasGooglePaySignals || hasAmazonPaySignals;
    const walletNames = [hasApplePaySignals && "Apple Pay", hasGooglePaySignals && "Google Pay", hasAmazonPaySignals && "Amazon Pay"].filter(Boolean).join(", ");
    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey: "wallet_payments",
      label: "Apple Pay / Google Pay / Amazon Pay",
      status: hasWalletPayments ? "PASS" : "WARN",
      detail: hasWalletPayments
        ? `Wallet payment detected (${walletNames}) — mobile checkout optimised.`
        : "No wallet payments detected — Apple Pay, Google Pay, and Amazon Pay dramatically improve mobile conversion rates.",
    });
    } // end if (ctx.isMobileApp)

    // Global Distribution & Localisation
    const hasHreflang = htmlLower.includes("hreflang");
    checks.push({
      category: CATEGORIES.GLOBAL_DISTRIBUTION,
      checkKey: "hreflang_tags",
      label: "hreflang tags (multi-region SEO)",
      status: hasHreflang ? "PASS" : "WARN",
      detail: hasHreflang
        ? "hreflang tags found — search engines will serve the correct regional version to each country."
        : "No hreflang tags — Google won't know which language/region version to surface to international users.",
    });

    const hasCharsetUtf8 = /charset=["']?utf-8/i.test(pageResult.html) || pageResult.headers["content-type"]?.toLowerCase().includes("utf-8");
    checks.push({
      category: CATEGORIES.GLOBAL_DISTRIBUTION,
      checkKey: "charset_utf8",
      label: "UTF-8 character encoding",
      status: hasCharsetUtf8 ? "PASS" : "WARN",
      detail: hasCharsetUtf8
        ? "UTF-8 charset declared — supports all international character sets."
        : "No UTF-8 charset — Chinese, Japanese, Arabic, and other non-Latin characters may render incorrectly.",
    });

    const hasCcpaSignal = htmlLower.includes("do not sell") || htmlLower.includes("your privacy choices") || htmlLower.includes("opt-out of sale") || htmlLower.includes("ccpa");
    checks.push({
      category: CATEGORIES.GLOBAL_DISTRIBUTION,
      checkKey: "ccpa_compliance",
      label: "CCPA (California privacy rights)",
      status: hasCcpaSignal ? "PASS" : "WARN",
      detail: hasCcpaSignal
        ? "CCPA compliance signals detected — California consumer privacy rights addressed."
        : "No CCPA signals — required for California users (40M people). Must include a &lsquo;Do Not Sell&rsquo; opt-out link.",
    });

    const currencySymbols = ["€", "£", "¥", "₹", "kr ", "chf", "sgd", "aud", "cad", "r$"];
    const hasMultiCurrency = currencySymbols.some((s) => pageResult.html.toLowerCase().includes(s));
    checks.push({
      category: CATEGORIES.GLOBAL_DISTRIBUTION,
      checkKey: "multi_currency",
      label: "Multi-currency pricing",
      status: hasMultiCurrency ? "PASS" : "WARN",
      detail: hasMultiCurrency
        ? "Multiple currency symbols detected — product appears to support international pricing."
        : "USD-only pricing detected — EU (€), UK (£), and Asian markets expect local currency; USD-only loses 20–40% of international revenue.",
    });

    const hasRtlSupport = /dir=["']rtl["']/i.test(pageResult.html) || htmlLower.includes(":dir(rtl)") || htmlLower.includes("[dir=rtl]");
    checks.push({
      category: CATEGORIES.GLOBAL_DISTRIBUTION,
      checkKey: "rtl_support",
      label: "RTL language support",
      status: hasRtlSupport ? "PASS" : "WARN",
      detail: hasRtlSupport
        ? "Right-to-left layout support detected — Arabic, Hebrew, and Persian markets accessible."
        : "No RTL support detected — required for Arabic (420M speakers), Hebrew, Farsi, and Urdu-speaking markets.",
    });

    const hasLanguageSwitcher = /href=["'][^"']*\/(en|de|fr|es|ja|zh|ko|ar|pt|nl|it|pl|sv)[\/"']/i.test(pageResult.html) ||
      htmlLower.includes('hreflang="x-default"') ||
      htmlLower.includes("language-selector") ||
      htmlLower.includes("lang-switcher") ||
      htmlLower.includes("locale-switcher");
    checks.push({
      category: CATEGORIES.GLOBAL_DISTRIBUTION,
      checkKey: "language_switcher",
      label: "Language / region switcher",
      status: hasLanguageSwitcher ? "PASS" : "WARN",
      detail: hasLanguageSwitcher
        ? "Language or region selector detected."
        : "No language switcher found — international users cannot switch to their preferred language.",
    });

    const hasInternationalPayments = htmlLower.includes("paypal") || htmlLower.includes("klarna") ||
      htmlLower.includes("afterpay") || htmlLower.includes("ideal") || htmlLower.includes("sofort") ||
      htmlLower.includes("alipay") || htmlLower.includes("wechat pay") || htmlLower.includes("paytm") ||
      htmlLower.includes("upi") || htmlLower.includes("sepa");
    checks.push({
      category: CATEGORIES.GLOBAL_DISTRIBUTION,
      checkKey: "international_payments",
      label: "International payment methods",
      status: hasInternationalPayments ? "PASS" : "WARN",
      detail: hasInternationalPayments
        ? "International payment methods detected (PayPal, Klarna, iDEAL, Alipay, etc.)."
        : "Card-only payments detected — EU (iDEAL, SEPA, Klarna), Asia (Alipay, WeChat Pay, UPI), and LATAM markets expect local options.",
    });

    const hasEuVatSignal = htmlLower.includes(" vat") || htmlLower.includes("value added tax") || htmlLower.includes("tax invoice") || htmlLower.includes("ust-idnr") || htmlLower.includes("mwst");
    checks.push({
      category: CATEGORIES.GLOBAL_DISTRIBUTION,
      checkKey: "eu_vat",
      label: "EU VAT / tax handling",
      status: hasEuVatSignal ? "PASS" : "WARN",
      detail: hasEuVatSignal
        ? "VAT or tax handling signals detected — EU digital services tax compliance appears considered."
        : "No VAT signals detected — EU DST regulations require VAT collection and invoicing for European B2C customers.",
    });

    // ─── Additional SEO ────────────────────────────────────────────────────────
    const hasStructuredData = /<script[^>]+type=["']application\/ld\+json["']/i.test(contentHtml);
    checks.push({
      category: CATEGORIES.SEO,
      checkKey: "structured_data",
      label: "JSON-LD structured data",
      status: hasStructuredData ? "PASS" : "WARN",
      detail: hasStructuredData
        ? "JSON-LD structured data found — rich results eligible in Google Search."
        : "No JSON-LD structured data — add schema.org markup to enable rich snippets (reviews, FAQs, product details).",
    });

    const hasPreloadLinks = /<link[^>]+rel=["']preload["']/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.SEO,
      checkKey: "preload_hints",
      label: "Resource preload hints",
      status: hasPreloadLinks ? "PASS" : "WARN",
      detail: hasPreloadLinks
        ? "Resource preload hints detected — critical resources load earlier."
        : "No preload hints — add <link rel=preload> for fonts, hero images, and critical JS/CSS.",
    });

    const hasVerificationMeta = /name=["'](google-site-verification|msvalidate\.01|yandex-verification)["']/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.SEO,
      checkKey: "search_engine_verified",
      label: "Search engine verification",
      status: hasVerificationMeta ? "PASS" : "WARN",
      detail: hasVerificationMeta
        ? "Search Console / Bing Webmaster verification meta tag found."
        : "No search engine verification — link Google Search Console to monitor indexing and search performance.",
    });

    const hasMetaRobots = /name=["']robots["']/i.test(pageResult.html);
    const blocksIndexing = hasMetaRobots && /content=["'][^"']*noindex/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.SEO,
      checkKey: "meta_robots",
      label: "Robots meta tag",
      status: blocksIndexing ? "FAIL" : hasMetaRobots ? "PASS" : "WARN",
      detail: blocksIndexing
        ? "noindex robots meta tag detected — search engines will not index this page."
        : hasMetaRobots
          ? "Robots meta tag found."
          : "No robots meta tag — add one to control indexing behaviour per page.",
    });

    const hasOgSiteName = /property=["']og:site_name["']/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.SEO,
      checkKey: "og_site_name",
      label: "og:site_name (brand in shares)",
      status: hasOgSiteName ? "PASS" : "WARN",
      detail: hasOgSiteName
        ? "og:site_name found — brand name will appear in social shares."
        : "No og:site_name — add it so your brand name appears consistently when links are shared on social.",
    });

    // ─── Additional Security ───────────────────────────────────────────────────
    const hasSri = /integrity=["'][a-z0-9+/=\-]+["']/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "subresource_integrity",
      label: "Subresource Integrity (SRI)",
      status: hasSri ? "PASS" : "WARN",
      detail: hasSri
        ? "SRI hashes found on external scripts — supply-chain injection attacks mitigated."
        : "No SRI hashes — a compromised CDN could inject malicious code into your app.",
    });

    const setCookieHeader = pageResult.headers["set-cookie"] ?? "";
    const lowerCookies = setCookieHeader.toLowerCase();
    const hasSecureCookieAttrs = lowerCookies.includes("secure") && lowerCookies.includes("samesite");
    // A response that sets NO cookies cannot have insecure ones. The old ternary read
    // `setCookieHeader ? "WARN" : "WARN"` — someone began drawing this distinction and
    // never finished it — so every cookie-less site was told its cookies were
    // "vulnerable to CSRF and session theft". Verified outside Pulse with curl:
    // stripe.com/gb sets zero cookies and was warned anyway.
    const setsCookies = setCookieHeader.trim().length > 0;
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "secure_cookie_attributes",
      label: "Secure cookie attributes",
      status: !setsCookies ? "SKIPPED" : hasSecureCookieAttrs ? "PASS" : "WARN",
      detail: !setsCookies
        ? "Not assessed — this response set no cookies, so there are no cookie attributes to check. If cookies are only set after sign-in, they are not visible to an unauthenticated scan."
        : hasSecureCookieAttrs
          ? "Cookies have Secure and SameSite attributes — session hijacking risk reduced."
          : "Cookies lack Secure or SameSite attributes — vulnerable to CSRF and session theft on mixed-content pages.",
    });

    // Absent ⇒ SKIPPED (the `secure_cookie_attributes` shape just above), `*` ⇒
    // WARN, own origin ⇒ PASS, any other origin ⇒ WARN. See `corsPolicyVerdict`
    // for why the absence branch and the PASS branch had to be fixed together.
    const cors = corsPolicyVerdict(pageResult.headers, pageResult.finalUrl || httpsUrl);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "cors_policy",
      label: "CORS policy (Access-Control-Allow-Origin on this document)",
      status: cors.status,
      detail: cors.detail,
      evidence: cors.evidence,
    });

    // security.txt is plain text with Contact:/Expires: fields — content-verify so
    // a catch-all HTML shell isn't mistaken for a disclosure file.
    const securityTxtFound = await fileServed(
      `${baseUrl}/.well-known/security.txt`,
      (body, ct) => ct.includes("text/plain") || /contact:|expires:|encryption:/i.test(body),
    );
    // ⚠️ WORDING, not logic. The probe is right — it content-verifies, so a
    // catch-all HTML 404 shell is not mistaken for a disclosure file, and it was
    // NOT fooled by gitwork.co.uk's catch-all 200. The sentence was the defect:
    // it converted "this host does not serve the RFC 9116 file" into "security
    // researchers have no official path to report vulnerabilities". Verified
    // false on both sites it fired on — news.ycombinator.com publishes a
    // `/security.html` page (linked from the footer Pulse parsed) with a contact
    // address, and mozilla.org serves a security.txt with a bounty programme.
    // Name the missing artefact and what it buys, not an absence of process.
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "security_txt",
      label: "security.txt (responsible disclosure)",
      status: securityTxtFound ? "PASS" : "WARN",
      detail: securityTxtFound
        ? "security.txt found — responsible disclosure channel available for security researchers."
        : "No machine-readable security.txt at /.well-known/security.txt. If a disclosure contact already exists on a security or contact page, add the RFC 9116 file too so scanners, researchers and bug-bounty tooling can discover it automatically instead of hunting for it.",
    });

    const serverHeader = pageResult.headers["server"] ?? "";
    const exposesVersion = /\d+\.\d+/.test(serverHeader) && serverHeader.length > 3;
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "server_header_leakage",
      label: "Server version not exposed",
      status: exposesVersion ? "WARN" : "PASS",
      detail: exposesVersion
        ? `Server header exposes version (${serverHeader}) — attackers can target known CVEs for this version.`
        : "Server header does not expose detailed version information.",
    });

    const hasMixedContent = /http:\/\/[^"'\s>]+\.(js|css|woff2?|svg)/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "no_mixed_content",
      label: "No mixed HTTP/HTTPS content",
      status: hasMixedContent ? "WARN" : "PASS",
      detail: hasMixedContent
        ? "HTTP (non-HTTPS) resource URLs found in page — mixed content triggers browser security warnings."
        : "No obvious mixed content — resource references appear to be HTTPS.",
    });

    // ─── Additional Performance ─────────────────────────────────────────────────
    const hasPreconnect = /<link[^>]+rel=["']preconnect["']/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.PERFORMANCE,
      checkKey: "preconnect_hints",
      label: "Preconnect / DNS prefetch hints",
      status: hasPreconnect ? "PASS" : "WARN",
      detail: hasPreconnect
        ? "Preconnect hints found — third-party connections warm up before they are needed."
        : "No preconnect hints — add <link rel=preconnect> for fonts, CDN, and analytics origins.",
    });

    const hasNativeLazy = /loading=["']lazy["']/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.PERFORMANCE,
      checkKey: "native_lazy_loading",
      label: "Native image lazy loading",
      status: hasNativeLazy ? "PASS" : "WARN",
      detail: hasNativeLazy
        ? "loading=lazy detected — images below the fold load on demand, reducing initial page weight."
        : "No native lazy loading — add loading=lazy to below-the-fold images to improve LCP.",
    });

    const hasFontDisplaySwap = /font-display:\s*swap/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.PERFORMANCE,
      checkKey: "font_display_swap",
      label: "Font display optimisation",
      status: hasFontDisplaySwap ? "PASS" : "WARN",
      detail: hasFontDisplaySwap
        ? "font-display: swap found — text visible during web font loading (no FOIT)."
        : "No font-display: swap — web fonts may block text render, contributing to poor CLS/LCP scores.",
    });

    const varyHeader = pageResult.headers["vary"];
    checks.push({
      category: CATEGORIES.PERFORMANCE,
      checkKey: "vary_header",
      label: "Vary header (content negotiation)",
      status: varyHeader ? "PASS" : "WARN",
      detail: varyHeader
        ? `Vary: ${varyHeader} — CDN caches serve the correct variant per request.`
        : "No Vary header — CDN may serve wrong compression type to some clients.",
    });

    const serverTimingHeader = pageResult.headers["server-timing"];
    checks.push({
      category: CATEGORIES.PERFORMANCE,
      checkKey: "server_timing",
      label: "Server-Timing header",
      status: serverTimingHeader ? "PASS" : "WARN",
      detail: serverTimingHeader
        ? "Server-Timing header present — backend performance metrics exposed to browser DevTools."
        : "No Server-Timing header — add it to expose database/cache timings for performance diagnostics.",
    });

    // ─── Additional Authentication ──────────────────────────────────────────────
    if (!ctx.isAuthEnabled) {
      skipChecks(checks, "Authentication", [
        ["mfa_signals", "Multi-factor authentication (MFA)"],
        ["email_verification_flow", "Email verification flow"],
        ["magic_link_auth", "Magic link / passwordless login"],
        ["enterprise_sso", "Enterprise SSO / SAML"],
      ], "Skipped — no authentication system detected on this project.");
    } else {
    const hasMfa = ["two-factor", "2fa", "authenticator app", "totp", "multi-factor", "mfa"].some((s) => htmlLower.includes(s));
    checks.push({
      category: CATEGORIES.AUTHENTICATION,
      checkKey: "mfa_signals",
      label: "Multi-factor authentication (MFA)",
      status: hasMfa ? "PASS" : "WARN",
      detail: hasMfa
        ? "MFA / 2FA signals detected — account security hardened."
        : "No MFA/2FA signals — enterprise buyers require MFA; absence blocks B2B deals.",
    });

    const hasEmailVerification = ["verify your email", "confirm your email", "email verification", "activate your account", "check your inbox"].some((s) => htmlLower.includes(s));
    checks.push({
      category: CATEGORIES.AUTHENTICATION,
      checkKey: "email_verification_flow",
      label: "Email verification flow",
      status: hasEmailVerification ? "PASS" : "WARN",
      detail: hasEmailVerification
        ? "Email verification signals detected — user email addresses are validated on sign-up."
        : "No email verification signals — unverified accounts lead to spam, poor deliverability, and bounce rates.",
    });

    const hasMagicLink = ["magic link", "passwordless", "sign in with email", "email link", "one-time link"].some((s) => htmlLower.includes(s));
    checks.push({
      category: CATEGORIES.AUTHENTICATION,
      checkKey: "magic_link_auth",
      label: "Magic link / passwordless login",
      status: hasMagicLink ? "PASS" : "WARN",
      detail: hasMagicLink
        ? "Passwordless/magic link login detected — frictionless auth available."
        : "No passwordless auth — magic links improve sign-up conversion by removing password friction.",
    });

    const hasSso = ["single sign-on", "saml", "okta", "azure ad", "active directory", "enterprise sso", "sso login"].some((s) => htmlLower.includes(s));
    checks.push({
      category: CATEGORIES.AUTHENTICATION,
      checkKey: "enterprise_sso",
      label: "Enterprise SSO / SAML",
      status: hasSso ? "PASS" : "WARN",
      detail: hasSso
        ? "Enterprise SSO signals detected — enterprise deals enabled."
        : "No SSO/SAML signals — enterprise buyers mandate SSO; absence is a deal-breaker for mid-market procurement.",
    });
    } // end if (ctx.isAuthEnabled)

    // ─── Additional Legal & Compliance ──────────────────────────────────────────
    const hasDataDeletion = ["delete my account", "delete account", "right to erasure", "delete your data", "close account", "request deletion"].some((s) => htmlLower.includes(s));
    checks.push({
      category: CATEGORIES.LEGAL,
      checkKey: "data_deletion_right",
      label: "Data deletion / right to erasure (GDPR Art. 17)",
      status: hasDataDeletion ? "PASS" : "WARN",
      detail: hasDataDeletion
        ? "Account or data deletion mechanism detected — GDPR Art. 17 compliance supported."
        : "No account deletion option visible — GDPR Art. 17 requires users can request erasure of all personal data.",
    });

    const legalApplicable = isCategoryApplicable(platform, CATEGORIES.LEGAL, surfaceKind);
    const [accessibilityStatus, dpaStatus, cookiePolicyStatus] = legalApplicable
      ? await Promise.all([
          headRequest(`${baseUrl}/accessibility`),
          headRequest(`${baseUrl}/dpa`),
          headRequest(`${baseUrl}/cookie-policy`),
        ])
      : [0, 0, 0];
    const accessibilityAltStatus = legalApplicable && accessibilityStatus !== 200
      ? await headRequest(`${baseUrl}/accessibility-statement`) : 200;
    const dpaAltStatus = legalApplicable && dpaStatus !== 200
      ? await headRequest(`${baseUrl}/data-processing-agreement`) : 200;
    const cookiePolicyAltStatus = legalApplicable && cookiePolicyStatus !== 200
      ? await headRequest(`${baseUrl}/cookies`) : 200;

    // A link on the page outranks a HEAD on a guessed path: it is evidence we already
    // hold, and it costs nothing. See linksPathContaining for the www.gov.uk case.
    const linksAccessibility = linksPathContaining(pageResult.html, ["accessibility"]);
    checks.push(routePageCheck(
      "Legal & Compliance", "accessibility_statement", "Accessibility statement",
      linksAccessibility || accessibilityStatus === 200 || accessibilityAltStatus === 200,
      "Accessibility statement page found — EU Web Accessibility Directive compliance documented.",
      "No accessibility statement — required by EU Web Accessibility Directive; recommended for all public-facing SaaS.",
    ));

    const hasCoppaSignals = ["under 13", "13 years", "children's privacy", "coppa", "child-directed", "parental consent", "age gate", "age verification"].some((s) => htmlLower.includes(s));
    checks.push({
      category: CATEGORIES.LEGAL,
      checkKey: "coppa_signals",
      label: "COPPA / children's privacy",
      status: hasCoppaSignals ? "PASS" : "WARN",
      detail: hasCoppaSignals
        ? "COPPA compliance signals detected — children's privacy handling addressed."
        : "No COPPA signals — if any users could be under 13 (US) or 16 (EU), additional parental consent is legally required.",
    });

    checks.push(routePageCheck(
      "Legal & Compliance", "dpa_available", "Data Processing Agreement (GDPR Art. 28)",
      dpaStatus === 200 || dpaAltStatus === 200,
      "DPA page found — GDPR Art. 28 processor obligations documented.",
      "No DPA available — required for B2B enterprise customers under GDPR; absence blocks EU procurement.",
    ));

    const hasIcpLicense = htmlLower.includes("icp备") || htmlLower.includes("备案号") || htmlLower.includes("icp证") || /[京沪粤]icp/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.LEGAL,
      checkKey: "icp_license",
      label: "China ICP license (for CN market)",
      status: hasIcpLicense ? "PASS" : "WARN",
      detail: hasIcpLicense
        ? "ICP license number detected — China internet content hosting compliance addressed."
        : "No ICP license — required for websites serving users in China; absence means ISPs can block access.",
    });

    const hasPrivacyLastUpdated = htmlLower.includes("last updated") || htmlLower.includes("last revised") || htmlLower.includes("effective date") || htmlLower.includes("last modified");
    checks.push({
      category: CATEGORIES.LEGAL,
      checkKey: "privacy_last_updated",
      label: "Privacy policy maintenance date",
      status: hasPrivacyLastUpdated ? "PASS" : "WARN",
      detail: hasPrivacyLastUpdated
        ? "Policy maintenance date detected — shows the privacy policy is actively maintained."
        : "No 'last updated' date in policy — regulators and users expect visible evidence of ongoing policy maintenance.",
    });

    const linksCookiePolicy = linksPathContaining(pageResult.html, ["cookie-policy", "cookiepolicy", "cookies", "cookie"]);
    checks.push(routePageCheck(
      "Legal & Compliance", "cookie_policy_page", "Dedicated cookie policy page",
      linksCookiePolicy || cookiePolicyStatus === 200 || cookiePolicyAltStatus === 200,
      "Dedicated cookie policy page found — GDPR ePrivacy Directive requirement met.",
      "No dedicated cookie policy — GDPR and ePrivacy Directive require transparent disclosure of all cookies used.",
    ));

    const hasDpoContact = htmlLower.includes("dpo@") || htmlLower.includes("privacy@") || htmlLower.includes("data protection officer") || htmlLower.includes("data-protection@");
    checks.push({
      category: CATEGORIES.LEGAL,
      checkKey: "gdpr_dpo_contact",
      label: "GDPR privacy contact (DPO)",
      status: hasDpoContact ? "PASS" : "WARN",
      detail: hasDpoContact
        ? "Privacy/DPO contact email detected — data subject requests can be handled."
        : "No DPO or privacy contact visible — GDPR requires a designated privacy contact for data subject requests.",
    });

    // ─── Additional Missing Pages (batch) ─────────────────────────────────────
    const [blogStatus, careersStatus, pressStatus, docsStatus, integrationsStatus, mediaKitStatus] = missingPagesApplicable
      ? await Promise.all([
          headRequest(`${baseUrl}/blog`),
          headRequest(`${baseUrl}/careers`),
          headRequest(`${baseUrl}/press`),
          headRequest(`${baseUrl}/docs`),
          headRequest(`${baseUrl}/integrations`),
          headRequest(`${baseUrl}/media-kit`),
        ])
      : [0, 0, 0, 0, 0, 0];
    const blogAltStatus = missingPagesApplicable && blogStatus !== 200 ? await headRequest(`${baseUrl}/resources`) : 200;
    const careersAltStatus = missingPagesApplicable && careersStatus !== 200 ? await headRequest(`${baseUrl}/jobs`) : 200;
    const pressAltStatus = missingPagesApplicable && pressStatus !== 200 ? await headRequest(`${baseUrl}/media`) : 200;
    const docsAltStatus = missingPagesApplicable && docsStatus !== 200 ? await headRequest(`${baseUrl}/documentation`) : 200;
    const integrationsAltStatus = missingPagesApplicable && integrationsStatus !== 200 ? await headRequest(`${baseUrl}/partners`) : 200;
    const brandKitStatus = missingPagesApplicable && mediaKitStatus !== 200 ? await headRequest(`${baseUrl}/brand`) : 200;

    checks.push(routePageCheck(
      "Missing Pages", "blog_resources", "Blog / resources hub",
      blogStatus === 200 || blogAltStatus === 200,
      "Blog or resources page found — content marketing enabled.",
      "No blog or resources section — content marketing drives 3× more leads than outbound for SaaS.",
    ));

    checks.push(routePageCheck(
      "Missing Pages", "careers_page", "Careers / jobs page",
      careersStatus === 200 || careersAltStatus === 200,
      "Careers page found.",
      "No careers page — even a simple 'we're hiring' page signals momentum and attracts talent.",
    ));

    checks.push(routePageCheck(
      "Missing Pages", "press_media", "Press / media page",
      pressStatus === 200 || pressAltStatus === 200,
      "Press or media page found.",
      "No press page — journalists need a media kit (logo, screenshots, founder bio) to write about you.",
    ));

    checks.push(routePageCheck(
      "Missing Pages", "documentation", "Documentation / developer docs",
      docsStatus === 200 || docsAltStatus === 200,
      "Documentation page found.",
      "No docs page — users and developers need documentation to onboard and integrate successfully.",
    ));

    checks.push(routePageCheck(
      "Missing Pages", "integrations_page", "Integrations / partners page",
      integrationsStatus === 200 || integrationsAltStatus === 200,
      "Integrations or partners page found.",
      "No integrations page — listing integrations (Zapier, Slack, Make.com) is a top buying signal for SaaS.",
    ));

    // A catch-all host (200 for every unknown path) by definition has no real 404,
    // so don't follow redirects (redirect:"manual") — we want the true status of
    // the missing path, not wherever it might forward to.
    let has404Page = false;
    if (!catchAll200) {
      try {
        const notFoundResponse = await fetchWithTimeout(`${baseUrl}/this-page-does-not-exist-pulse-check`, {
          headers: { "User-Agent": "Gitwork-Pulse/1.0" },
          redirect: "manual",
        });
        if (notFoundResponse.status === 404) {
          const notFoundHtml = await notFoundResponse.text().catch(() => "");
          has404Page = notFoundHtml.length > 200 && !notFoundHtml.toLowerCase().includes("cannot get");
        }
      } catch {
        // ignore
      }
    }
    checks.push({
      category: CATEGORIES.MISSING_PAGES,
      checkKey: "custom_404_page",
      label: "Custom 404 error page",
      status: has404Page ? "PASS" : "WARN",
      detail: has404Page
        ? "Custom 404 page detected — broken links lead to a branded error experience."
        : catchAll200
          ? "Unknown paths return 200 (catch-all routing) instead of a 404 — broken links won't surface a proper error page; ensure your SPA renders a branded not-found state for unmatched routes."
          : "No custom 404 page — broken links dump users on a raw error; a custom 404 with navigation retains them.",
    });

    // ─── Additional SaaS Readiness ─────────────────────────────────────────────
    if (!ctx.isSaas) {
      skipChecks(checks, "SaaS Readiness", [
        ["demo_booking", "Demo booking / discovery call"],
        ["free_trial_cta", "Free trial / free plan CTA"],
        ["api_availability", "Public API / developer access"],
        ["affiliate_program", "Affiliate / referral program"],
        ["security_trust_page", "Security / trust page"],
        ["in_app_notifications", "In-app notification system"],
      ], "Skipped — no SaaS product signals detected on this project.");
    } else {
    const hasDemoBooking = ["book a demo", "schedule a demo", "request a demo", "calendly.com", "savvycal.com", "cal.com"].some((s) => htmlLower.includes(s));
    checks.push({
      category: CATEGORIES.SAAS,
      checkKey: "demo_booking",
      label: "Demo booking / discovery call",
      status: hasDemoBooking ? "PASS" : "WARN",
      detail: hasDemoBooking
        ? "Demo booking link or scheduling widget detected."
        : "No demo booking — high-ACV SaaS needs a 'book a demo' CTA to capture enterprise leads.",
    });

    const hasFreeTrial = ["free trial", "start for free", "get started free", "try for free", "free plan", "no credit card required"].some((s) => htmlLower.includes(s));
    checks.push({
      category: CATEGORIES.SAAS,
      checkKey: "free_trial_cta",
      label: "Free trial / free plan CTA",
      status: hasFreeTrial ? "PASS" : "WARN",
      detail: hasFreeTrial
        ? "Free trial or free plan CTA detected — reduces purchase friction."
        : "No free trial signal — freemium or free trial converts 3–5× better than paid-only for early SaaS.",
    });

    const saasApplicable = isCategoryApplicable(platform, CATEGORIES.SAAS, surfaceKind);
    const trustApplicable = isCategoryApplicable(platform, CATEGORIES.TRUST_BRAND, surfaceKind);
    const [apiStatus, affiliateStatus, securityPageStatus] = saasApplicable || trustApplicable
      ? await Promise.all([
          saasApplicable ? headRequest(`${baseUrl}/api`) : Promise.resolve(0),
          saasApplicable ? headRequest(`${baseUrl}/affiliate`) : Promise.resolve(0),
          trustApplicable ? headRequest(`${baseUrl}/security`) : Promise.resolve(0),
        ])
      : [0, 0, 0];
    const apiAltStatus = saasApplicable && apiStatus !== 200 ? await headRequest(`${baseUrl}/api-docs`) : 200;
    const affiliateAltStatus = saasApplicable && affiliateStatus !== 200 ? await headRequest(`${baseUrl}/referral`) : 200;
    const trustPageStatus = trustApplicable && securityPageStatus !== 200 ? await headRequest(`${baseUrl}/trust`) : 200;

    checks.push(routePageCheck(
      "SaaS Readiness", "api_availability", "Public API / developer access",
      apiStatus === 200 || apiAltStatus === 200,
      "API endpoint or documentation found.",
      "No public API detected — an API unlocks integrations, Zapier/Make.com workflows, and developer-led growth.",
    ));

    checks.push(routePageCheck(
      "SaaS Readiness", "affiliate_program", "Affiliate / referral program",
      affiliateStatus === 200 || affiliateAltStatus === 200,
      "Affiliate or referral program page found — word-of-mouth growth enabled.",
      "No affiliate or referral program — referral programs can generate 15–30% of SaaS revenue.",
    ));

    checks.push(routePageCheck(
      "SaaS Readiness", "security_trust_page", "Security / trust page",
      securityPageStatus === 200 || trustPageStatus === 200,
      "Security or trust page found — enterprise procurement friction reduced.",
      "No security page — enterprise buyers complete security questionnaires; a /security page pre-empts them.",
    ));

    const hasNotificationSignals = ["notification-center", "notification bell", "unread messages", "inbox notifications"].some((s) => htmlLower.includes(s)) ||
      /class=["'][^"']*notif[^"']*["']/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.SAAS,
      checkKey: "in_app_notifications",
      label: "In-app notification system",
      status: hasNotificationSignals ? "PASS" : "WARN",
      detail: hasNotificationSignals
        ? "In-app notification signals detected."
        : "No notification system — in-app notifications drive feature adoption and reduce churn.",
    });
    } // end if (ctx.isSaas)

    // ─── Additional Observability ──────────────────────────────────────────────
    if (!ctx.hasBackend) {
      skipChecks(checks, "Observability", [
        ["uptime_monitoring", "External uptime monitoring"],
        ["log_aggregation", "Centralised log aggregation"],
        ["apm_signals", "Application Performance Monitoring (APM)"],
        ["real_user_monitoring", "Real User Monitoring (RUM)"],
      ], "Skipped — no backend or server-side signals detected on this project.");
    } else {
    const uptimeSignals = ["statuspage.io", "betteruptime.com", "uptimerobot", "pingdom", "freshping", "checkly", "hyperping"].some((s) => htmlLower.includes(s));
    checks.push({
      category: CATEGORIES.OBSERVABILITY,
      checkKey: "uptime_monitoring",
      label: "External uptime monitoring",
      status: uptimeSignals ? "PASS" : "WARN",
      detail: uptimeSignals
        ? "External uptime monitoring service detected."
        : "No uptime monitoring — you won't know about outages before users tweet about them.",
    });

    const logAggregationSignals = ["papertrail", "logtail", "logflare", "axiom", "betterstack", "baselime"].some((s) => htmlLower.includes(s));
    checks.push({
      category: CATEGORIES.OBSERVABILITY,
      checkKey: "log_aggregation",
      label: "Centralised log aggregation",
      status: logAggregationSignals ? "PASS" : "WARN",
      detail: logAggregationSignals
        ? "Log aggregation service detected."
        : "No log aggregation — debugging production issues without centralised logs takes 10× longer.",
    });

    const apmSignals = ["newrelic", "dynatrace", "appdynamics", "elastic apm", "scout apm", "sentry performance"].some((s) => htmlLower.includes(s));
    checks.push({
      category: CATEGORIES.OBSERVABILITY,
      checkKey: "apm_signals",
      label: "Application Performance Monitoring (APM)",
      status: apmSignals ? "PASS" : "WARN",
      detail: apmSignals
        ? "APM tool detected — transaction tracing and performance insights available."
        : "No APM detected — without transaction-level data, slow queries and N+1 problems go undetected.",
    });

    const rumSignals = ["speedcurve", "web-vitals", "lux.speedcurve", "perfume.js"].some((s) => htmlLower.includes(s));
    checks.push({
      category: CATEGORIES.OBSERVABILITY,
      checkKey: "real_user_monitoring",
      label: "Real User Monitoring (RUM)",
      status: rumSignals ? "PASS" : "WARN",
      detail: rumSignals
        ? "Real User Monitoring signals detected — field Core Web Vitals being collected."
        : "No RUM detected — lab performance data doesn't reflect real-world Core Web Vitals across user devices.",
    });
    } // end if (ctx.hasBackend)

    // ─── Additional Payments ──────────────────────────────────────────────────
    if (!ctx.isPaymentEnabled) {
      skipChecks(checks, "Payments", [
        ["payment_trust_badges", "Payment trust badges"],
        ["bnpl_options", "Buy Now Pay Later (BNPL)"],
        ["crypto_payments", "Cryptocurrency payment option"],
      ], "Skipped — no payment integration detected on this project.");
    } else {
    const hasPciTrustBadge = ["pci dss", "pci-dss", "payment security", "256-bit encryption", "ssl secured checkout"].some((s) => htmlLower.includes(s));
    checks.push({
      category: CATEGORIES.PAYMENTS,
      checkKey: "payment_trust_badges",
      label: "Payment trust badges",
      status: hasPciTrustBadge ? "PASS" : "WARN",
      detail: hasPciTrustBadge
        ? "Payment security trust signals detected — checkout conversion improved."
        : "No payment trust badges near checkout — SSL/PCI badges reduce cart abandonment by up to 30%.",
    });

    const hasBnpl = ["klarna", "afterpay", "affirm", "clearpay", "laybuy", "zip pay", "sezzle", "buy now pay later"].some((s) => htmlLower.includes(s));
    checks.push({
      category: CATEGORIES.PAYMENTS,
      checkKey: "bnpl_options",
      label: "Buy Now Pay Later (BNPL)",
      status: hasBnpl ? "PASS" : "WARN",
      detail: hasBnpl
        ? "BNPL option detected — large purchase friction reduced."
        : "No BNPL option — Klarna/Afterpay increases average order value by up to 45% for higher-priced products.",
    });

    const hasCryptoPayments = ["bitcoin", "ethereum", " usdc", "coinbase commerce", "bitpay", "nowpayments", "crypto payment"].some((s) => htmlLower.includes(s));
    checks.push({
      category: CATEGORIES.PAYMENTS,
      checkKey: "crypto_payments",
      label: "Cryptocurrency payment option",
      status: hasCryptoPayments ? "PASS" : "WARN",
      detail: hasCryptoPayments
        ? "Cryptocurrency payment option detected."
        : "No crypto payments — a growing segment prefers crypto; easy to add via Coinbase Commerce.",
    });
    } // end if (ctx.isPaymentEnabled)

    // ─── Additional App Store & Mobile ─────────────────────────────────────────
    if (!ctx.isMobileApp) {
      skipChecks(checks, "App Store & Mobile", [
        ["smart_app_banner_meta", "Smart App Banner (iOS web-to-app)"],
        ["amazon_app_store", "Amazon Appstore / Fire TV presence"],
        ["app_listing_screenshots", "App screenshots / listing assets"],
        ["app_icon_sizes", "App icon multiple resolutions"],
      ], "Skipped — no mobile app signals detected on this project.");
    } else {
    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey: "smart_app_banner_meta",
      label: "Smart App Banner (iOS web-to-app)",
      status: hasAppleSmartBanner ? "PASS" : "WARN",
      detail: hasAppleSmartBanner
        ? "apple-itunes-app meta tag found — iOS users see a Smart App Banner to download the native app."
        : "No Smart App Banner — add <meta name=apple-itunes-app> to drive web-to-native app installs on iOS.",
    });

    const hasAmazonAppStore = htmlLower.includes("amazon.com/apps") || htmlLower.includes("amazon appstore") || htmlLower.includes("amazon underground");
    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey: "amazon_app_store",
      label: "Amazon Appstore / Fire TV presence",
      status: hasAmazonAppStore ? "PASS" : "WARN",
      detail: hasAmazonAppStore
        ? "Amazon Appstore link detected — Fire tablet and Fire TV market addressed."
        : "No Amazon Appstore link — consider Amazon Appstore for Fire tablet reach and LATAM/emerging market Android users.",
    });

    const multipleOgImages = (pageResult.html.match(/property=["']og:image["']/gi) ?? []).length > 1;
    const hasScreenshotAssets = multipleOgImages || htmlLower.includes("app-screenshot") || /class=["'][^"']*screenshot[^"']*["']/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey: "app_listing_screenshots",
      label: "App screenshots / listing assets",
      status: hasScreenshotAssets ? "PASS" : "WARN",
      detail: hasScreenshotAssets
        ? "Multiple OG images or screenshot assets detected — store listing quality enhanced."
        : "No dedicated screenshot assets — App Store and Play Store listings require 3–8 high-quality screenshots.",
    });

    const appleTouchIconCount = (pageResult.html.match(/apple-touch-icon/gi) ?? []).length;
    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey: "app_icon_sizes",
      label: "App icon multiple resolutions",
      status: appleTouchIconCount >= 2 ? "PASS" : appleTouchIconCount === 1 ? "WARN" : "WARN",
      detail: appleTouchIconCount >= 2
        ? `${appleTouchIconCount} Apple touch icon sizes detected — iOS device resolutions covered.`
        : appleTouchIconCount === 1
          ? "Only one Apple touch icon size — add 60×60, 76×76, 120×120, and 180×180 variants for full iOS support."
          : "No Apple touch icon — required for iOS home screen installation and App Store submission.",
    });
    } // end if (ctx.isMobileApp) — additional App Store section

    // ─── Additional Global Distribution ────────────────────────────────────────
    const hasCountrySelector = /country[\s-]?selector|region[\s-]?selector|select[\s\S]{0,200}country/i.test(pageResult.html) || htmlLower.includes("country-dropdown");
    checks.push({
      category: CATEGORIES.GLOBAL_DISTRIBUTION,
      checkKey: "country_region_selector",
      label: "Country / region selector",
      status: hasCountrySelector ? "PASS" : "WARN",
      detail: hasCountrySelector
        ? "Country or region selector detected — users can choose their market."
        : "No country/region selector — global users expect to set their region for localised pricing and content.",
    });

    const hasComplianceBadge = ["soc 2", "soc2", "iso 27001", "iso27001", "gdpr compliant", "hipaa compliant", "pci dss certified"].some((s) => htmlLower.includes(s));
    checks.push({
      category: CATEGORIES.GLOBAL_DISTRIBUTION,
      checkKey: "compliance_certifications",
      label: "Compliance certifications (SOC 2, ISO 27001)",
      status: hasComplianceBadge ? "PASS" : "WARN",
      detail: hasComplianceBadge
        ? "Compliance certification badge detected — enterprise trust signals present."
        : "No compliance certifications visible — SOC 2 Type II is the minimum bar for enterprise B2B SaaS sales.",
    });

    const hasEuHostingSignal = htmlLower.includes("eu-west") || htmlLower.includes("eu-central") || htmlLower.includes("europe-west") || (htmlLower.includes("gdpr") && htmlLower.includes("eu data"));
    checks.push({
      category: CATEGORIES.GLOBAL_DISTRIBUTION,
      checkKey: "eu_data_residency",
      label: "EU data residency signals",
      status: hasEuHostingSignal ? "PASS" : "WARN",
      detail: hasEuHostingSignal
        ? "EU data residency signals detected — GDPR data sovereignty requirements may be met."
        : "No EU data residency signals — EU enterprise buyers require data to stay within the EU under GDPR.",
    });

    const hasCompanyRegistration = /company (number|reg|registration)|registered in|vat number|registered company|\b(ltd|llc|inc|gmbh|bv|ab)\b/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.GLOBAL_DISTRIBUTION,
      checkKey: "company_registration_info",
      label: "Company registration info",
      status: hasCompanyRegistration ? "PASS" : "WARN",
      detail: hasCompanyRegistration
        ? "Company registration details detected in page — legal entity transparency confirmed."
        : "No company registration visible — EU regulations require displaying registered company name and number in footer.",
    });

    const hasTimezoneAware = ["timezone", "time zone", "local time", "utc offset", "intl.datetimeformat"].some((s) => htmlLower.includes(s));
    checks.push({
      category: CATEGORIES.GLOBAL_DISTRIBUTION,
      checkKey: "timezone_locale_support",
      label: "Timezone / locale-aware content",
      status: hasTimezoneAware ? "PASS" : "WARN",
      detail: hasTimezoneAware
        ? "Timezone or locale-aware content signals detected."
        : "No timezone handling — dates and times should display in the user's local timezone for a global product.",
    });

    // ─── Trust & Brand ─────────────────────────────────────────────────────────
    const hasSocialLinks = ["twitter.com/", "x.com/", "linkedin.com/company", "github.com/", "instagram.com/", "youtube.com/"].some((s) => htmlLower.includes(s));
    checks.push({
      category: CATEGORIES.TRUST_BRAND,
      checkKey: "social_media_links",
      label: "Social media presence",
      status: hasSocialLinks ? "PASS" : "WARN",
      detail: hasSocialLinks
        ? "Social media links detected — brand is findable and building a public presence."
        : "No social media links — add Twitter/X, LinkedIn, and GitHub in the footer for brand credibility.",
    });

    const hasThirdPartyReviews = ["trustpilot", "g2.com", "capterra", "producthunt.com", "getapp.com", "software advice"].some((s) => htmlLower.includes(s));
    checks.push({
      category: CATEGORIES.TRUST_BRAND,
      checkKey: "third_party_reviews",
      label: "Third-party review platform",
      status: hasThirdPartyReviews ? "PASS" : "WARN",
      detail: hasThirdPartyReviews
        ? "Third-party review platform link or widget detected."
        : "No review platform links — Trustpilot or G2 badges add verifiable social proof; 72% of buyers trust reviews.",
    });

    const hasPressCoverage = ["as seen in", "featured in", "as featured in", "press coverage", "in the press", "media coverage"].some((s) => htmlLower.includes(s));
    checks.push({
      category: CATEGORIES.TRUST_BRAND,
      checkKey: "press_coverage",
      label: "Press / media coverage section",
      status: hasPressCoverage ? "PASS" : "WARN",
      detail: hasPressCoverage
        ? "Press or media coverage section detected."
        : "No press coverage section — even one article mention adds significant credibility.",
    });

    const hasTeamPresence = (["founder", "our team", "meet the team", "co-founder"].some((s) => htmlLower.includes(s))) &&
      /<img[^>]+src=["'][^"']+["'][^>]*>/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.TRUST_BRAND,
      checkKey: "team_presence",
      label: "Founder / team bio with photo",
      status: hasTeamPresence ? "PASS" : "WARN",
      detail: hasTeamPresence
        ? "Team or founder presence with images detected — human accountability builds trust."
        : "No visible founder or team bio — vibe-coded apps feel anonymous; a human face increases conversion.",
    });

    const hasProductHunt = htmlLower.includes("producthunt.com") || htmlLower.includes("product hunt") || htmlLower.includes("ph-badge");
    checks.push({
      category: CATEGORIES.TRUST_BRAND,
      checkKey: "product_hunt_badge",
      label: "Product Hunt launch presence",
      status: hasProductHunt ? "PASS" : "WARN",
      detail: hasProductHunt
        ? "Product Hunt badge or link detected — launch community engaged."
        : "No Product Hunt presence — a PH launch generates early adopters, press, and social proof.",
    });

    checks.push(routePageCheck(
      "Trust & Brand", "media_kit", "Media kit / brand assets",
      mediaKitStatus === 200 || brandKitStatus === 200,
      "Media kit or brand assets page found — journalists and partners have correct branding.",
      "No media kit — journalists and partners need logo files and brand guidelines at /media-kit.",
    ));

    // ─── Code Quality (URL-detectable) ─────────────────────────────────────────
    const hasPlaceholderText = pageResult.html.toLowerCase().includes("lorem ipsum") || pageResult.html.toLowerCase().includes("placeholder text here");
    checks.push({
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "no_placeholder_text",
      label: "No placeholder / lorem ipsum content",
      status: hasPlaceholderText ? "FAIL" : "PASS",
      detail: hasPlaceholderText
        ? "Lorem ipsum or placeholder text detected — vibe-coded apps often ship with unfilled copy blocks."
        : "No placeholder text detected in page source.",
    });

    const hasHashRouting = /#\/[a-z]/i.test(pageResult.html) || htmlLower.includes("hashrouter") || htmlLower.includes("hash-router");
    checks.push({
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "no_hash_routing",
      label: "Clean URL routing (no hash routes)",
      status: hasHashRouting ? "WARN" : "PASS",
      detail: hasHashRouting
        ? "Hash-based routing detected (#/path) — search engines cannot index hash routes; use HTML5 history API routing."
        : "No hash routing detected — URL structure appears SEO-friendly.",
    });

    // ─── A1: Email Security (DNS-over-HTTPS) ──────────────────────────────────
    // Returns `{ ok }` rather than a bare array so a resolver failure cannot be
    // mistaken for an empty answer — see the section note above `dmarcCheckVerdict`.
    // Answer TYPES are kept because they carry information the SPF wording needs:
    // a TXT query against a CNAME owner comes back as a type-5 answer with no
    // type-16, which is how `spfCheckVerdict` recognises a name that provably
    // cannot hold the record, with no extra query.
    async function dnsLookup(name: string, type: string): Promise<DnsLookup> {
      try {
        const res = await fetchWithTimeout(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`,
          { headers: { Accept: "application/dns-json" } },
        );
        if (!res.ok) return { ok: false, answers: [] };
        const json = await res.json() as { Status?: number; Answer?: { type?: number; data: string }[] };
        // DoH Status: 0 = NOERROR, 3 = NXDOMAIN. Both are real answers. Anything
        // else (SERVFAIL, REFUSED, ...) means the question was not answered.
        if (json.Status !== undefined && json.Status !== 0 && json.Status !== 3) {
          return { ok: false, answers: [] };
        }
        return {
          ok: true,
          answers: (json.Answer ?? []).map((a) => ({ type: a.type ?? 0, data: a.data })),
        };
      } catch {
        return { ok: false, answers: [] };
      }
    }

    try {
      const hostAnalysis = analyzeHost(hostname);
      // RFC 7489 §6.6.3 strictly says "retry at the Organizational Domain". We walk
      // the ladder most-specific-first instead, capped, because in a delegated tree
      // (`www.hmrc.gov.uk` → `hmrc.gov.uk` → `gov.uk`) the department publishes its
      // own record and stopping at the single organizational answer would report the
      // parent's policy as the department's.
      const parentNames = boundedDmarcCandidates(organizationalDomainCandidates(hostname));
      const [txtLookup, dmarcLookup, mxLookup, ...parentLookups] = await Promise.all([
        dnsLookup(hostname, "TXT"),
        dnsLookup(`_dmarc.${hostname}`, "TXT"),
        dnsLookup(hostname, "MX"),
        ...parentNames.map((name) => dnsLookup(`_dmarc.${name}`, "TXT")),
      ]);

      const spf = spfCheckVerdict({
        hostname,
        txt: txtLookup,
        mx: mxLookup,
        registrable: hostAnalysis.registrable,
      });
      checks.push({
        category: CATEGORIES.SECURITY,
        checkKey: "spf_record",
        label: "SPF record (email spoofing protection)",
        status: spf.status,
        detail: spf.detail,
        evidence: spf.evidence,
      });

      const dmarc = dmarcCheckVerdict({
        hostname,
        atHost: dmarcLookup,
        parents: parentNames.map((domain, index) => ({ domain, lookup: parentLookups[index] })),
        // An apex has no parent to fall back to, so its absence is a complete
        // answer. Only an unidentifiable registrable domain leaves the discovery
        // algorithm unfinished.
        unresolvedReason: parentNames.length === 0 ? hostAnalysis.reason : null,
      });
      checks.push({
        category: CATEGORIES.SECURITY,
        checkKey: "dmarc_record",
        label: "DMARC record (email impersonation protection)",
        status: dmarc.status,
        detail: dmarc.detail,
        evidence: dmarc.evidence,
      });

      const mxRecords = mxLookup.answers.filter((a) => a.type === 15);
      checks.push({
        category: CATEGORIES.INFRASTRUCTURE,
        checkKey: "mx_record",
        label: "MX records (email infrastructure)",
        status: !mxLookup.ok ? "INCONCLUSIVE" : mxRecords.length > 0 ? "PASS" : "WARN",
        detail: !mxLookup.ok
          ? `Not assessed — the MX lookup for ${hostname} did not complete, so Pulse cannot say whether email infrastructure is declared.`
          : mxRecords.length > 0
            ? `MX records found — email infrastructure is declared (${mxRecords.length} record${mxRecords.length !== 1 ? "s" : ""}).`
            : `No MX records at ${hostname} — this name is not configured to receive email. That is normal for a web-only host; mail for the organisation is usually handled at another name.`,
        evidence: mxLookup.ok ? `${mxRecords.length} MX record(s) at ${hostname}` : `MX ${hostname}: lookup failed`,
      });
    } catch {
      // `dnsLookup` swallows its own transport errors, so reaching here means
      // something unexpected broke. All three checks must still be EMITTED — a key
      // that silently vanishes from the set is worse than one that admits it has no
      // answer, because a missing check is invisible in both the report and the
      // coverage number. INCONCLUSIVE, never the old WARN: nothing was established.
      const failed = "Not assessed — the DNS lookups for this host did not complete, so no email-authentication conclusion can be drawn.";
      checks.push(
        { category: CATEGORIES.SECURITY, checkKey: "spf_record", label: "SPF record (email spoofing protection)", status: "INCONCLUSIVE", detail: failed },
        { category: CATEGORIES.SECURITY, checkKey: "dmarc_record", label: "DMARC record (email impersonation protection)", status: "INCONCLUSIVE", detail: failed },
        { category: CATEGORIES.INFRASTRUCTURE, checkKey: "mx_record", label: "MX records (email infrastructure)", status: "INCONCLUSIVE", detail: failed },
      );
    }

    // ─── A2: Sensitive Path Exposure ──────────────────────────────────────────
    async function checkPaths(baseUrl: string, paths: string[], timeoutMs = 3000): Promise<number[]> {
      const results = await Promise.allSettled(
        paths.map((p) =>
          fetchScannableUrl(`${baseUrl}${p}`, {
            method: "HEAD",
            redirect: "follow",
            signal: AbortSignal.timeout(timeoutMs),
            headers: { "User-Agent": "Gitwork-Pulse/1.0" },
          }).then((r) => r.status).catch(() => 0),
        ),
      );
      return results.map((r) => (r.status === "fulfilled" ? r.value : 0));
    }

    const [adminStatuses, phpInfoStatuses, gitConfigStatus, debugStatuses, backupStatuses] = await Promise.all([
      checkPaths(httpsUrl, ["/admin", "/wp-admin"]),
      checkPaths(httpsUrl, ["/phpinfo.php", "/info.php"]),
      checkPaths(httpsUrl, ["/.git/config"]).then((s) => s[0]),
      checkPaths(httpsUrl, ["/telescope", "/__clockwork", "/horizon", "/_debug"]),
      checkPaths(httpsUrl, ["/backup.sql", "/dump.sql", "/.env.bak", "/db.sql"]),
    ]);

    // These are path-existence probes (HEAD → status). On a catch-all host every
    // path returns 200, so a 200 here proves nothing — gate the "exposed" verdict
    // on the baseline and say so, rather than flagging phantom files on an SPA.
    const catchAllNote = catchAll200
      ? " (Host returns 200 for any path — catch-all routing — so path-based probes are inconclusive; nothing actually exposed by status.)"
      : "";

    const absenceStatus = (
      exposed: boolean,
      statuses: number[],
      exposedStatus: "WARN" | "FAIL",
    ): "PASS" | "WARN" | "FAIL" | "INCONCLUSIVE" => {
      if (exposed) return exposedStatus;
      if (catchAll200 || statuses.some((status) => status === 0)) return "INCONCLUSIVE";
      return "PASS";
    };

    const adminExposed = !catchAll200 && adminStatuses.some((s) => s === 200);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "no_exposed_admin",
      label: "Admin panel not publicly accessible",
      status: absenceStatus(adminExposed, adminStatuses, "WARN"),
      detail: adminExposed
        ? "An admin path (/admin or /wp-admin) returned HTTP 200 — verify it requires authentication. Exposed admin panels are prime targets for credential stuffing attacks."
        : adminStatuses.some((status) => status === 0)
          ? "One or more admin-path probes failed, so public exposure could not be ruled out."
          : "Admin paths not freely accessible." + catchAllNote,
    });

    const phpInfoExposed = !catchAll200 && phpInfoStatuses.some((s) => s === 200);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "no_exposed_phpinfo",
      label: "PHP info page not exposed",
      status: absenceStatus(phpInfoExposed, phpInfoStatuses, "FAIL"),
      detail: phpInfoExposed
        ? "phpinfo.php or info.php returned HTTP 200 — this file exposes PHP version, server paths, loaded extensions, and environment variables to attackers."
        : phpInfoStatuses.some((status) => status === 0)
          ? "One or more PHP-info probes failed, so exposure could not be ruled out."
          : "No exposed PHP info pages detected." + catchAllNote,
    });

    const gitConfigExposed = !catchAll200 && gitConfigStatus === 200;
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "no_exposed_git_config",
      label: "Git config not publicly accessible",
      status: absenceStatus(gitConfigExposed, [gitConfigStatus], "FAIL"),
      detail: gitConfigExposed
        ? "/.git/config is publicly accessible — this reveals repository URLs, credentials, and project structure. Remove or block access immediately."
        : gitConfigStatus === 0
          ? "The Git-config probe failed, so exposure could not be ruled out."
          : "Git config not publicly accessible." + catchAllNote,
    });

    const debugExposed = !catchAll200 && debugStatuses.some((s) => s === 200);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "no_debug_endpoints",
      label: "Debug/monitoring endpoints not public",
      status: absenceStatus(debugExposed, debugStatuses, "WARN"),
      detail: debugExposed
        ? "A debug endpoint (/telescope, /__clockwork, /horizon, or /_debug) returned HTTP 200 — these expose internal request logs, jobs, and performance data."
        : debugStatuses.some((status) => status === 0)
          ? "One or more debug-endpoint probes failed, so exposure could not be ruled out."
          : "Debug and monitoring endpoints are not publicly accessible." + catchAllNote,
    });

    const backupExposed = !catchAll200 && backupStatuses.some((s) => s === 200);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "no_exposed_backup",
      label: "Database backup files not exposed",
      status: absenceStatus(backupExposed, backupStatuses, "FAIL"),
      detail: backupExposed
        ? "A database backup file (backup.sql, dump.sql, .env.bak, or db.sql) is publicly downloadable — this is a critical data breach risk."
        : backupStatuses.some((status) => status === 0)
          ? "One or more backup-file probes failed, so exposure could not be ruled out."
          : "No exposed database backup files detected." + catchAllNote,
    });

    // ─── A3: HTTP Protocol & Headers Quality ──────────────────────────────────
    const altSvcHeader = pageResult.headers["alt-svc"] ?? "";
    const http2Detected = altSvcHeader.includes("h2") || pageResult.headers["x-firefox-spdy"] === "h2";
    checks.push({
      category: CATEGORIES.PERFORMANCE,
      checkKey: "http2_enabled",
      label: "HTTP/2 protocol",
      status: http2Detected ? "PASS" : "WARN",
      detail: http2Detected
        ? "HTTP/2 detected via alt-svc header — multiplexed connections improve load performance."
        : "Could not verify HTTP/2 support — consider upgrading for multiplexing benefits. Modern servers (Nginx 1.9.5+, Apache 2.4.17+) support HTTP/2 natively.",
    });

    // ⚠️ The label used to be the fixed string "X-Powered-By header absent" —
    // phrased as the PASS state — while `status` and `detail` flip to the
    // opposite. The public triage view renders `label` as the finding HEADLINE,
    // so on vercel.com (`x-powered-by: Next.js, Payload`) a prospect read:
    //     X-Powered-By header absent — X-Powered-By is set to "Next.js, Payload"
    // The finding itself is sound; the presentation made it unusable. A label must
    // name the SUBJECT being measured, never the desired outcome, because it is
    // shown identically whichever way the check goes.
    //
    // Other checks in this file share the shape and were left alone deliberately
    // (no audit reproduced them, and each label is duplicated in
    // checks-registry.ts, which this change does not own): `.env not public`,
    // `.git directory not public`, `Server version not exposed`, `Server version
    // not disclosed`, and the five A2 exposure labels. Worth a follow-up pass.
    const xPoweredBy = pageResult.headers["x-powered-by"];
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "no_x_powered_by",
      label: "X-Powered-By header",
      status: xPoweredBy ? "FAIL" : "PASS",
      detail: xPoweredBy
        ? `X-Powered-By is set to "${xPoweredBy}" — this exposes your backend technology to attackers who can target known vulnerabilities in that stack.`
        : "X-Powered-By header is not present — backend technology is not disclosed.",
    });

    const a3ServerHeader = pageResult.headers["server"] ?? "";
    const serverHasVersion = /[\/]\d+\.\d+/.test(a3ServerHeader);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "no_server_version",
      label: "Server version not disclosed",
      status: serverHasVersion ? "FAIL" : "PASS",
      detail: serverHasVersion
        ? `Server header "${a3ServerHeader}" includes a version number — attackers can target known CVEs for that exact version.`
        : a3ServerHeader
          ? `Server header present ("${a3ServerHeader}") but no version number disclosed.`
          : "Server header not present — server identity and version are not disclosed.",
    });

    const a3CorsHeader = pageResult.headers["access-control-allow-origin"] ?? "";
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "cors_not_wildcard",
      label: "CORS not open to all origins",
      status: a3CorsHeader === "*" ? "FAIL" : "PASS",
      detail: a3CorsHeader === "*"
        ? "Access-Control-Allow-Origin: * allows any website to read your API responses, enabling data theft and CSRF-style attacks. Restrict to specific trusted origins."
        : a3CorsHeader
          ? `CORS origin is restricted to "${a3CorsHeader}".`
          : "No CORS header present on the main page.",
    });

    // ─── A4: Content Quality (HTML analysis) ──────────────────────────────────
    const strippedText = contentHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const wordCount = strippedText.split(/\s+/).filter((w) => w.length > 0).length;
    checks.push({
      category: CATEGORIES.SEO,
      checkKey: "has_word_count",
      label: "Sufficient page content",
      status: wordCount >= 300 ? "PASS" : wordCount >= 100 ? "WARN" : "FAIL",
      detail: wordCount >= 300
        ? `Page contains approximately ${wordCount.toLocaleString()} words — good content depth for SEO.`
        : wordCount >= 100
          ? `Page contains approximately ${wordCount.toLocaleString()} words — below the recommended 300 words for indexed pages.`
          : `Page contains only approximately ${wordCount.toLocaleString()} words — too thin for search engine indexing. Search engines prefer pages with substantial content.`,
    });

    const a4HasH1 = /<h1[\s>]/i.test(contentHtml);
    const hasH2orH3 = /<h[23][\s>]/i.test(contentHtml);
    checks.push({
      category: CATEGORIES.SEO,
      checkKey: "has_heading_hierarchy",
      label: "Heading hierarchy (H1→H2→H3)",
      status: a4HasH1 && hasH2orH3 ? "PASS" : a4HasH1 ? "WARN" : "FAIL",
      detail: a4HasH1 && hasH2orH3
        ? "Heading hierarchy detected (H1 and sub-headings present)."
        : a4HasH1
          ? "H1 found but no H2/H3 sub-headings — add sub-headings to improve content structure and SEO."
          : "No heading tags detected — headings are critical for SEO and screen reader navigation.",
    });

    const imgTags = contentHtml.match(/<img[^>]*>/gi) ?? [];
    const imgsWithAlt = imgTags.filter((img) => /\balt=/i.test(img)).length;
    const altCoverage = imgTags.length > 0 ? imgsWithAlt / imgTags.length : 1;
    checks.push({
      category: CATEGORIES.ACCESSIBILITY,
      checkKey: "image_alt_coverage",
      label: "Image alt text coverage",
      // Zero images is NOT_APPLICABLE, never PASS. A PASS asserts the control was satisfied; with
      // nothing to caption there is no control to satisfy, and on a client-rendered shell the
      // images simply had not rendered — so a PASS there would be a finding invented from absence.
      status: imgTags.length === 0 ? "NOT_APPLICABLE" : altCoverage >= 0.8 ? "PASS" : altCoverage >= 0.5 ? "WARN" : "FAIL",
      detail: imgTags.length === 0
        ? "No images were present in the page HTML, so there was no alt-text coverage to measure."
        : `${imgsWithAlt}/${imgTags.length} images have alt attributes (${Math.round(altCoverage * 100)}%). ${altCoverage < 0.8 ? "Missing alt text fails WCAG 1.1.1 and harms screen reader users." : "Good alt text coverage."}`,
    });

    const internalLinkPattern = new RegExp(`<a[^>]+href=["'](/|https?://${hostname.replace(".", "\\.")})[^"']*["']`, "gi");
    const internalLinkMatches = contentHtml.match(internalLinkPattern) ?? [];
    const internalLinkCount = internalLinkMatches.length;
    checks.push({
      category: CATEGORIES.SEO,
      checkKey: "internal_links_present",
      label: "Internal linking",
      status: internalLinkCount > 5 ? "PASS" : internalLinkCount >= 1 ? "WARN" : "FAIL",
      detail: internalLinkCount > 5
        ? `${internalLinkCount} internal links detected — good link structure for SEO crawling.`
        : internalLinkCount >= 1
          ? `Only ${internalLinkCount} internal link${internalLinkCount !== 1 ? "s" : ""} detected — add more internal links to distribute page authority and aid navigation.`
          : "No internal links detected — search engines cannot crawl deeper pages without internal links.",
    });

    const hasConsoleLogs = /console\.log\s*\(/.test(pageResult.html);
    checks.push({
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "no_broken_inline_scripts",
      label: "No console.log in production HTML",
      status: hasConsoleLogs ? "WARN" : "PASS",
      detail: hasConsoleLogs
        ? "console.log() calls found in page HTML — debug logging left in production code can expose sensitive data and signals poor build hygiene."
        : "No console.log statements detected in page source.",
    });

    // ─── A5: PWA & Offline Readiness ──────────────────────────────────────────
    const hasServiceWorker = /navigator\.serviceWorker|registerServiceWorker|["']sw\.js["']|service[-_]worker/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.PERFORMANCE,
      checkKey: "service_worker_present",
      label: "Service worker (offline/caching)",
      status: hasServiceWorker ? "PASS" : "WARN",
      detail: hasServiceWorker
        ? "Service worker detected — offline support and cache-first loading are enabled."
        : "No service worker detected. Service workers enable offline support, background sync, and dramatically faster repeat visits via cache-first loading.",
    });

    const a5HasManifestLink = /<link[^>]+rel=["']manifest["']/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.PERFORMANCE,
      checkKey: "web_app_manifest_linked",
      label: "Web app manifest linked",
      status: a5HasManifestLink ? "PASS" : "WARN",
      detail: a5HasManifestLink
        ? "Web app manifest linked — PWA install prompt and home screen support enabled."
        : "No <link rel=\"manifest\"> found. A manifest.json enables Add to Home Screen on mobile, defines app name/icons, and is required for PWA install prompts.",
    });

    const hasThemeColor = /<meta[^>]+name=["']theme-color["']/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.PERFORMANCE,
      checkKey: "theme_color_defined",
      label: "Theme colour meta tag",
      status: hasThemeColor ? "PASS" : "WARN",
      detail: hasThemeColor
        ? "theme-color meta tag found — browser UI will match brand colour on mobile."
        : "No theme-color meta tag. theme-color customises the browser UI colour on mobile, improving brand recognition.",
    });

    // ─── A6: Third-Party Script Risk ──────────────────────────────────────────
    const scriptSrcMatches = pageResult.html.match(/<script[^>]+src=["']([^"']+)["']/gi) ?? [];
    const externalScriptDomains = new Set<string>();
    const oldJqueryFound: string[] = [];
    for (const tag of scriptSrcMatches) {
      const srcMatch = tag.match(/src=["']([^"']+)["']/i);
      if (!srcMatch) continue;
      const src = srcMatch[1];
      if (!src.startsWith("http")) continue;
      try {
        const scriptHostname = new URL(src).hostname;
        if (scriptHostname !== hostname) {
          externalScriptDomains.add(scriptHostname);
        }
      } catch { /* ignore */ }
      if (/jquery[-/]([12])\.\d+/i.test(src) || /jquery[-/]1\.\d+|jquery[-/]2\.\d+/i.test(src)) {
        oldJqueryFound.push(src);
      }
    }
    const thirdPartyDomainCount = externalScriptDomains.size;
    checks.push({
      category: CATEGORIES.PERFORMANCE,
      checkKey: "third_party_script_count",
      label: "Third-party script load",
      status: thirdPartyDomainCount <= 5 ? "PASS" : thirdPartyDomainCount <= 12 ? "WARN" : "FAIL",
      detail: thirdPartyDomainCount <= 5
        ? `${thirdPartyDomainCount} external script domain${thirdPartyDomainCount !== 1 ? "s" : ""} — reasonable third-party dependency footprint.`
        : `${thirdPartyDomainCount} external script domains — each is a DNS lookup and potential supply-chain attack vector. Audit and consolidate where possible.`,
      evidence: thirdPartyDomainCount > 0 ? [...externalScriptDomains].slice(0, 5).join(", ") : undefined,
    });

    checks.push({
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "no_jquery_old",
      label: "No outdated jQuery",
      status: oldJqueryFound.length > 0 ? "FAIL" : "PASS",
      detail: oldJqueryFound.length > 0
        ? `Old jQuery version detected (${oldJqueryFound[0]}) — jQuery 1.x/2.x has known XSS and prototype pollution vulnerabilities and is no longer maintained.`
        : "No outdated jQuery (1.x/2.x) detected.",
    });

    // ─── A7: SaaS / Business Signals ──────────────────────────────────────────
    const hasAnnualBilling = /annual|yearly|per year|save\s+\d|\bsave\b.*year|year.*save/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.SAAS,
      checkKey: "annual_billing_signal",
      label: "Annual billing option",
      status: hasAnnualBilling ? "PASS" : "WARN",
      detail: hasAnnualBilling
        ? "Annual billing option detected — cash flow and churn reduction signals present."
        : "No annual billing signal found. Annual billing reduces churn by ~50% and improves cash flow. Most SaaS buyers expect a monthly vs annual toggle.",
    });

    const hasMoneyBack = /money[\s-]back|30[\s-]day|14[\s-]day|7[\s-]day|\brefund\b/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.SAAS,
      checkKey: "money_back_signal",
      label: "Money-back guarantee signal",
      status: hasMoneyBack ? "PASS" : "WARN",
      detail: hasMoneyBack
        ? "Money-back guarantee or refund policy signal detected — purchase anxiety reduced."
        : "No money-back guarantee signal. A clearly stated refund policy reduces purchase anxiety and increases conversion rates.",
    });

    const hasLiveChat = /\b(intercom|crisp|tidio|drift|hubspot|freshchat|zendesk|tawk|liveagent|chatra|helpscout)\b/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.SAAS,
      checkKey: "live_chat_signal",
      label: "Live chat / support widget",
      status: hasLiveChat ? "PASS" : "WARN",
      detail: hasLiveChat
        ? "Live chat or support widget detected — real-time support capability present."
        : "No live chat widget detected. Live chat can increase conversions by 20-40% and is now expected in SaaS products.",
    });

    const hasDemoBooking = /book\s+a\s+demo|schedule\s+a\s+demo|book\s+a\s+call|calendly\.com|cal\.com|book\s+demo/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.SAAS,
      checkKey: "demo_booking_signal",
      label: "Demo booking or discovery call",
      status: hasDemoBooking ? "PASS" : "WARN",
      detail: hasDemoBooking
        ? "Demo booking or discovery call signal detected — sales-assist motion is supported."
        : "No demo booking path detected. A demo booking option is essential for PLG → sales-assist motion and enterprise prospects.",
    });

    const hasSocialProofNumbers = /\b\d[\d,]*\s*[k+]\s*(users?|customers?|teams?|companies|businesses)|\b\d[\d,]*\+\s*(users?|customers?|teams?)|\b(users?|customers?|teams?|companies)\s*\d[\d,]*[k+]?/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.TRUST_BRAND,
      checkKey: "social_proof_numbers",
      label: "Quantified social proof",
      status: hasSocialProofNumbers ? "PASS" : "WARN",
      detail: hasSocialProofNumbers
        ? "Quantified social proof (numeric user/customer count) detected — specific numbers build credibility."
        : "No numeric social proof found. Specific numbers ('10,000 teams') convert 3x better than vague claims ('thousands of customers').",
    });

    const hasVideoEmbed = /youtube\.com\/embed|loom\.com\/embed|vimeo\.com\/video|wistia\.com|mux\.com/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.SAAS,
      checkKey: "video_embed_present",
      label: "Product demo video",
      status: hasVideoEmbed ? "PASS" : "WARN",
      detail: hasVideoEmbed
        ? "Product demo video embed detected — visual product demonstration available."
        : "No product demo video detected. A demo video on the landing page typically increases conversion rate by 20-80%.",
    });

    // ─── A8: Developer / API Signals ──────────────────────────────────────────
    const hasApiDocsSignal = /api\s+docs|api\s+reference|developer\s+docs?\b/i.test(pageResult.html) ||
      /href=["'][^"']*\/(docs|api-docs|developers|api\/docs)[^"']*["']/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.SAAS,
      checkKey: "api_docs_signal",
      label: "API documentation",
      status: hasApiDocsSignal ? "PASS" : "WARN",
      detail: hasApiDocsSignal
        ? "API documentation link or reference detected — developer resources are accessible."
        : "No API documentation signals found. API docs are essential for technical buyers and integration partners.",
    });

    const apiQualityApplicable = isCategoryApplicable(platform, CATEGORIES.API_QUALITY, surfaceKind);
    const openApiStatuses = apiQualityApplicable
      ? await checkPaths(httpsUrl, ["/openapi.json", "/openapi.yaml", "/swagger.json", "/api-docs"])
      : [];
    // A bare 200 proves nothing on a catch-all host (SPA / Vercel / Next), which
    // 200s every path with the app shell — the same reason the exposed-file probes
    // at :2141 consult catchAll200. Without this guard the status-only probe emitted
    // a false PASS, and because the content-verified `openapi_spec_served` in
    // api-quality.ts correctly WARNed on the same host, one report asserted both
    // that a spec exists and that it does not.
    const hasOpenApiEndpoint = !catchAll200 && openApiStatuses.some((s) => s === 200);
    checks.push({
      category: CATEGORIES.API_QUALITY,
      checkKey: "openapi_endpoint",
      label: "OpenAPI spec endpoint",
      status: hasOpenApiEndpoint ? "PASS" : "WARN",
      detail: hasOpenApiEndpoint
        ? "OpenAPI/Swagger spec endpoint found — machine-readable API spec enables auto-generated SDKs and Postman imports."
        : catchAll200
          ? "Could not establish an OpenAPI spec endpoint: this host returns 200 for paths that cannot exist, so a 200 on /openapi.json is not evidence a spec is served. Serve the spec with a JSON content type to make it verifiable."
          : "No OpenAPI spec endpoint found. A machine-readable API spec enables auto-generated SDKs, Postman imports, and reduces integration friction.",
    });

    const hasGraphqlInHtml = /\bgraphql\b/i.test(pageResult.html);
    const graphqlPathStatus = apiQualityApplicable
      ? await checkPaths(httpsUrl, ["/graphql"]).then((s) => s[0])
      : 0;
    // Same catch-all caveat: only trust the /graphql 200 when the host does not
    // 200 everything. An in-HTML mention is independent evidence and still counts.
    const hasGraphql = hasGraphqlInHtml || (!catchAll200 && graphqlPathStatus === 200);
    checks.push({
      category: CATEGORIES.API_QUALITY,
      checkKey: "graphql_signal",
      label: "GraphQL API",
      status: hasGraphql ? "PASS" : "WARN",
      detail: hasGraphql
        ? "GraphQL API signal detected — flexible query API available for clients."
        : "No GraphQL signals found. GraphQL reduces over-fetching and enables flexible client queries. Common in modern developer platforms.",
    });

    // ─── A9: Conversion & UX Signals ──────────────────────────────────────────
    const hasSearch = /<input[^>]+type=["']search["']/i.test(pageResult.html) ||
      /role=["']search["']/i.test(pageResult.html) ||
      /placeholder=["'][^"']*search[^"']*["']/i.test(pageResult.html) ||
      /\b(algolia|typesense|fuse\.js)\b/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.SAAS,
      checkKey: "search_functionality",
      label: "Search functionality",
      status: hasSearch ? "PASS" : "WARN",
      detail: hasSearch
        ? "Search functionality detected — users can find content without manual navigation."
        : "No search functionality detected. Apps without search force users to navigate manually — search reduces time-to-value.",
    });

    const hasGranularConsent = /accept\s+all|reject\s+all|manage\s+(cookies|preferences)/i.test(pageResult.html);
    const hasBasicConsent = /cookie\s*(consent|banner|notice)|we\s+use\s+cookies|this\s+site\s+uses\s+cookies/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.LEGAL,
      checkKey: "cookie_consent_granular",
      label: "Granular cookie consent (accept/reject all)",
      status: hasGranularConsent ? "PASS" : hasBasicConsent ? "WARN" : "FAIL",
      detail: hasGranularConsent
        ? "Granular cookie consent (accept all / reject all / manage preferences) detected — GDPR-compliant consent flow."
        : hasBasicConsent
          ? "Basic cookie notice detected but no reject/manage options — GDPR requires granular consent with the ability to decline non-essential cookies."
          : "No cookie consent mechanism detected — required by GDPR, ePrivacy Directive, and CCPA for sites using tracking cookies.",
    });

    const hasNewsletter = /newsletter|\bsubscribe\b|mailing\s+list|email\s+updates/i.test(pageResult.html);
    checks.push({
      category: CATEGORIES.SAAS,
      checkKey: "newsletter_signup",
      label: "Newsletter / email list capture",
      status: hasNewsletter ? "PASS" : "WARN",
      detail: hasNewsletter
        ? "Newsletter or email capture detected — email list building is in place."
        : "No newsletter or email signup detected. Email lists compound over time — a newsletter is one of the highest-ROI acquisition channels for SaaS.",
    });

    // Emit the core (non-extended) checks as the first wave before the heavier
    // extended modules run, so the UI fills in immediately.
    emit?.(checks.slice());

    // ─── Extended checks (all 305 new checks in parallel category modules) ────
    try {
      const extended = await runExtendedChecks({
        pageResult,
        httpsUrl,
        hostname,
        platform: platform ?? "",
        ctx,
        htmlLower,
        catchAll200,
        surfaceKind,
        targetMarkets,
        detectedMarkets,
        effectiveMarkets,
      }, emit);
      checks.push(...extended);
    } catch (error) {
      // The scan still succeeds without the extended families — but it must not
      // LOOK like a complete one. runExtendedChecks emits its own completeness
      // check from inside itself, so a throw here loses that row too: ~300 checks
      // and the only record that they were expected both disappear, while
      // url-checks still reports COMPLETED. Emit the row the collector could not.
      checks.push(collectorCompletenessCheck(
        [{
          name: "extended-checks",
          outcome: "ERROR",
          detail: error instanceof Error ? error.message.slice(0, 160) : "collector failed",
        }],
        "scan_extended_collector_completeness",
      ));
    }

  } else {
    // Site unreachable — mark remaining checks as FAIL
    const failedChecks: Array<[CheckCategory, string, string]> = [
      ["Infrastructure", "http_redirect", "HTTP → HTTPS redirect"],
      ["Infrastructure", "response_time", "Response time"],
      ["Infrastructure", "status_200", "Returns 200 OK"],
      ["Infrastructure", "custom_domain", "Custom domain"],
      ["Infrastructure", "cdn_detected", "CDN / edge cache present"],
      ["SEO", "meta_title", "<title> tag"],
      ["SEO", "meta_description", "Meta description"],
      ["SEO", "og_tags", "Open Graph tags"],
      ["SEO", "canonical_url", "Canonical URL"],
      ["SEO", "h1_present", "H1 heading"],
      ["SEO", "has_robots_txt", "robots.txt"],
      ["SEO", "has_sitemap", "sitemap.xml"],
      ["Security", "csp_header", "Content-Security-Policy"],
      ["Security", "hsts_header", "HSTS header"],
      ["Security", "x_frame_options", "X-Frame-Options header"],
      ["Security", "no_exposed_env", ".env not public"],
      ["Security", "no_exposed_git", ".git directory not public"],
      ["Performance", "compression", "Gzip/Brotli compression"],
      ["Performance", "caching_headers", "Cache-Control headers"],
      ["Payments", "stripe_signals", "Stripe integration"],
      ["Payments", "pricing_page", "Pricing/billing UI"],
      ["Authentication", "auth_ui_signals", "Login/signup UI"],
      ["Authentication", "oauth_signals", "Auth provider"],
      ["Observability", "error_monitoring", "Error monitoring"],
      ["Observability", "analytics_present", "Analytics"],
      ["Observability", "health_endpoint", "/health endpoint"],
      ["Legal & Compliance", "privacy_policy", "Privacy Policy"],
      ["Legal & Compliance", "terms_of_service", "Terms of Service"],
      ["Legal & Compliance", "cookie_consent", "Cookie consent / GDPR"],
      ["Legal & Compliance", "refund_policy", "Refund / Cancellation policy"],
      ["Missing Pages", "about_page", "About / Team page"],
      ["Missing Pages", "contact_page", "Contact page"],
      ["Missing Pages", "faq_page", "FAQ / Help page"],
      ["Missing Pages", "status_page", "Status / uptime page"],
      ["Missing Pages", "changelog", "Changelog / What's new"],
      ["SaaS Readiness", "billing_portal", "Billing / subscription management"],
      ["SaaS Readiness", "account_settings", "Account settings"],
      ["SaaS Readiness", "password_reset", "Password reset"],
      ["SaaS Readiness", "support_channel", "Support channel"],
      ["SaaS Readiness", "social_proof", "Social proof / testimonials"],
      ["SaaS Readiness", "onboarding_flow", "Onboarding flow"],
      ["Mobile & Accessibility", "viewport_meta", "Viewport meta tag"],
      ["Mobile & Accessibility", "html_lang", "HTML language attribute"],
      ["Mobile & Accessibility", "aria_attributes", "ARIA accessibility attributes"],
      ["Mobile & Accessibility", "responsive_images", "Responsive / optimised images"],
      ["SEO", "og_image", "og:image (social preview)"],
      ["SEO", "twitter_card", "Twitter / X Card"],
      ["Security", "x_content_type_options", "X-Content-Type-Options"],
      ["Security", "permissions_policy", "Permissions-Policy"],
      ["Security", "referrer_policy", "Referrer-Policy"],
      ["SaaS Readiness", "email_provider", "Transactional email provider"],
      ["Code Quality", "ai_platform_origin", "AI platform watermark"],
      ["Mobile & Accessibility", "favicon", "Favicon / app icon"],
      ["Mobile & Accessibility", "pwa_manifest", "Web App Manifest (PWA)"],
      ["Payments", "stripe_webhook", "Stripe webhook endpoint"],
      ["App Store & Mobile", "apple_touch_icon", "Apple touch icon"],
      ["App Store & Mobile", "apple_app_store", "Apple App Store presence"],
      ["App Store & Mobile", "google_play_store", "Google Play Store presence"],
      ["App Store & Mobile", "universal_links", "Universal Links (iOS deep linking)"],
      ["App Store & Mobile", "android_asset_links", "Android App Links (deep linking)"],
      ["App Store & Mobile", "wallet_payments", "Apple Pay / Google Pay / Amazon Pay"],
      ["Global Distribution", "hreflang_tags", "hreflang tags (multi-region SEO)"],
      ["Global Distribution", "charset_utf8", "UTF-8 character encoding"],
      ["Global Distribution", "ccpa_compliance", "CCPA (California privacy rights)"],
      ["Global Distribution", "multi_currency", "Multi-currency pricing"],
      ["Global Distribution", "rtl_support", "RTL language support"],
      ["Global Distribution", "language_switcher", "Language / region switcher"],
      ["Global Distribution", "international_payments", "International payment methods"],
      ["Global Distribution", "eu_vat", "EU VAT / tax handling"],
      // Additional SEO
      ["SEO", "structured_data", "JSON-LD structured data"],
      ["SEO", "preload_hints", "Resource preload hints"],
      ["SEO", "search_engine_verified", "Search engine verification"],
      ["SEO", "meta_robots", "Robots meta tag"],
      ["SEO", "og_site_name", "og:site_name (brand in shares)"],
      // Additional Security
      ["Security", "subresource_integrity", "Subresource Integrity (SRI)"],
      ["Security", "secure_cookie_attributes", "Secure cookie attributes"],
      ["Security", "cors_policy", "CORS policy (Access-Control-Allow-Origin on this document)"],
      ["Security", "security_txt", "security.txt (responsible disclosure)"],
      ["Security", "server_header_leakage", "Server version not exposed"],
      ["Security", "no_mixed_content", "No mixed HTTP/HTTPS content"],
      // Additional Performance
      ["Performance", "preconnect_hints", "Preconnect / DNS prefetch hints"],
      ["Performance", "native_lazy_loading", "Native image lazy loading"],
      ["Performance", "font_display_swap", "Font display optimisation"],
      ["Performance", "vary_header", "Vary header (content negotiation)"],
      ["Performance", "server_timing", "Server-Timing header"],
      // Additional Authentication
      ["Authentication", "mfa_signals", "Multi-factor authentication (MFA)"],
      ["Authentication", "email_verification_flow", "Email verification flow"],
      ["Authentication", "magic_link_auth", "Magic link / passwordless login"],
      ["Authentication", "enterprise_sso", "Enterprise SSO / SAML"],
      // Additional Legal
      ["Legal & Compliance", "data_deletion_right", "Data deletion / right to erasure (GDPR Art. 17)"],
      ["Legal & Compliance", "accessibility_statement", "Accessibility statement"],
      ["Legal & Compliance", "coppa_signals", "COPPA / children's privacy"],
      ["Legal & Compliance", "dpa_available", "Data Processing Agreement (GDPR Art. 28)"],
      ["Legal & Compliance", "icp_license", "China ICP license (for CN market)"],
      ["Legal & Compliance", "privacy_last_updated", "Privacy policy maintenance date"],
      ["Legal & Compliance", "cookie_policy_page", "Dedicated cookie policy page"],
      ["Legal & Compliance", "gdpr_dpo_contact", "GDPR privacy contact (DPO)"],
      // Additional Missing Pages
      ["Missing Pages", "blog_resources", "Blog / resources hub"],
      ["Missing Pages", "careers_page", "Careers / jobs page"],
      ["Missing Pages", "press_media", "Press / media page"],
      ["Missing Pages", "documentation", "Documentation / developer docs"],
      ["Missing Pages", "integrations_page", "Integrations / partners page"],
      ["Missing Pages", "custom_404_page", "Custom 404 error page"],
      // Additional SaaS Readiness
      ["SaaS Readiness", "demo_booking", "Demo booking / discovery call"],
      ["SaaS Readiness", "free_trial_cta", "Free trial / free plan CTA"],
      ["SaaS Readiness", "api_availability", "Public API / developer access"],
      ["SaaS Readiness", "affiliate_program", "Affiliate / referral program"],
      ["SaaS Readiness", "security_trust_page", "Security / trust page"],
      ["SaaS Readiness", "in_app_notifications", "In-app notification system"],
      // Additional Observability
      ["Observability", "uptime_monitoring", "External uptime monitoring"],
      ["Observability", "log_aggregation", "Centralised log aggregation"],
      ["Observability", "apm_signals", "Application Performance Monitoring (APM)"],
      ["Observability", "real_user_monitoring", "Real User Monitoring (RUM)"],
      // Additional Payments
      ["Payments", "payment_trust_badges", "Payment trust badges"],
      ["Payments", "bnpl_options", "Buy Now Pay Later (BNPL)"],
      ["Payments", "crypto_payments", "Cryptocurrency payment option"],
      // Additional App Store & Mobile
      ["App Store & Mobile", "smart_app_banner_meta", "Smart App Banner (iOS web-to-app)"],
      ["App Store & Mobile", "amazon_app_store", "Amazon Appstore / Fire TV presence"],
      ["App Store & Mobile", "app_listing_screenshots", "App screenshots / listing assets"],
      ["App Store & Mobile", "app_icon_sizes", "App icon multiple resolutions"],
      // Additional Global Distribution
      ["Global Distribution", "country_region_selector", "Country / region selector"],
      ["Global Distribution", "compliance_certifications", "Compliance certifications (SOC 2, ISO 27001)"],
      ["Global Distribution", "eu_data_residency", "EU data residency signals"],
      ["Global Distribution", "company_registration_info", "Company registration info"],
      ["Global Distribution", "timezone_locale_support", "Timezone / locale-aware content"],
      // Trust & Brand (new category)
      ["Trust & Brand", "social_media_links", "Social media presence"],
      ["Trust & Brand", "third_party_reviews", "Third-party review platform"],
      ["Trust & Brand", "press_coverage", "Press / media coverage section"],
      ["Trust & Brand", "team_presence", "Founder / team bio with photo"],
      ["Trust & Brand", "product_hunt_badge", "Product Hunt launch presence"],
      ["Trust & Brand", "media_kit", "Media kit / brand assets"],
      // Code Quality (URL-detectable)
      ["Code Quality", "no_placeholder_text", "No placeholder / lorem ipsum content"],
      ["Code Quality", "no_hash_routing", "Clean URL routing (no hash routes)"],
      // Security Extended
      ["Security", "cross_origin_opener_policy", "Cross-Origin-Opener-Policy (COOP)"],
      ["Security", "cross_origin_resource_policy", "Cross-Origin-Resource-Policy (CORP)"],
      ["Security", "cross_origin_embedder_policy", "Cross-Origin-Embedder-Policy (COEP)"],
      ["Security", "csp_report_directive", "CSP report-uri / report-to configured"],
      ["Security", "rate_limiting_headers", "Rate-limiting headers present"],
      ["Security", "caa_dns_record", "CAA DNS record (cert authority restriction)"],
      ["Security", "dnssec_enabled", "DNSSEC enabled on domain"],
      ["Security", "certificate_expiry_30d", "SSL cert not expiring within 30 days"],
      ["Security", "no_exposed_ds_store", ".DS_Store not publicly accessible"],
      ["Security", "no_exposed_composer_json", "composer.json not at web root"],
      ["Security", "no_exposed_package_json_root", "package.json not served at root"],
      ["Security", "no_exposed_swagger_open", "Swagger UI not open in production"],
      ["Security", "no_exposed_actuator", "/actuator endpoints not public"],
      ["Security", "no_exposed_prometheus_metrics", "/metrics endpoint not public"],
      ["Security", "no_graphql_introspection_prod", "GraphQL introspection disabled in prod"],
      ["Security", "no_exposed_source_maps", "Source maps not served with page"],
      ["Security", "no_api_keys_in_html", "No API key patterns in HTML source"],
      ["Security", "csrf_protection_signals", "CSRF token protection detected"],
      ["Security", "bot_protection_present", "Bot protection (Cloudflare / reCAPTCHA)"],
      ["Security", "sql_error_exposure", "No SQL errors exposed in responses"],
      ["Security", "brute_force_protection", "Brute force / rate limit on auth"],
      ["Security", "session_cookie_httponly", "HttpOnly flag on session cookies"],
      ["Security", "session_cookie_samesite", "SameSite attribute on cookies"],
      ["Security", "csp_frame_ancestors", "frame-ancestors in CSP policy"],
      ["Security", "no_exposed_env_variants", ".env.prod / .env.docker not accessible"],
      ["Security", "secret_scanning_github", "No secrets / keys in page HTML"],
      ["Security", "cors_credentials_restricted", "CORS credentials not open to all origins"],
      ["Security", "dependency_audit_clean", "No obvious vulnerable library versions"],
      ["Security", "subdomain_takeover_risk", "No dangling CNAME / subdomain takeover risk"],
      ["Security", "content_security_policy_nonce", "CSP uses nonces (not unsafe-inline)"],
      // Legal Extended
      ["Legal & Compliance", "gdpr_article13_notice", "GDPR Art. 13/14 data collection notice"],
      ["Legal & Compliance", "gdpr_right_to_access", "GDPR Art. 15 — right to access data"],
      ["Legal & Compliance", "gdpr_right_to_erasure_ui", "GDPR Art. 17 — right to erasure UI"],
      ["Legal & Compliance", "gdpr_right_to_portability", "GDPR Art. 20 — data portability"],
      ["Legal & Compliance", "gdpr_right_to_object", "GDPR Art. 21 — right to object"],
      ["Legal & Compliance", "gdpr_lawful_basis_stated", "GDPR lawful basis stated"],
      ["Legal & Compliance", "gdpr_breach_notification", "GDPR breach notification procedure"],
      ["Legal & Compliance", "gdpr_records_processing", "GDPR records of processing (Art. 30)"],
      ["Legal & Compliance", "uk_gdpr_ico_registration", "ICO registration number"],
      ["Legal & Compliance", "eu_representative_contact", "EU Art. 27 representative"],
      ["Legal & Compliance", "eprivacy_pecr_compliance", "UK PECR / ePrivacy compliance"],
      ["Legal & Compliance", "digital_markets_act", "EU Digital Markets Act signals"],
      ["Legal & Compliance", "eu_ai_act_disclosure", "EU AI Act transparency disclosure"],
      ["Legal & Compliance", "lgpd_brazil", "Brazil LGPD compliance"],
      ["Legal & Compliance", "pipeda_canada", "Canada PIPEDA / Law 25 compliance"],
      ["Legal & Compliance", "pdpa_singapore", "Singapore PDPA compliance"],
      ["Legal & Compliance", "pdpa_thailand", "Thailand PDPA compliance"],
      ["Legal & Compliance", "popia_south_africa", "South Africa POPIA compliance"],
      ["Legal & Compliance", "appi_japan", "Japan APPI compliance"],
      ["Legal & Compliance", "pipl_china", "China PIPL compliance"],
      ["Legal & Compliance", "pipa_korea", "South Korea PIPA compliance"],
      ["Legal & Compliance", "dpdp_india", "India DPDP Act compliance"],
      ["Legal & Compliance", "australian_privacy_act", "Australian Privacy Act compliance"],
      ["Legal & Compliance", "hipaa_signals", "HIPAA compliance signals"],
      ["Legal & Compliance", "pci_dss_scope_reduction", "PCI DSS scope reduction evidence"],
      ["Legal & Compliance", "ferpa_signals", "FERPA compliance signals"],
      ["Legal & Compliance", "cooling_off_period_eu", "EU 14-day cooling-off period"],
      ["Legal & Compliance", "auto_renewal_disclosure", "Auto-renewal disclosure"],
      ["Legal & Compliance", "subscription_cancellation_easy", "Easy cancellation (FTC click-to-cancel)"],
      ["Legal & Compliance", "price_vat_inclusive", "Prices shown inclusive of VAT"],
      ["Legal & Compliance", "distance_selling_notice", "EU distance selling regulations"],
      ["Legal & Compliance", "intellectual_property_notice", "Copyright / IP notice"],
      ["Legal & Compliance", "dmca_policy", "DMCA takedown procedure"],
      ["Legal & Compliance", "age_gate", "Age verification / age gate"],
      ["Legal & Compliance", "contract_terms_b2b", "B2B contract terms / SLA"],
      // Performance Extended
      ["Performance", "next_gen_image_formats", "Next-gen image formats (WebP / AVIF)"],
      ["Performance", "image_dimension_attributes", "Image width/height attributes (CLS prevention)"],
      ["Performance", "critical_css_inlined", "Critical CSS inlined in <head>"],
      ["Performance", "css_appears_minified", "CSS appears minified"],
      ["Performance", "js_appears_minified", "JS files appear minified"],
      ["Performance", "http3_quic_support", "HTTP/3 / QUIC support"],
      ["Performance", "early_hints_support", "103 Early Hints support"],
      ["Performance", "stale_while_revalidate", "Stale-while-revalidate cache directive"],
      ["Performance", "immutable_cache_assets", "Immutable cache on hashed assets"],
      ["Performance", "dns_ttl_optimized", "DNS TTL not near-zero"],
      ["Performance", "render_blocking_scripts", "No render-blocking scripts"],
      ["Performance", "lcp_fetchpriority_hint", "fetchpriority=high on LCP image"],
      ["Performance", "image_width_height", "Images have explicit width/height"],
      ["Performance", "font_preload_hint", "Fonts preloaded"],
      ["Performance", "total_page_weight", "Total page weight < 3MB"],
      ["Performance", "third_party_script_blocking", "No render-blocking third-party scripts"],
      ["Performance", "no_unused_javascript", "Code splitting / lazy loading signals"],
      ["Performance", "module_script_type", "type=module on script tags"],
      ["Performance", "resource_hints_comprehensive", "Comprehensive resource hints (preload/prefetch/preconnect)"],
      ["Performance", "woff2_font_format", "WOFF2 font format used"],
      // WCAG Accessibility
      ["Accessibility", "skip_to_main_content", "Skip to main content link"],
      ["Accessibility", "image_input_alt", "<input type=image> has alt attribute"],
      ["Accessibility", "video_captions", "Video has captions track"],
      ["Accessibility", "form_labels_present", "Form inputs have labels"],
      ["Accessibility", "form_error_identification", "Form errors identify the field"],
      ["Accessibility", "keyboard_focus_visible", "Keyboard focus visible (:focus-visible)"],
      ["Accessibility", "touch_target_size", "Touch target size adequate"],
      ["Accessibility", "no_autoplay_audio", "No autoplay audio"],
      ["Accessibility", "no_autoplay_video", "No autoplay video without controls"],
      ["Accessibility", "session_timeout_warning", "Session timeout warning"],
      ["Accessibility", "valid_html_parsing", "Valid HTML / no parsing errors"],
      ["Accessibility", "aria_roles_valid", "ARIA landmark roles used"],
      ["Accessibility", "aria_live_regions", "aria-live for dynamic content"],
      ["Accessibility", "prefers_reduced_motion", "prefers-reduced-motion CSS"],
      ["Accessibility", "prefers_high_contrast", "prefers-contrast CSS"],
      ["Accessibility", "sufficient_colour_contrast", "Sufficient colour contrast"],
      ["Accessibility", "text_spacing_supported", "Text spacing not fixed"],
      ["Accessibility", "link_purpose_clear", "Link purpose clear (no 'click here')"],
      ["Accessibility", "page_title_unique", "Unique page title per route"],
      ["Accessibility", "language_attribute_body", "lang attribute on <html>"],
      // Auth Extended
      ["Authentication", "session_timeout_configured", "Session timeout configured"],
      ["Authentication", "account_lockout_policy", "Account lockout / brute force policy"],
      ["Authentication", "password_strength_enforced", "Password strength enforced"],
      ["Authentication", "passkey_webauthn_support", "Passkeys / WebAuthn support"],
      ["Authentication", "breach_password_detection", "Breach password detection"],
      ["Authentication", "account_recovery_options", "Account recovery options"],
      ["Authentication", "jwt_not_in_localstorage", "JWT not stored in localStorage"],
      ["Authentication", "refresh_token_rotation", "Refresh token rotation"],
      ["Authentication", "pkce_oauth_flow", "PKCE for OAuth public clients"],
      ["Authentication", "api_key_creation_ui", "API key generation UI"],
      ["Authentication", "oauth_minimal_scopes", "Minimal OAuth scope requests"],
      ["Authentication", "service_account_support", "Service account / M2M tokens"],
      ["Authentication", "device_management", "Trusted device management"],
      ["Authentication", "concurrent_session_policy", "Concurrent session limiting"],
      ["Authentication", "token_expiry_short", "Short-lived access tokens (< 1hr)"],
      // Roles & Permissions
      ["Roles & Permissions", "rbac_signals", "RBAC / role management UI"],
      ["Roles & Permissions", "admin_role_separation", "Admin vs user role separation"],
      ["Roles & Permissions", "team_management_ui", "Team / org management UI"],
      ["Roles & Permissions", "invite_workflow", "User invitation workflow"],
      ["Roles & Permissions", "permission_matrix_docs", "Permissions matrix documented"],
      ["Roles & Permissions", "data_scope_isolation", "Multi-tenant data isolation"],
      ["Roles & Permissions", "audit_trail_present", "Audit log / activity log"],
      ["Roles & Permissions", "api_scope_documentation", "API scopes documented"],
      ["Roles & Permissions", "least_privilege_api_tokens", "API tokens scoped to specific actions"],
      ["Roles & Permissions", "role_hierarchy", "Role hierarchy (Admin > Manager > User)"],
      ["Roles & Permissions", "access_revocation_ui", "Account deactivation / revocation UI"],
      ["Roles & Permissions", "ip_allowlisting", "IP restriction / allowlist"],
      ["Roles & Permissions", "sso_scim_provisioning", "SCIM provisioning support"],
      ["Roles & Permissions", "mfa_admin_enforced", "MFA required for admin accounts"],
      ["Roles & Permissions", "guest_anonymous_mode", "Guest / view-only mode"],
      ["Roles & Permissions", "read_only_role", "Read-only role available"],
      ["Roles & Permissions", "data_export_permission", "Data export restricted by role"],
      ["Roles & Permissions", "workspace_tenant_isolation", "Workspace / tenant isolation"],
      ["Roles & Permissions", "permission_inheritance", "Permission inheritance (groups)"],
      ["Roles & Permissions", "gdpr_data_access_control", "GDPR data subject access by role"],
      // Email Deliverability
      ["Email Deliverability", "dkim_record_present", "DKIM DNS record present"],
      ["Email Deliverability", "bimi_record_present", "BIMI DNS record present"],
      ["Email Deliverability", "mta_sts_policy", "MTA-STS mail transfer security"],
      ["Email Deliverability", "tls_rpt_record", "TLS-RPT reporting record"],
      ["Email Deliverability", "spf_hardfail", "SPF -all (hardfail)"],
      ["Email Deliverability", "dmarc_quarantine_reject", "DMARC quarantine or reject policy"],
      ["Email Deliverability", "email_unsubscribe_signal", "Unsubscribe / List-Unsubscribe signal"],
      ["Email Deliverability", "transactional_subdomain", "Transactional email subdomain"],
      ["Email Deliverability", "can_spam_address", "CAN-SPAM physical address in email"],
      ["Email Deliverability", "casl_double_optin", "CASL double opt-in signals"],
      ["Email Deliverability", "plain_text_email", "Plain text email alternative"],
      ["Email Deliverability", "bounce_handling_signal", "Bounce handling / list hygiene"],
      ["Email Deliverability", "email_preview_configured", "Email preview text configured"],
      ["Email Deliverability", "email_warm_up_signals", "Reputable ESP detected"],
      ["Email Deliverability", "mailing_list_segmentation", "Email list segmentation signals"],
      // Observability Extended
      ["Observability", "alert_pagerduty_opsgenie", "PagerDuty / OpsGenie alerting"],
      ["Observability", "on_call_configured", "On-call rotation configured"],
      ["Observability", "distributed_tracing", "Distributed tracing (Jaeger / DataDog)"],
      ["Observability", "custom_business_metrics", "Custom business metrics dashboards"],
      ["Observability", "synthetic_monitoring", "Synthetic / ping monitoring"],
      ["Observability", "structured_logging", "Structured JSON logging"],
      ["Observability", "log_retention_policy", "Log retention policy configured"],
      ["Observability", "audit_log_api_export", "Audit log accessible via API"],
      ["Observability", "db_performance_monitoring", "Database performance monitoring"],
      ["Observability", "queue_depth_monitoring", "Message queue depth monitoring"],
      ["Observability", "cost_monitoring_signals", "Cloud cost alerting"],
      ["Observability", "error_budget_policy", "SLO / error budget policy"],
      ["Observability", "incident_runbooks", "Incident runbooks documented"],
      ["Observability", "post_mortem_culture", "Post-mortem process signals"],
      ["Observability", "deployment_frequency_tracking", "Deploy frequency tracked (DORA)"],
      // Infrastructure Extended
      ["Infrastructure", "ipv6_dns_record", "IPv6 AAAA DNS record"],
      ["Infrastructure", "multi_region_signals", "Multi-region deployment signals"],
      ["Infrastructure", "load_balancer_detected", "Load balancer detected"],
      ["Infrastructure", "auto_scaling_configured", "Auto-scaling configured"],
      ["Infrastructure", "circuit_breaker_pattern", "Circuit breaker / retry pattern"],
      ["Infrastructure", "graceful_shutdown_configured", "Graceful shutdown (SIGTERM)"],
      ["Infrastructure", "environment_separation", "Prod / staging / dev separation"],
      ["Infrastructure", "blue_green_canary_deploy", "Blue/green or canary deployment"],
      ["Infrastructure", "feature_flags_system", "Feature flag system"],
      ["Infrastructure", "secrets_manager_used", "Secrets manager (Vault / AWS SM)"],
      ["Infrastructure", "database_read_replicas", "Database read replicas"],
      ["Infrastructure", "dns_ttl_healthy", "DNS TTL > 300s"],
      ["Infrastructure", "backup_domain_configured", "Backup / failover domain"],
      ["Infrastructure", "object_storage_signals", "Object storage (S3 / GCS)"],
      ["Infrastructure", "cdn_custom_caching_rules", "CDN custom caching rules"],
      // SaaS Extended
      ["SaaS Readiness", "saml_sso_available", "SAML / enterprise SSO"],
      ["SaaS Readiness", "scim_user_provisioning", "SCIM user provisioning"],
      ["SaaS Readiness", "custom_branding_available", "Custom branding / white-label"],
      ["SaaS Readiness", "enterprise_pricing_tier", "Enterprise pricing tier"],
      ["SaaS Readiness", "keyboard_shortcuts_ui", "Keyboard shortcuts"],
      ["SaaS Readiness", "dark_mode_supported", "Dark mode support"],
      ["SaaS Readiness", "bulk_operations_ui", "Bulk operations UI"],
      ["SaaS Readiness", "data_export_csv_pdf", "Data export (CSV / PDF)"],
      ["SaaS Readiness", "data_import_capability", "Data import capability"],
      ["SaaS Readiness", "community_forum_slack", "Community forum or Slack"],
      ["SaaS Readiness", "app_marketplace_listed", "Marketplace / ecosystem listing"],
      ["SaaS Readiness", "public_roadmap", "Public product roadmap"],
      ["SaaS Readiness", "partner_reseller_program", "Partner / reseller programme"],
      ["SaaS Readiness", "g2_capterra_listed", "G2 or Capterra listing"],
      ["SaaS Readiness", "volume_discount_signals", "Volume discounts"],
      // Payments Extended
      ["Payments", "sepa_bank_transfer", "SEPA / bank transfer (EU)"],
      ["Payments", "paypal_integration", "PayPal integration"],
      ["Payments", "three_ds_sca_compliant", "3D Secure / PSD2 SCA compliant"],
      ["Payments", "fraud_detection_tool", "Fraud detection (Stripe Radar / Kount)"],
      ["Payments", "pci_saq_evidence", "PCI SAQ / scope reduction evidence"],
      ["Payments", "regional_payment_methods", "Regional payment methods (Klarna / iDEAL)"],
      ["Payments", "chargeback_prevention", "Chargeback prevention tools"],
      ["Payments", "subscription_proration", "Subscription proration"],
      ["Payments", "invoicing_capability", "Invoice generation for B2B"],
      ["Payments", "tax_automation", "Tax automation (Avalara / TaxJar)"],
      // SEO Extended
      ["SEO", "faqpage_schema", "FAQPage JSON-LD structured data"],
      ["SEO", "product_schema", "Product schema (e-commerce)"],
      ["SEO", "organization_schema", "Organization schema"],
      ["SEO", "article_schema", "Article / BlogPosting schema"],
      ["SEO", "review_schema", "AggregateRating / Review schema"],
      ["SEO", "breadcrumb_schema", "BreadcrumbList schema"],
      ["SEO", "local_business_schema", "LocalBusiness schema"],
      ["SEO", "sitemap_index", "XML sitemap index"],
      ["SEO", "image_sitemap_present", "Image sitemap"],
      ["SEO", "news_sitemap_present", "Google News sitemap"],
      ["SEO", "pagination_rel_links", "rel=prev/next pagination links"],
      ["SEO", "canonical_self_referencing", "Self-referencing canonical"],
      ["SEO", "google_business_profile", "Google Business Profile signals"],
      ["SEO", "bing_webmaster_verified", "Bing Webmaster Tools verified"],
      ["SEO", "internal_link_depth", "Key pages within 3 clicks"],
      // Trust & Brand Extended
      ["Trust & Brand", "customer_logo_wall", "Customer logo wall"],
      ["Trust & Brand", "case_studies_present", "Customer case studies"],
      ["Trust & Brand", "awards_recognition", "Industry awards / badges"],
      ["Trust & Brand", "security_whitepaper", "Security whitepaper"],
      ["Trust & Brand", "github_org_public", "Public GitHub organisation"],
      ["Trust & Brand", "cto_technical_bio", "CTO / technical lead bio"],
      ["Trust & Brand", "investor_backing_listed", "VC / accelerator backing"],
      ["Trust & Brand", "conference_speaking", "Conference / speaking appearances"],
      ["Trust & Brand", "uptime_history_public", "Public uptime history"],
      ["Trust & Brand", "named_customer_quotes", "Named customer quotes"],
      // Missing Pages Extended
      ["Missing Pages", "legal_hub_page", "/legal page aggregating legal docs"],
      ["Missing Pages", "security_dedicated_page", "/security dedicated page"],
      ["Missing Pages", "api_docs_page", "/docs or /api-docs page"],
      ["Missing Pages", "system_requirements_page", "System requirements page"],
      ["Missing Pages", "roadmap_public_page", "/roadmap public page"],
      ["Missing Pages", "pricing_comparison_table", "Pricing comparison table"],
      ["Missing Pages", "migration_import_guide", "Migration / import guide"],
      ["Missing Pages", "partners_ecosystem_page", "/partners or /ecosystem page"],
      ["Missing Pages", "affiliate_programme_page", "/affiliate programme page"],
      ["Missing Pages", "release_notes_page", "/release-notes page"],
      // Global Distribution Extended
      ["Global Distribution", "uk_pecr_cookie_law", "UK PECR cookie law reference"],
      ["Global Distribution", "cnil_france_compliant", "CNIL compliance signals (France)"],
      ["Global Distribution", "eu_art27_representative", "EU Art. 27 representative named"],
      ["Global Distribution", "consumer_law_aus", "Australian Consumer Law (ACL)"],
      ["Global Distribution", "local_phone_numbers", "Local phone numbers for target markets"],
      ["Global Distribution", "vat_moss_oss_signals", "EU VAT OSS compliance"],
      ["Global Distribution", "gdpr_dpa_list_public", "Sub-processors list public"],
      ["Global Distribution", "iso_27701_signals", "ISO 27701 privacy management"],
      ["Global Distribution", "transfer_impact_assessment", "SCCs / transfer impact assessment"],
      ["Global Distribution", "local_legal_notice", "Local legal notice (Mentions Légales)"],
      // Code Quality Extended
      ["Code Quality", "github_branch_protection", "Branch protection rules"],
      ["Code Quality", "github_required_reviews", "Required PR approvals"],
      ["Code Quality", "github_codeowners", "CODEOWNERS file"],
      ["Code Quality", "github_code_scanning", "Code scanning (CodeQL / Snyk)"],
      ["Code Quality", "github_secret_scanning", "Secret scanning enabled"],
      ["Code Quality", "github_pr_template", "PR description template"],
      ["Code Quality", "github_issue_templates", "Issue templates"],
      ["Code Quality", "commit_signing_enabled", "Signed commits (GPG / sigstore)"],
      ["Code Quality", "release_automation", "Release automation (semantic-release)"],
      ["Code Quality", "stale_bot_configured", "Stale issue / PR bot"],
      // Mobile Extended
      ["Mobile & Accessibility", "web_push_notifications", "Web Push Notifications"],
      ["Mobile & Accessibility", "push_permission_polite", "Polite push permission prompt"],
      ["Mobile & Accessibility", "offline_mode_capable", "Service worker offline support"],
      ["Mobile & Accessibility", "reduced_motion_css", "prefers-reduced-motion CSS"],
      ["Mobile & Accessibility", "high_contrast_css", "prefers-contrast CSS"],
      ["Mobile & Accessibility", "biometric_auth_signals", "WebAuthn biometric auth signals"],
      ["Mobile & Accessibility", "screen_reader_tested_signal", "Accessibility testing evidence"],
      ["Mobile & Accessibility", "gesture_navigation", "Swipe / gesture navigation"],
      ["Mobile & Accessibility", "apple_app_clip_support", "App Clips (iOS)"],
      ["Mobile & Accessibility", "android_instant_app", "Android Instant Apps"],
      // Business Operations
      ["Business Operations", "physical_address_footer", "Physical address in footer"],
      ["Business Operations", "business_hours_displayed", "Business hours displayed"],
      ["Business Operations", "vat_number_displayed", "VAT number in footer (EU B2B)"],
      ["Business Operations", "uk_companies_house_number", "UK Companies House registration number"],
      ["Business Operations", "eu_director_info", "Director / responsible person named"],
      ["Business Operations", "support_sla_documented", "Support SLA / response times"],
      ["Business Operations", "esignature_support", "eSignature / contract workflow"],
      ["Business Operations", "invoice_generation_b2b", "Invoice / tax invoice generation"],
      ["Business Operations", "insurance_mention", "Professional indemnity insurance"],
      ["Business Operations", "gdpr_ropa_maintained", "ROPA (Records of Processing Activities)"],
      ["Business Operations", "data_retention_schedule", "Data retention schedule"],
      ["Business Operations", "supplier_due_diligence", "Vendor / sub-processor due diligence"],
      ["Business Operations", "modern_slavery_statement", "Modern Slavery Act statement"],
      ["Business Operations", "bribery_act_policy", "Anti-bribery policy"],
      ["Business Operations", "whistleblower_policy", "Whistleblower / speak-up policy"],
      // API Quality
      ["API Quality", "api_versioning_present", "API versioning (/v1/, /v2/)"],
      ["API Quality", "api_rate_limit_documented", "Rate limits documented"],
      ["API Quality", "api_auth_method_documented", "Auth method documented"],
      ["API Quality", "api_error_rfc7807", "RFC 7807 Problem Details format"],
      ["API Quality", "api_pagination_documented", "Pagination documented"],
      ["API Quality", "api_filtering_sorting", "Filtering / sorting params documented"],
      ["API Quality", "api_webhook_docs", "Webhook documentation"],
      ["API Quality", "api_sandbox_test_mode", "Sandbox / test mode"],
      ["API Quality", "api_sdk_packages", "SDK packages published"],
      ["API Quality", "api_versioned_changelog", "Versioned API changelog"],
      ["API Quality", "api_health_status_endpoint", "/api/health or /status endpoint"],
      ["API Quality", "api_deprecation_policy", "Deprecation policy / sunset headers"],
      ["API Quality", "api_sla_documented", "API SLA / uptime guarantee"],
      ["API Quality", "graphql_depth_limiting", "GraphQL depth / complexity limiting"],
      ["API Quality", "openapi_spec_served", "OpenAPI 3.x spec at /openapi.json"],
    ];
    for (const [category, checkKey, label] of failedChecks) {
      checks.push({ category, checkKey, label, status: "FAIL", detail: "Could not reach the site." });
    }
  }

  const spaHostname = (() => {
    try {
      return new URL(pageResult?.finalUrl || httpsUrl).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const techStack = pageResult ? detectTechStack(pageResult.headers, pageResult.html, spaHostname) : [];
  const rawChecks = checks.map((check, i) => ({ ...check, sortOrder: i }));
  // Same pipeline as every streamed wave — see finaliseUrlChecks for why that matters.
  const finalChecks = finaliseUrlChecks(rawChecks, {
    platform,
    surfaceKind,
    markets: effectiveMarkets,
    spaShell,
  });
  return { checks: finalChecks, techStack, detectedMarkets, surfaceKind };
}

type GitHubContentsEntry = { name: string; type: "file" | "dir" };
type GitHubContentsResponse = GitHubContentsEntry[] | { message?: string };

export async function runGithubChecks(
  repoInput: string,
  platform?: string,
  detectedShape?: SnapshotShape,
): Promise<{
  checks: PulseScanCheckInput[];
  techStack: string[];
  /** Detected mobile project shape, or null for anything else. Null on every early
   *  return, so an unreadable repo is never mistaken for a mobile one. */
  nativePlatform: NativePlatform | null;
}> {
  const parsed = parseGithubRepo(repoInput);
  const checks: PulseScanCheckInput[] = [];

  if (!parsed) {
    return {
      checks: [
        {
          category: CATEGORIES.CODE_QUALITY,
          checkKey: "repo_parse",
          label: "Repository URL",
          status: "FAIL",
          detail: "Could not parse repository URL. Use 'owner/repo' or a full GitHub URL.",
        },
      ],
      techStack: [],
      // Unreadable / unparseable repo is not a mobile repo — never let a failed read
      // suppress the web suite as though we had detected a mobile project.
      nativePlatform: null,
    };
  }

  const fullName = `${parsed.owner}/${parsed.repo}`;
  const contents = await safeGithubRequest<GitHubContentsResponse>(
    `/repos/${fullName}/contents`,
    [],
  );

  const entries = Array.isArray(contents) ? (contents as GitHubContentsEntry[]) : [];

  // ── Can we actually READ this repo? ─────────────────────────────────────────
  // Every check below is derived from the root listing, so an empty listing made
  // them all report "missing" — a wall of confident, entirely false findings plus a
  // plausible-looking score. Observed live: a private repo that genuinely contains
  // README.md, .gitignore and pubspec.yaml was reported as having none of them.
  //
  // `safeGithubRequest` swallows the HTTP error, so an empty array is ambiguous
  // between "no access", "does not exist" and "genuinely empty repo". One extra
  // request (only on this path) tells them apart. The secret scanner already skips
  // on an unreadable tree; this brings runGithubChecks in line.
  let repoReadable = entries.length > 0;
  let repoExists = repoReadable;
  if (!repoReadable) {
    const meta = await safeGithubRequest<{ full_name?: string; size?: number }>(
      `/repos/${fullName}`,
      {},
    );
    repoExists = Boolean(meta.full_name);
    // Repo metadata readable but no contents ⇒ a real, empty repository.
    repoReadable = repoExists;
  }

  if (!repoReadable) {
    // Name the ACTUAL cause. "No access" and "no credentials at all" need completely
    // different fixes, and conflating them cost a full day of misdiagnosis: the token
    // was never set in prod, but the symptom looked like a scoring problem.
    const reason = !hasGithubToken()
      ? `GITHUB_TOKEN is not configured on this server, so Pulse is calling GitHub unauthenticated — every private repository returns 404 and no repository intelligence is available. This is a server configuration problem, not a finding about ${fullName}: nothing below was assessed. Set GITHUB_TOKEN in the VPS .env (or the FOUNDRY_GITHUB_TOKEN Actions secret, which the deploy syncs) and re-scan.`
      : repoExists
        ? `Repository ${fullName} exists but its contents could not be read — Pulse's GITHUB_TOKEN lacks access. If it is a fine-grained token, add this repository to its allow-list (or set it to All repositories). Findings derived from the file tree are unavailable rather than negative.`
        : `Repository ${fullName} is not accessible: it does not exist, or Pulse's GITHUB_TOKEN cannot see it. Findings derived from the file tree are unavailable, NOT negative — nothing below was assessed.`;
    return {
      checks: [
        {
          category: CATEGORIES.CODE_QUALITY,
          checkKey: "repo_accessible",
          label: "Repository is readable by Pulse",
          status: "FAIL" as const,
          detail: `${reason} Until this is resolved the scan carries no information about the code.`,
        },
      ].map((check, i) => ({ ...check, sortOrder: i })),
      techStack: [],
      // Unreadable / unparseable repo is not a mobile repo — never let a failed read
      // suppress the web suite as though we had detected a mobile project.
      nativePlatform: null,
    };
  }

  const names = entries.map((e) => e.name.toLowerCase());

  const hasReadme = names.some((n) => n.startsWith("readme"));
  const hasTests = names.some((n) => ["test", "tests", "__tests__", "spec", "specs"].includes(n));
  const hasLinter =
    names.includes("eslint.config.js") ||
    names.includes("eslint.config.mjs") ||
    names.includes(".eslintrc") ||
    names.includes(".eslintrc.js") ||
    names.includes("biome.json") ||
    names.includes(".prettierrc");
  const hasTs = names.includes("tsconfig.json");
  const hasEnvExample = names.includes(".env.example") || names.includes(".env.sample");
  const hasCi = names.includes(".github") || names.includes(".circleci");
  const hasLicense = names.some((n) => n.startsWith("license"));
  const hasPackageJson = names.includes("package.json");
  const hasPyProject = names.includes("pyproject.toml") || names.includes("requirements.txt");
  const hasManifest = hasPackageJson || hasPyProject || names.includes("cargo.toml") || names.includes("go.mod");
  const hasDockerfile = names.includes("dockerfile") || names.includes("docker-compose.yml") || names.includes("docker-compose.yaml");

  // AEO & AI Discoverability (repo side) — is the codebase built to be worked on by
  // AI coding agents? An agent-instructions contract (CLAUDE.md / AGENTS.md / editor
  // rules) and a published llms.txt are the AI-first-repo signals.
  const hasAgentInstructions =
    names.includes("claude.md") ||
    names.includes("agents.md") ||
    names.includes(".cursorrules") ||
    names.includes(".windsurfrules") ||
    names.includes(".aider.conf.yml") ||
    names.some((n) => n.startsWith("agent") && n.endsWith(".md"));
  // llms.txt must be SERVED at /llms.txt, and for every mainstream web framework
  // the only way to achieve that is to commit it to a static root — public/ for
  // Next, Vite and Astro, static/ for Nuxt and SvelteKit. Matching the repo root
  // only therefore WARNed every correctly-configured project for failing to publish
  // a file it does publish (verified against this repo: no root llms.txt,
  // public/llms.txt present and served). Only probe the static roots that exist,
  // so a repo without one costs no extra API calls.
  const STATIC_ROOTS = ["public", "static", "www", "assets"] as const;
  const presentStaticRoots = STATIC_ROOTS.filter((d) =>
    entries.some((e) => e.name.toLowerCase() === d && e.type === "dir"),
  );
  const staticRootListings = await Promise.all(
    presentStaticRoots.map((d) =>
      safeGithubRequest<GitHubContentsResponse>(`/repos/${fullName}/contents/${d}`, []),
    ),
  );
  const staticNames = staticRootListings
    .flatMap((l) => (Array.isArray(l) ? (l as GitHubContentsEntry[]) : []))
    .map((e) => e.name.toLowerCase());
  const isLlmsTxt = (n: string) => n === "llms.txt" || n === "llms-full.txt";
  const hasRepoLlmsTxt = names.some(isLlmsTxt) || staticNames.some(isLlmsTxt);

  checks.push(
    {
      category: CATEGORIES.AEO,
      checkKey: "aeo_agent_instructions",
      label: "AI agent instructions (CLAUDE.md / AGENTS.md)",
      status: hasAgentInstructions ? "PASS" : "WARN",
      detail: hasAgentInstructions
        ? "Agent-instructions file found — the repo gives AI coding agents an explicit contract (conventions, component APIs, anti-patterns), so they compose from known vocabulary instead of guessing."
        : "No CLAUDE.md / AGENTS.md / editor-rules file. Adding an agent-instructions contract makes the codebase far more productive to build with AI coding agents (one-pass changes, fewer invented patterns).",
    },
    {
      category: CATEGORIES.AEO,
      checkKey: "aeo_repo_llms_txt",
      label: "llms.txt published in repo",
      status: hasRepoLlmsTxt ? "PASS" : "WARN",
      detail: hasRepoLlmsTxt
        ? "llms.txt present in the repo — machine-readable guidance for LLMs is version-controlled alongside the code."
        : "No llms.txt in the repo root. Publishing one (served at the site root) tells AI answer engines what the product is and which docs matter.",
    },
  );

  checks.push(
    {
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "has_readme",
      label: "README.md",
      status: hasReadme ? "PASS" : "FAIL",
      detail: hasReadme ? "README.md present." : "No README.md found.",
    },
    {
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "has_tests",
      label: "Test suite",
      status: hasTests ? "PASS" : "WARN",
      detail: hasTests ? "Test directory found." : "No test directory detected.",
    },
    {
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "has_linter",
      label: "Linter config",
      status: hasLinter ? "PASS" : "WARN",
      detail: hasLinter ? "Linting configuration found." : "No ESLint/Biome/Prettier config found.",
    },
    {
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "has_typescript",
      label: "TypeScript",
      status: hasTs ? "PASS" : "WARN",
      detail: hasTs ? "TypeScript configured (tsconfig.json found)." : "No TypeScript configuration found.",
    },
    {
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "has_env_example",
      label: ".env.example",
      status: hasEnvExample ? "PASS" : "WARN",
      detail: hasEnvExample ? ".env.example found." : "No .env.example file — environment setup is undocumented.",
    },
    {
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "ci_cd_present",
      label: "CI/CD pipeline",
      status: hasCi ? "PASS" : "WARN",
      detail: hasCi ? "CI/CD configuration found." : "No CI/CD configuration detected.",
    },
    {
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "has_license",
      label: "License file",
      status: hasLicense ? "PASS" : "WARN",
      detail: hasLicense ? "License file present." : "No license file found.",
    },
    {
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: "has_manifest",
      label: "Dependency manifest",
      status: hasManifest ? "PASS" : "WARN",
      detail: hasManifest ? "Dependency manifest found." : "No dependency manifest detected.",
    },
    {
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: "dockerfile_present",
      label: "Dockerfile / Docker Compose",
      status: hasDockerfile ? "PASS" : "WARN",
      detail: hasDockerfile ? "Docker configuration found." : "No Docker configuration detected.",
    },
  );

  // Additional Code Quality checks
  const hasContributing = names.some((n) => n.startsWith("contributing"));
  const hasCodeOfConduct = names.some((n) => n.startsWith("code_of_conduct") || n.startsWith("code-of-conduct"));
  const hasSecurityMd = names.some((n) => n === "security.md");
  const hasDependabot = names.includes(".github") && (() => {
    const githubDir = entries.find((e) => e.name === ".github" && e.type === "dir");
    return Boolean(githubDir);
  })();
  const hasChangelogFile = names.some((n) => n.startsWith("changelog") || n === "history.md");
  const hasOpenApiSpec = names.some((n) => ["openapi.yaml", "openapi.yml", "openapi.json", "swagger.yaml", "swagger.json"].includes(n));
  const hasEditorConfig = names.includes(".editorconfig");
  const hasGitignore = names.includes(".gitignore");

  checks.push(
    {
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "has_contributing",
      label: "CONTRIBUTING.md",
      status: hasContributing ? "PASS" : "WARN",
      detail: hasContributing ? "CONTRIBUTING.md found — contributor guidelines documented." : "No CONTRIBUTING.md — makes open-source contributions and team onboarding harder.",
    },
    {
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "has_code_of_conduct",
      label: "Code of Conduct",
      status: hasCodeOfConduct ? "PASS" : "WARN",
      detail: hasCodeOfConduct ? "Code of Conduct found." : "No Code of Conduct — required for GitHub marketplace listings and professional open-source projects.",
    },
    {
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "has_security_md",
      label: "SECURITY.md (vulnerability disclosure)",
      status: hasSecurityMd ? "PASS" : "WARN",
      detail: hasSecurityMd ? "SECURITY.md found — responsible disclosure policy documented." : "No SECURITY.md — GitHub recommends this for all repos to guide vulnerability reporting.",
    },
    {
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "has_dependabot",
      label: "Dependabot / automated dependency updates",
      status: hasDependabot ? "PASS" : "WARN",
      detail: hasDependabot ? ".github directory found — check for dependabot.yml for automated updates." : "No Dependabot configuration — unpatched dependencies are the #1 source of supply-chain vulnerabilities.",
    },
    {
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "has_changelog_file",
      label: "CHANGELOG.md",
      status: hasChangelogFile ? "PASS" : "WARN",
      detail: hasChangelogFile ? "CHANGELOG.md found — release history documented." : "No CHANGELOG.md — users and contributors can't track what changed between versions.",
    },
    {
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "has_openapi_spec",
      label: "OpenAPI / Swagger spec",
      status: hasOpenApiSpec ? "PASS" : "WARN",
      detail: hasOpenApiSpec ? "OpenAPI/Swagger spec found — API is documented and machine-readable." : "No OpenAPI spec — an openapi.yaml enables auto-generated SDKs, Postman collections, and API docs.",
    },
    {
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "has_editorconfig",
      label: ".editorconfig (consistent formatting)",
      status: hasEditorConfig ? "PASS" : "WARN",
      detail: hasEditorConfig ? ".editorconfig found — consistent code style across editors." : "No .editorconfig — without it, tabs vs spaces and line endings vary by contributor.",
    },
    {
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "has_gitignore",
      label: ".gitignore",
      status: hasGitignore ? "PASS" : "FAIL",
      detail: hasGitignore ? ".gitignore found — build artifacts and secrets excluded from version control." : "No .gitignore — secrets and build artifacts may be accidentally committed.",
    },
  );

  // ── Additional file presence checks ──────────────────────────────────────
  const hasDockerCompose = names.includes("docker-compose.yml") || names.includes("docker-compose.yaml");
  const hasMakefile = names.includes("makefile");
  const hasHuskyConfig = names.includes(".husky") || names.includes(".huskyrc");
  const hasVitest = names.some((n) => n === "vitest.config.ts" || n === "vitest.config.js");
  const hasJest = names.some((n) => n === "jest.config.js" || n === "jest.config.ts" || n === "jest.config.mjs");
  const hasPlaywright = names.some((n) => n.startsWith("playwright.config"));
  const hasCypress = names.some((n) => n === "cypress.json" || n === "cypress.config.js" || n === "cypress.config.ts" || n === "cypress");
  const hasE2eTests = hasPlaywright || hasCypress;
  const hasDevContainer = names.includes(".devcontainer");
  const hasRenovate = names.some((n) => n === "renovate.json" || n === ".renovaterc" || n === "renovate.json5");
  const hasHelmChart = names.includes("charts") || names.includes("helm");
  const hasK8s = names.includes("k8s") || names.includes("kubernetes");
  const hasInfraCode = hasHelmChart || hasK8s || names.includes("terraform") || names.includes("pulumi");
  const hasMigrations = names.some((n) => n === "migrations" || n === "db" || n === "database" || n === "prisma");
  const hasSupabase = names.includes("supabase");
  const hasPrisma = names.includes("prisma");
  const hasDrizzle = names.some((n) => n === "drizzle.config.ts" || n === "drizzle.config.js");
  const hasOrmConfig = hasPrisma || hasDrizzle || hasSupabase;
  const hasMonorepo = names.some((n) => n === "pnpm-workspace.yaml" || n === "lerna.json" || n === "nx.json" || n === "turbo.json");
  const hasCoverage = names.some((n) => n === "codecov.yml" || n === ".codecov.yml" || n === "coveralls.yml" || n.startsWith("coverage"));

  // suppress unused variable warnings for variables that may be useful in future
  void hasDockerCompose;

  checks.push(
    {
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "has_e2e_tests",
      label: "E2E test suite (Playwright / Cypress)",
      status: hasE2eTests ? "PASS" : "WARN",
      detail: hasE2eTests
        ? "End-to-end test configuration found."
        : "No E2E tests detected — Playwright or Cypress would catch regressions that unit tests miss.",
    },
    {
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "has_unit_test_config",
      label: "Unit test framework (Jest / Vitest)",
      status: hasVitest || hasJest ? "PASS" : "WARN",
      detail: hasVitest || hasJest
        ? "Unit test framework configured."
        : "No Jest/Vitest config found — unit tests are the fastest feedback loop for catching bugs.",
    },
    {
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "has_git_hooks",
      label: "Git hooks (Husky / lefthook)",
      status: hasHuskyConfig || names.includes("lefthook.yml") || names.includes(".lefthook.yml") ? "PASS" : "WARN",
      detail: hasHuskyConfig
        ? "Git hooks configured — linting and tests run before commits."
        : "No pre-commit hooks — lint errors and test failures can reach the main branch undetected.",
    },
    {
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: "has_orm_config",
      label: "ORM / database configuration",
      status: hasOrmConfig ? "PASS" : "WARN",
      detail: hasOrmConfig
        ? "Database ORM configuration detected (Prisma/Drizzle/Supabase)."
        : "No ORM config detected — consider Prisma or Drizzle for type-safe database access and migration management.",
    },
    {
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: "has_migrations",
      label: "Database migrations",
      status: hasMigrations ? "PASS" : "WARN",
      detail: hasMigrations
        ? "Database migrations directory detected."
        : "No migrations folder detected — schema changes without migrations make deployments risky and rollbacks difficult.",
    },
    {
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "has_renovate",
      label: "Renovate / automated dependency updates",
      status: hasRenovate ? "PASS" : "WARN",
      detail: hasRenovate
        ? "Renovate config found — dependencies stay up-to-date automatically."
        : "No Renovate config — dependencies gradually drift out of date, accumulating security debt.",
    },
    {
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: "has_devcontainer",
      label: "Dev container (.devcontainer)",
      status: hasDevContainer ? "PASS" : "WARN",
      detail: hasDevContainer
        ? ".devcontainer found — reproducible dev environment."
        : "No devcontainer — onboarding a new developer requires manual environment setup, which is error-prone.",
    },
    {
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: "has_infra_code",
      label: "Infrastructure as Code (Terraform / Helm / K8s)",
      status: hasInfraCode ? "PASS" : "WARN",
      detail: hasInfraCode
        ? "Infrastructure as Code configuration detected."
        : "No IaC detected — infrastructure managed manually means deployments are harder to reproduce and audit.",
    },
    {
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "has_makefile",
      label: "Makefile / task runner",
      status: hasMakefile ? "PASS" : "WARN",
      detail: hasMakefile
        ? "Makefile found — common tasks are standardised."
        : "No Makefile — developers must remember or document common commands (build, test, deploy) separately.",
    },
    {
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "is_monorepo",
      label: "Monorepo tooling (Turbo / Nx / pnpm workspaces)",
      status: hasMonorepo ? "PASS" : "WARN",
      detail: hasMonorepo
        ? "Monorepo configuration detected."
        : "Single package repository — fine for smaller projects, but consider a monorepo as the product grows.",
    },
    {
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "has_coverage_config",
      label: "Code coverage reporting",
      status: hasCoverage ? "PASS" : "WARN",
      detail: hasCoverage
        ? "Coverage configuration found."
        : "No coverage config — without coverage tracking you can't see which code paths are untested.",
    },
  );

  // Detect tech stack from package.json if available
  const techStack: string[] = [];
  if (hasPackageJson) {
    const pkgJson = await safeGithubRequest<Record<string, unknown>>(
      `/repos/${fullName}/contents/package.json`,
      {},
    );
    // GitHub returns base64-encoded content
    const encoded = (pkgJson as { content?: string }).content;
    if (encoded) {
      try {
        const decoded = Buffer.from(encoded.replace(/\n/g, ""), "base64").toString("utf-8");
        const pkg = JSON.parse(decoded) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps["next"]) techStack.push("Next.js");
        if (deps["react"]) techStack.push("React");
        if (deps["vue"]) techStack.push("Vue");
        if (deps["svelte"]) techStack.push("Svelte");
        if (deps["nuxt"]) techStack.push("Nuxt.js");
        if (deps["@remix-run/react"] || deps["@remix-run/node"]) techStack.push("Remix");
        if (deps["gatsby"]) techStack.push("Gatsby");
        if (deps["express"]) techStack.push("Express");
        if (deps["fastify"]) techStack.push("Fastify");
        if (deps["hono"]) techStack.push("Hono");
        if (deps["stripe"] || deps["@stripe/stripe-js"]) techStack.push("Stripe");
        if (deps["@supabase/supabase-js"]) techStack.push("Supabase");
        if (deps["firebase"] || deps["firebase-admin"]) techStack.push("Firebase");
        if (deps["@clerk/nextjs"] || deps["@clerk/clerk-react"]) techStack.push("Clerk");
        if (deps["next-auth"] || deps["@auth/core"]) techStack.push("NextAuth");
        if (deps["prisma"] || deps["@prisma/client"]) techStack.push("Prisma");
        if (deps["drizzle-orm"]) techStack.push("Drizzle");
        if (deps["@anthropic-ai/sdk"]) techStack.push("Anthropic Claude");
        if (deps["openai"]) techStack.push("OpenAI");
        if (deps["tailwindcss"]) techStack.push("Tailwind CSS");
        if (deps["lovable-tagger"]) techStack.push("Lovable");

        // AI Readiness checks (GitHub / package.json source)
        const isAiProject = !!(
          deps["@anthropic-ai/sdk"] ||
          deps["openai"] ||
          deps["@google/generative-ai"] ||
          deps["@mistralai/mistralai"] ||
          deps["ai"] ||
          deps["@ai-sdk/core"] ||
          deps["@ai-sdk/openai"] ||
          deps["langchain"] ||
          deps["@langchain/core"] ||
          deps["llama-index"] ||
          deps["llamaindex"]
        );

        if (isAiProject) {
          const hasAiMonitoring = !!(
            deps["@helicone/helicone"] ||
            deps["langsmith"] ||
            deps["langfuse"] ||
            deps["portkey-ai"] ||
            deps["braintrust"] ||
            deps["traceloop-sdk"] ||
            deps["@arizeai/openinference-core"]
          );
          checks.push({
            category: CATEGORIES.AI_READINESS,
            checkKey: "ai_has_monitoring_dep",
            label: "AI observability / LLM tracing dependency",
            status: hasAiMonitoring ? "PASS" : "WARN",
            detail: hasAiMonitoring
              ? "AI observability library detected — LLM calls are traced and costs monitored."
              : "No AI observability library (Helicone, LangSmith, Langfuse) found. Without tracing, debugging model failures and cost spikes is very difficult.",
          });

          const hasValidation = !!(
            deps["zod"] ||
            deps["yup"] ||
            deps["joi"] ||
            deps["valibot"] ||
            deps["@sinclair/typebox"]
          );
          checks.push({
            category: CATEGORIES.AI_READINESS,
            checkKey: "ai_has_validation_dep",
            label: "Output validation library for AI responses",
            status: hasValidation ? "PASS" : "WARN",
            detail: hasValidation
              ? "Schema validation library detected — AI outputs can be validated before use."
              : "No schema validation library found. Raw AI outputs without validation will cause runtime errors when the model returns unexpected formats.",
          });

          const hasRetry = !!(
            deps["p-retry"] ||
            deps["axios-retry"] ||
            deps["exponential-backoff"] ||
            deps["async-retry"] ||
            deps["retry"] ||
            deps["cockatiel"]
          );
          checks.push({
            category: CATEGORIES.AI_READINESS,
            checkKey: "ai_has_retry_dep",
            label: "Retry / resilience library for AI API calls",
            status: hasRetry ? "PASS" : "WARN",
            detail: hasRetry
              ? "Retry / resilience library detected — AI API rate-limit errors are handled gracefully."
              : "No retry library detected. AI API calls without retry logic will surface 429 rate-limit errors directly to users.",
          });

          const hasEvals = !!(
            deps["promptfoo"] ||
            deps["deepeval"] ||
            deps["evalite"] ||
            deps["braintrust"] ||
            deps["vitest"] && (deps["@anthropic-ai/sdk"] || deps["openai"])
          );
          checks.push({
            category: CATEGORIES.AI_READINESS,
            checkKey: "ai_has_evals",
            label: "AI evaluation / testing framework",
            status: hasEvals ? "PASS" : "WARN",
            detail: hasEvals
              ? "AI evaluation framework detected — model outputs are tested for quality and regressions."
              : "No AI evaluation framework found. Without evals, model version upgrades can cause silent quality regressions.",
          });
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  // Vibe Code Hygiene checks (GitHub root tree source)
  const envCommitted = names.includes(".env") || names.includes(".env.production") || names.includes(".env.local");
  checks.push({
    category: CATEGORIES.VIBE_HYGIENE,
    checkKey: "vibe_env_not_committed",
    label: ".env file not committed to repo",
    status: envCommitted ? "FAIL" : "PASS",
    detail: envCommitted
      ? "CRITICAL: .env file found in repo root — API keys and secrets are exposed in version control. Rotate all secrets immediately."
      : "No .env file found in repo root.",
  });

  const nodeModulesCommitted = names.includes("node_modules");
  checks.push({
    category: CATEGORIES.VIBE_HYGIENE,
    checkKey: "vibe_node_modules_not_committed",
    label: "node_modules/ not committed to repo",
    status: nodeModulesCommitted ? "FAIL" : "PASS",
    detail: nodeModulesCommitted
      ? "node_modules/ directory is committed to the repo — this is auto-generated code that must never be in version control."
      : "node_modules/ is not committed.",
  });

  if (hasTs) techStack.push("TypeScript");

  // ── Native mobile applicability ─────────────────────────────────────────────
  // Many of the checks above look for web/JS artefacts (tsconfig, .env.example,
  // Dockerfile, a top-level test/ folder). A Swift or Kotlin project has no
  // equivalent, so scoring them as failures made a flawless native app score the
  // same as a broken one. Rewrite those to SKIPPED (excluded from the score, with
  // the reason shown) and label the stack, which package.json sniffing can't do.
  // The snapshot is memoized, so this shares one tree fetch with the iOS family.
  checks.push({
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "repo_accessible",
    label: "Repository is readable by Pulse",
    status: "PASS",
    detail: `Repository ${fullName} read successfully (${entries.length} root entries), so the findings below are based on the actual file tree.`,
  });

  const resolvedShape = detectedShape ?? await detectRepoShape(repoInput).catch(() => "none" as const);
  const nativeSnapshot = await getRepoSnapshot(repoInput).catch(() => null);
  const nativePlatform = (["ios", "android", "flutter", "react-native"] as const).includes(
    resolvedShape as NativePlatform,
  ) ? resolvedShape as NativePlatform : null;
  techStack.push(...nativeTechStack(nativePlatform, nativeSnapshot?.paths ?? []));
  const effectivePlatform = effectivePlatformForRepoShape(platform, resolvedShape);

  return {
    checks: keepApplicableChecks(
      applyNativeApplicability(checks, nativePlatform),
      effectivePlatform,
    ).map((check, i) => ({ ...check, sortOrder: i })),
    techStack: [...new Set(techStack)],
    // Retained for report metadata and compatibility. The live orchestrator never
    // expands a repository scan into its optional GitHub Website field.
    nativePlatform,
  };
}

export function skipAllChecks(inputType: PulseScanInputType, platform?: string): PulseScanCheckInput[] {
  if (inputType !== "FREE_TEXT") return [];
  // A description contains no executable artefact. Synthesising hundreds of
  // URL/repository rows as SKIPPED is noise, consumes storage and implies work
  // Pulse did not perform. Description scans are intentionally AI analysis only.
  return [];

  const skippedChecks: Array<[CheckCategory, string, string]> = [
    ["Infrastructure", "ssl_valid", "HTTPS / SSL certificate"],
    ["Infrastructure", "http_redirect", "HTTP → HTTPS redirect"],
    ["Infrastructure", "response_time", "Response time"],
    ["Infrastructure", "status_200", "Returns 200 OK"],
    ["Infrastructure", "custom_domain", "Custom domain"],
    ["Infrastructure", "cdn_detected", "CDN / edge cache present"],
    ["SEO", "meta_title", "<title> tag"],
    ["SEO", "meta_description", "Meta description"],
    ["SEO", "og_tags", "Open Graph tags"],
    ["SEO", "canonical_url", "Canonical URL"],
    ["SEO", "h1_present", "H1 heading"],
    ["SEO", "has_robots_txt", "robots.txt"],
    ["SEO", "has_sitemap", "sitemap.xml"],
    ["Security", "csp_header", "Content-Security-Policy"],
    ["Security", "hsts_header", "HSTS header"],
    ["Security", "x_frame_options", "X-Frame-Options header"],
    ["Security", "no_exposed_env", ".env not public"],
    ["Security", "no_exposed_git", ".git directory not public"],
    ["Performance", "compression", "Gzip/Brotli compression"],
    ["Performance", "caching_headers", "Cache-Control headers"],
    ["Payments", "stripe_signals", "Stripe integration"],
    ["Payments", "pricing_page", "Pricing/billing UI"],
    ["Authentication", "auth_ui_signals", "Login/signup UI"],
    ["Authentication", "oauth_signals", "Auth provider"],
    ["Observability", "error_monitoring", "Error monitoring"],
    ["Observability", "analytics_present", "Analytics"],
    ["Observability", "health_endpoint", "/health endpoint"],
    ["Code Quality", "has_readme", "README.md"],
    ["Code Quality", "has_tests", "Test suite"],
    ["Code Quality", "has_linter", "Linter config"],
    ["Code Quality", "has_typescript", "TypeScript"],
    ["Code Quality", "has_env_example", ".env.example"],
    ["Code Quality", "ci_cd_present", "CI/CD pipeline"],
    ["Code Quality", "has_license", "License file"],
    ["Legal & Compliance", "privacy_policy", "Privacy Policy"],
    ["Legal & Compliance", "terms_of_service", "Terms of Service"],
    ["Legal & Compliance", "cookie_consent", "Cookie consent / GDPR"],
    ["Legal & Compliance", "refund_policy", "Refund / Cancellation policy"],
    ["Missing Pages", "about_page", "About / Team page"],
    ["Missing Pages", "contact_page", "Contact page"],
    ["Missing Pages", "faq_page", "FAQ / Help page"],
    ["Missing Pages", "status_page", "Status / uptime page"],
    ["Missing Pages", "changelog", "Changelog / What's new"],
    ["SaaS Readiness", "billing_portal", "Billing / subscription management"],
    ["SaaS Readiness", "account_settings", "Account settings"],
    ["SaaS Readiness", "password_reset", "Password reset"],
    ["SaaS Readiness", "support_channel", "Support channel"],
    ["SaaS Readiness", "social_proof", "Social proof / testimonials"],
    ["SaaS Readiness", "onboarding_flow", "Onboarding flow"],
    ["Mobile & Accessibility", "viewport_meta", "Viewport meta tag"],
    ["Mobile & Accessibility", "html_lang", "HTML language attribute"],
    ["Mobile & Accessibility", "aria_attributes", "ARIA accessibility attributes"],
    ["Mobile & Accessibility", "responsive_images", "Responsive / optimised images"],
    ["SEO", "og_image", "og:image (social preview)"],
    ["SEO", "twitter_card", "Twitter / X Card"],
    ["Security", "x_content_type_options", "X-Content-Type-Options"],
    ["Security", "permissions_policy", "Permissions-Policy"],
    ["Security", "referrer_policy", "Referrer-Policy"],
    ["SaaS Readiness", "email_provider", "Transactional email provider"],
    ["Code Quality", "ai_platform_origin", "AI platform watermark"],
    ["Mobile & Accessibility", "favicon", "Favicon / app icon"],
    ["Mobile & Accessibility", "pwa_manifest", "Web App Manifest (PWA)"],
    ["Payments", "stripe_webhook", "Stripe webhook endpoint"],
    ["App Store & Mobile", "apple_touch_icon", "Apple touch icon"],
    ["App Store & Mobile", "apple_app_store", "Apple App Store presence"],
    ["App Store & Mobile", "google_play_store", "Google Play Store presence"],
    ["App Store & Mobile", "universal_links", "Universal Links (iOS deep linking)"],
    ["App Store & Mobile", "android_asset_links", "Android App Links (deep linking)"],
    ["App Store & Mobile", "wallet_payments", "Apple Pay / Google Pay / Amazon Pay"],
    ["Global Distribution", "hreflang_tags", "hreflang tags (multi-region SEO)"],
    ["Global Distribution", "charset_utf8", "UTF-8 character encoding"],
    ["Global Distribution", "ccpa_compliance", "CCPA (California privacy rights)"],
    ["Global Distribution", "multi_currency", "Multi-currency pricing"],
    ["Global Distribution", "rtl_support", "RTL language support"],
    ["Global Distribution", "language_switcher", "Language / region switcher"],
    ["Global Distribution", "international_payments", "International payment methods"],
    ["Global Distribution", "eu_vat", "EU VAT / tax handling"],
    // Additional SEO
    ["SEO", "structured_data", "JSON-LD structured data"],
    ["SEO", "preload_hints", "Resource preload hints"],
    ["SEO", "search_engine_verified", "Search engine verification"],
    ["SEO", "meta_robots", "Robots meta tag"],
    ["SEO", "og_site_name", "og:site_name (brand in shares)"],
    // Additional Security
    ["Security", "subresource_integrity", "Subresource Integrity (SRI)"],
    ["Security", "secure_cookie_attributes", "Secure cookie attributes"],
    ["Security", "cors_policy", "CORS policy (Access-Control-Allow-Origin on this document)"],
    ["Security", "security_txt", "security.txt (responsible disclosure)"],
    ["Security", "server_header_leakage", "Server version not exposed"],
    ["Security", "no_mixed_content", "No mixed HTTP/HTTPS content"],
    // Additional Performance
    ["Performance", "preconnect_hints", "Preconnect / DNS prefetch hints"],
    ["Performance", "native_lazy_loading", "Native image lazy loading"],
    ["Performance", "font_display_swap", "Font display optimisation"],
    ["Performance", "vary_header", "Vary header (content negotiation)"],
    ["Performance", "server_timing", "Server-Timing header"],
    // Additional Authentication
    ["Authentication", "mfa_signals", "Multi-factor authentication (MFA)"],
    ["Authentication", "email_verification_flow", "Email verification flow"],
    ["Authentication", "magic_link_auth", "Magic link / passwordless login"],
    ["Authentication", "enterprise_sso", "Enterprise SSO / SAML"],
    // Additional Legal
    ["Legal & Compliance", "data_deletion_right", "Data deletion / right to erasure (GDPR Art. 17)"],
    ["Legal & Compliance", "accessibility_statement", "Accessibility statement"],
    ["Legal & Compliance", "coppa_signals", "COPPA / children's privacy"],
    ["Legal & Compliance", "dpa_available", "Data Processing Agreement (GDPR Art. 28)"],
    ["Legal & Compliance", "icp_license", "China ICP license (for CN market)"],
    ["Legal & Compliance", "privacy_last_updated", "Privacy policy maintenance date"],
    ["Legal & Compliance", "cookie_policy_page", "Dedicated cookie policy page"],
    ["Legal & Compliance", "gdpr_dpo_contact", "GDPR privacy contact (DPO)"],
    // Additional Missing Pages
    ["Missing Pages", "blog_resources", "Blog / resources hub"],
    ["Missing Pages", "careers_page", "Careers / jobs page"],
    ["Missing Pages", "press_media", "Press / media page"],
    ["Missing Pages", "documentation", "Documentation / developer docs"],
    ["Missing Pages", "integrations_page", "Integrations / partners page"],
    ["Missing Pages", "custom_404_page", "Custom 404 error page"],
    // Additional SaaS Readiness
    ["SaaS Readiness", "demo_booking", "Demo booking / discovery call"],
    ["SaaS Readiness", "free_trial_cta", "Free trial / free plan CTA"],
    ["SaaS Readiness", "api_availability", "Public API / developer access"],
    ["SaaS Readiness", "affiliate_program", "Affiliate / referral program"],
    ["SaaS Readiness", "security_trust_page", "Security / trust page"],
    ["SaaS Readiness", "in_app_notifications", "In-app notification system"],
    // Additional Observability
    ["Observability", "uptime_monitoring", "External uptime monitoring"],
    ["Observability", "log_aggregation", "Centralised log aggregation"],
    ["Observability", "apm_signals", "Application Performance Monitoring (APM)"],
    ["Observability", "real_user_monitoring", "Real User Monitoring (RUM)"],
    // Additional Payments
    ["Payments", "payment_trust_badges", "Payment trust badges"],
    ["Payments", "bnpl_options", "Buy Now Pay Later (BNPL)"],
    ["Payments", "crypto_payments", "Cryptocurrency payment option"],
    // Additional App Store & Mobile
    ["App Store & Mobile", "smart_app_banner_meta", "Smart App Banner (iOS web-to-app)"],
    ["App Store & Mobile", "amazon_app_store", "Amazon Appstore / Fire TV presence"],
    ["App Store & Mobile", "app_listing_screenshots", "App screenshots / listing assets"],
    ["App Store & Mobile", "app_icon_sizes", "App icon multiple resolutions"],
    // Additional Global Distribution
    ["Global Distribution", "country_region_selector", "Country / region selector"],
    ["Global Distribution", "compliance_certifications", "Compliance certifications (SOC 2, ISO 27001)"],
    ["Global Distribution", "eu_data_residency", "EU data residency signals"],
    ["Global Distribution", "company_registration_info", "Company registration info"],
    ["Global Distribution", "timezone_locale_support", "Timezone / locale-aware content"],
    // Trust & Brand (new category)
    ["Trust & Brand", "social_media_links", "Social media presence"],
    ["Trust & Brand", "third_party_reviews", "Third-party review platform"],
    ["Trust & Brand", "press_coverage", "Press / media coverage section"],
    ["Trust & Brand", "team_presence", "Founder / team bio with photo"],
    ["Trust & Brand", "product_hunt_badge", "Product Hunt launch presence"],
    ["Trust & Brand", "media_kit", "Media kit / brand assets"],
    // Code Quality (URL-detectable)
    ["Code Quality", "no_placeholder_text", "No placeholder / lorem ipsum content"],
    ["Code Quality", "no_hash_routing", "Clean URL routing (no hash routes)"],
    // Security Extended
    ["Security", "cross_origin_opener_policy", "Cross-Origin-Opener-Policy (COOP)"],
    ["Security", "cross_origin_resource_policy", "Cross-Origin-Resource-Policy (CORP)"],
    ["Security", "cross_origin_embedder_policy", "Cross-Origin-Embedder-Policy (COEP)"],
    ["Security", "csp_report_directive", "CSP report-uri / report-to configured"],
    ["Security", "rate_limiting_headers", "Rate-limiting headers present"],
    ["Security", "caa_dns_record", "CAA DNS record (cert authority restriction)"],
    ["Security", "dnssec_enabled", "DNSSEC enabled on domain"],
    ["Security", "certificate_expiry_30d", "SSL cert not expiring within 30 days"],
    ["Security", "no_exposed_ds_store", ".DS_Store not publicly accessible"],
    ["Security", "no_exposed_composer_json", "composer.json not at web root"],
    ["Security", "no_exposed_package_json_root", "package.json not served at root"],
    ["Security", "no_exposed_swagger_open", "Swagger UI not open in production"],
    ["Security", "no_exposed_actuator", "/actuator endpoints not public"],
    ["Security", "no_exposed_prometheus_metrics", "/metrics endpoint not public"],
    ["Security", "no_graphql_introspection_prod", "GraphQL introspection disabled in prod"],
    ["Security", "no_exposed_source_maps", "Source maps not served with page"],
    ["Security", "no_api_keys_in_html", "No API key patterns in HTML source"],
    ["Security", "csrf_protection_signals", "CSRF token protection detected"],
    ["Security", "bot_protection_present", "Bot protection (Cloudflare / reCAPTCHA)"],
    ["Security", "sql_error_exposure", "No SQL errors exposed in responses"],
    ["Security", "brute_force_protection", "Brute force / rate limit on auth"],
    ["Security", "session_cookie_httponly", "HttpOnly flag on session cookies"],
    ["Security", "session_cookie_samesite", "SameSite attribute on cookies"],
    ["Security", "csp_frame_ancestors", "frame-ancestors in CSP policy"],
    ["Security", "no_exposed_env_variants", ".env.prod / .env.docker not accessible"],
    ["Security", "secret_scanning_github", "No secrets / keys in page HTML"],
    ["Security", "cors_credentials_restricted", "CORS credentials not open to all origins"],
    ["Security", "dependency_audit_clean", "No obvious vulnerable library versions"],
    ["Security", "subdomain_takeover_risk", "No dangling CNAME / subdomain takeover risk"],
    ["Security", "content_security_policy_nonce", "CSP uses nonces (not unsafe-inline)"],
    // Legal Extended
    ["Legal & Compliance", "gdpr_article13_notice", "GDPR Art. 13/14 data collection notice"],
    ["Legal & Compliance", "gdpr_right_to_access", "GDPR Art. 15 — right to access data"],
    ["Legal & Compliance", "gdpr_right_to_erasure_ui", "GDPR Art. 17 — right to erasure UI"],
    ["Legal & Compliance", "gdpr_right_to_portability", "GDPR Art. 20 — data portability"],
    ["Legal & Compliance", "gdpr_right_to_object", "GDPR Art. 21 — right to object"],
    ["Legal & Compliance", "gdpr_lawful_basis_stated", "GDPR lawful basis stated"],
    ["Legal & Compliance", "gdpr_breach_notification", "GDPR breach notification procedure"],
    ["Legal & Compliance", "gdpr_records_processing", "GDPR records of processing (Art. 30)"],
    ["Legal & Compliance", "uk_gdpr_ico_registration", "ICO registration number"],
    ["Legal & Compliance", "eu_representative_contact", "EU Art. 27 representative"],
    ["Legal & Compliance", "eprivacy_pecr_compliance", "UK PECR / ePrivacy compliance"],
    ["Legal & Compliance", "digital_markets_act", "EU Digital Markets Act signals"],
    ["Legal & Compliance", "eu_ai_act_disclosure", "EU AI Act transparency disclosure"],
    ["Legal & Compliance", "lgpd_brazil", "Brazil LGPD compliance"],
    ["Legal & Compliance", "pipeda_canada", "Canada PIPEDA / Law 25 compliance"],
    ["Legal & Compliance", "pdpa_singapore", "Singapore PDPA compliance"],
    ["Legal & Compliance", "pdpa_thailand", "Thailand PDPA compliance"],
    ["Legal & Compliance", "popia_south_africa", "South Africa POPIA compliance"],
    ["Legal & Compliance", "appi_japan", "Japan APPI compliance"],
    ["Legal & Compliance", "pipl_china", "China PIPL compliance"],
    ["Legal & Compliance", "pipa_korea", "South Korea PIPA compliance"],
    ["Legal & Compliance", "dpdp_india", "India DPDP Act compliance"],
    ["Legal & Compliance", "australian_privacy_act", "Australian Privacy Act compliance"],
    ["Legal & Compliance", "hipaa_signals", "HIPAA compliance signals"],
    ["Legal & Compliance", "pci_dss_scope_reduction", "PCI DSS scope reduction evidence"],
    ["Legal & Compliance", "ferpa_signals", "FERPA compliance signals"],
    ["Legal & Compliance", "cooling_off_period_eu", "EU 14-day cooling-off period"],
    ["Legal & Compliance", "auto_renewal_disclosure", "Auto-renewal disclosure"],
    ["Legal & Compliance", "subscription_cancellation_easy", "Easy cancellation (FTC click-to-cancel)"],
    ["Legal & Compliance", "price_vat_inclusive", "Prices shown inclusive of VAT"],
    ["Legal & Compliance", "distance_selling_notice", "EU distance selling regulations"],
    ["Legal & Compliance", "intellectual_property_notice", "Copyright / IP notice"],
    ["Legal & Compliance", "dmca_policy", "DMCA takedown procedure"],
    ["Legal & Compliance", "age_gate", "Age verification / age gate"],
    ["Legal & Compliance", "contract_terms_b2b", "B2B contract terms / SLA"],
    // Performance Extended
    ["Performance", "next_gen_image_formats", "Next-gen image formats (WebP / AVIF)"],
    ["Performance", "image_dimension_attributes", "Image width/height attributes (CLS prevention)"],
    ["Performance", "critical_css_inlined", "Critical CSS inlined in <head>"],
    ["Performance", "css_appears_minified", "CSS appears minified"],
    ["Performance", "js_appears_minified", "JS files appear minified"],
    ["Performance", "http3_quic_support", "HTTP/3 / QUIC support"],
    ["Performance", "early_hints_support", "103 Early Hints support"],
    ["Performance", "stale_while_revalidate", "Stale-while-revalidate cache directive"],
    ["Performance", "immutable_cache_assets", "Immutable cache on hashed assets"],
    ["Performance", "dns_ttl_optimized", "DNS TTL not near-zero"],
    ["Performance", "render_blocking_scripts", "No render-blocking scripts"],
    ["Performance", "lcp_fetchpriority_hint", "fetchpriority=high on LCP image"],
    ["Performance", "image_width_height", "Images have explicit width/height"],
    ["Performance", "font_preload_hint", "Fonts preloaded"],
    ["Performance", "total_page_weight", "Total page weight < 3MB"],
    ["Performance", "third_party_script_blocking", "No render-blocking third-party scripts"],
    ["Performance", "no_unused_javascript", "Code splitting / lazy loading signals"],
    ["Performance", "module_script_type", "type=module on script tags"],
    ["Performance", "resource_hints_comprehensive", "Comprehensive resource hints (preload/prefetch/preconnect)"],
    ["Performance", "woff2_font_format", "WOFF2 font format used"],
    // WCAG Accessibility
    ["Accessibility", "skip_to_main_content", "Skip to main content link"],
    ["Accessibility", "image_input_alt", "<input type=image> has alt attribute"],
    ["Accessibility", "video_captions", "Video has captions track"],
    ["Accessibility", "form_labels_present", "Form inputs have labels"],
    ["Accessibility", "form_error_identification", "Form errors identify the field"],
    ["Accessibility", "keyboard_focus_visible", "Keyboard focus visible (:focus-visible)"],
    ["Accessibility", "touch_target_size", "Touch target size adequate"],
    ["Accessibility", "no_autoplay_audio", "No autoplay audio"],
    ["Accessibility", "no_autoplay_video", "No autoplay video without controls"],
    ["Accessibility", "session_timeout_warning", "Session timeout warning"],
    ["Accessibility", "valid_html_parsing", "Valid HTML / no parsing errors"],
    ["Accessibility", "aria_roles_valid", "ARIA landmark roles used"],
    ["Accessibility", "aria_live_regions", "aria-live for dynamic content"],
    ["Accessibility", "prefers_reduced_motion", "prefers-reduced-motion CSS"],
    ["Accessibility", "prefers_high_contrast", "prefers-contrast CSS"],
    ["Accessibility", "sufficient_colour_contrast", "Sufficient colour contrast"],
    ["Accessibility", "text_spacing_supported", "Text spacing not fixed"],
    ["Accessibility", "link_purpose_clear", "Link purpose clear (no 'click here')"],
    ["Accessibility", "page_title_unique", "Unique page title per route"],
    ["Accessibility", "language_attribute_body", "lang attribute on <html>"],
    // Auth Extended
    ["Authentication", "session_timeout_configured", "Session timeout configured"],
    ["Authentication", "account_lockout_policy", "Account lockout / brute force policy"],
    ["Authentication", "password_strength_enforced", "Password strength enforced"],
    ["Authentication", "passkey_webauthn_support", "Passkeys / WebAuthn support"],
    ["Authentication", "breach_password_detection", "Breach password detection"],
    ["Authentication", "account_recovery_options", "Account recovery options"],
    ["Authentication", "jwt_not_in_localstorage", "JWT not stored in localStorage"],
    ["Authentication", "refresh_token_rotation", "Refresh token rotation"],
    ["Authentication", "pkce_oauth_flow", "PKCE for OAuth public clients"],
    ["Authentication", "api_key_creation_ui", "API key generation UI"],
    ["Authentication", "oauth_minimal_scopes", "Minimal OAuth scope requests"],
    ["Authentication", "service_account_support", "Service account / M2M tokens"],
    ["Authentication", "device_management", "Trusted device management"],
    ["Authentication", "concurrent_session_policy", "Concurrent session limiting"],
    ["Authentication", "token_expiry_short", "Short-lived access tokens (< 1hr)"],
    // Roles & Permissions
    ["Roles & Permissions", "rbac_signals", "RBAC / role management UI"],
    ["Roles & Permissions", "admin_role_separation", "Admin vs user role separation"],
    ["Roles & Permissions", "team_management_ui", "Team / org management UI"],
    ["Roles & Permissions", "invite_workflow", "User invitation workflow"],
    ["Roles & Permissions", "permission_matrix_docs", "Permissions matrix documented"],
    ["Roles & Permissions", "data_scope_isolation", "Multi-tenant data isolation"],
    ["Roles & Permissions", "audit_trail_present", "Audit log / activity log"],
    ["Roles & Permissions", "api_scope_documentation", "API scopes documented"],
    ["Roles & Permissions", "least_privilege_api_tokens", "API tokens scoped to specific actions"],
    ["Roles & Permissions", "role_hierarchy", "Role hierarchy (Admin > Manager > User)"],
    ["Roles & Permissions", "access_revocation_ui", "Account deactivation / revocation UI"],
    ["Roles & Permissions", "ip_allowlisting", "IP restriction / allowlist"],
    ["Roles & Permissions", "sso_scim_provisioning", "SCIM provisioning support"],
    ["Roles & Permissions", "mfa_admin_enforced", "MFA required for admin accounts"],
    ["Roles & Permissions", "guest_anonymous_mode", "Guest / view-only mode"],
    ["Roles & Permissions", "read_only_role", "Read-only role available"],
    ["Roles & Permissions", "data_export_permission", "Data export restricted by role"],
    ["Roles & Permissions", "workspace_tenant_isolation", "Workspace / tenant isolation"],
    ["Roles & Permissions", "permission_inheritance", "Permission inheritance (groups)"],
    ["Roles & Permissions", "gdpr_data_access_control", "GDPR data subject access by role"],
    // Email Deliverability
    ["Email Deliverability", "dkim_record_present", "DKIM DNS record present"],
    ["Email Deliverability", "bimi_record_present", "BIMI DNS record present"],
    ["Email Deliverability", "mta_sts_policy", "MTA-STS mail transfer security"],
    ["Email Deliverability", "tls_rpt_record", "TLS-RPT reporting record"],
    ["Email Deliverability", "spf_hardfail", "SPF -all (hardfail)"],
    ["Email Deliverability", "dmarc_quarantine_reject", "DMARC quarantine or reject policy"],
    ["Email Deliverability", "email_unsubscribe_signal", "Unsubscribe / List-Unsubscribe signal"],
    ["Email Deliverability", "transactional_subdomain", "Transactional email subdomain"],
    ["Email Deliverability", "can_spam_address", "CAN-SPAM physical address in email"],
    ["Email Deliverability", "casl_double_optin", "CASL double opt-in signals"],
    ["Email Deliverability", "plain_text_email", "Plain text email alternative"],
    ["Email Deliverability", "bounce_handling_signal", "Bounce handling / list hygiene"],
    ["Email Deliverability", "email_preview_configured", "Email preview text configured"],
    ["Email Deliverability", "email_warm_up_signals", "Reputable ESP detected"],
    ["Email Deliverability", "mailing_list_segmentation", "Email list segmentation signals"],
    // Observability Extended
    ["Observability", "alert_pagerduty_opsgenie", "PagerDuty / OpsGenie alerting"],
    ["Observability", "on_call_configured", "On-call rotation configured"],
    ["Observability", "distributed_tracing", "Distributed tracing (Jaeger / DataDog)"],
    ["Observability", "custom_business_metrics", "Custom business metrics dashboards"],
    ["Observability", "synthetic_monitoring", "Synthetic / ping monitoring"],
    ["Observability", "structured_logging", "Structured JSON logging"],
    ["Observability", "log_retention_policy", "Log retention policy configured"],
    ["Observability", "audit_log_api_export", "Audit log accessible via API"],
    ["Observability", "db_performance_monitoring", "Database performance monitoring"],
    ["Observability", "queue_depth_monitoring", "Message queue depth monitoring"],
    ["Observability", "cost_monitoring_signals", "Cloud cost alerting"],
    ["Observability", "error_budget_policy", "SLO / error budget policy"],
    ["Observability", "incident_runbooks", "Incident runbooks documented"],
    ["Observability", "post_mortem_culture", "Post-mortem process signals"],
    ["Observability", "deployment_frequency_tracking", "Deploy frequency tracked (DORA)"],
    // Infrastructure Extended
    ["Infrastructure", "ipv6_dns_record", "IPv6 AAAA DNS record"],
    ["Infrastructure", "multi_region_signals", "Multi-region deployment signals"],
    ["Infrastructure", "load_balancer_detected", "Load balancer detected"],
    ["Infrastructure", "auto_scaling_configured", "Auto-scaling configured"],
    ["Infrastructure", "circuit_breaker_pattern", "Circuit breaker / retry pattern"],
    ["Infrastructure", "graceful_shutdown_configured", "Graceful shutdown (SIGTERM)"],
    ["Infrastructure", "environment_separation", "Prod / staging / dev separation"],
    ["Infrastructure", "blue_green_canary_deploy", "Blue/green or canary deployment"],
    ["Infrastructure", "feature_flags_system", "Feature flag system"],
    ["Infrastructure", "secrets_manager_used", "Secrets manager (Vault / AWS SM)"],
    ["Infrastructure", "database_read_replicas", "Database read replicas"],
    ["Infrastructure", "dns_ttl_healthy", "DNS TTL > 300s"],
    ["Infrastructure", "backup_domain_configured", "Backup / failover domain"],
    ["Infrastructure", "object_storage_signals", "Object storage (S3 / GCS)"],
    ["Infrastructure", "cdn_custom_caching_rules", "CDN custom caching rules"],
    // SaaS Extended
    ["SaaS Readiness", "saml_sso_available", "SAML / enterprise SSO"],
    ["SaaS Readiness", "scim_user_provisioning", "SCIM user provisioning"],
    ["SaaS Readiness", "custom_branding_available", "Custom branding / white-label"],
    ["SaaS Readiness", "enterprise_pricing_tier", "Enterprise pricing tier"],
    ["SaaS Readiness", "keyboard_shortcuts_ui", "Keyboard shortcuts"],
    ["SaaS Readiness", "dark_mode_supported", "Dark mode support"],
    ["SaaS Readiness", "bulk_operations_ui", "Bulk operations UI"],
    ["SaaS Readiness", "data_export_csv_pdf", "Data export (CSV / PDF)"],
    ["SaaS Readiness", "data_import_capability", "Data import capability"],
    ["SaaS Readiness", "community_forum_slack", "Community forum or Slack"],
    ["SaaS Readiness", "app_marketplace_listed", "Marketplace / ecosystem listing"],
    ["SaaS Readiness", "public_roadmap", "Public product roadmap"],
    ["SaaS Readiness", "partner_reseller_program", "Partner / reseller programme"],
    ["SaaS Readiness", "g2_capterra_listed", "G2 or Capterra listing"],
    ["SaaS Readiness", "volume_discount_signals", "Volume discounts"],
    // Payments Extended
    ["Payments", "sepa_bank_transfer", "SEPA / bank transfer (EU)"],
    ["Payments", "paypal_integration", "PayPal integration"],
    ["Payments", "three_ds_sca_compliant", "3D Secure / PSD2 SCA compliant"],
    ["Payments", "fraud_detection_tool", "Fraud detection (Stripe Radar / Kount)"],
    ["Payments", "pci_saq_evidence", "PCI SAQ / scope reduction evidence"],
    ["Payments", "regional_payment_methods", "Regional payment methods (Klarna / iDEAL)"],
    ["Payments", "chargeback_prevention", "Chargeback prevention tools"],
    ["Payments", "subscription_proration", "Subscription proration"],
    ["Payments", "invoicing_capability", "Invoice generation for B2B"],
    ["Payments", "tax_automation", "Tax automation (Avalara / TaxJar)"],
    // SEO Extended
    ["SEO", "faqpage_schema", "FAQPage JSON-LD structured data"],
    ["SEO", "product_schema", "Product schema (e-commerce)"],
    ["SEO", "organization_schema", "Organization schema"],
    ["SEO", "article_schema", "Article / BlogPosting schema"],
    ["SEO", "review_schema", "AggregateRating / Review schema"],
    ["SEO", "breadcrumb_schema", "BreadcrumbList schema"],
    ["SEO", "local_business_schema", "LocalBusiness schema"],
    ["SEO", "sitemap_index", "XML sitemap index"],
    ["SEO", "image_sitemap_present", "Image sitemap"],
    ["SEO", "news_sitemap_present", "Google News sitemap"],
    ["SEO", "pagination_rel_links", "rel=prev/next pagination links"],
    ["SEO", "canonical_self_referencing", "Self-referencing canonical"],
    ["SEO", "google_business_profile", "Google Business Profile signals"],
    ["SEO", "bing_webmaster_verified", "Bing Webmaster Tools verified"],
    ["SEO", "internal_link_depth", "Key pages within 3 clicks"],
    // Trust & Brand Extended
    ["Trust & Brand", "customer_logo_wall", "Customer logo wall"],
    ["Trust & Brand", "case_studies_present", "Customer case studies"],
    ["Trust & Brand", "awards_recognition", "Industry awards / badges"],
    ["Trust & Brand", "security_whitepaper", "Security whitepaper"],
    ["Trust & Brand", "github_org_public", "Public GitHub organisation"],
    ["Trust & Brand", "cto_technical_bio", "CTO / technical lead bio"],
    ["Trust & Brand", "investor_backing_listed", "VC / accelerator backing"],
    ["Trust & Brand", "conference_speaking", "Conference / speaking appearances"],
    ["Trust & Brand", "uptime_history_public", "Public uptime history"],
    ["Trust & Brand", "named_customer_quotes", "Named customer quotes"],
    // Missing Pages Extended
    ["Missing Pages", "legal_hub_page", "/legal page aggregating legal docs"],
    ["Missing Pages", "security_dedicated_page", "/security dedicated page"],
    ["Missing Pages", "api_docs_page", "/docs or /api-docs page"],
    ["Missing Pages", "system_requirements_page", "System requirements page"],
    ["Missing Pages", "roadmap_public_page", "/roadmap public page"],
    ["Missing Pages", "pricing_comparison_table", "Pricing comparison table"],
    ["Missing Pages", "migration_import_guide", "Migration / import guide"],
    ["Missing Pages", "partners_ecosystem_page", "/partners or /ecosystem page"],
    ["Missing Pages", "affiliate_programme_page", "/affiliate programme page"],
    ["Missing Pages", "release_notes_page", "/release-notes page"],
    // Global Distribution Extended
    ["Global Distribution", "uk_pecr_cookie_law", "UK PECR cookie law reference"],
    ["Global Distribution", "cnil_france_compliant", "CNIL compliance signals (France)"],
    ["Global Distribution", "eu_art27_representative", "EU Art. 27 representative named"],
    ["Global Distribution", "consumer_law_aus", "Australian Consumer Law (ACL)"],
    ["Global Distribution", "local_phone_numbers", "Local phone numbers for target markets"],
    ["Global Distribution", "vat_moss_oss_signals", "EU VAT OSS compliance"],
    ["Global Distribution", "gdpr_dpa_list_public", "Sub-processors list public"],
    ["Global Distribution", "iso_27701_signals", "ISO 27701 privacy management"],
    ["Global Distribution", "transfer_impact_assessment", "SCCs / transfer impact assessment"],
    ["Global Distribution", "local_legal_notice", "Local legal notice (Mentions Légales)"],
    // Code Quality Extended
    ["Code Quality", "github_branch_protection", "Branch protection rules"],
    ["Code Quality", "github_required_reviews", "Required PR approvals"],
    ["Code Quality", "github_codeowners", "CODEOWNERS file"],
    ["Code Quality", "github_code_scanning", "Code scanning (CodeQL / Snyk)"],
    ["Code Quality", "github_secret_scanning", "Secret scanning enabled"],
    ["Code Quality", "github_pr_template", "PR description template"],
    ["Code Quality", "github_issue_templates", "Issue templates"],
    ["Code Quality", "commit_signing_enabled", "Signed commits (GPG / sigstore)"],
    ["Code Quality", "release_automation", "Release automation (semantic-release)"],
    ["Code Quality", "stale_bot_configured", "Stale issue / PR bot"],
    // Mobile Extended
    ["Mobile & Accessibility", "web_push_notifications", "Web Push Notifications"],
    ["Mobile & Accessibility", "push_permission_polite", "Polite push permission prompt"],
    ["Mobile & Accessibility", "offline_mode_capable", "Service worker offline support"],
    ["Mobile & Accessibility", "reduced_motion_css", "prefers-reduced-motion CSS"],
    ["Mobile & Accessibility", "high_contrast_css", "prefers-contrast CSS"],
    ["Mobile & Accessibility", "biometric_auth_signals", "WebAuthn biometric auth signals"],
    ["Mobile & Accessibility", "screen_reader_tested_signal", "Accessibility testing evidence"],
    ["Mobile & Accessibility", "gesture_navigation", "Swipe / gesture navigation"],
    ["Mobile & Accessibility", "apple_app_clip_support", "App Clips (iOS)"],
    ["Mobile & Accessibility", "android_instant_app", "Android Instant Apps"],
    // Business Operations
    ["Business Operations", "physical_address_footer", "Physical address in footer"],
    ["Business Operations", "business_hours_displayed", "Business hours displayed"],
    ["Business Operations", "vat_number_displayed", "VAT number in footer (EU B2B)"],
    ["Business Operations", "uk_companies_house_number", "UK Companies House registration number"],
    ["Business Operations", "eu_director_info", "Director / responsible person named"],
    ["Business Operations", "support_sla_documented", "Support SLA / response times"],
    ["Business Operations", "esignature_support", "eSignature / contract workflow"],
    ["Business Operations", "invoice_generation_b2b", "Invoice / tax invoice generation"],
    ["Business Operations", "insurance_mention", "Professional indemnity insurance"],
    ["Business Operations", "gdpr_ropa_maintained", "ROPA (Records of Processing Activities)"],
    ["Business Operations", "data_retention_schedule", "Data retention schedule"],
    ["Business Operations", "supplier_due_diligence", "Vendor / sub-processor due diligence"],
    ["Business Operations", "modern_slavery_statement", "Modern Slavery Act statement"],
    ["Business Operations", "bribery_act_policy", "Anti-bribery policy"],
    ["Business Operations", "whistleblower_policy", "Whistleblower / speak-up policy"],
    // API Quality
    ["API Quality", "api_versioning_present", "API versioning (/v1/, /v2/)"],
    ["API Quality", "api_rate_limit_documented", "Rate limits documented"],
    ["API Quality", "api_auth_method_documented", "Auth method documented"],
    ["API Quality", "api_error_rfc7807", "RFC 7807 Problem Details format"],
    ["API Quality", "api_pagination_documented", "Pagination documented"],
    ["API Quality", "api_filtering_sorting", "Filtering / sorting params documented"],
    ["API Quality", "api_webhook_docs", "Webhook documentation"],
    ["API Quality", "api_sandbox_test_mode", "Sandbox / test mode"],
    ["API Quality", "api_sdk_packages", "SDK packages published"],
    ["API Quality", "api_versioned_changelog", "Versioned API changelog"],
    ["API Quality", "api_health_status_endpoint", "/api/health or /status endpoint"],
    ["API Quality", "api_deprecation_policy", "Deprecation policy / sunset headers"],
    ["API Quality", "api_sla_documented", "API SLA / uptime guarantee"],
    ["API Quality", "graphql_depth_limiting", "GraphQL depth / complexity limiting"],
    ["API Quality", "openapi_spec_served", "OpenAPI 3.x spec at /openapi.json"],
    // AI Readiness (URL-based)
    ["AI Readiness", "ai_feedback_ui", "User feedback loop on AI outputs"],
    ["AI Readiness", "ai_error_fallback_ui", "AI error / fallback state in UI"],
    ["AI Readiness", "ai_streaming_ui", "Streaming AI response pattern"],
    ["AI Readiness", "ai_cost_monitoring_script", "AI cost / usage monitoring tool"],
    ["AI Readiness", "ai_content_safety_signal", "Content moderation / safety layer"],
    ["AI Readiness", "ai_human_review_signal", "Human-in-the-loop review signal"],
    ["AI Readiness", "ai_rate_limit_ui", "Rate limit / quota UI signal"],
    ["AI Readiness", "ai_ai_act_disclosure", "EU AI Act transparency disclosure"],
    ["AI Readiness", "ai_provider_detected", "AI provider detected on page"],
    // AI Readiness (GitHub-based)
    ["AI Readiness", "ai_has_monitoring_dep", "AI observability / LLM tracing dependency"],
    ["AI Readiness", "ai_has_validation_dep", "Output validation library for AI responses"],
    ["AI Readiness", "ai_has_retry_dep", "Retry / resilience library for AI API calls"],
    ["AI Readiness", "ai_has_evals", "AI evaluation / testing framework"],
    // Vibe Code Hygiene (URL-based)
    ["Vibe Code Hygiene", "vibe_ai_builder", "Builder / platform origin"],
    ["Vibe Code Hygiene", "vibe_broken_links", "Internal links resolve (no broken links)"],
    ["Vibe Code Hygiene", "vibe_placeholder_content", "No placeholder / filler content in production"],
    ["Vibe Code Hygiene", "vibe_placeholder_images", "No placeholder / stock filler images"],
    ["Vibe Code Hygiene", "vibe_debug_mode", "No debug or development mode signals"],
    ["Vibe Code Hygiene", "vibe_default_title", "Meaningful page title (not a framework default)"],
    ["Vibe Code Hygiene", "vibe_ai_comment_markers", "No AI-generated comment markers in page source"],
    ["Vibe Code Hygiene", "vibe_hardcoded_creds_html", "No hardcoded test credentials in page HTML"],
    ["Vibe Code Hygiene", "vibe_no_custom_404", "Custom 404 page for missing routes"],
    ["Vibe Code Hygiene", "vibe_empty_alt_images", "Images have descriptive alt text"],
    // Vibe Code Hygiene (GitHub-based)
    ["Vibe Code Hygiene", "vibe_env_not_committed", ".env file not committed to repo"],
    ["Vibe Code Hygiene", "vibe_node_modules_not_committed", "node_modules/ not committed to repo"],
  ] as const;

  return [
    ...skippedChecks.map(([category, checkKey, label], i) => ({
    category,
    checkKey,
    label,
    status: "SKIPPED" as const,
    detail: "Not applicable for free-text input.",
    sortOrder: i,
    })),
    ...runStandardsVerificationCatalog(platform).map((check, i) => ({ ...check, sortOrder: skippedChecks.length + i })),
  ];
}

// The health score and its "why this score" breakdown share one implementation
// (computeScoreBreakdown) so the explanation can never diverge from the number.
export function calculateHealthScore(checks: PulseScanCheckInput[]): number {
  return computeScoreBreakdown(checks).finalScore;
}
