import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertSuperAdmin, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { clearDevSignalDemo, seedDevSignalDemo } from "@/server/devsignal/seed-demo";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Seed the DevSignal showcase set. Super Admin only. */
export async function POST(request: NextRequest) {
  try {
    assertSuperAdmin(await getEffectiveUserOrNull(request));
    const { workspace } = await ensureBaseRecords();
    return apiOk(await seedDevSignalDemo(workspace.id));
  } catch (error) {
    return fromError(error);
  }
}

/** Remove the seeded showcase set. */
export async function DELETE(request: NextRequest) {
  try {
    assertSuperAdmin(await getEffectiveUserOrNull(request));
    const { workspace } = await ensureBaseRecords();
    return apiOk(await clearDevSignalDemo(workspace.id));
  } catch (error) {
    return fromError(error);
  }
}
