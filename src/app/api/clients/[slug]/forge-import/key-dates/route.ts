/**
 * Bring the client's planning-tool calendar dates (Forge "companyDates") onto their Board's
 * Schedule as key dates, without re-running the plan import. A dry run unless `apply: true`.
 * Admin-only, like the plan import (src/server/forge-import-access.ts). CLAUDE.md §128.
 */
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { forgeKeyDatesBodySchema } from "@/lib/forge-import/schemas";
import { ForgeImportError, importForgeKeyDates } from "@/server/forge-import";
import { requireForgeImporter } from "@/server/forge-import-access";

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { user, clientId } = await requireForgeImporter(req, slug);
    const body = forgeKeyDatesBodySchema.parse(await req.json().catch(() => ({})));
    const result = await importForgeKeyDates({ workspaceId: user.workspaceId, clientId, feedUrl: body.feedUrl, apply: body.apply === true });
    return apiOk({ result });
  } catch (err) {
    if (err instanceof ForgeImportError) return apiError(err.message, err.status);
    return fromError(err);
  }
}
