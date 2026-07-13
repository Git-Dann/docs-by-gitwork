/**
 * Config for the public /embed/pulse widget (the gitwork.co.uk lead-capture teaser).
 *
 * Two workspace-scoped settings, both editable from the "Public Embed" panel on
 * /app/pulse (src/components/pulse/pulse-embed-panel.tsx):
 *   - pulseEmbedEnabled    — master kill-switch, checked first by both public routes.
 *   - pulseEmbedCheckKeys  — which checkKeys (from checks-registry.ts) the free teaser
 *     shows. Score/counts/findings in the embed all derive from this subset, not the
 *     full scan — see src/app/api/public/pulse/scan/[id]/route.ts.
 */

/** Sensible starter set — one per category, broadly applicable to any site. */
export const DEFAULT_EMBED_CHECK_KEYS: string[] = [
  "ssl_valid",
  "http_redirect",
  "response_time",
  "meta_title",
  "meta_description",
  "csp_header",
  "no_exposed_env",
  "viewport_meta",
  "favicon",
  "compression",
];

export function resolveEmbedCheckKeys(raw: unknown): string[] {
  if (Array.isArray(raw) && raw.every((k) => typeof k === "string") && raw.length > 0) {
    return raw as string[];
  }
  return DEFAULT_EMBED_CHECK_KEYS;
}

/** Restricts a full checks array down to the curated embed set, preserving order. */
export function filterToEmbedChecks<T extends { checkKey: string }>(checks: T[], checkKeys: string[]): T[] {
  const allowed = new Set(checkKeys);
  return checks.filter((c) => allowed.has(c.checkKey));
}
