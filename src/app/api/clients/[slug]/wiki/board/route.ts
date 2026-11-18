/**
 * The Board section's settings (the sidebar's Add New / delete, and the team's "show all tasks"
 * switch). The board is the client's own tasks, so there is nothing else to store: turning it
 * off hides it, and keeps every card and every piece of feedback.
 *   PATCH { enabled?: boolean, showAllTasks?: boolean }
 *
 * Gated like Sheets' settings (`resolveInternalSheets`): 'Manage clients' AND access to this
 * client, so a developer who can't open a client can't change what its client sees.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { setWikiBoardEnabled, setWikiBoardShowAllTasks } from "@/server/wiki-board";
import { resolveInternalSheets } from "@/server/wiki-sheets-access";

const bodySchema = z
  .object({ enabled: z.boolean().optional(), showAllTasks: z.boolean().optional() })
  .strict()
  .refine((b) => b.enabled !== undefined || b.showAllTasks !== undefined, "Nothing to change");

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { clientId } = await resolveInternalSheets(req, slug, "manage the Board section");
    if (!clientId) return apiError("Client not found", 404);
    const body = bodySchema.parse(await req.json());
    if (body.enabled !== undefined) await setWikiBoardEnabled(clientId, body.enabled);
    if (body.showAllTasks !== undefined) await setWikiBoardShowAllTasks(clientId, body.showAllTasks);
    return apiOk(body);
  } catch (err) {
    return fromError(err);
  }
}
