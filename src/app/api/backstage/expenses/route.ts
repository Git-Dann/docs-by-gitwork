import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUserOrDefault } from "@/server/auth/effective-user";
import { listExpenses, createExpense } from "@/server/backstage";
import {
  backstageListQuerySchema,
  expenseInputSchema,
} from "@/server/validators";
import type { ExpenseStatus } from "@/types/backstage";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUserOrDefault(req);
    const url = new URL(req.url);
    const q = backstageListQuerySchema.parse({
      scope: url.searchParams.get("scope") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const rows = await listExpenses(user, {
      scope: q.scope,
      status: q.status as ExpenseStatus | undefined,
      limit: q.limit,
    });
    return apiOk(rows);
  } catch (e) {
    return fromError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUserOrDefault(req);
    const body = expenseInputSchema.parse(await req.json());
    const created = await createExpense(user, body);
    return apiOk(created, { status: 201 });
  } catch (e) {
    return fromError(e);
  }
}
