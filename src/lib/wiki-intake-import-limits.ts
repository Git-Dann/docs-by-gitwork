/**
 * The two limits the request importer enforces, in ONE place.
 *
 * ⚠️ These were declared only in the route's zod schema, so the browser had no idea
 * they existed. The modal happily previewed "640 to import", offered an "Import 640"
 * button, did all the column mapping, and then rendered the server's ZodError as the
 * bare words "Validation failed" — no row named, no reason given, after the work was
 * done. A 640-row backlog and a Jira summary over 180 characters (Jira allows 255) are
 * both ordinary inputs, not abuse.
 *
 * Framework-free on purpose: the route is server-side and the modal is a `"use client"`
 * component, so neither can import the other's copy. Anything that knows one limit must
 * import it from here.
 */

/** Rows accepted in a single import call. Matches the task importer rather than the
 *  public API's 200 — a person pasting their own backlog once is a different risk from
 *  an integration looping unattended. */
export const IMPORT_MAX_ROWS = 500;

/** Longest request title the store accepts. */
export const IMPORT_MAX_TITLE = 180;
