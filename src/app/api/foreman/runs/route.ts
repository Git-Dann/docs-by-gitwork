import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertAtLeastAdmin, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { listForemanRuns } from "@/server/foreman/queries";
import { runForeman } from "@/server/foreman/run";
import { foremanRunSchema } from "@/server/validators";

export const dynamic = "force-dynamic";
// Manual runs execute inline (no serverless cap on the VPS); the optional AI pass can take a moment.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    assertAtLeastAdmin(await getEffectiveUserOrNull(request));
    const runs = await listForemanRuns();
    return apiOk({ runs });
  } catch (error) {
    return fromError(error);
  }
}

/** Run Foreman now (inline). Body: { consolidate?, dryRun? }. Returns the run result. */
export async function POST(request: NextRequest) {
  try {
    assertAtLeastAdmin(await getEffectiveUserOrNull(request));
    const body = await request.json().catch(() => ({}));
    const { consolidate, dryRun } = foremanRunSchema.parse(body);
    const result = await runForeman({ consolidate, dryRun });
    return apiOk({ result });
  } catch (error) {
    return fromError(error);
  }
}
