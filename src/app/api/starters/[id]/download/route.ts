import { NextRequest } from "next/server";
import { apiError, fromError } from "@/lib/api-response";
import { getStarter } from "@/server/starters";
import { buildStarterZip } from "@/server/starters-package";
import { assertCan, canManageStarters, getEffectiveUserOrNull } from "@/server/auth/effective-user";

// Node runtime — Buffer + server-side GitHub fetch + fflate. Starters is Super-Admin-only (same
// gate as the other /api/starters routes). Returns a Claude Skill `.zip` (folder + SKILL.md at the
// root) for SKILL/PROMPT, or a source/backup zip for the other types.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageStarters, "download starters");
    const { id } = await params;
    const starter = await getStarter(id);
    if (!starter) return apiError("Starter not found", 404);

    const zip = await buildStarterZip(starter);
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
