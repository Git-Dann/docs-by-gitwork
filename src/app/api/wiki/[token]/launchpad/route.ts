/**
 * Client-facing Launchpad, via the public wiki share token.
 *
 *   GET   → read the kit. Token-only, because the section is individually shareable
 *           and a link recipient must be able to see what is being asked of them.
 *   PATCH → save field answers. Requires the wiki-access cookie (or a Gitwork
 *           session) — writes are never anonymous.
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { getLaunchpadByWikiId, saveLaunchpadAnswers } from "@/server/launchpad";
import {
  assertLaunchpadWriteRate,
  launchpadAccessError,
  resolveLaunchpadWriter,
} from "@/server/launchpad-access";
import { resolvePublicWiki } from "@/server/wiki";
import { launchpadAnswersSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const resolved = await resolvePublicWiki(token);
    if (!resolved) return apiError("Not found", 404);

    const launchpad = await getLaunchpadByWikiId(resolved.wiki.id);
    if (!launchpad?.enabled) {
      // Distinct from a bad token on purpose (§40.1): reporting a switched-off
      // section as an invalid link points the client at their credential when the
      // credential is fine.
      return apiError(launchpadAccessError("section_disabled").message, 409);
    }
    return apiOk({ launchpad });
  } catch (err) {
    return fromError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const access = await resolveLaunchpadWriter(req, token);
    if (!access.ok) {
      const { message, status } = launchpadAccessError(access.reason);
      return apiError(message, status);
    }
    await assertLaunchpadWriteRate(req);

    const { answers } = launchpadAnswersSchema.parse(await req.json());
    const launchpad = await saveLaunchpadAnswers(access.writer.wikiId, answers);
    if (!launchpad) {
      const { message, status } = launchpadAccessError("section_disabled");
      return apiError(message, status);
    }
    return apiOk({ launchpad });
  } catch (err) {
    return fromError(err);
  }
}
