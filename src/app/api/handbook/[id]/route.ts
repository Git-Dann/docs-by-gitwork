import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import {
  getHandbookArticle,
  updateHandbookArticle,
  deleteHandbookArticle,
  recordHandbookView,
} from "@/server/handbook";
import { handbookUpdateSchema } from "@/server/validators";
import { assertCan, canManageHandbook, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { workspaceIdForRequest } from "@/server/workspaces/scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageHandbook, "view the handbook");
    const { id } = await params;
    const article = await getHandbookArticle(await workspaceIdForRequest(request), id);
    if (!article) return apiError("Article not found", 404);
    // Fire-and-forget view counter — never blocks the read.
    void recordHandbookView(await workspaceIdForRequest(request), id);
    return apiOk({ article });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageHandbook, "edit handbook articles");
    const { id } = await params;
    const body = await request.json();
    const data = handbookUpdateSchema.parse(body);
    const article = await updateHandbookArticle(await workspaceIdForRequest(request), id, {
      ...data,
      // The last editor becomes the recorded author.
      authorId: user?.id ?? undefined,
    });
    if (!article) return apiError("Article not found", 404);
    return apiOk({ article });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageHandbook, "delete handbook articles");
    const { id } = await params;
    const ok = await deleteHandbookArticle(await workspaceIdForRequest(request), id);
    if (!ok) return apiError("Article not found", 404);
    return apiOk({ deleted: true });
  } catch (error) {
    return fromError(error);
  }
}
