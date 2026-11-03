import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { seedDefaultWorkflowRules } from "@/server/support";
import { requireSupportClient } from "@/server/support-scope";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    await requireSupportClient(request, clientId);
    await seedDefaultWorkflowRules(clientId);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
