import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { listStarters, createStarter, type StarterType } from "@/server/starters";
import { starterCreateSchema } from "@/server/validators";
import { assertCan, canManageStarters, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

// Starters is an admin-only tool (gated by the `starters` feature perm) — view == manage.
export async function GET(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageStarters, "view starters");
    const url = new URL(request.url);
    const typeParam = url.searchParams.get("type");
    const includeArchived = url.searchParams.get("includeArchived") === "true";
    const validTypes: StarterType[] = ["PROMPT", "SKILL", "PLUGIN", "KIT", "COLLECTION"];
    const type = validTypes.includes(typeParam as StarterType) ? (typeParam as StarterType) : undefined;
    const starters = await listStarters({ type, includeArchived });
    return apiOk({ starters });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageStarters, "create starters");
    const body = await request.json();
    const data = starterCreateSchema.parse(body);
    const starter = await createStarter({
      name: data.name,
      summary: data.summary,
      description: data.description ?? null,
      type: data.type,
      status: data.status,
      tags: data.tags,
      content: data.content ?? null,
    });
    return apiOk({ starter }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
