import { NextRequest } from "next/server";
import { strToU8, zipSync } from "fflate";
import { apiError, fromError } from "@/lib/api-response";
import { getStarter, recordStarterUsage } from "@/server/starters";
import { assembleStarterFiles } from "@/server/starters-package";
import { assertCan, canManageStarters, canViewCosts, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { getDerivedClientDetail } from "@/server/clients";
import { prisma } from "@/lib/prisma";
import { proposalInclude, serializeProposal } from "@/server/proposals";
import { getPulseScan } from "@/server/pulse";
import {
  applyMergeVariables,
  resolveClientTokens,
  resolveDocumentTokens,
  resolvePulseTokens,
} from "@/lib/starter-merge-variables";

// Node runtime — Buffer + server-side GitHub fetch + fflate. Starters is Super-Admin-only (same
// gate as the other /api/starters routes). Returns a Claude Skill `.zip` (folder + SKILL.md at the
// root) for SKILL/PROMPT, or a source/backup zip for the other types.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageStarters, "download starters");
    const { id } = await params;
    const starter = await getStarter(id);
    if (!starter) return apiError("Starter not found", 404);

    const files = await assembleStarterFiles(starter);

    // Optional live-insert: mirrors what the on-screen prompt editor resolved (session-only there,
    // never persisted here either — the stored Starter template is untouched). Only meaningful for
    // the synthesized SKILL.md (the file the editor's text becomes); mirrored starters' other files
    // are shipped verbatim regardless.
    const clientSlug = request.nextUrl.searchParams.get("clientSlug");
    const documentId = request.nextUrl.searchParams.get("documentId");
    const scanId = request.nextUrl.searchParams.get("scanId");
    if (clientSlug || documentId || scanId) {
      const [clientDetail, document, scan] = await Promise.all([
        clientSlug ? getDerivedClientDetail(clientSlug) : null,
        documentId ? prisma.document.findFirst({ where: { id: documentId }, include: proposalInclude }) : null,
        scanId ? getPulseScan(scanId) : null,
      ]);
      let vars: Record<string, string> = {};
      if (clientDetail?.client) vars = { ...vars, ...resolveClientTokens(clientDetail.client) };
      if (document) {
        const showCosts = user ? canViewCosts(user) : true;
        vars = { ...vars, ...resolveDocumentTokens(serializeProposal(document, { canViewCosts: showCosts })) };
      }
      if (scan) vars = { ...vars, ...resolvePulseTokens(scan) };

      const skillPath = Object.keys(files).find((p) => p.toLowerCase() === `${starter.slug.toLowerCase()}/skill.md`);
      if (skillPath && Object.keys(vars).length > 0) {
        const raw = Buffer.from(files[skillPath]).toString("utf8");
        files[skillPath] = strToU8(applyMergeVariables(raw, vars));
      }
    }

    await recordStarterUsage(starter.id);

    const zip = zipSync(files);
    const filename = `${starter.slug}.zip`.replace(/[^\w.\-]+/g, "-");
    return new Response(Buffer.from(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return fromError(error);
  }
}
