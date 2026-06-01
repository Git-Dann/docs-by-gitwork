import { NextResponse } from "next/server";
import { fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { setBackstageApprover } from "@/server/backstage";
import { backstagePermissionSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const user = await requireAuthedUser(req);
    const { userId } = await params;
    const body = backstagePermissionSchema.parse(await req.json());
    await setBackstageApprover(user, userId, body.canApprove);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return fromError(e);
  }
}
