"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  PencilSquareIcon,
  TrashIcon,
  ClockIcon,
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
    <div className="mx-auto max-w-3xl space-y-5">
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

      {/* Editorial reading surface */}
      <article className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">01</span>
            {" // ARTICLE"}
          </span>
          <span className="widget-header__status">
            {article.status === "DRAFT" ? "DRAFT" : article.status === "ARCHIVED" ? "ARCHIVED" : "PUBLISHED"}
          </span>
        </div>

        {/* Masthead */}
        <header className="border-b border-[var(--border-2)] px-7 pb-7 pt-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-700)]">
            <span>{article.category}</span>
            {article.readMinutes ? (
              <span className="inline-flex items-center gap-1 text-[var(--text-4)]">
                <ClockIcon className="h-3 w-3" />
                {article.readMinutes} min read
              </span>
            ) : null}
          </div>
          {/* thin brand rule */}
          <div className="mt-3 h-0.5 w-12 rounded-full bg-[var(--brand-600)]" />
          <h1
            className="mt-4 text-[40px] leading-[1.08] tracking-[-0.03em] text-[var(--text-1)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {article.title}
          </h1>
          {article.summary ? (
            <p className="mt-3 max-w-2xl text-[17px] leading-7 text-[var(--text-3)]">{article.summary}</p>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-[var(--text-4)]">
            {article.author?.name ? <span>By {article.author.name}</span> : null}
            <span>Updated {formatDate(article.updatedAt)}</span>
            {article.tags.length > 0 ? <span>{article.tags.map((t) => `#${t}`).join("  ")}</span> : null}
          </div>
        </header>

        {/* Body */}
        <div className="px-7 py-7">
          <ArticleMarkdown content={article.content} className="space-y-5" />
        </div>
      </article>
    </div>
  );
}
