import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { createClientRecord, listDerivedClients } from "@/server/clients";
import { clientCreateSchema } from "@/server/validators";
import type { WorkspaceClientStatus } from "@/types/client";

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
    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = clientCreateSchema.parse(await request.json());
    const client = await createClientRecord(body);
    return apiOk({ client }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
