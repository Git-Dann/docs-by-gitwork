/**
 * Extra links on a client platform — a ClickUp board, a Figma file, a status page.
 *
 * The three fixed URL fields (production, staging, repo) cover the common shape;
 * this is for everything else a client hands over. Pure and framework-free so the
 * API route, the form and the card all agree on what a valid link is.
 */

export interface PlatformLink {
  label: string;
  url: string;
}

export const MAX_PLATFORM_LINKS = 12;
const MAX_LABEL = 60;

/**
 * Only http(s). A stored link is rendered as an anchor, so `javascript:` — and
 * `data:`, which can carry a whole HTML document — would be script execution on
 * click, from a field one person types and another clicks months later.
 */
export function isSafeLinkUrl(raw: string | null | undefined): boolean {
  const value = raw?.trim();
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** A readable fallback when someone pastes a URL and doesn't name it. */
export function labelFromUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

/**
 * Normalise whatever is stored/submitted into a clean list.
 *
 * Drops anything unusable rather than throwing: these arrive from a repeatable
 * form where a half-typed row is normal, and from a Json column that predates
 * the field and can hold anything.
 */
export function normalisePlatformLinks(input: unknown): PlatformLink[] {
  if (!Array.isArray(input)) return [];
  const out: PlatformLink[] = [];
  for (const row of input) {
    if (!row || typeof row !== "object") continue;
    const url = String((row as Record<string, unknown>).url ?? "").trim();
    if (!isSafeLinkUrl(url)) continue;
    const rawLabel = String((row as Record<string, unknown>).label ?? "").trim();
    out.push({ label: (rawLabel || labelFromUrl(url)).slice(0, MAX_LABEL), url });
    if (out.length >= MAX_PLATFORM_LINKS) break;
  }
  return out;
}
