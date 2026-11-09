/**
 * A link that opens the Code Handover compare view on a given pair of versions.
 *
 * The pair rides in a `?compare=<moduleId>:<fromId>..<toId>` query parameter, NOT in the
 * hash. Both wiki views route on the hash or `?section=` by exact match (the internal wiki
 * rewrites the hash to `#<section>` on every section change), so anything appended to the
 * hash would either send the reader to the dashboard or be overwritten. A separate query
 * parameter leaves that routing untouched: the internal wiki is opened on the section by
 * `#code-handover`, the client's share page by `?section=code-handover`.
 */

export const COMPARE_PARAM = "compare";
export const CODE_HANDOVER_SECTION = "code-handover";

export interface ComparePair {
  moduleId: string;
  fromId: string;
  toId: string;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function encodeComparePair(p: ComparePair): string {
  return `${p.moduleId}:${p.fromId}..${p.toId}`;
}

/** The pair from a parameter value, or null for anything malformed. */
export function parseComparePair(raw: string | null | undefined): ComparePair | null {
  if (!raw) return null;
  const m = /^([^:]+):([^.]+)\.\.(.+)$/.exec(raw);
  if (!m) return null;
  const [, moduleId, fromId, toId] = m;
  if (![moduleId, fromId, toId].every((id) => ID.test(id)) || fromId === toId) return null;
  return { moduleId, fromId, toId };
}

/**
 * The URL to share, built from the page the reader is on so it keeps their path and any
 * other parameters (a share link's token is in the path). The client's share page is
 * opened on the section with `?section=`; the internal wiki with the hash.
 */
export function compareLink(href: string, pair: ComparePair, mode: "internal" | "public"): string {
  const url = new URL(href);
  url.searchParams.set(COMPARE_PARAM, encodeComparePair(pair));
  if (mode === "public") url.searchParams.set("section", CODE_HANDOVER_SECTION);
  url.hash = CODE_HANDOVER_SECTION;
  return url.toString();
}

/** The same URL without the compare parameter, for when the dialog closes. */
export function withoutComparePair(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(COMPARE_PARAM);
  return url.toString();
}
