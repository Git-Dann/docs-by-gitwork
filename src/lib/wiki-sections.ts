/**
 * Which clients get the client-specific wiki sections.
 *
 * Framework-free and dependency-free so BOTH the wiki components and the Care module can import it
 * — the lists previously lived in `components/clients/wiki/wiki-sidebar.tsx`, which is a React
 * component module, so anything outside the wiki that needed the same answer either pulled a
 * component tree in behind it or, in Care's case, hardcoded nothing at all and showed the control
 * to everyone.
 *
 * These are genuinely per-client features, not roles or permissions: Course Requests and the Golf
 * Data console are Wedge's golf-course pipeline, wired to Big Wedge's own API
 * (`bigwedge-course-api.ts`, `wiki-bigwedge-import.ts`) and to a `"New Feedback"` subject line that
 * means nothing to any other client. Offering them elsewhere is offering a control that cannot work.
 *
 * ⚠️ Match on the **Portal client slug** (`WorkspaceClient.slug`), not the Care client's slug or
 * name — Care's own record for the same client is "Big Wedge Golf".
 */
export const COURSE_REQUESTS_SLUGS = ["wedge"];

export const GOLF_DATA_SLUGS = ["wedge"];

/** Does this client have the Course Requests pipeline? */
export function hasCourseRequests(clientSlug: string | null | undefined): boolean {
  return Boolean(clientSlug && COURSE_REQUESTS_SLUGS.includes(clientSlug));
}
