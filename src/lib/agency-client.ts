/**
 * The agency's own client record — Gitwork, in Portal, as `gitwork`. It is a client like any
 * other except where noted: its wiki's Monitors section also shows every client's monitors
 * (`src/lib/monitor-board.ts`), because Gitwork is the one watching all of them.
 *
 * Keyed on the Portal slug, like `COURSE_REQUESTS_SLUGS` — a slug is stable and visible, and a
 * name match is the mistake §42.15 records.
 */
export const AGENCY_CLIENT_SLUG = "gitwork";

export function isAgencyClient(slug: string | null | undefined): boolean {
  return slug === AGENCY_CLIENT_SLUG;
}
