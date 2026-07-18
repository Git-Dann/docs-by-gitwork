import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { listRecipesWithStarters, createRecipe } from "@/server/starter-recipes";
import { starterRecipeCreateSchema } from "@/server/validators";
import { assertCan, canManageStarters, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

// Recipes live under the same `starters` feature perm as the rest of the library — view == manage.
export async function GET(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageStarters, "view starter recipes");
    const recipes = await listRecipesWithStarters();
    return apiOk({ recipes });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageStarters, "create starter recipes");
    const body = await request.json();
    const data = starterRecipeCreateSchema.parse(body);
    const recipe = await createRecipe({
      name: data.name,
      summary: data.summary,
      description: data.description ?? null,
      starterIds: data.starterIds,
    });
    return apiOk({ recipe }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
