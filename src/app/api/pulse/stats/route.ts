import { apiOk, fromError } from "@/lib/api-response";
import { getPulseStats } from "@/server/pulse";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await getPulseStats();
    return apiOk(stats);
  } catch (error) {
    return fromError(error);
  }
}
