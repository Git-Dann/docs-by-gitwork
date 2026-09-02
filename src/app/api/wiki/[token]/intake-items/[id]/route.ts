/**
 * A client editing or withdrawing a request they raised, from their own wiki.
 *
 *   PATCH  /api/wiki/:token/intake-items/:id
 *   DELETE /api/wiki/:token/intake-items/:id
 *
 * Auth is the token from the wiki URL — the client's share link — resolved the
 * same way as the create route beside this one. Everything is scoped to that
 * token's own wiki, so a link can never reach another client's request.
 *
 * Only the fields the client filled in are editable, and only while the request
 * is still NEW or TRIAGED: once it's PROMOTED a dev owns the task it became, and
 * CLOSED is a record of something already dealt with. Both cases answer 409 with
 * the reason rather than a bare 404 — "not found" for something the client can
 * see on screen is the kind of message that turns into a Slack question.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import {
  deleteWikiIntakeItemByShareToken,
  updateWikiIntakeItemByShareToken,
} from "@/server/wiki";

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(180).optional(),
    description: z.string().trim().max(10_000).optional().nullable(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
    /** One of the client's own category ids — decides `type` server-side. */
    categoryId: z.string().trim().max(64).optional().nullable(),
  })
  // An empty body would silently succeed while changing nothing.
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

const LOCKED =
  "This request has already been picked up, so it can't be changed here. Raise a new one or reply to us and we'll sort it.";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  try {
    const { token, id } = await params;
    const result = await updateWikiIntakeItemByShareToken(
      token,
      id,
      patchSchema.parse(await req.json()),
    );
    if (!result.ok) {
      return result.reason === "locked" ? apiError(LOCKED, 409) : apiError("Request not found", 404);
    }
    return apiOk(result.item);
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  try {
    const { token, id } = await params;
    const result = await deleteWikiIntakeItemByShareToken(token, id);
    if (!result.ok) {
      return result.reason === "locked" ? apiError(LOCKED, 409) : apiError("Request not found", 404);
    }
    return apiOk({ deleted: true, id: result.item.id });
  } catch (err) {
    return fromError(err);
  }
}
