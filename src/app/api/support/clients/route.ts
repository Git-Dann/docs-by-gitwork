import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { listSupportClients, createSupportClient, seedDefaultWorkflowRules } from "@/server/support";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const clients = await listSupportClients();
    return apiOk({ clients });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const client = await createSupportClient(body);
    await seedDefaultWorkflowRules(client.id);
    return apiOk({ client }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
