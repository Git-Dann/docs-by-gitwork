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
import { hueFor } from "@/components/handbook/cover-hue";

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

        {/* Editorial cover band — gradient by section, echoing the reference infographic's covers */}
        {(() => {
          const hue = hueFor(`${article.category}:${article.title}`);
          return (
            <header
              className="relative overflow-hidden border-b border-[var(--border-2)] px-7 pb-8 pt-9"
              style={{ background: `linear-gradient(135deg, ${hue.from} 0%, ${hue.to} 100%)` }}
            >
              {/* oversized ghost numeral, like an editorial cover */}
              <span
                aria-hidden
                className="pointer-events-none absolute -right-2 -top-6 select-none text-[150px] leading-none opacity-[0.10]"
                style={{ fontFamily: "var(--font-display)", color: hue.ink }}
              >
                §
              </span>
              <div className="relative">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: hue.ink }}>
                  <span>{article.category}</span>
                  {article.readMinutes ? (
                    <span className="inline-flex items-center gap-1 opacity-70">
                      <ClockIcon className="h-3 w-3" />
                      {article.readMinutes} min read
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 h-0.5 w-12 rounded-full" style={{ background: hue.ink, opacity: 0.5 }} />
                <h1
                  className="mt-4 max-w-2xl text-[42px] leading-[1.06] tracking-[-0.03em]"
                  style={{ fontFamily: "var(--font-display)", color: hue.ink }}
                >
                  {article.title}
                </h1>
                {article.summary ? (
                  <p className="mt-3 max-w-2xl text-[17px] leading-7" style={{ color: hue.ink, opacity: 0.8 }}>
                    {article.summary}
                  </p>
                ) : null}
                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px]" style={{ color: hue.ink, opacity: 0.65 }}>
                  {article.author?.name ? <span>By {article.author.name}</span> : null}
                  <span>Updated {formatDate(article.updatedAt)}</span>
                  {article.tags.length > 0 ? <span>{article.tags.map((t) => `#${t}`).join("  ")}</span> : null}
                </div>
              </div>
            </header>
          );
        })()}

        {/* Body */}
        <div className="px-7 py-7">
          <ArticleMarkdown content={article.content} className="space-y-5" />
        </div>
      </article>
    </div>
  );
}
