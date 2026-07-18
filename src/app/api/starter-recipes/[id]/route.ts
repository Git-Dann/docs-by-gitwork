import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getRecipe, updateRecipe, deleteRecipe } from "@/server/starter-recipes";
import { starterRecipeUpdateSchema } from "@/server/validators";
import { assertCan, canManageStarters, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageStarters, "view starter recipes");
    const { id } = await params;
    const recipe = await getRecipe(id);
    if (!recipe) return apiError("Recipe not found", 404);
    return apiOk({ recipe });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageStarters, "update starter recipes");
    const { id } = await params;
    const body = await request.json();
    const data = starterRecipeUpdateSchema.parse(body);
    const recipe = await updateRecipe(id, {
      ...data,
      description: data.description === undefined ? undefined : data.description ?? null,
    });
    if (!recipe) return apiError("Recipe not found", 404);
    return apiOk({ recipe });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageStarters, "delete starter recipes");
    const { id } = await params;
    const ok = await deleteRecipe(id);
    if (!ok) return apiError("Recipe not found", 404);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
