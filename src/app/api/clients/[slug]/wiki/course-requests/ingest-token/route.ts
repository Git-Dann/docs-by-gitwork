import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getCourseIngest, setCourseIngest } from "@/server/wiki";
import { z } from "zod";
import { clientIdForSlug } from "@/server/clients-scope";
import { assertClientReader, assertClientWriter } from "@/server/client-write-access";

const bodySchema = z.object({
  enabled: z.boolean(),
  rotate: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    await assertClientReader(req, slug);
    const clientId = await clientIdForSlug(slug, req);
    if (!clientId) return apiError("Client not found", 404);
    return apiOk(await getCourseIngest(clientId));
  } catch (err) {
    return fromError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    await assertClientWriter(req, slug);
    const clientId = await clientIdForSlug(slug, req);
    if (!clientId) return apiError("Client not found", 404);

    const { enabled, rotate } = bodySchema.parse(await req.json());
    return apiOk(await setCourseIngest(clientId, { enabled, rotate }));
  } catch (err) {
    return fromError(err);
  }
}
