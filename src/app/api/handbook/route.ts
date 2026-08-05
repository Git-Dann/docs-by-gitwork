import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import {
  listHandbookArticles,
  listHandbookCategories,
  createHandbookArticle,
} from "@/server/handbook";
import { handbookCreateSchema } from "@/server/validators";
import { assertCan, canManageHandbook, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

// The Handbook is Admin + Super Admin only — view and write alike.
export async function GET(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageHandbook, "view the handbook");
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? undefined;
    const category = url.searchParams.get("category") ?? undefined;
    const includeArchived = url.searchParams.get("includeArchived") === "true";
    const [articles, categories] = await Promise.all([
      listHandbookArticles({ q, category, includeArchived }),
      listHandbookCategories(),
    ]);
    return apiOk({ articles, categories });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageHandbook, "create handbook articles");
    const body = await request.json();
    const data = handbookCreateSchema.parse(body);
    const article = await createHandbookArticle({
      title: data.title,
      summary: data.summary ?? null,
      category: data.category ?? null,
      content: data.content ?? null,
      tags: data.tags,
      keywords: data.keywords,
      status: data.status,
      authorId: user?.id ?? null,
    });
    return apiOk({ article }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
