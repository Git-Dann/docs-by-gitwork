import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { ingestWikiItemsByToken } from "@/server/wiki";

const itemSchema = z.object({
  type: z.enum(["BUG", "FEEDBACK", "TASK"]).default("FEEDBACK"),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(10_000).optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  requestedBy: z.string().trim().max(120).optional().nullable(),
  externalRef: z.string().trim().max(180).optional().nullable(),
});

const bodySchema = z.union([
  itemSchema,
  z.object({ items: z.array(itemSchema).min(1).max(200) }),
]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
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
    return apiOk(result, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
