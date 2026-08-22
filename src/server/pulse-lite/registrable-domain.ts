/**
 * Registrable domain (a.k.a. organizational domain) resolution for the Pulse
 * deterministic core.
 *
 * WHY THIS EXISTS
 * ---------------
 * Several checks need to know where the DNS name they were handed sits relative
 * to the name an organisation actually registered:
 *
 *  - `dmarc_record` must implement RFC 7489 §6.6.3: a receiver that finds no
 *    record at the DNS domain retries at the Organizational Domain. Querying
 *    `_dmarc.www.gov.uk` once and stopping reports "no DMARC record" for a
 *    domain publishing `p=reject`.
 *  - `backup_domain_configured` concatenates `www.` onto the scanned hostname,
 *    which produces `www.www.gov.uk` — a name that cannot exist. It needs to
 *    know whether the scanned host is already a `www` host, some other
 *    subdomain, or the apex.
 *
 * Both are the §35 failure mode ("we couldn't look" rendered as "it isn't
 * there") caused by a lookup narrower than the standard it cites.
 *
 * THE HONESTY CONTRACT — read before extending the lists
 * -----------------------------------------------------
 * A WRONG registrable domain is worse than no answer at all: it makes a caller
 * query a real record belonging to somebody else and report it as the scanned
 * host's own, at HIGH confidence. `www.myapp.vercel.app` resolved to
 * `vercel.app` would report Vercel's DMARC policy as the customer's.
 *
 * So this module NEVER guesses. When the hostname's suffix is not in the
 * curated list, `registrableDomain()` returns `null` and `analyzeHost().reason`
 * carries a sentence explaining what could not be established — suitable for a
 * SKIPPED check detail. Callers must treat `null` as "do not answer", never as
 * "no record exists".
 *
 * WHY NOT THE FULL MOZILLA PSL
 * ----------------------------
 * ~15k lines, refreshed continuously, and this runs on the scan hot path. The
 * curated list below covers the namespaces that actually occur in scan targets.
 * Lookups are Set hits against at most `MAX_SUFFIX_LABELS` candidate strings.
 *
 * KNOWN, DELIBERATE DEVIATIONS FROM THE PSL
 * -----------------------------------------
 *  1. `gov.uk` is treated as a REGISTRABLE DOMAIN, not a public suffix, so
 *     `www.gov.uk` -> `gov.uk`. The PSL lists `gov.uk` as a suffix, which would
 *     make the organizational domain of `www.gov.uk` be `www.gov.uk` itself.
 *     Verified against live DNS (2026-08):
 *         _dmarc.gov.uk      -> "v=DMARC1;p=reject;sp=none;np=reject;..."
 *         _dmarc.www.gov.uk  -> (nothing)
 *     i.e. the strict-PSL answer finds no record for a `p=reject` domain. The
 *     `gov.uk` zone is run as one organisation (GDS) publishing tree-wide
 *     policy via `sp=`/`np=`, so `gov.uk` is the right organizational domain.
 *
 *     `ac.uk` is the opposite and IS listed as a suffix, for the same reason
 *     read the other way round:
 *         _dmarc.ac.uk       -> (nothing)
 *         _dmarc.cam.ac.uk   -> "v=DMARC1; p=reject; ..."
 *     `ac.uk` is a pure registry namespace; each institution runs its own zone.
 *
 *     ⚠️ The cost of (1): UK government departments DO run their own zones
 *     (`_dmarc.hmrc.gov.uk` and `_dmarc.dwp.gov.uk` both exist), so for
 *     `www.hmrc.gov.uk` the single answer `gov.uk` is the parent's record, not
 *     the department's. A caller that must not get this wrong should walk
 *     `organizationalDomainCandidates()` (most specific first) instead of
 *     betting on the single `registrableDomain()` answer.
 *
 *  2. Geographic second levels are enumerated only where they are compact
 *     (`.us` states, `.ca` provinces). Registries whose PSL entry is a long
 *     geographic list (`.jp` prefectures, `.it` provinces, `.cn` provinces) have
 *     their GENERIC second levels listed (`co.jp`, `gov.it`, `com.cn`) but not
 *     their geographic ones, because the generic namespaces are what real scan
 *     targets use. `foo.tokyo.jp` therefore resolves to `tokyo.jp`, which is a
 *     public suffix. This is a known residual gap, not an accepted guess: add
 *     the entry if such a target ever matters.
 *
 * This module is pure: no network, no DNS, no database, no dependencies beyond
 * `node:net` for IP-literal detection (the same primitive `url-guard.ts` uses).
 * It must stay importable from `pulse-lite`, which is the AI-free core — never
 * import anything from `pulse-ai`.
 */

import { isIP } from "node:net";

/** Maximum length of a DNS name in presentation form (RFC 1035 §2.3.4). */
const MAX_HOSTNAME_LENGTH = 253;

/** Maximum length of a single DNS label (RFC 1035 §2.3.4). */
const MAX_LABEL_LENGTH = 63;

/**
 * A DNS label we are willing to interpret: letters/digits/hyphen, not starting
 * or ending with a hyphen. A leading underscore is allowed so callers can pass
 * service names such as `_dmarc.gov.uk` without the module rejecting them.
 */
const LABEL_PATTERN = /^_?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

// ---------------------------------------------------------------------------
// Multi-label public suffixes
//
// A hostname ending in one of these has its registrable domain formed by adding
// ONE label to the left of the suffix. Grouped by registry so a missing entry is
// easy to spot.
// ---------------------------------------------------------------------------

/** United Kingdom. `gov.uk` is deliberately ABSENT — see deviation (1) above. */
const SUFFIXES_UK = [
  "ac.uk",
  "co.uk",
  "ltd.uk",
  "me.uk",
  "net.uk",
  "nhs.uk",
  "org.uk",
  "plc.uk",
  "police.uk",
  "sch.uk",
];

/** Australia, New Zealand, Japan, South Africa, Brazil. */
const SUFFIXES_APAC_1 = [
  "asn.au",
  "com.au",
  "edu.au",
  "gov.au",
  "id.au",
  "net.au",
  "org.au",
  "ac.nz",
  "co.nz",
  "geek.nz",
  "govt.nz",
  "net.nz",
  "org.nz",
  "school.nz",
  "ac.jp",
  "ad.jp",
  "co.jp",
  "ed.jp",
  "go.jp",
  "gr.jp",
  "lg.jp",
  "ne.jp",
  "or.jp",
  "ac.za",
  "co.za",
  "gov.za",
  "net.za",
  "org.za",
  "web.za",
  "art.br",
  "com.br",
  "dev.br",
  "edu.br",
  "gov.br",
  "net.br",
  "org.br",
];

/** India, Singapore, Malaysia, Indonesia, Philippines, Vietnam, Thailand. */
const SUFFIXES_APAC_2 = [
  "ac.in",
  "co.in",
  "edu.in",
  "firm.in",
  "gen.in",
  "gov.in",
  "ind.in",
  "net.in",
  "nic.in",
  "org.in",
  "res.in",
  "com.sg",
  "edu.sg",
  "gov.sg",
  "net.sg",
  "org.sg",
  "per.sg",
  "com.my",
  "edu.my",
  "gov.my",
  "mil.my",
  "name.my",
  "net.my",
  "org.my",
  "ac.id",
  "biz.id",
  "co.id",
  "go.id",
  "my.id",
  "net.id",
  "or.id",
  "sch.id",
  "web.id",
  "com.ph",
  "edu.ph",
  "gov.ph",
  "net.ph",
  "org.ph",
  "ac.vn",
  "biz.vn",
  "com.vn",
  "edu.vn",
  "gov.vn",
  "net.vn",
  "org.vn",
  "ac.th",
  "co.th",
  "go.th",
  "in.th",
  "mi.th",
  "net.th",
  "or.th",
];

/** China, Hong Kong, Taiwan, South Korea. */
const SUFFIXES_APAC_3 = [
  "ac.cn",
  "com.cn",
  "edu.cn",
  "gov.cn",
  "net.cn",
  "org.cn",
  "com.hk",
  "edu.hk",
  "gov.hk",
  "idv.hk",
  "net.hk",
  "org.hk",
  "club.tw",
  "com.tw",
  "ebiz.tw",
  "edu.tw",
  "game.tw",
  "gov.tw",
  "idv.tw",
  "net.tw",
  "org.tw",
  "ac.kr",
  "co.kr",
  "go.kr",
  "mil.kr",
  "ne.kr",
  "or.kr",
  "pe.kr",
  "re.kr",
  "sc.kr",
];

/** Europe (generic second levels only — see deviation (2) for geographic ones). */
const SUFFIXES_EUROPE = [
  "asso.fr",
  "com.fr",
  "gouv.fr",
  "nom.fr",
  "prd.fr",
  "tm.fr",
  "com.es",
  "edu.es",
  "gob.es",
  "nom.es",
  "org.es",
  "edu.it",
  "gov.it",
  "gov.ie",
  "ac.at",
  "co.at",
  "gv.at",
  "or.at",
  "priv.at",
  "biz.pl",
  "com.pl",
  "edu.pl",
  "gov.pl",
  "info.pl",
  "net.pl",
  "org.pl",
  "waw.pl",
  "ac.se",
  "com.se",
  "org.se",
  "pp.se",
  "tm.se",
  "fhs.no",
  "kommune.no",
  "mil.no",
  "priv.no",
  "stat.no",
  "vgs.no",
  "com.ua",
  "edu.ua",
  "gov.ua",
  "in.ua",
  "kiev.ua",
  "net.ua",
  "org.ua",
  "ac.ru",
  "com.ru",
  "edu.ru",
  "gov.ru",
  "msk.ru",
  "net.ru",
  "org.ru",
  "pp.ru",
  "spb.ru",
  "com.tr",
  "edu.tr",
  "gen.tr",
  "gov.tr",
  "k12.tr",
  "mil.tr",
  "net.tr",
  "org.tr",
  "web.tr",
];

/** Latin America, Middle East, Africa. */
const SUFFIXES_ROW = [
  "com.mx",
  "edu.mx",
  "gob.mx",
  "net.mx",
  "org.mx",
  "com.ar",
  "edu.ar",
  "gob.ar",
  "int.ar",
  "mil.ar",
  "net.ar",
  "org.ar",
  "tur.ar",
  "com.co",
  "edu.co",
  "gov.co",
  "mil.co",
  "net.co",
  "nom.co",
  "org.co",
  "com.pe",
  "edu.pe",
  "gob.pe",
  "net.pe",
  "nom.pe",
  "org.pe",
  "ac.il",
  "co.il",
  "gov.il",
  "idf.il",
  "k12.il",
  "muni.il",
  "net.il",
  "org.il",
  "com.sa",
  "edu.sa",
  "gov.sa",
  "med.sa",
  "net.sa",
  "org.sa",
  "pub.sa",
  "sch.sa",
  "com.eg",
  "edu.eg",
  "eun.eg",
  "gov.eg",
  "net.eg",
  "org.eg",
  "sci.eg",
  "com.ng",
  "edu.ng",
  "gov.ng",
  "name.ng",
  "net.ng",
  "org.ng",
  "sch.ng",
  "biz.pk",
  "com.pk",
  "edu.pk",
  "fam.pk",
  "gov.pk",
  "net.pk",
  "org.pk",
  "web.pk",
  "ac.ke",
  "co.ke",
  "go.ke",
  "info.ke",
  "me.ke",
  "mobi.ke",
  "ne.ke",
  "or.ke",
  "sc.ke",
];

/**
 * `.us` locality second levels (the 50 state codes plus DC and the territories)
 * and `.ca` provincial second levels. Enumerated because they are compact and
 * omitting them would silently resolve `foo.ny.us` to the public suffix `ny.us`.
 */
const SUFFIXES_US_CA = [
  ...`ak al ar az ca co ct dc de fl ga gu hi ia id il in ks ky la ma md me mi mn
      mo ms mt nc nd ne nh nj nm nv ny oh ok or pa pr ri sc sd tn tx ut va vi vt
      wa wi wv wy`
    .split(/\s+/)
    .filter(Boolean)
    .map((code) => `${code}.us`),
  "dni.us",
  "fed.us",
  "isa.us",
  "kids.us",
  "nsn.us",
  ...`ab bc mb nb nf nl ns nt nu on pe qc sk yk yt`
    .split(/\s+/)
    .filter(Boolean)
    .map((code) => `${code}.ca`),
  "gc.ca",
];

/**
 * Platform / hosting namespaces (the PSL's "private" section).
 *
 * These matter MORE than any ccTLD for a scanner, because Pulse is routinely
 * pointed at a deploy preview. Without them `myapp.vercel.app` resolves to
 * `vercel.app` and a DMARC/DNS check reports the PLATFORM's records as the
 * customer's — a confident wrong answer, which is the bug class this module
 * exists to prevent.
 *
 * The list stays private: read it through `platformSuffixOf()` /
 * `isPlatformSuffix()` below, so no caller can half-implement the
 * strictly-beneath rule that keeps `substack.com` out of the answer.
 */
const SUFFIXES_PLATFORM = [
  "vercel.app",
  "vercel.sh",
  "netlify.app",
  "pages.dev",
  "workers.dev",
  "github.io",
  "gitlab.io",
  "herokuapp.com",
  "azurewebsites.net",
  "firebaseapp.com",
  "web.app",
  "run.app",
  "appspot.com",
  "cloudfunctions.net",
  "amplifyapp.com",
  "elasticbeanstalk.com",
  "cloudfront.net",
  "s3.amazonaws.com",
  "onrender.com",
  "fly.dev",
  "railway.app",
  "up.railway.app",
  "surge.sh",
  "glitch.me",
  "repl.co",
  "replit.app",
  "webflow.io",
  "wixsite.com",
  "myshopify.com",
  "squarespace.com",
  "wordpress.com",
  "substack.com",
  "notion.site",
  "blogspot.com",
  "bubbleapps.io",
  "lovable.app",
  "framer.website",
  "readthedocs.io",
  "translate.goog",
];

/** Fast membership set for the platform namespaces, and the longest one in labels. */
const PLATFORM_SUFFIX_SET: ReadonlySet<string> = new Set(SUFFIXES_PLATFORM);

/**
 * The one label above a platform namespace that is NOT a customer name.
 * `www.substack.com` is Substack's own marketing site; no platform in
 * `SUFFIXES_PLATFORM` hands `www` out as a tenant label. See `platformSuffixOf`.
 */
const NAMESPACE_OWN_WWW_LABEL = "www";

const MAX_PLATFORM_SUFFIX_LABELS = (() => {
  let max = 2;
  for (const suffix of PLATFORM_SUFFIX_SET) {
    const count = suffix.split(".").length;
    if (count > max) max = count;
  }
  return max;
})();

/**
 * The platform namespace a hostname sits BENEATH — `"vercel.app"` for
 * `myapp.vercel.app`, `"github.io"` for `someuser.github.io` — or `null`.
 *
 * WHY A CALLER WANTS THIS AND NOT `registrableDomain()`
 * ----------------------------------------------------
 * `myapp.vercel.app` IS its own registrable domain, so it is an apex by every
 * test in this module and a check reasoning about DNS records will treat it like
 * one. It is not one in the sense that matters for advice: the labels below a
 * platform namespace are issued one at a time by the platform, so there is no
 * zone to add a record to. `backup_domain_configured` learned that the expensive
 * way — it asked DNS for `www.myapp.vercel.app` (NXDOMAIN, necessarily) and then
 * told the owner to "add an A/CNAME record for www.myapp.vercel.app", which is
 * not a thing anyone can do.
 *
 * ⚠️ EQUALITY IS DELIBERATELY NOT A MATCH, AND NEITHER IS THE NAMESPACE'S OWN
 * `www` HOST. `platformSuffixOf("substack.com")` and
 * `platformSuffixOf("www.substack.com")` are both `null`. Several of these
 * namespaces are also the vendor's own website — `substack.com`, `wordpress.com`,
 * `squarespace.com`, `myshopify.com`, `webflow.io`, `railway.app`, `notion.site` —
 * and for those hosts the apex/www question is entirely real: `www.substack.com`,
 * `www.wordpress.com` and `www.squarespace.com` all resolve and all serve the
 * vendor's marketing site. A predicate that answered "platform" for either form
 * would decline a legitimate question about the vendor's own site, which is the
 * fix becoming its own false positive.
 *
 * `www` is the ONLY label treated this way, and it is not a heuristic about what
 * customer names look like: no platform in this list issues `www` as a customer
 * label, because it is the one name the namespace's own site needs. Every other
 * single label is a customer name (`myapp.vercel.app`, `someuser.github.io`), and
 * anything deeper than one `www` label still sits beneath the namespace — so
 * `www.myapp.vercel.app` declines, and `www.up.railway.app` declines against
 * `railway.app` rather than reading as "Railway's own www host".
 *
 * ⚠️ THIS IS A TEST ON THE NAME, NOT ON THE HOSTING. A custom domain that points
 * at one of these platforms — a CNAME to `netlify.app`, an ALIAS to a Vercel edge
 * — returns `null`, because nothing about the NAME says so and the apex/www pair
 * is genuinely actionable there. That asymmetry is the point of the predicate:
 * decline only where the advice would be impossible to act on.
 */
export function platformSuffixOf(input: string): string | null {
  const hostname = normalizeHostname(input);
  if (!hostname) return null;
  const labels = hostname.split(".");
  // `labels.length - 1` is what enforces "strictly beneath": there must be at
  // least one label to the left of the namespace.
  const longest = Math.min(labels.length - 1, MAX_PLATFORM_SUFFIX_LABELS);
  for (let take = longest; take >= 2; take -= 1) {
    const candidate = labels.slice(labels.length - take).join(".");
    if (!PLATFORM_SUFFIX_SET.has(candidate)) continue;
    // `www.<namespace>` is the vendor's own website, not a name the platform
    // issued to anyone — see the ⚠️ above. `continue` rather than `return null`
    // on purpose: a longer host can still sit beneath a SHORTER namespace in the
    // list, so `www.up.railway.app` falls through to `railway.app` and is
    // correctly declined instead of being treated as Railway's own www host.
    const above = labels.slice(0, labels.length - take);
    if (above.length === 1 && above[0] === NAMESPACE_OWN_WWW_LABEL) continue;
    return candidate;
  }
  return null;
}

/**
 * True when the hostname is a name issued beneath a hosting platform's own
 * namespace (`myapp.vercel.app`, `shop.myshopify.com`, `docs.readthedocs.io`).
 *
 * Thin wrapper over `platformSuffixOf`, which is the one to call when the caller
 * needs to NAME the platform in its output — and it should, because "this is a
 * vercel.app deployment" is the whole reason the advice is being withheld.
 */
export function isPlatformSuffix(input: string): boolean {
  return platformSuffixOf(input) !== null;
}

/**
 * Every multi-label public suffix this module knows. A hostname ending in one of
 * these has its registrable domain formed by adding one label to the left.
 */
export const MULTI_LABEL_PUBLIC_SUFFIXES: ReadonlySet<string> = new Set([
  ...SUFFIXES_UK,
  ...SUFFIXES_APAC_1,
  ...SUFFIXES_APAC_2,
  ...SUFFIXES_APAC_3,
  ...SUFFIXES_EUROPE,
  ...SUFFIXES_ROW,
  ...SUFFIXES_US_CA,
  ...SUFFIXES_PLATFORM,
]);

/**
 * Top-level domains under which second-level registration is the norm, so the
 * registrable domain of `example.<tld>` is `example.<tld>`.
 *
 * A ccTLD only belongs here once its generic second levels are enumerated
 * above. Registries that do NOT permit direct second-level registration
 * (`.za`, `.br`, `.th`, `.ar`, `.eg`, `.sa`, `.pk`, `.ke`, `.il`) are
 * deliberately absent, so `example.za` returns `null` rather than a guess.
 */
export const SINGLE_LABEL_PUBLIC_SUFFIXES: ReadonlySet<string> = new Set([
  // Legacy + common gTLDs.
  "com",
  "org",
  "net",
  "int",
  "edu",
  "gov",
  "mil",
  "info",
  "biz",
  "name",
  "pro",
  "mobi",
  "asia",
  "tel",
  "coop",
  "aero",
  "jobs",
  "museum",
  // New gTLDs seen in practice.
  "app",
  "dev",
  "page",
  "site",
  "online",
  "store",
  "shop",
  "blog",
  "cloud",
  "tech",
  "space",
  "website",
  "live",
  "life",
  "world",
  "today",
  "news",
  "media",
  "agency",
  "digital",
  "studio",
  "design",
  "works",
  "group",
  "team",
  "network",
  "systems",
  "solutions",
  "email",
  "chat",
  "fyi",
  "wiki",
  "xyz",
  "top",
  "club",
  "fun",
  "art",
  "ai",
  "io",
  "co",
  "sh",
  "so",
  "to",
  "gg",
  "cc",
  "tv",
  "ly",
  "me",
  "is",
  "im",
  "fm",
  "am",
  "st",
  // Europe.
  "eu",
  "uk",
  "ie",
  "de",
  "at",
  "ch",
  "li",
  "nl",
  "be",
  "lu",
  "fr",
  "es",
  "pt",
  "it",
  "dk",
  "se",
  "no",
  "fi",
  "pl",
  "cz",
  "sk",
  "si",
  "hr",
  "hu",
  "ro",
  "bg",
  "gr",
  "lt",
  "lv",
  "ee",
  "ua",
  "ru",
  "tr",
  "rs",
  "ba",
  "mk",
  "al",
  "md",
  "by",
  "kz",
  // Americas, APAC, Africa where direct registration is normal.
  "us",
  "ca",
  "au",
  "nz",
  "jp",
  "in",
  "sg",
  "cn",
  "hk",
  "tw",
  "kr",
  "id",
  "my",
  "ph",
  "vn",
  "pe",
  "mx",
  "cl",
  "uy",
  "ec",
  "cr",
  "pa",
  "do",
  "ng",
  "ma",
  "tn",
  "gh",
  "ae",
  "qa",
]);

/** Longest suffix, in labels, that any list entry can match. */
const MAX_SUFFIX_LABELS = (() => {
  let max = 1;
  for (const suffix of MULTI_LABEL_PUBLIC_SUFFIXES) {
    const count = suffix.split(".").length;
    if (count > max) max = count;
  }
  return max;
})();

/** Wrap a value in double quotes for a human-readable reason string. */
function quote(value: string): string {
  return `"${value}"`;
}

/** The decomposition of a hostname against the curated public-suffix list. */
export interface HostAnalysis {
  /** Normalised input: lowercased, leading/trailing dots and any `:port` removed. */
  hostname: string;
  /** The public suffix that matched, or `null` when none is known. */
  publicSuffix: string | null;
  /**
   * The public suffix plus one label, or `null` when it cannot be established
   * without guessing. `null` NEVER means "this host has no registrable domain
   * in reality" — it means this module declines to answer.
   */
  registrable: string | null;
  /** Labels above the registrable domain, outermost first. `[]` when unknown. */
  subdomainLabels: string[];
  /** True only when `registrable` is known AND equals `hostname`. */
  isApex: boolean;
  /** True when the input is an IP literal rather than a DNS name. */
  isIpLiteral: boolean;
  /**
   * Why `registrable` is `null`, phrased for use verbatim in a SKIPPED check
   * detail. `null` when the registrable domain WAS established.
   */
  reason: string | null;
}

/** Build the "we could not establish it" result, carrying the reason forward. */
function unresolved(hostname: string, reason: string, isIpLiteral = false): HostAnalysis {
  return {
    hostname,
    publicSuffix: null,
    registrable: null,
    subdomainLabels: [],
    isApex: false,
    isIpLiteral,
    reason,
  };
}

/**
 * Normalise a hostname for lookup: lowercase, strip surrounding whitespace, a
 * trailing `:port`, IPv6 brackets, and any leading/trailing dots (a
 * fully-qualified name ends in a root dot).
 *
 * Empty labels in the MIDDLE are deliberately left in place so they can be
 * reported as malformed rather than silently repaired.
 */
function normalizeHostname(input: string): string {
  let host = String(input ?? "")
    .trim()
    .toLowerCase();
  // Bracketed IPv6 literal, optionally with a port: [::1] / [::1]:8080
  const bracketed = /^\[([^\]]*)\](?::\d+)?$/.exec(host);
  if (bracketed) return bracketed[1];
  // Trailing :port on a plain hostname or IPv4 literal. A bare IPv6 literal has
  // several colons, so only strip when exactly one colon is present.
  if ((host.match(/:/g)?.length ?? 0) === 1) host = host.replace(/:\d+$/, "");
  return host.replace(/^\.+|\.+$/g, "");
}

/**
 * Longest-match the hostname's labels against the curated suffix lists.
 * Multi-label entries are tried before the bare TLD so `co.uk` beats `uk`.
 */
function matchPublicSuffix(labels: string[]): string | null {
  const longest = Math.min(labels.length, MAX_SUFFIX_LABELS);
  for (let take = longest; take >= 1; take -= 1) {
    const candidate = labels.slice(labels.length - take).join(".");
    const known =
      take === 1
        ? SINGLE_LABEL_PUBLIC_SUFFIXES.has(candidate)
        : MULTI_LABEL_PUBLIC_SUFFIXES.has(candidate);
    if (known) return candidate;
  }
  return null;
}

/**
 * Decompose a hostname into its public suffix, registrable domain and
 * subdomain labels — or explain why that could not be done.
 *
 * This is the primitive; the narrower helpers below all delegate to it. Prefer
 * it when the caller needs to emit a SKIPPED reason, because `reason` is
 * written to be dropped straight into a check detail.
 */
export function analyzeHost(input: string): HostAnalysis {
  const hostname = normalizeHostname(input);

  if (!hostname) {
    return unresolved("", "No hostname was supplied, so no registrable domain can be established.");
  }

  // IP literals have no registrable domain. `isIP` covers IPv4, IPv6 and the
  // bracket-stripped form; a zone id (`fe80::1%eth0`) is stripped first.
  if (isIP(hostname.split("%")[0]) !== 0) {
    return unresolved(
      hostname,
      `${quote(hostname)} is an IP address, not a DNS name, so it has no registrable domain.`,
      true,
    );
  }

  if (hostname.length > MAX_HOSTNAME_LENGTH) {
    return unresolved(
      hostname,
      `This hostname is ${hostname.length} characters, longer than the ${MAX_HOSTNAME_LENGTH}-character DNS limit, so it is not a valid name.`,
    );
  }

  const labels = hostname.split(".");

  for (const label of labels) {
    if (!label || label.length > MAX_LABEL_LENGTH || !LABEL_PATTERN.test(label)) {
      return unresolved(
        hostname,
        `${quote(hostname)} is not a valid DNS name (empty or malformed label), so no registrable domain can be established.`,
      );
    }
  }

  if (labels.length < 2) {
    return unresolved(
      hostname,
      `${quote(hostname)} is a single-label name with no public suffix, so it has no registrable domain.`,
    );
  }

  const publicSuffix = matchPublicSuffix(labels);
  if (!publicSuffix) {
    // The honest branch. Guessing "the last two labels" here is precisely what
    // would make a caller query somebody else's DNS record and report it as
    // this host's own.
    return unresolved(
      hostname,
      `The suffix ${quote(`.${labels[labels.length - 1]}`)} is not in Pulse's curated public-suffix list, so the registrable domain of ${quote(hostname)} cannot be established without guessing.`,
    );
  }

  const suffixLabelCount = publicSuffix.split(".").length;

  if (labels.length === suffixLabelCount) {
    return {
      hostname,
      publicSuffix,
      registrable: null,
      subdomainLabels: [],
      isApex: false,
      isIpLiteral: false,
      reason: `${quote(hostname)} is itself a public suffix — names are registered beneath it — so it has no registrable domain of its own.`,
    };
  }

  const registrableLabelCount = suffixLabelCount + 1;
  const registrable = labels.slice(labels.length - registrableLabelCount).join(".");

  return {
    hostname,
    publicSuffix,
    registrable,
    subdomainLabels: labels.slice(0, labels.length - registrableLabelCount),
    isApex: registrable === hostname,
    isIpLiteral: false,
    reason: null,
  };
}

/**
 * The registrable domain (organizational domain) of a hostname, or `null` when
 * it cannot be established.
 *
 * ```
 * registrableDomain("www.gov.uk")            // "gov.uk"
 * registrableDomain("foundry.gitwork.co.uk") // "gitwork.co.uk"
 * registrableDomain("a.b.c.example.com")     // "example.com"
 * registrableDomain("linear.app")            // "linear.app" (already apex)
 * registrableDomain("192.0.2.1")             // null
 * registrableDomain("example.invalidtld")    // null
 * ```
 *
 * ⚠️ `null` means "not established", never "no such thing". A check must
 * SKIP with `analyzeHost().reason` rather than emit a verdict.
 */
export function registrableDomain(input: string): string | null {
  return analyzeHost(input).registrable;
}

/**
 * True when the hostname IS its own registrable domain (`gov.uk`, `linear.app`).
 *
 * ⚠️ Returns `false` when the registrable domain could not be established, so
 * `false` conflates "this is a subdomain" with "we could not tell". A caller
 * that needs the difference — such as `backup_domain_configured` deciding
 * between PASS, WARN and SKIPPED — must use `analyzeHost()` and branch on
 * `reason` first.
 */
export function isApex(input: string): boolean {
  return analyzeHost(input).isApex;
}

/**
 * The labels above the registrable domain, outermost first.
 *
 * ```
 * subdomainLabels("www.gov.uk")        // ["www"]
 * subdomainLabels("a.b.c.example.com") // ["a", "b", "c"]
 * subdomainLabels("linear.app")        // []
 * ```
 *
 * ⚠️ Returns `[]` both for an apex and for a hostname whose registrable domain
 * could not be established. Check `analyzeHost().reason` when the difference
 * matters.
 */
export function subdomainLabels(input: string): string[] {
  return analyzeHost(input).subdomainLabels;
}

/** The public suffix that matched, or `null` when none is known. */
export function publicSuffixOf(input: string): string | null {
  return analyzeHost(input).publicSuffix;
}

/**
 * The ordered list of parent names to try when a record was not found at the
 * hostname itself — most specific first, ending at the registrable domain.
 *
 * ```
 * organizationalDomainCandidates("www.hmrc.gov.uk")  // ["hmrc.gov.uk", "gov.uk"]
 * organizationalDomainCandidates("a.b.example.com")  // ["b.example.com", "example.com"]
 * organizationalDomainCandidates("www.gov.uk")       // ["gov.uk"]
 * organizationalDomainCandidates("linear.app")       // []  (already apex)
 * ```
 *
 * Why this exists alongside `registrableDomain()`: a single answer has to pick
 * one interpretation of a hierarchical namespace, and for `.gov.uk` either
 * choice is wrong for some hosts (see deviation (1) in the module header).
 * Walking the ladder and stopping at the first name that actually answers is
 * strictly safer than betting.
 *
 * Strict RFC 7489 §6.6.3 behaviour is to try only the LAST element (the
 * organizational domain). The caller decides how many to try and must bound the
 * count — a deeply-nested hostname yields one entry per label.
 */
export function organizationalDomainCandidates(input: string): string[] {
  const analysis = analyzeHost(input);
  if (!analysis.registrable) return [];

  const labels = analysis.hostname.split(".");
  const registrableLabelCount = analysis.registrable.split(".").length;
  const candidates: string[] = [];
  for (let take = labels.length - 1; take >= registrableLabelCount; take -= 1) {
    candidates.push(labels.slice(labels.length - take).join("."));
  }
  return candidates;
}

/**
 * Bound the DMARC discovery ladder without dropping the name the RFC mandates.
 *
 * `organizationalDomainCandidates()` walks every ancestor most-specific-first, so a
 * deeply-nested host yields one entry per label and an uncapped walk would issue a DNS
 * query per level. The cap has to exist.
 *
 * ⚠️ But a plain `.slice(0, 3)` caps the WRONG END. On `a.b.c.d.example.com` the
 * candidates are [b.c.d…, c.d…, d.example.com, example.com] and the first three keep
 * three intermediate parents while discarding `example.com` — the ORGANIZATIONAL
 * DOMAIN, which is the single name RFC 7489 §6.6.3 requires a receiver to retry. The
 * result was a WARN, at HIGH confidence, saying no DMARC record exists for a host whose
 * organizational domain publishes one, with `unresolvedReason` left null so nothing
 * hedged it.
 *
 * So: keep the nearest parents up to the budget, and always keep the last candidate.
 */
export function boundedDmarcCandidates(candidates: string[], budget = 3): string[] {
  if (candidates.length <= budget) return candidates;
  const organizational = candidates[candidates.length - 1];
  return [...candidates.slice(0, budget - 1), organizational];
}
