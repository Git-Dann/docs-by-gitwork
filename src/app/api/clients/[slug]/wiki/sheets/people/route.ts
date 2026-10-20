import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { resolveInternalSheets } from "@/server/wiki-sheets-access";
import { sheetPeopleDirectory, sheetPeopleForBrowser } from "@/server/wiki-intake-mentions";

type Ctx = { params: Promise<{ slug: string }> };

/**
 * Who the team can pick into a person column (§73.1): the active team members who can see
 * this client, plus the client's own people. Names and opaque ids only — never an email.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { slug } = await params;
    const { clientId } = await resolveInternalSheets(req, slug, "view sheets");
    if (!clientId) return apiError("Client not found", 404);
    const people = sheetPeopleForBrowser(await sheetPeopleDirectory({ clientId }, "team"));
    return apiOk({ people });
  } catch (err) {
    return fromError(err);
  }
}
