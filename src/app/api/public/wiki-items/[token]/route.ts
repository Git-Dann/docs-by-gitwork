/**
 * Public client-intake API — how a CLIENT's own system pushes bugs, feedback and
 * feature requests into their Foundry wiki. Integrator docs:
 * docs/client-intake-api.md.
 *
 * Auth is the per-client intake token in the URL, and NOT the workspace API_KEY:
 * that key authorises every /api/ route for the whole workspace, so handing it to
 * a client would give them every other client's data. The token also identifies
 * the client, so there is no way to express "write to a different client's wiki".
 * Reveal/rotate it at Portal → client → Wiki → Requests.
 *
 *   GET   /api/public/wiki-items/:token            → verify the token, echo the client
 *   GET   /api/public/wiki-items/:token?items=1    → list what we hold (reconcile)
 *   POST  /api/public/wiki-items/:token            → create one item or a batch
 *   PATCH /api/public/wiki-items/:token/:ref       → update one (./[ref]/route.ts)
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { ingestWikiItemsByToken, listWikiIntakeItemsByToken } from "@/server/wiki";
import { intakeCommonFields } from "@/server/wiki-intake-vocab";

const itemSchema = z.object({
  ...intakeCommonFields,
  title: z.string().trim().min(1).max(180),
  type: intakeCommonFields.type.default("FEEDBACK"),
  priority: intakeCommonFields.priority.default("MEDIUM"),
  // Optional on create: a new item always starts NEW unless they say otherwise.
  status: intakeCommonFields.status.optional(),
  /** The item's id in the client's own system. Send it — it makes pushes
   *  idempotent and is how an update addresses the item later. */
  externalRef: z.string().trim().max(180).optional().nullable(),
});

const bodySchema = z.union([
  itemSchema,
  z.object({ items: z.array(itemSchema).min(1).max(200) }),
]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    // `?items=1` lists what we hold so an integrator can reconcile their side —
    // and confirm a push landed — without needing a second credential.
    if (req.nextUrl.searchParams.get("items") === "1") {
      const items = await listWikiIntakeItemsByToken(token, {
        status: req.nextUrl.searchParams.get("status"),
        limit: Number(req.nextUrl.searchParams.get("limit")) || undefined,
      });
      if (!items) return apiError("Invalid intake token", 404);
      return apiOk({ items });
    }
    const result = await ingestWikiItemsByToken(token, [], { dryRun: true });
    if (!result) return apiError("Invalid intake token", 404);
    return apiOk({ ok: true, client: result.client });
  } catch (err) {
    return fromError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const parsed = bodySchema.parse(await req.json());
    const items = "items" in parsed ? parsed.items : [parsed];
    const result = await ingestWikiItemsByToken(token, items);
    if (!result) return apiError("Invalid intake token", 404);
    // `skipped` is not a failure: a repeat push of the same externalRef — or of an
    // open item with the same title — is deduped on purpose, so a retrying
    // integration can't fill the Requests page with duplicates.
    return apiOk(result, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
