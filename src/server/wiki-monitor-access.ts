/**
 * Who may change a client's monitors: adding, editing, removing, "Check now".
 *
 * The Monitors page (/app/monitors) lists every client's monitors to anyone with the `monitors`
 * permission, and offers Add and Edit there. So every write route checks the caller may work on
 * THIS client: a guest never, a restricted developer only on clients they're assigned to. The
 * page offers the buttons only where this passes; the routes enforce it.
 *
 * `null` (a trusted API-key caller) passes, as it does everywhere.
 */

import type { NextRequest } from "next/server";
import { assertClientAccessBySlug } from "@/server/client-assignments";
import { ForbiddenError, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { isExternalRole } from "@/types/auth";

export async function assertMonitorWriter(req: NextRequest, slug: string): Promise<void> {
  const user = await getEffectiveUserOrNull(req);
  if (user && isExternalRole(user.role)) throw new ForbiddenError("You can't change monitors.");
  await assertClientAccessBySlug(user, slug);
}
