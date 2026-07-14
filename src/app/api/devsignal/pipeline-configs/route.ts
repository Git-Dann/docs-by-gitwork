import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import {
  assertCan,
  canCalibrateDevSignal,
  canManageDevSignal,
  getEffectiveUserOrNull,
} from "@/server/auth/effective-user";
import { createPipelineConfig, listPipelineConfigs } from "@/server/devsignal/config-store";
import { devSignalPipelineConfigSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageDevSignal, "view DevSignal configs");
    const { workspace } = await ensureBaseRecords();
    return apiOk({ items: await listPipelineConfigs(workspace.id) });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getEffectiveUserOrNull(request);
    // Writing weights changes how every candidate is scored → Super Admin only.
    assertCan(user, canCalibrateDevSignal, "edit DevSignal scoring weights");
    const { workspace } = await ensureBaseRecords();
    const body = devSignalPipelineConfigSchema.parse(await request.json());
    const config = await createPipelineConfig(workspace.id, {
      ...body,
      createdBy: user?.id ?? null,
    });
    return apiOk({ config }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
