import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { reviewExpense } from "@/server/backstage";
import { expenseReviewSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    const body = expenseReviewSchema.parse(await req.json());
    const row = await reviewExpense(user, id, body.status, body.note);
    return apiOk(row);
  } catch (e) {
    return fromError(e);
  }
}
