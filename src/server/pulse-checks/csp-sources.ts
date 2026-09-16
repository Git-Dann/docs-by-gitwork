/**
 * CSP source-list semantics, in ONE place.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * Two checks grade `frame-ancestors` on the SAME response — `clickjacking_protection`
 * (pulse-scan.ts) and `csp_frame_ancestors` (security-extended.ts) — and each had its
 * own copy of the "does this source permit every origin" rule, plus its own copy of the
 * scheme list. The copies drifted, so one scan could contradict itself: measured on a
 * policy whose source list was `'self'` plus a wildcard host with a trailing slash,
 * pulse-scan WARNed "permits every origin" while security-extended PASSed "clickjacking
 * protection via CSP" — about the identical header. A report that disagrees with itself
 * is worse than either verdict alone, because it gives the reader no way to decide which
 * half to act on.
 *
 * Both now call `permitsEveryOrigin`. Adding a case fixes both checks at once, and they
 * cannot diverge again.
 *
 * THE SEMANTICS
 * -------------
 * A `frame-ancestors` list is a UNION, so ONE permit-all source opens the whole
 * directive — `frame-ancestors 'self' *` restricts nothing. Callers must therefore test
 * with `.some()`, never `.every()`.
 *
 * (Note for anyone editing the comments here: a literal asterisk-slash pair cannot
 * appear in a block comment, so wildcard-with-path examples are written in the tests
 * rather than inline.)
 */

/**
 * Schemes that can carry an arbitrary REMOTE page, and therefore an attacker's framing
 * page.
 *
 * ⚠️ This gate is the difference between a true finding and a false one. A bare scheme
 * source permits every origin *on that scheme* — but only some schemes can host a page
 * an attacker controls. `frame-ancestors 'self' chrome-extension:` genuinely restricts
 * web framing; so do `blob:`, `data:`, `filesystem:`, `file:` and the app/extension
 * schemes (`moz-extension:`, `capacitor:`, `ionic:`, `tauri:`). Treating any bare scheme
 * as permit-all reported those policies as unprotected, with a false explanation.
 */
export const REMOTE_PAGE_SCHEMES: ReadonlySet<string> = new Set(["http", "https", "ws", "wss", "ftp"]);

/**
 * A bare `*` host, with an optional port and an optional path.
 * Matches: `*` · `*:*` · `*:443` · asterisk followed by a slash and any path.
 */
const BARE_WILDCARD_HOST = /^\*(?::(?:\*|\d+))?(?:\/[^\s]*)?$/;

/** A bare scheme source: `https:`, `chrome-extension:`. */
const BARE_SCHEME = /^([a-z][a-z0-9+.\-]*):$/;

/**
 * A wholly-wildcarded host, with or without a scheme, with an optional port and an
 * optional trailing path. Matches `https://*`, `https://*:443`, the scheme-relative
 * `//*`, and any of those followed by a slash and a path.
 */
const WILDCARD_HOST = /^(?:([a-z][a-z0-9+.\-]*):)?\/\/\*(?::(?:\*|\d+))?(?:\/[^\s]*)?$/;

/**
 * True when this single source permits framing from ANY origin.
 *
 * ```
 * permitsEveryOrigin("*")                      // true
 * permitsEveryOrigin("https:")                 // true  — every https origin
 * permitsEveryOrigin("chrome-extension:")      // false — cannot host a remote page
 * permitsEveryOrigin("https://*")              // true
 * permitsEveryOrigin("*:443")                  // true  — every origin on that port,
 * //                                                      on ANY scheme
 * permitsEveryOrigin("//*")                    // true  — inherits the page's scheme
 * permitsEveryOrigin("https://*.example.com")  // false — names a domain
 * permitsEveryOrigin("'self'")                 // false
 * ```
 */
export function permitsEveryOrigin(source: string): boolean {
  // Strip CSP keyword quoting so `'self'` and `self` behave alike — one copy did this
  // and the other did not, which was itself a way for the two checks to disagree.
  const value = source.trim().toLowerCase().replace(/^'|'$/g, "");
  if (!value) return false;

  // `*` — every origin, on any scheme. Also `*:443` and the with-path forms: CSP's
  // host-source grammar makes the scheme OPTIONAL, so a bare wildcard host is every
  // origin on that port on ANY scheme — strictly WIDER than `https://*`.
  //
  // ⚠️ No REMOTE_PAGE_SCHEMES gate on this branch, and that is deliberate: with no
  // scheme written, http and https are among the schemes it admits, so the narrowing
  // that exempts `chrome-extension:` cannot apply. `*.example.com` is NOT in this class
  // — it names a domain, which is a real restriction, so the leading `*` must be the
  // WHOLE host for this branch to fire.
  if (BARE_WILDCARD_HOST.test(value)) return true;

  const bareScheme = BARE_SCHEME.exec(value);
  if (bareScheme) return REMOTE_PAGE_SCHEMES.has(bareScheme[1]);

  // A scheme-relative `//*` inherits the page's own scheme, which is remote by
  // definition, so it permits every origin whatever that scheme turns out to be.
  const wildcardHost = WILDCARD_HOST.exec(value);
  if (wildcardHost) return !wildcardHost[1] || REMOTE_PAGE_SCHEMES.has(wildcardHost[1]);

  return false;
}

/**
 * Whether a `frame-ancestors` source list actually restricts who may frame the page.
 *
 * An EMPTY list is not evidence of protection — it means the directive was absent or
 * unparsed — so it returns false rather than vacuously true.
 */
export function restrictsFraming(sources: string[]): boolean {
  return sources.length > 0 && !sources.some(permitsEveryOrigin);
}

/** Every permit-all source in the list, for a detail line that names what it found. */
export function permissiveSources(sources: string[]): string[] {
  return sources.filter(permitsEveryOrigin);
}
