/**
 * Legacy route. Portal canonicalised on /app/portal (matching the sidebar nav and
 * `MODULE_PATHS` in src/middleware.ts, which labels this prefix the legacy alias).
 *
 * This used to render its own copy of <ClientManagement /> rather than redirect —
 * a second live entry point that had drifted: /app/clients/[slug] never gained the
 * tasks, wiki and design-system child routes that /app/portal/[slug] has, so anyone
 * arriving here landed on a strictly worse client page.
 *
 * Keep the matching MODULE_PATHS entry when touching this: hasModuleAccess() ends in
 * an unconditional `return true`, so an /app path with no prefix match is reachable by
 * any signed-in member.
 */
import { redirect } from "next/navigation";

export default function LegacyClientsListRedirect() {
  redirect("/app/portal");
}
