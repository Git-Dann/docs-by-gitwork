import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getPublicWiki } from "@/server/wiki";

// Public — no auth required
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const wiki = await getPublicWiki(token);
    if (!wiki) return apiError("Not found", 404);
    return apiOk(wiki);
  } catch (err) {
    return fromError(err);
  }
}
