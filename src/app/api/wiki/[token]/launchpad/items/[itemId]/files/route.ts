/**
 * Client-facing: the client uploads a file against one requirement.
 *
 * Hardened posture, like every Launchpad write: share token + wiki-access cookie (or
 * a Gitwork session) via `resolveLaunchpadWriter`, the item must be in THIS wiki's
 * own kit snapshot (checked in `attachLaunchpadItemFile`), and a per-IP upload limit.
 * The uploader's name is resolved server-side, never taken from the body.
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { attachLaunchpadItemFile } from "@/server/launchpad";
import {
  assertLaunchpadUploadRate,
  launchpadAccessError,
  resolveLaunchpadWriter,
} from "@/server/launchpad-access";
import { readLaunchpadUpload } from "@/server/launchpad-files-http";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; itemId: string }> },
) {
  try {
    const { token, itemId } = await params;
    const access = await resolveLaunchpadWriter(req, token);
    if (!access.ok) {
      const { message, status } = launchpadAccessError(access.reason);
      return apiError(message, status);
    }
    await assertLaunchpadUploadRate(req);

    const upload = await readLaunchpadUpload(req);
    const launchpad = await attachLaunchpadItemFile(access.writer.wikiId, itemId, upload, {
      kind: "client",
      name: access.writer.actorName,
    });
    if (!launchpad) return apiError("That requirement isn't part of this Launchpad", 409);
    return apiOk({ launchpad }, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
