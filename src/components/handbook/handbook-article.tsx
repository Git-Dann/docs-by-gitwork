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

      {/* Editorial reading surface — scoped `.handbook-reader` theme (never leaks into the app) */}
      <article className="handbook-reader overflow-hidden rounded-[16px] border border-[var(--hb-border)]">
        {/* Navy hero band */}
        <header className="relative overflow-hidden px-8 pb-9 pt-8 sm:px-12" style={{ background: "var(--hb-navy)" }}>
          <span
            aria-hidden
            className="hb-serif pointer-events-none absolute -right-3 -top-10 select-none text-[190px] leading-none"
            style={{ color: "#ffffff", opacity: 0.04 }}
          >
            §
          </span>
          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <span className="hb-mono text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "#5b8def" }}>
                Gitwork Handbook
              </span>
              <span className="hb-mono text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--hb-on-dark-muted)" }}>
                {article.category} · Internal Standard
              </span>
            </div>

            <div className="mt-8">
              <div className="hb-mono flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "#5b8def" }}>
                <span>{article.category}</span>
                {article.readMinutes ? (
                  <span className="inline-flex items-center gap-1" style={{ color: "var(--hb-on-dark-muted)" }}>
                    <ClockIcon className="h-3 w-3" />
                    {article.readMinutes} min read
                  </span>
                ) : null}
              </div>
              <div className="mt-3 h-0.5 w-12 rounded-full" style={{ background: "#5b8def" }} />
              <h1 className="hb-serif mt-4 max-w-3xl text-[46px] leading-[1.04] tracking-[-0.02em]" style={{ color: "var(--hb-on-dark)" }}>
                {article.title}
                <span style={{ color: "#5b8def" }}>.</span>
              </h1>
              {article.summary ? (
                <p className="mt-4 max-w-2xl text-[18px] leading-8" style={{ color: "var(--hb-on-dark-muted)" }}>
                  {article.summary}
                </p>
              ) : null}
              <div className="hb-mono mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--hb-on-dark-muted)" }}>
                {article.author?.name ? <span>By {article.author.name}</span> : null}
                <span>Updated {formatDate(article.updatedAt)}</span>
                {article.tags.length > 0 ? <span>{article.tags.map((t) => `#${t}`).join("  ")}</span> : null}
              </div>
            </div>
          </div>
        </header>

        {/* Cream paper body */}
        <div className="px-6 py-10 sm:px-12 sm:py-12" style={{ background: "var(--hb-cream)" }}>
          <div className="mx-auto max-w-3xl">
            <ArticleMarkdown content={article.content} />
          </div>
        </div>
      </article>
    </div>
  );
}
