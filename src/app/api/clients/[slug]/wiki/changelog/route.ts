import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { addChangelogEntry } from "@/server/wiki";
import { resolveInternalChangelog } from "@/server/wiki-changelog-access";
import { z } from "zod";

const bodySchema = z.object({
  platform: z.enum(["IOS", "ANDROID", "FIRESTICK", "WEB", "ALL"]),
  version: z.string().min(1),
  title: z.string().min(1),
  body: z.string().optional(),
  releasedAt: z.string().optional(),
  status: z.enum(["PENDING", "APPROVED"]).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    // In the caller's own workspace (it used the default workspace), and only for a client
    // they can see.
    const { clientId } = await resolveInternalChangelog(req, slug, "add to this changelog");
    if (!clientId) return apiError("Client not found", 404);

    const body = bodySchema.parse(await req.json());
    const entry = await addChangelogEntry(clientId, body);
    return apiOk(entry);
  } catch (err) {
    return fromError(err);
  }
}
