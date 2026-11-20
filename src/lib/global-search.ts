/**
 * ⌘K search across Foundry's records (tasks, requests, meetings, Care conversations, people), as
 * opposed to the menu's own pages, clients and documents, which it already has in the browser.
 * Pure, so the query rules are tested. The server side is src/server/global-search.ts.
 */

export type SearchGroup = "Tasks" | "Requests" | "Meetings" | "Care" | "People";

export const SEARCH_GROUPS: readonly SearchGroup[] = ["Tasks", "Requests", "Meetings", "Care", "People"];

export interface SearchHit {
  id: string;
  group: SearchGroup;
  title: string;
  /** A short second line: the client, the status, the date. */
  hint: string;
  href: string;
}

export interface SearchResponse {
  query: string;
  hits: SearchHit[];
  /** Groups that couldn't be searched just now (never shown as "no results"). */
  failed: SearchGroup[];
}

/** Below this many characters nothing is searched: two letters match half the database. */
export const SEARCH_MIN_CHARS = 2;
/** Results per group. */
export const SEARCH_PER_GROUP = 5;
export const SEARCH_MAX_CHARS = 80;

/** The query as it will be searched, or null when it's too short to be worth it. */
export function normaliseQuery(raw: string | null | undefined): string | null {
  const q = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX_CHARS);
  return q.length >= SEARCH_MIN_CHARS ? q : null;
}

/**
 * The words a record must contain, all of them, in any order: "booking email" finds "Send booking
 * confirmations by email". One-letter words are ignored, and at most five words are used.
 */
export function searchTerms(q: string): string[] {
  return [...new Set(q.toLowerCase().split(" ").filter((w) => w.length >= 2))].slice(0, 5);
}

/** Hits in display order: by group, as the server ranked them inside each. */
export function orderHits(hits: SearchHit[]): SearchHit[] {
  return SEARCH_GROUPS.flatMap((g) => hits.filter((h) => h.group === g).slice(0, SEARCH_PER_GROUP));
}
