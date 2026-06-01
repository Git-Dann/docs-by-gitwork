import { apiOk, fromError } from "@/lib/api-response";
import { NextResponse } from "next/server";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getExpense, updateExpense, deleteExpense } from "@/server/backstage";
import { expenseUpdateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    const row = await getExpense(user, id);
    return apiOk(row);
  } catch (e) {
    return fromError(e);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    const body = expenseUpdateSchema.parse(await req.json());
    const row = await updateExpense(user, id, body);
    return apiOk(row);
  } catch (e) {
    return fromError(e);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    await deleteExpense(user, id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return fromError(e);
  }
}
