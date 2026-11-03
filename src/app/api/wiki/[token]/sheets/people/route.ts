/**
 * Who a client can pick into a person column on their own page (§73.1): their own people
 * plus the Gitwork people actually involved with them — the same restricted list as the
 * @mention picker, never the whole staff list, never an email.
 *
 * Same hardened resolve as the write routes: the list is only useful to someone who can
 * edit, so it is only served to someone who can edit. The ids it returns are what the write
 * routes check a picked person against.
 */
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { resolveSheetsWriter, sheetsAccessError } from "@/server/wiki-sheets-access";
import { sheetPeopleDirectory, sheetPeopleForBrowser } from "@/server/wiki-intake-mentions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { token } = await params;
    const access = await resolveSheetsWriter(req, token);
    if (!access.ok) {
      const { message, status } = sheetsAccessError(access.reason);
      return apiError(message, status);
    }
    const people = sheetPeopleForBrowser(await sheetPeopleDirectory({ wikiId: access.writer.wikiId }, "client"));
    return apiOk({ people });
  } catch (err) {
    return fromError(err);
  }
}
