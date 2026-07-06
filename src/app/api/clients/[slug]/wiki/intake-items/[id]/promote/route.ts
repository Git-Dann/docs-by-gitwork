import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { isAtLeast } from "@/types/auth";
import { promoteWikiIntakeItemToTask } from "@/server/wiki";

const bodySchema = z.object({ assigneeIds: z.array(z.string()).optional() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    if (!isAtLeast(user.role, "ADMIN")) return apiError("Admin only", 403);
    const { id } = await params;
    const body = bodySchema.parse(await req.json().catch(() => ({})));
    return apiOk(await promoteWikiIntakeItemToTask(id, user.id, { assigneeIds: body.assigneeIds }));
  } catch (err) {
    return fromError(err);
  }
}
