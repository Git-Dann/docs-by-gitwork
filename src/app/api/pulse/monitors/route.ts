import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { listMonitors, createMonitor } from "@/server/pulse-agents/monitor";
import { assertCan, canManagePulse, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createMonitorSchema = z.object({
  projectName:     z.string().min(1).max(200),
  inputType:       z.enum(["URL", "GITHUB_REPO", "FREE_TEXT"]),
  inputUrl:        z.string().url().optional(),
  inputGithubRepo: z.string().optional(),
  clientId:        z.string().cuid().optional(),
  alertThreshold:  z.number().int().min(1).max(50).optional(),
  frequency:       z.enum(["DAILY", "WEEKLY", "OFF"]).optional(),
});

function appUrl(request: NextRequest): string {
  const host = request.headers.get("host") ?? "";
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest) {
  try {
    const monitors = await listMonitors(appUrl(request));
    return apiOk({ monitors });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManagePulse, "create Pulse monitors");
    const body = createMonitorSchema.parse(await request.json());
    const monitor = await createMonitor(body, appUrl(request));
    return apiOk({ monitor }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
