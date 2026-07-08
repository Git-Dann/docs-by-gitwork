import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { buildClubsOpenApi } from "@/server/golf-clubs";

/** GET /api/golf/clubs/openapi — the OpenAPI 3.1 contract for the clubs export. */
export async function GET(req: NextRequest) {
  try {
    const origin = req.nextUrl.origin;
    return apiOk(buildClubsOpenApi(origin));
  } catch (err) {
    return fromError(err);
  }
}
