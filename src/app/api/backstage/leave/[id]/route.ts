import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import {
  getLeaveRequest,
  updateLeaveRequest,
  cancelLeaveRequest,
} from "@/server/backstage";
import { leaveRequestUpdateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    const lr = await getLeaveRequest(user, id);
    return apiOk(lr);
  } catch (e) {
    return fromError(e);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    const body = leaveRequestUpdateSchema.parse(await req.json());
    const lr = await updateLeaveRequest(user, id, body);
    return apiOk(lr);
  } catch (e) {
    return fromError(e);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    const lr = await cancelLeaveRequest(user, id);
    return apiOk(lr);
  } catch (e) {
    return fromError(e);
  }
}
