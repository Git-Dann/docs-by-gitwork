/**
 * Internal: upload a file against one Launchpad requirement (multipart, `file`).
 *
 * Validation (type by sniffed content, 10 MB, 10 per item) happens in
 * `attachLaunchpadItemFile`, shared with the client-facing route, and any problem
 * with the file is a 400 — never a 500.
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { attachLaunchpadItemFile } from "@/server/launchpad";
import { resolveInternalLaunchpadTarget } from "@/server/launchpad-access";
import { readLaunchpadUpload } from "@/server/launchpad-files-http";
import {
  assertCan,
  canManageClients,
  getEffectiveUserOrNull,
} from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; itemId: string }> },
) {
  try {
    const user = await getEffectiveUserOrNull(req);
    assertCan(user, canManageClients, "manage the Launchpad");
    const { slug, itemId } = await params;
    const target = await resolveInternalLaunchpadTarget(slug);
    if (!target) return apiError("Client not found", 404);

    const upload = await readLaunchpadUpload(req);
    const name = user?.name?.trim() || user?.email || "Gitwork";
    const launchpad = await attachLaunchpadItemFile(target.wikiId, itemId, upload, {
      kind: "team",
      name,
    });
    if (!launchpad) {
      return apiError("That requirement isn't part of this client's Launchpad", 409);
    }
    return apiOk({ launchpad }, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
