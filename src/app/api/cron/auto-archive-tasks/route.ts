import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { autoArchiveDoneTasks } from "@/server/tasks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily auto-archive: soft-archive tasks that have been DONE for >30 days so the active board
 * stays lean (history is preserved — the Archived tab still reads them). CRON_SECRET-guarded
 * like the other crons. Hobby plan = daily only.
 */
export async function GET(request: NextRequest) {
  try {
    assertCron(request);
    const result = await autoArchiveDoneTasks(30);
    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}
