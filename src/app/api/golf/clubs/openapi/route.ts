import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { originFrom } from "@/lib/request-origin";
import { buildClubsOpenApi } from "@/server/golf-clubs";

const DEV_API_ENABLED = process.env.GOLF_DEV_API_ENABLED === "true";

/** GET /api/golf/clubs/openapi — the OpenAPI 3.1 contract for the clubs export. */
export async function GET(req: NextRequest) {
  try {
    if (!DEV_API_ENABLED) return apiError("The clubs API is not yet available", 404);
    const origin = originFrom(req);
    return apiOk(buildClubsOpenApi(origin));
  } catch (err) {
    return fromError(err);
  }
}
