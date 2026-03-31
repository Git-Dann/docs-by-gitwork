import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { listDerivedClients } from "@/server/clients";

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams.get("search")?.trim();
    const result = await listDerivedClients({ search });
    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}
