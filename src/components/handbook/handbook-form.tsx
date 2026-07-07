"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EyeIcon, PencilSquareIcon, ViewColumnsIcon } from "@heroicons/react/24/outline";
import {
  useCreateHandbookArticle,
  useUpdateHandbookArticle,
  type HandbookInput,
} from "@/hooks/use-handbook";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import { ArticleMarkdown } from "@/components/handbook/article-markdown";
import { ArticleHero } from "@/components/handbook/article-hero";
import { HANDBOOK_CATEGORY_SUGGESTIONS, type HandbookRecord, type HandbookStatus } from "@/server/handbook";

type Mode = "write" | "split" | "preview";

const STATUSES: HandbookStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];

const inputClass =
  "w-full rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-focus-ring)]";
const labelClass = "block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]";

const PLACEHOLDER = [
  "Open with a strong one- or two-sentence lede — it gets a drop cap.",
  "",
  "## A section",
  "",
  "Write in Markdown. Use blocks for structure:",
  "",
  "::: check EVERY CHANGE INCLUDES",
  "- Happy-path testing",
  "- Edge cases handled",
  ":::",
  "",
  "> [!TIP]",
  "> One thing that really matters.",
].join("\n");

function csvToArray(value: string): string[] {
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function estimateReadMinutes(content: string): number | null {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return words === 0 ? null : Math.max(1, Math.round(words / 200));
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
  const [mode, setMode] = useState<Mode>("split");
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

  const showEditor = mode !== "preview";
  const showPreview = mode !== "write";

  const modes: { id: Mode; label: string; icon: typeof EyeIcon; lgOnly?: boolean }[] = [
    { id: "write", label: "Write", icon: PencilSquareIcon },
    { id: "split", label: "Split", icon: ViewColumnsIcon, lgOnly: true },
    { id: "preview", label: "Preview", icon: EyeIcon },
  ];

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-5xl space-y-5">
      {/* 01 // ARTICLE DETAILS */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">01</span>
            {isEdit ? " // EDIT ARTICLE" : " // NEW ARTICLE"}
          </span>
          <span className="widget-header__status">{isEdit ? "EDITING" : "DRAFT"}</span>
        </div>
        <div className="space-y-5 px-5 py-5">
          <div>
            <label className={labelClass} htmlFor="hb-title">Title</label>
            <input
              id="hb-title"
              className={cn(inputClass, "mt-1.5 text-[15px]")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Our release process"
              autoFocus={!isEdit}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="hb-summary">Summary</label>
            <input
              id="hb-summary"
              className={cn(inputClass, "mt-1.5")}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="One line shown on the card and under the title."
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass} htmlFor="hb-category">Section</label>
              <input
                id="hb-category"
                list="hb-category-options"
                className={cn(inputClass, "mt-1.5")}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Release & Deploys"
              />
              <datalist id="hb-category-options">
                {HANDBOOK_CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className={labelClass} htmlFor="hb-status">Status</label>
              <select
                id="hb-status"
                className="app-select mt-1.5 w-full text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value as HandbookStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="hb-tags">Tags</label>
              <input
                id="hb-tags"
                className={cn(inputClass, "mt-1.5")}
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="git, ci, deploys"
              />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="hb-keywords">
              Hidden search tags
              <span className="ml-1 font-sans font-normal normal-case tracking-normal text-[var(--text-4)]">— related terms so search finds this (optional)</span>
            </label>
            <input
              id="hb-keywords"
              className={cn(inputClass, "mt-1.5")}
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="shipping, release, rollback, pipeline"
            />
            <p className="mt-1 text-[11px] text-[var(--text-4)]">
              Not shown on the article. Related terms are auto-added, so search works even if you leave this blank.
            </p>
          </div>
        </div>
      </section>

      {/* 02 // CONTENT — editor with a real Write / Split / Preview toggle */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">02</span>
            {" // CONTENT"}
          </span>
          <div className="flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] p-0.5">
            {modes.map((m) => {
              const Icon = m.icon;
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1 text-[11px] font-medium transition",
                    m.lgOnly && "hidden lg:inline-flex",
                    active
                      ? "bg-[var(--surface-0)] text-[var(--text-1)] shadow-[var(--shadow-xs)]"
                      : "text-[var(--text-4)] hover:text-[var(--text-2)]",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Formatting hint */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--border-2)] bg-[var(--surface-1)] px-5 py-2 font-mono text-[10px] text-[var(--text-4)]">
          <span className="font-semibold uppercase tracking-[0.1em] text-[var(--text-3)]">Blocks</span>
          {[":::steps", ":::check", ":::avoid", ":::grid", ":::pills", ":::stats", "> [!TIP]", "| table |", "```code```"].map((t) => (
            <code key={t} className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[var(--text-3)]">{t}</code>
          ))}
        </div>

        {/* Panes — fixed height, each fills + scrolls internally (no clipping) */}
        <div className={cn("grid h-[62vh] min-h-[460px]", mode === "split" && "lg:grid-cols-2")}>
          {showEditor && (
            <div className={cn("h-full min-h-0", mode === "split" && "border-b border-[var(--border-2)] lg:border-b-0 lg:border-r")}>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={PLACEHOLDER}
                spellCheck={false}
                className="h-full w-full resize-none bg-[var(--surface-0)] px-5 py-4 font-mono text-[13px] leading-6 text-[var(--text-1)] outline-none placeholder:text-[var(--text-4)]"
              />
            </div>
          )}
          {showPreview && (
            <div className="handbook-reader h-full min-h-0 overflow-y-auto" style={{ background: "var(--hb-cream)" }}>
              {title.trim() || summary.trim() ? (
                <ArticleHero title={title} summary={summary} category={category} readMinutes={estimateReadMinutes(content)} />
              ) : null}
              <div className="px-6 py-8 sm:px-8">
                <div className="mx-auto max-w-2xl">
                  <ArticleMarkdown content={content} />
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {error && (
        <p className="rounded-[6px] border border-[var(--danger-200)] bg-[var(--danger-50)] px-3 py-2 text-sm text-[var(--danger-700)]">
          {error}
        </p>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] px-4 py-3">
        <p className="hidden text-xs text-[var(--text-4)] sm:block">
          {status === "PUBLISHED" ? "Publishes to the handbook on save." : status === "DRAFT" ? "Saved as a draft — not shown in the library scope." : "Archived — hidden from the default views."}
        </p>
        <div className="flex items-center gap-2">
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
      </div>
    </form>
  );
}
