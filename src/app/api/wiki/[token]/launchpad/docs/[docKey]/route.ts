/**
 * Client-facing: the client fills in, edits and approves one legal doc.
 *
 *   PATCH → save answers and/or the edited body
 *   POST   → approve / withdraw approval
 *
 * Approval is a lightweight status, NOT an e-signature — see `approveLaunchpadDoc`.
 * The approving email is taken from the resolved wiki-access user, never from the
 * body, so it records who was actually signed in.
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import {
  approveLaunchpadDoc,
  unapproveLaunchpadDoc,
  updateLaunchpadDoc,
} from "@/server/launchpad";
import {
  assertLaunchpadWriteRate,
  launchpadAccessError,
  resolveLaunchpadWriter,
} from "@/server/launchpad-access";
import { launchpadDocApproveSchema, launchpadDocPatchSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

const NOT_IN_KIT = "That document isn't part of this Launchpad";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; docKey: string }> },
) {
  try {
    const { token, docKey } = await params;
    const access = await resolveLaunchpadWriter(req, token);
    if (!access.ok) {
      const { message, status } = launchpadAccessError(access.reason);
      return apiError(message, status);
    }
    await assertLaunchpadWriteRate(req);

    const body = launchpadDocPatchSchema.parse(await req.json());
    const launchpad = await updateLaunchpadDoc(access.writer.wikiId, docKey, body);
    if (!launchpad) return apiError(NOT_IN_KIT, 409);
    return apiOk({ launchpad });
  } catch (err) {
    return fromError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; docKey: string }> },
) {
  try {
    const { token, docKey } = await params;
    const access = await resolveLaunchpadWriter(req, token);
    if (!access.ok) {
      const { message, status } = launchpadAccessError(access.reason);
      return apiError(message, status);
    }
    await assertLaunchpadWriteRate(req);

    const { approved } = launchpadDocApproveSchema.parse(await req.json());
    const launchpad = approved
      ? await approveLaunchpadDoc(access.writer.wikiId, docKey, access.writer.actorEmail)
      : await unapproveLaunchpadDoc(access.writer.wikiId, docKey);
    if (!launchpad) return apiError(NOT_IN_KIT, 409);
    return apiOk({ launchpad });
  } catch (err) {
    return fromError(err);
  }
}
