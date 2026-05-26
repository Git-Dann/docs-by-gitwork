import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { resetAgentConfig } from "@/server/agent-config";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ agentKey: string }> },
) {
  try {
    const { agentKey } = await params;
    await resetAgentConfig(decodeURIComponent(agentKey));
    return apiOk({ ok: true });
  } catch (e) {
    return fromError(e);
  }
}
