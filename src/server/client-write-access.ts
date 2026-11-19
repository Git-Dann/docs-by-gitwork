/**
 * Who may change something that belongs to one client: the caller must be able to OPEN that
 * client (Portal's own rule, `assertClientAccessBySlug`). A developer assigned to two clients can
 * edit those two clients' wikis and nobody else's; a guest only what they were given.
 *
 * The client routes under /api/clients/[slug] found the client in the caller's workspace but
 * never asked whether the caller could work on it, so any signed-in member could edit any
 * client's wiki documents, users, share link or requests (CLAUDE.md §57.6 item 2, §135).
 * `null` (a trusted API-key caller) passes, as it does everywhere.
 */
import { assertClientAccessBySlug } from "@/server/client-assignments";
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";

export async function assertClientWriter(req: Request, slug: string): Promise<void> {
  await assertClientAccessBySlug(await getEffectiveUserOrNull(req), slug);
}
