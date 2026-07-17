import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageStarters, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { listStarterVersions } from "@/server/starter-versions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageStarters, "view starter history");
    const { id } = await params;
    return apiOk({ versions: await listStarterVersions(id) });
  } catch (error) {
    return fromError(error);
  }
}
