import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, fromError, apiError } from "@/lib/api-response";
import { listCheckConfigs, saveCheckConfig } from "@/server/check-config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
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
    const body = saveSchema.parse(await req.json());
    await saveCheckConfig(body);
    return apiOk({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return apiError(e.message, 400);
    return fromError(e);
  }
}
