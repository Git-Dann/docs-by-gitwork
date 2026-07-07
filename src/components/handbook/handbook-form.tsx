"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EyeIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import {
  useCreateHandbookArticle,
  useUpdateHandbookArticle,
  type HandbookInput,
} from "@/hooks/use-handbook";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import { ArticleMarkdown } from "@/components/handbook/article-markdown";
import { HANDBOOK_CATEGORY_SUGGESTIONS, type HandbookRecord, type HandbookStatus } from "@/server/handbook";

const STATUSES: HandbookStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];

const inputClass =
  "w-full rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-400)]";
const labelClass = "block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]";

function csvToArray(value: string): string[] {
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function HandbookForm({
  article,
  onSaved,
}: {
  article?: HandbookRecord;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const create = useCreateHandbookArticle();
  const update = useUpdateHandbookArticle(article?.id ?? "");
  const isEdit = Boolean(article);

  const [title, setTitle] = useState(article?.title ?? "");
  const [summary, setSummary] = useState(article?.summary ?? "");
  const [category, setCategory] = useState(article?.category ?? "");
  const [tags, setTags] = useState((article?.tags ?? []).join(", "));
  const [keywords, setKeywords] = useState((article?.keywords ?? []).join(", "));
  const [status, setStatus] = useState<HandbookStatus>(article?.status ?? "PUBLISHED");
  const [content, setContent] = useState(article?.content ?? "");
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saving = create.isPending || update.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("A title is required.");
      return;
    }
    const payload: HandbookInput = {
      title: title.trim(),
      summary: summary.trim() || null,
      category: category.trim() || null,
      content,
      tags: csvToArray(tags),
      keywords: csvToArray(keywords),
      status,
    };
    try {
      const result = isEdit ? await update.mutateAsync(payload) : await create.mutateAsync(payload);
      if (onSaved) onSaved(result.id);
      else router.push(`/app/handbook/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the article.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-5xl space-y-5">
      {/* 01 // ARTICLE — metadata */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">01</span>
            {isEdit ? " // EDIT ARTICLE" : " // NEW ARTICLE"}
          </span>
        </div>
        <div className="space-y-4 px-5 py-5">
          <div>
            <label className={labelClass} htmlFor="hb-title">
              Title
            </label>
            <input
              id="hb-title"
              className={`${inputClass} mt-1.5`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Our release process — Staging → QA → Production"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="hb-summary">
              Summary
            </label>
            <input
              id="hb-summary"
              className={`${inputClass} mt-1.5`}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="One line shown on the card and under the title."
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass} htmlFor="hb-category">
                Section
              </label>
              <input
                id="hb-category"
                list="hb-category-options"
                className={`${inputClass} mt-1.5`}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Release & Deploys"
              />
              <datalist id="hb-category-options">
                {HANDBOOK_CATEGORY_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={labelClass} htmlFor="hb-status">
                Status
              </label>
              <select
                id="hb-status"
                className={`${inputClass} mt-1.5`}
                value={status}
                onChange={(e) => setStatus(e.target.value as HandbookStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="hb-tags">
                Tags (comma-separated)
              </label>
              <input
                id="hb-tags"
                className={`${inputClass} mt-1.5`}
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="git, ci, deploys"
              />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="hb-keywords">
              Hidden search tags <span className="font-sans font-normal normal-case text-[var(--text-4)]">— related terms so search finds this (optional)</span>
            </label>
            <input
              id="hb-keywords"
              className={`${inputClass} mt-1.5`}
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="shipping, release, rollback, pipeline"
            />
            <p className="mt-1 text-[11px] text-[var(--text-4)]">
              Not shown on the article. We also auto-add related terms — leave blank and search still works.
            </p>
          </div>
        </div>
      </section>

      {/* 02 // CONTENT — markdown editor with live preview */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">02</span>
            {" // CONTENT"}
          </span>
          <div className="flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] p-0.5">
            <button
              type="button"
              onClick={() => setPreview(false)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1 text-[11px] font-medium transition",
                !preview ? "bg-[var(--surface-0)] text-[var(--text-1)] shadow-sm" : "text-[var(--text-4)] hover:text-[var(--text-2)]",
              )}
            >
              <PencilSquareIcon className="h-3.5 w-3.5" />
              Write
            </button>
            <button
              type="button"
              onClick={() => setPreview(true)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1 text-[11px] font-medium transition",
                preview ? "bg-[var(--surface-0)] text-[var(--text-1)] shadow-sm" : "text-[var(--text-4)] hover:text-[var(--text-2)]",
              )}
            >
              <EyeIcon className="h-3.5 w-3.5" />
              Preview
            </button>
          </div>
        </div>
        <div className="grid lg:grid-cols-2">
          <div className={cn("border-b border-[var(--border-2)] lg:border-b-0 lg:border-r", preview && "hidden lg:block")}>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={"# Overview\n\nWrite in Markdown — headings, **bold**, lists, `code`, tables and ```fenced code blocks``` all render.\n\n> Callouts use blockquotes."}
              className="min-h-[420px] w-full resize-y bg-[var(--surface-0)] px-5 py-4 font-mono text-[13px] leading-6 text-[var(--text-1)] outline-none"
            />
          </div>
          <div className={cn("handbook-reader px-6 py-6", !preview && "hidden lg:block")} style={{ background: "var(--hb-cream)" }}>
            <ArticleMarkdown content={content} />
          </div>
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={() => router.push(isEdit && article ? `/app/handbook/${article.id}` : "/app/handbook")}
        >
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="md" loading={saving}>
          {isEdit ? "Save changes" : "Create article"}
        </Button>
      </div>
    </form>
  );
}
