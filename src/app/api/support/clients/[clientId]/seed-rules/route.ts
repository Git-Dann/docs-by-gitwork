import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { seedDefaultWorkflowRules } from "@/server/support";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    await seedDefaultWorkflowRules(clientId);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
