import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { approveChangelogEntries } from "@/server/wiki";
import { approverError, assertApproveRate, resolveChangelogApprover } from "@/server/wiki-changelog-access";

/**
 * A client approves a release from their own wiki page. The ids are one version's entries
 * (one per platform). Anything not in this wiki, or already approved, is left alone; the
 * reply says how many were approved. See src/server/wiki-changelog-access.ts for who may.
 */
const bodySchema = z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(20) }).strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const who = await resolveChangelogApprover(req, token);
    if (!who.ok) {
      const { message, status } = approverError(who.reason);
      return apiError(message, status);
    }
    await assertApproveRate(req);
    const { ids } = bodySchema.parse(await req.json());
    const approved = await approveChangelogEntries(who.wikiId, ids, who.name);
    return apiOk({ approved, approvedByName: who.name });
  } catch (err) {
    return fromError(err);
  }
}
