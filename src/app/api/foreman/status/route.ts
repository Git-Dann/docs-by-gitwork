import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertAtLeastAdmin, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { getForemanStatus } from "@/server/foreman/queries";

export const dynamic = "force-dynamic";

// Foreman is the management delivery view — Admins & Super Admins.
export async function GET(request: NextRequest) {
  try {
    assertAtLeastAdmin(await getEffectiveUserOrNull(request));
    const status = await getForemanStatus();
    return apiOk({ status });
  } catch (error) {
    return fromError(error);
  }
}
