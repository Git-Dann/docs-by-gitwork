import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { addWikiIntakeItemByToken } from "@/server/wiki";

const bodySchema = z.object({
  type: z.enum(["BUG", "FEEDBACK", "TASK", "DESIGN"]).default("FEEDBACK"),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(10_000).optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  requestedBy: z.string().trim().max(120).optional().nullable(),
  externalRef: z.string().trim().max(180).optional().nullable(),
  label: z.enum(["BACKEND", "FRONTEND", "UI_UX", "RESEARCH", "DESIGN"]).optional().nullable(),
  /** One of the client's own category ids — decides `type` server-side. */
  categoryId: z.string().trim().max(64).optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const item = await addWikiIntakeItemByToken(token, bodySchema.parse(await req.json()));
    if (!item) return apiError("Invalid wiki token", 404);
    return apiOk(item, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
