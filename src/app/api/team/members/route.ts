import { NextRequest } from "next/server";
import { listMembers } from "@/server/team";
import { apiOk, fromError } from "@/lib/api-response";
import { assertInternal, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export async function GET(request: NextRequest) {
  try {
    // ⚠️ Returns every teammate WITH their email address. `/app/team` was gated and
    // this was not — found by probing the API as a real guest, not by reading, because
    // the page looking right says nothing about the route behind it.
    assertInternal(await getEffectiveUserOrNull(request));
    const members = await listMembers();
    return apiOk(members);
  } catch (e) {
    return fromError(e);
  }
}
