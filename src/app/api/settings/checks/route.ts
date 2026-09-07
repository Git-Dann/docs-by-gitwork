import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, fromError, apiError } from "@/lib/api-response";
import { listCheckConfigs, saveCheckConfig } from "@/server/check-config";
import {
  assertAtLeastAdmin,
  assertCan,
  canViewCheckConfig,
  getEffectiveUserOrNull,
} from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

/**
 * The read half of the check configuration. POST here and DELETE on `[checkKey]` were both
 * gated; GET asserted nothing, so any signed-in member — a developer scoped to one client
 * included — could read which controls the workspace has disabled, relabelled or downgraded.
 * That is a map of what this workspace has decided not to look at.
 *
 * Gated on `settings.agents`, matching the settings page that renders it, rather than on
 * admin — see canViewCheckConfig for why the stricter gate would be the wrong one.
 */
export async function GET(req: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canViewCheckConfig, "view Pulse check settings");
    const checks = await listCheckConfigs();
    return apiOk(checks);
  } catch (e) {
    return fromError(e);
  }
}

const saveSchema = z.object({
  checkKey: z.string().min(1),
  enabled: z.boolean().optional(),
  labelOverride: z.string().nullable().optional(),
  severityOverride: z.enum(["WARN", "FAIL"]).nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    assertAtLeastAdmin(await getEffectiveUserOrNull(req));
    const body = saveSchema.parse(await req.json());
    await saveCheckConfig(body);
    return apiOk({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return apiError(e.message, 400);
    return fromError(e);
  }
}
