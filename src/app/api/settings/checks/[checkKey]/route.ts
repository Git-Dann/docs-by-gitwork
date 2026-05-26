import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { resetCheckConfig } from "@/server/check-config";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ checkKey: string }> },
) {
  try {
    const { checkKey } = await params;
    await resetCheckConfig(decodeURIComponent(checkKey));
    return apiOk({ ok: true });
  } catch (e) {
    return fromError(e);
  }
}
