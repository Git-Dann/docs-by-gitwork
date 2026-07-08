import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import { listGolfClubs, clubsToCsv } from "@/server/golf-clubs";

/**
 * GET /api/golf/clubs — the canonical golf clubs dataset for partner devs.
 * API_KEY gated (Authorization: Bearer <API_KEY>) like all /api routes.
 *
 * Query: ?manufacturer= ?category= ?year= ?q= ?format=json|csv
 */
export async function GET(req: NextRequest) {
  try {
    const { workspace } = await ensureBaseRecords();
    const sp = req.nextUrl.searchParams;
    const yearRaw = sp.get("year");
    const clubs = await listGolfClubs(workspace.id, {
      manufacturer: sp.get("manufacturer") ?? undefined,
      category: sp.get("category") ?? undefined,
      year: yearRaw ? Number(yearRaw) : undefined,
      q: sp.get("q") ?? undefined,
    });

    if (sp.get("format") === "csv") {
      return new Response(clubsToCsv(clubs), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="gitwork-golf-clubs.csv"',
        },
      });
    }

    return apiOk({ count: clubs.length, clubs });
  } catch (err) {
    return fromError(err);
  }
}
