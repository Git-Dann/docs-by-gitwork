"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  PencilSquareIcon,
  TrashIcon,
  StarIcon as StarOutline,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolid } from "@heroicons/react/24/solid";
import {
  useHandbookArticle,
  useDeleteHandbookArticle,
  useToggleHandbookFeatured,
} from "@/hooks/use-handbook";
import { usePermissions } from "@/hooks/use-permissions";
import { cn, formatDate } from "@/lib/format";
import { Button, buttonStyles } from "@/components/ui/button";
import { ArticleMarkdown } from "@/components/handbook/article-markdown";
import { ArticleHero } from "@/components/handbook/article-hero";
import { HandbookForm } from "@/components/handbook/handbook-form";

export function HandbookArticleView({ articleId }: { articleId: string }) {
  const router = useRouter();
  const { canManageHandbook } = usePermissions();
  const { data: article, isLoading } = useHandbookArticle(articleId);
  const { mutate: deleteArticle } = useDeleteHandbookArticle();
  const { mutate: toggleFeatured } = useToggleHandbookFeatured();
  const [editing, setEditing] = useState(false);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="h-72 animate-pulse rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)]" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="widget-card px-6 py-16 text-center">
        <p className="text-sm text-[var(--text-3)]">Article not found.</p>
        <Link
          href="/app/handbook"
          className={cn("mt-4 inline-flex", buttonStyles({ variant: "secondary", size: "sm" }))}
        >
          Back to the handbook
        </Link>
      </div>
    );
  }

  if (editing) {
    return <HandbookForm article={article} onSaved={() => setEditing(false)} />;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Nav + actions */}
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/app/handbook"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-3)] transition hover:text-[var(--text-1)]"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Back to the handbook
        </Link>
        {canManageHandbook && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => toggleFeatured({ id: article.id, featured: !article.featured })}
              leadingIcon={
                article.featured ? (
                  <StarSolid className="h-4 w-4 text-amber-500" />
                ) : (
                  <StarOutline className="h-4 w-4" />
                )
              }
            >
              {article.featured ? "Pinned" : "Pin"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setEditing(true)}
              leadingIcon={<PencilSquareIcon className="h-4 w-4" />}
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                if (confirm(`Delete "${article.title}"? This can't be undone.`)) {
                  deleteArticle(article.id);
                  router.push("/app/handbook");
                }
              }}
              leadingIcon={<TrashIcon className="h-4 w-4" />}
            >
              Delete
            </Button>
          </div>
        )}
      </div>

      {/* Editorial reading surface — scoped `.handbook-reader` theme (never leaks into the app) */}
      <article className="handbook-reader overflow-hidden rounded-[16px] border border-[var(--hb-border)]">
        <ArticleHero
          title={article.title}
          summary={article.summary}
          category={article.category}
          readMinutes={article.readMinutes}
          author={article.author?.name}
          updatedLabel={formatDate(article.updatedAt)}
          tags={article.tags}
        />
        {/* Cream paper body */}
        <div className="px-6 py-10 sm:px-12 sm:py-12" style={{ background: "var(--hb-cream)" }}>
          <div className="mx-auto max-w-4xl">
            <ArticleMarkdown content={article.content} />
          </div>
        </div>
      </article>
    </div>
  );
}
