import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { createClientRecord, listDerivedClients } from "@/server/clients";
import { clientCreateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams.get("search")?.trim();
    const result = await listDerivedClients({ search });
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
