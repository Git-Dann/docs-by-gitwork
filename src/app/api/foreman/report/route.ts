import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertAtLeastAdmin, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { getForemanReport } from "@/server/foreman/queries";

export const dynamic = "force-dynamic";

// The frozen latest report the Desk "Delivery watch" panel renders. Admins & Super Admins.
export async function GET(request: NextRequest) {
  try {
    assertAtLeastAdmin(await getEffectiveUserOrNull(request));
    const report = await getForemanReport();
    return apiOk({ report });
  } catch (error) {
    return fromError(error);
  }
}
