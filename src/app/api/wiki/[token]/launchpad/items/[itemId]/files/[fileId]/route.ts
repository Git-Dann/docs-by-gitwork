/**
 * Client-facing: download or remove one file on a requirement.
 *
 * BOTH need the hardened posture (token + wiki-access cookie or a Gitwork session).
 * Reading the checklist is token-only so a link recipient can see what is being
 * asked of them — but the files themselves are what the client sent us (contracts,
 * account documents), so holding the link alone is not enough to download them.
 * A switched-off section stops serving its files.
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { deleteLaunchpadItemFile, getLaunchpadItemFile } from "@/server/launchpad";
import {
  assertLaunchpadWriteRate,
  launchpadAccessError,
  resolveLaunchpadWriter,
} from "@/server/launchpad-access";
import { launchpadFileResponse } from "@/server/launchpad-files-http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string; itemId: string; fileId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { token, itemId, fileId } = await params;
    const access = await resolveLaunchpadWriter(req, token);
    if (!access.ok) {
      const { message, status } = launchpadAccessError(access.reason);
      return apiError(message, status);
    }
    const file = await getLaunchpadItemFile(access.writer.wikiId, itemId, fileId, {
      requireEnabled: true,
    });
    if (!file) return apiError("File not found", 404);
    return launchpadFileResponse(file);
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { token, itemId, fileId } = await params;
    const access = await resolveLaunchpadWriter(req, token);
    if (!access.ok) {
      const { message, status } = launchpadAccessError(access.reason);
      return apiError(message, status);
    }
    await assertLaunchpadWriteRate(req);
    const launchpad = await deleteLaunchpadItemFile(access.writer.wikiId, itemId, fileId, {
      kind: "client",
      name: access.writer.actorName,
    });
    if (!launchpad) return apiError("File not found", 404);
    return apiOk({ launchpad });
  } catch (err) {
    return fromError(err);
  }
}
