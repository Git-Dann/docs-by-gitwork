"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  BookOpenIcon,
  TrashIcon,
  StarIcon as StarOutline,
  ClockIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolid } from "@heroicons/react/24/solid";
import {
  useHandbookList,
  useDeleteHandbookArticle,
  useToggleHandbookFeatured,
} from "@/hooks/use-handbook";
import { usePermissions } from "@/hooks/use-permissions";
import { cn, formatDate } from "@/lib/format";
import { buttonStyles } from "@/components/ui/button";
import type { HandbookListItem, HandbookStatus } from "@/server/handbook";
import { hueFor } from "@/components/handbook/cover-hue";
import { AttributionChip } from "@/components/handbook/attribution-chip";

type Scope = "all" | "featured" | "drafts" | "archived";

const STATUS_LABEL: Record<HandbookStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};
const STATUS_TONE: Record<HandbookStatus, string> = {
  PUBLISHED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  DRAFT: "bg-amber-50 text-amber-700 border-amber-200",
  ARCHIVED: "bg-[var(--surface-1)] text-[var(--text-4)] border-[var(--border-2)]",
};

function RailItem({
  active,
  onClick,
  label,
  count,
  dense,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  dense?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-[6px] border px-2.5 text-left text-[13px] transition",
        dense ? "py-1.5" : "py-2",
        active
          ? "border-[var(--brand-300)] bg-[var(--surface-brand)] font-medium text-[var(--brand-800)]"
          : "border-transparent text-[var(--text-2)] hover:bg-[var(--surface-1)]",
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      {count !== undefined ? (
        <span className="shrink-0 font-mono text-[10px] font-semibold text-[var(--text-4)]">{count}</span>
      ) : null}
    </button>
  );
}

function ArticleCard({
  article,
  onDelete,
  onToggleFeatured,
}: {
  article: HandbookListItem;
  onDelete: (id: string) => void;
  onToggleFeatured: (id: string, featured: boolean) => void;
}) {
  const hue = hueFor(`${article.category}:${article.title}`);
  return (
    <article className="group relative overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] transition hover:border-[var(--border-1)] hover:shadow-[rgba(0,0,0,0.04)_0px_2px_8px]">
      {/* Generated editorial cover */}
      <Link href={`/app/handbook/${article.id}`} className="block">
        <div
          className="relative flex h-32 flex-col px-5 pb-5 pt-4"
          style={{ background: `linear-gradient(135deg, ${hue.from} 0%, ${hue.to} 100%)` }}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: hue.ink }}
            >
              {article.category}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onToggleFeatured(article.id, !article.featured);
              }}
              className={cn(
                "rounded-[6px] bg-white/50 p-0.5 backdrop-blur transition hover:bg-white/80",
                article.featured ? "text-amber-500" : "text-[var(--text-4)] hover:text-amber-500",
              )}
              title={article.featured ? "Unpin" : "Pin to top"}
              aria-label={article.featured ? "Unpin" : "Pin to top"}
            >
              {article.featured ? <StarSolid className="h-4 w-4" /> : <StarOutline className="h-4 w-4" />}
            </button>
          </div>
          <h3
            className="mt-auto line-clamp-2 text-[22px] leading-[1.15] tracking-[-0.02em]"
            style={{ fontFamily: "var(--font-display)", color: hue.ink }}
          >
            {article.title}
          </h3>
        </div>
      </Link>

      <div className="px-5 py-3.5">
        <p className="line-clamp-2 min-h-[2.5rem] text-xs leading-5 text-[var(--text-3)]">
          {article.summary || "No summary yet."}
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-[4px] border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em]",
                STATUS_TONE[article.status],
              )}
            >
              {STATUS_LABEL[article.status]}
            </span>
            {article.readMinutes ? (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[var(--text-4)]">
                <ClockIcon className="h-3 w-3" />
                {article.readMinutes} min
              </span>
            ) : null}
          </span>
          <span className="flex items-center gap-2">
            <span className="widget-timestamp">{formatDate(article.updatedAt)}</span>
            <button
              type="button"
              onClick={() => {
                if (confirm(`Delete "${article.title}"? This can't be undone.`)) onDelete(article.id);
              }}
              className="rounded-[6px] p-1 text-[var(--text-4)] opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
              title="Delete article"
              aria-label="Delete article"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      </div>
    </article>
  );
}

export function HandbookLibrary() {
  const { canManageHandbook } = usePermissions();
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [category, setCategory] = useState<string | null>(null);
  // Mobile: the rail (4 scopes + up to a dozen sections) is collapsed by default so the article
  // grid is reachable without scrolling past the whole nav. Always open on lg+ (see markup).
  const [railOpen, setRailOpen] = useState(false);

  const includeArchived = scope === "archived";
  const { data, isLoading } = useHandbookList({
    q: search,
    category: category ?? undefined,
    includeArchived,
  });

  const { mutate: deleteArticle } = useDeleteHandbookArticle();
  const { mutate: toggleFeatured } = useToggleHandbookFeatured();

  const articles = useMemo(() => data?.articles ?? [], [data]);
  const categories = data?.categories ?? [];

  const scoped = useMemo(() => {
    switch (scope) {
      case "featured":
        return articles.filter((a) => a.featured && a.status !== "ARCHIVED");
      case "drafts":
        return articles.filter((a) => a.status === "DRAFT");
      case "archived":
        return articles.filter((a) => a.status === "ARCHIVED");
      default:
        return articles.filter((a) => a.status !== "ARCHIVED");
    }
  }, [articles, scope]);

  const publishedCount = articles.filter((a) => a.status !== "ARCHIVED").length;
  const featuredCount = articles.filter((a) => a.featured && a.status !== "ARCHIVED").length;
  const draftCount = articles.filter((a) => a.status === "DRAFT").length;

  const SCOPE_LABEL: Record<Scope, string> = {
    all: "All articles",
    featured: "Featured",
    drafts: "Drafts",
    archived: "Archived",
  };
  const currentFilterLabel = category ?? SCOPE_LABEL[scope];
  // Run a selection, then collapse the rail on mobile so results are visible immediately.
  const pick = (fn: () => void) => {
    fn();
    setRailOpen(false);
  };

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">01</span>
          {" // HANDBOOK"}
        </span>
        <span className="widget-header__status">
          {publishedCount} {publishedCount === 1 ? "ARTICLE" : "ARTICLES"} · {categories.length}{" "}
          {categories.length === 1 ? "SECTION" : "SECTIONS"}
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border-2)] px-4 py-3">
        <div className="relative min-w-[200px] flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-4)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the handbook…"
            className="w-full rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] py-2 pl-9 pr-3 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-400)]"
          />
        </div>
        <AttributionChip name="Umer Fayyaz" />
        {canManageHandbook ? (
          <Link href="/app/handbook/new" className={buttonStyles({ variant: "primary", size: "sm" })}>
            <PlusIcon className="h-4 w-4" />
            New article
          </Link>
        ) : null}
      </div>

      {/* Two-pane body: rail + content */}
      <div className="grid lg:grid-cols-[212px_1fr]">
        {/* Rail */}
        <aside className="border-b border-[var(--border-2)] p-3 lg:border-b-0 lg:border-r">
          {/* Mobile disclosure toggle — collapses the long filter list so content shows first */}
          <button
            type="button"
            onClick={() => setRailOpen((o) => !o)}
            aria-expanded={railOpen}
            className="flex w-full items-center justify-between gap-2 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2 text-[13px] font-medium text-[var(--text-1)] lg:hidden"
          >
            <span className="min-w-0 truncate">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">Browse · </span>
              {currentFilterLabel}
            </span>
            <ChevronDownIcon className={cn("h-4 w-4 shrink-0 text-[var(--text-3)] transition", railOpen && "rotate-180")} />
          </button>

          {/* Filter list — collapsed on mobile unless toggled; always shown on lg+ */}
          <div className={cn("space-y-4 lg:mt-0 lg:block", railOpen ? "mt-3 block" : "hidden")}>
            <div className="space-y-1">
              <RailItem label="All articles" count={publishedCount} active={scope === "all" && !category} onClick={() => pick(() => { setScope("all"); setCategory(null); })} />
              <RailItem label="Featured" count={featuredCount} active={scope === "featured"} onClick={() => pick(() => { setScope("featured"); setCategory(null); })} />
              <RailItem label="Drafts" count={draftCount} active={scope === "drafts"} onClick={() => pick(() => { setScope("drafts"); setCategory(null); })} />
              <RailItem label="Archived" active={scope === "archived"} onClick={() => pick(() => { setScope("archived"); setCategory(null); })} />
            </div>

            {categories.length > 0 && (
              <div>
                <p className="px-2.5 pb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
                  Sections
                </p>
                <div className="space-y-0.5">
                  {categories.map((c) => (
                    <RailItem
                      key={c.category}
                      dense
                      label={c.category}
                      count={c.count}
                      active={category === c.category && scope !== "archived"}
                      onClick={() => pick(() => { setScope("all"); setCategory((prev) => (prev === c.category ? null : c.category)); })}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Content */}
        <div className="p-4">
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-52 animate-pulse rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)]" />
              ))}
            </div>
          ) : scoped.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              {search || category ? (
                <>
                  <MagnifyingGlassIcon className="mb-4 h-10 w-10 text-[var(--text-4)]" />
                  <h3 className="text-2xl leading-none tracking-[-0.02em] text-[var(--text-1)]" style={{ fontFamily: "var(--font-display)" }}>
                    Nothing matches
                  </h3>
                  <p className="mt-2 max-w-sm text-sm text-[var(--text-3)]">
                    No articles for {search ? `“${search}”` : ""}{search && category ? " in " : ""}{category ? `“${category}”` : ""}. Try a broader search.
                  </p>
                </>
              ) : (
                <>
                  <BookOpenIcon className="mb-4 h-10 w-10 text-[var(--text-4)]" />
                  <h3 className="text-3xl leading-none tracking-[-0.03em] text-[var(--text-1)]" style={{ fontFamily: "var(--font-display)" }}>
                    {scope === "drafts" ? "No drafts" : scope === "archived" ? "Nothing archived" : scope === "featured" ? "Nothing featured yet" : "The handbook is empty"}
                  </h3>
                  {scope === "all" && canManageHandbook && (
                    <>
                      <p className="mt-3 max-w-md text-sm text-[var(--text-3)]">
                        The canonical way Gitwork builds — standards, playbooks and process, searchable in one place. Write the first article.
                      </p>
                      <div className="mt-5">
                        <Link href="/app/handbook/new" className={buttonStyles({ variant: "primary", size: "md" })}>
                          <PlusIcon className="h-4 w-4" />
                          New article
                        </Link>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {scoped.map((a) => (
                <ArticleCard
                  key={a.id}
                  article={a}
                  onDelete={(id) => deleteArticle(id)}
                  onToggleFeatured={(id, featured) => toggleFeatured({ id, featured })}
                />
              ))}
            </div>
          )}
        </div>
      </div>

    </section>
  );
}
