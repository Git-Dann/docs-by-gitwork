import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canIssueCountermark, requireAuthedUser } from "@/server/auth/effective-user";
import { setSchedule } from "@/server/provenance/recheck";
import { countermarkScheduleSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

/**
 * Keep a countermark current: switch continuous re-examination on or off, or change its cadence.
 *
 * Gated on `provenance.issue`: every re-examination strikes a new mark in the name of whoever
 * switched it on, so switching it on is issuing. `requireAuthedUser`, never the OrDefault
 * variant — an identity-less caller must not put a Super Admin's name on future certificates.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(request);
    assertCan(user, canIssueCountermark, "keep countermarks current");
    const { id } = await params;
    const { enabled, cadenceDays } = countermarkScheduleSchema.parse(await request.json());
    const schedule = await setSchedule({
      workspaceId: user.workspaceId,
      countermarkId: id,
      enabled,
      cadenceDays,
      user: { id: user.id, name: user.name?.trim() || user.email },
    });
    return apiOk({ schedule });
  } catch (error) {
    return fromError(error);
  }
}
