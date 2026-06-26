import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { createClientRecord, listDerivedClients } from "@/server/clients";
import { clientCreateSchema } from "@/server/validators";
import type { WorkspaceClientStatus } from "@/types/client";
import {
  canSeeAllClients,
  assertCan,
  canManageClients,
  canViewClientFinancials,
  getEffectiveUserOrNull,
} from "@/server/auth/effective-user";
import { isSuperAdmin } from "@/types/auth";
import { assignedClientIds } from "@/server/tasks";

export const dynamic = "force-dynamic";

const VALID_STATUSES: ReadonlyArray<WorkspaceClientStatus | "ALL"> = [
  "PENDING_REVIEW",
  "ACTIVE",
  "ARCHIVED",
  "LEAD",
  "INACTIVE",
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
    // Resolve the viewer once. It gates the sensitive cost/working-days fields and the
    // restricted-developer client scoping. Null = legacy shared-token / server caller
    // (no per-user identity) → no financials, full unscoped list (as before).
    const user = await getEffectiveUserOrNull(request);
    const includeFinancials = user ? canViewClientFinancials(user) : false;

    // Leads are Super-Admin-only — never return them to anyone else, even by direct query.
    if (status === "LEAD" && !(user && isSuperAdmin(user.role))) {
      return apiOk({ clients: [] });
    }

    const result = await listDerivedClients({ search, status, includeFinancials });

    if (user && !canSeeAllClients(user)) {
      const allowed = new Set(await assignedClientIds(user));
      result.clients = result.clients.filter((c) => allowed.has(c.id));
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
