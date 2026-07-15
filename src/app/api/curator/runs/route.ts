import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageStarters, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { listCuratorRuns } from "@/server/curator/queries";
import { runCurator } from "@/server/curator/run";
import { curatorRunSchema } from "@/server/validators";

export const dynamic = "force-dynamic";
// Manual runs execute inline (no serverless cap on the VPS); the LLM pass can take a while.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageStarters, "view curator runs");
    const runs = await listCuratorRuns();
    return apiOk({ runs });
  } catch (error) {
    return fromError(error);
  }
}

/** Run the curator now (inline). Body: { mode?, dryRun? }. Returns the run result. */
export async function POST(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageStarters, "run the curator");
    const body = await request.json().catch(() => ({}));
    const { mode, dryRun } = curatorRunSchema.parse(body);
    const result = await runCurator({ mode, dryRun });
    return apiOk({ result });
  } catch (error) {
    return fromError(error);
  }
}
