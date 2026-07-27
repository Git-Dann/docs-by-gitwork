/**
 * The /app module gate — which permission (if any) each /app path requires.
 *
 * Lives here rather than inside `src/middleware.ts` so it can be unit-tested: importing
 * the middleware pulls in NextAuth and the edge runtime, which a Node test can't boot.
 * The middleware is the only caller.
 *
 * Admins and Super Admins bypass this entirely (see middleware) — nav safety, so a stale
 * token can never lock an admin out of a module.
 */

/**
 * Maps /app/* path prefixes to the module permission that gates them. Listed as pairs
 * (not a module→path map) so a module can expose both its canonical route and its legacy
 * alias — e.g. clients lives at /app/portal today and /app/clients historically; both
 * resolve to the same `clients` permission.
 *
 * ORDER MATTERS: first match wins, so a narrower prefix must precede a broader one.
 */
export const MODULE_PATHS: Array<{ prefix: string; module: string }> = [
  { prefix: "/app/pulse", module: "pulse" },
  // DevSignal — MUST precede the /app/code(clear) entries so it wins the first-match
  // loop. Admin-only feature perm (default-off), not `codeclear`.
  { prefix: "/app/codeclear/devsignal", module: "devsignal" },
  // Matching is anchored on a path-segment boundary (see matchesPrefix), so "/app/code"
  // does NOT catch "/app/codeclear" and the legacy prefix needs its own entry. It used to
  // be covered incidentally by a bare `startsWith` — which also meant a hypothetical
  // "/app/codex" would have been gated on `codeclear`.
  //
  // If DevSignal ever moves to /app/code/devsignal, RENAME the entry above in place;
  // appending it after the two entries below would let a broader prefix match first and
  // silently regate admin-only DevSignal onto `codeclear`, which STAFF auto-inherits.
  { prefix: "/app/codeclear", module: "codeclear" }, // legacy (still owns candidates/, pipeline/, devsignal/**)
  { prefix: "/app/code", module: "codeclear" }, // canonical
  { prefix: "/app/docs", module: "proposals" }, // canonical
  { prefix: "/app/proposals", module: "proposals" }, // legacy
  { prefix: "/app/portal", module: "clients" }, // canonical
  { prefix: "/app/clients", module: "clients" }, // legacy (redirect stub — still needs gating)
  { prefix: "/app/care", module: "support" }, // canonical
  { prefix: "/app/support", module: "support" }, // legacy
  { prefix: "/app/study", module: "study" }, // optional Pulse tool — admin-only feature perm (default-off)
  { prefix: "/app/backstage", module: "backstage" },
  { prefix: "/app/studio", module: "studio" }, // Admin/Super Admin only (default-off feature perm)
  // These three were reachable by ANY signed-in member — including a developer scoped to
  // neither module — because the gate used to end in an unconditional `return true`. They
  // are all nav-hidden or single-linked, which is why it went unnoticed. That default is
  // now gone (see UNGATED_APP_PREFIXES).
  { prefix: "/app/proof", module: "proposals" }, // document sign-off — nav-hidden (§11)
  { prefix: "/app/templates", module: "proposals" }, // document templates
  { prefix: "/app/projects", module: "clients" }, // Foundry project detail
  // Starters is NOT here — it's Super-Admin-ONLY, enforced by a dedicated role check in
  // the middleware that runs before this gate.
];

/**
 * The /app paths that are deliberately reachable by any signed-in member, i.e. that have
 * no module permission at all. This is an ALLOW-LIST, and it exists because the
 * alternative — "anything not in MODULE_PATHS is open" — is how /app/proof,
 * /app/templates and /app/projects ended up ungated: nobody had to *decide* to expose a
 * new page, they got it for free by adding a directory.
 *
 * Adding a page under /app now means picking one of two things on purpose: a MODULE_PATHS
 * entry, or a row here. Miss both and the page redirects to /app for non-admins — a
 * visible failure at first click rather than a silent hole.
 */
export const UNGATED_APP_PREFIXES = [
  "/app/settings", // own settings; sensitive tabs gate themselves (Labs/Curator = Super Admin)
  "/app/account-settings",
  "/app/team",
  "/app/handbook", // deliberately readable by every internal user (§4); writes are Admin+
  "/app/analytics", // Super Admin, enforced by the page itself via a live DB role read (§4)
  "/app/starters", // Super Admin, enforced by the middleware's own check — never reaches here
];

/**
 * The HQ dashboard. Deliberately NOT in UNGATED_APP_PREFIXES: a "/app" entry there would
 * match every descendant path and turn the default-deny below back into a default-allow,
 * which is the exact hole this was written to close. (A unit test caught that on the first
 * cut of this file — keep it exact.)
 */
const APP_ROOT = "/app";

/**
 * Prefix match anchored on a path segment: exact, or the prefix followed by "/".
 *
 * A bare `startsWith` would let "/app/code" gate "/app/codex", and "/app/docs" gate a
 * future "/app/docs-archive" — the same class of bug `isPublicApiPath` already guards
 * against on the API side.
 */
export function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

/** The module permission an /app path requires, or null if it needs none. */
export function moduleForPath(pathname: string): string | null {
  for (const entry of MODULE_PATHS) {
    if (matchesPrefix(pathname, entry.prefix)) return entry.module;
  }
  return null;
}

export function hasModuleAccess(pathname: string, permissions: string[]): boolean {
  // Not named `module` — Next forbids assigning that identifier (no-assign-module-variable).
  const required = moduleForPath(pathname);
  if (required) return permissions.includes(required);
  if (pathname === APP_ROOT) return true;
  if (UNGATED_APP_PREFIXES.some((p) => matchesPrefix(pathname, p))) return true;
  // Default deny. An /app path that matched neither list is a page nobody chose to
  // expose — most likely one added without a MODULE_PATHS entry. Admins and Super Admins
  // never reach here (the caller short-circuits on role), so a missing entry shows up as
  // "developers can't open this", not as an outage.
  return false;
}
