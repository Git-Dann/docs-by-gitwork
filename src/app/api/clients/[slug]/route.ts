import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { getDerivedClientDetail } from "@/server/clients";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const client = await getDerivedClientDetail(slug);

    if (!client) {
      return apiError("Client not found", 404);
    }

    return apiOk(client);
  } catch (error) {
    return fromError(error);
  }
}
