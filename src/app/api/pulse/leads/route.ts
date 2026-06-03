import { apiOk, fromError } from "@/lib/api-response";
import { listPulseLeads } from "@/server/pulse-lite/leads-admin";

export const dynamic = "force-dynamic";

/** GET /api/pulse/leads — authed. Leads captured from the public scanner. */
export async function GET() {
  try {
    const leads = await listPulseLeads();
    return apiOk({ leads });
  } catch (error) {
    return fromError(error);
  }
}
