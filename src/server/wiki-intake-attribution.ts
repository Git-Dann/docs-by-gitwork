/**
 * Who a request gets attributed to.
 *
 * Pure and framework-free so the precedence can be tested without a request or a
 * database — the precedence is the part that matters, because one of the inputs
 * is caller-controlled.
 *
 * The rule: an identity we established ourselves always beats a name the
 * submitter typed. A "Requested by" box is a claim, not an identity — anyone
 * holding a client's wiki link could type a colleague's name, or ours. So the
 * typed value is only used when nobody is signed in at all, which today means an
 * unauthenticated share link.
 */

export interface AttributionInput {
  /** Display name of the signed-in client wiki user (ClientWikiUser), if any. */
  clientUserName?: string | null;
  /** Name/email of the signed-in Gitwork user, if any. */
  staffName?: string | null;
  /** What the form sent — untrusted. */
  typedName?: string | null;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Resolve the attribution, or null when nothing usable was supplied (callers
 * fall back to their own default, e.g. "Client wiki").
 *
 * Client user first: on a client's own wiki they are the more specific identity,
 * and staff viewing that page are looking at it rather than filing as themselves.
 */
export function resolveRequestedBy(input: AttributionInput): string | null {
  return clean(input.clientUserName) ?? clean(input.staffName) ?? clean(input.typedName) ?? null;
}

/** True when we know who this is, so the UI can drop the "Requested by" box. */
export function hasKnownSubmitter(input: AttributionInput): boolean {
  return clean(input.clientUserName) !== null || clean(input.staffName) !== null;
}
