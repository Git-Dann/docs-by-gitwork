import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { listLeaveRequests, createLeaveRequest } from "@/server/backstage";
import {
  backstageListQuerySchema,
  leaveRequestInputSchema,
} from "@/server/validators";
import type { LeaveStatus } from "@/types/backstage";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const url = new URL(req.url);
    const q = backstageListQuerySchema.parse({
      scope: url.searchParams.get("scope") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
    });
    const requests = await listLeaveRequests(user, {
      scope: q.scope,
      status: q.status as LeaveStatus | undefined,
      limit: q.limit,
    });
    return apiOk(requests);
  } catch (e) {
    return fromError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const body = leaveRequestInputSchema.parse(await req.json());
    const created = await createLeaveRequest(user, body);
    return apiOk(created, { status: 201 });
  } catch (e) {
    return fromError(e);
  }
}
