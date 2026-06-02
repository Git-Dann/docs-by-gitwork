import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { createClientRecord, listDerivedClients } from "@/server/clients";
import { clientCreateSchema } from "@/server/validators";
import type { WorkspaceClientStatus } from "@/types/client";
import {
  requireAuthedUser,
  canSeeAllClients,
  assertCan,
  canManageClients,
  getEffectiveUserOrNull,
} from "@/server/auth/effective-user";
import { assignedClientIds } from "@/server/tasks";

export const dynamic = "force-dynamic";

const VALID_STATUSES: ReadonlyArray<WorkspaceClientStatus | "ALL"> = [
  "PENDING_REVIEW",
  "ACTIVE",
  "ARCHIVED",
  "ALL",
];

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams.get("search")?.trim();
    const statusParam = request.nextUrl.searchParams.get("status");
    const status =
      statusParam && (VALID_STATUSES as ReadonlyArray<string>).includes(statusParam)
        ? (statusParam as WorkspaceClientStatus | "ALL")
        : undefined;
    const result = await listDerivedClients({ search, status });

    // Restricted developers (seeAllClients off) only see clients they're
    // assigned to. Best-effort: if we can't resolve a per-user identity
    // (legacy shared-token / server callers), behave as before and return all.
    try {
      const user = await requireAuthedUser(request);
      if (!canSeeAllClients(user)) {
        const allowed = new Set(await assignedClientIds(user));
        result.clients = result.clients.filter((c) => allowed.has(c.id));
      }
    } catch {
      // No per-user identity — leave the full list untouched.
    }

    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageClients, "create clients");
    const body = clientCreateSchema.parse(await request.json());
    const client = await createClientRecord(body);
    return apiOk({ client }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
