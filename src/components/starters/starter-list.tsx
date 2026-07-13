"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  PlusIcon,
  RectangleStackIcon,
  TagIcon,
  TrashIcon,
  SparklesIcon,
  ArrowRightIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
  StarIcon as StarOutline,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolid } from "@heroicons/react/24/solid";
import { useStarterList, useDeleteStarter, useAdoptStarter, useToggleStarterFeatured } from "@/hooks/use-starters";
import { usePulseScan } from "@/hooks/use-pulse";
import { usePermissions } from "@/hooks/use-permissions";
import { cn, formatDate } from "@/lib/format";
import { buttonStyles } from "@/components/ui/button";
import { recommendStartersForScan } from "@/lib/starters-recommend";
import type { StarterListItem, StarterType } from "@/server/starters";

type Filter = "all" | StarterType;

const TYPE_LABEL: Record<StarterType, string> = {
  PROMPT: "Prompt",
  SKILL: "Skill",
  PLUGIN: "Plugin",
  KIT: "Kit",
  COLLECTION: "Collection",
};

// DESIGN.md: badges use rounded-[4px], not rounded-full.
const TYPE_TONE: Record<StarterType, string> = {
  PROMPT: "bg-[var(--mist)] text-[var(--brand-700)] border border-[var(--mist-border)]",
  SKILL: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  PLUGIN: "bg-violet-50 text-violet-700 border border-violet-200",
  KIT: "bg-amber-50 text-amber-700 border border-amber-200",
  COLLECTION: "bg-[var(--surface-1)] text-[var(--text-3)] border border-[var(--border-2)]",
};

function TypeBadge({ type }: { type: StarterType }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[4px] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]",
        TYPE_TONE[type] ?? TYPE_TONE.KIT,
      )}
    >
      {TYPE_LABEL[type] ?? type}
    </span>
  );
}

function StarterCard({
  starter,
  index,
  onDelete,
  canManage,
  scanId,
  onAdopt,
  adopting,
  reasons,
  onToggleFeatured,
}: {
  starter: StarterListItem;
  index: number;
  onDelete: (id: string) => void;
  canManage: boolean;
  scanId: string | null;
  onAdopt: (id: string) => void;
  adopting: boolean;
  reasons?: string[];
  onToggleFeatured: (id: string, featured: boolean) => void;
}) {
  const numberLabel = String(index + 1).padStart(2, "0");
  const primaryTag = starter.tags[0];
  return (
    <article className="widget-card group transition-shadow hover:shadow-[rgba(0,0,0,0.04)_0px_2px_8px]">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{numberLabel}</span>
          {" // STARTER"}
        </span>
        <span className="flex items-center gap-1.5">
          {canManage && (
            <button
              type="button"
              onClick={() => onToggleFeatured(starter.id, !starter.featured)}
              className={cn(
                "rounded-[6px] p-0.5 transition hover:bg-[var(--surface-1)]",
                starter.featured ? "text-amber-500" : "text-[var(--text-4)] hover:text-amber-500",
              )}
              title={starter.featured ? "Unfeature" : "Feature"}
              aria-label={starter.featured ? "Unfeature" : "Feature"}
            >
              {starter.featured ? <StarSolid className="h-4 w-4" /> : <StarOutline className="h-4 w-4" />}
            </button>
          )}
          <TypeBadge type={starter.type} />
        </span>
      </div>

      <Link href={`/app/starters/${starter.id}`} className="block min-w-0 px-4 pt-4">
        <h3 className="line-clamp-1 text-sm font-semibold leading-snug text-[var(--text-1)] group-hover:text-[var(--brand-700)]">
          {starter.name}
        </h3>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-3)]">{starter.summary}</p>
      </Link>

      {reasons && reasons.length > 0 ? (
        <p className="mx-4 mt-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--brand-700)]">
          Matches: {reasons.slice(0, 4).join(" · ")}
        </p>
      ) : primaryTag ? (
        <span className="mx-4 mt-2.5 inline-flex w-fit items-center gap-1.5 rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-3)]">
          <TagIcon className="h-3 w-3" />
          {primaryTag}
        </span>
      ) : null}

      <div className="mt-3 flex items-center justify-between border-t border-[var(--border-2)] px-4 py-2.5">
        <span className="widget-timestamp">
          {TYPE_LABEL[starter.type]}
          {starter.tags.length > 0 && ` · ${starter.tags.length} tag${starter.tags.length === 1 ? "" : "s"}`}
        </span>
        <div className="flex items-center gap-3">
          {scanId ? (
            <button
              type="button"
              onClick={() => onAdopt(starter.id)}
              disabled={adopting}
              className="inline-flex items-center gap-1 rounded-[6px] bg-[var(--brand-700)] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-white transition hover:opacity-90 disabled:opacity-50"
              title="Link this starter to the scan"
            >
              Use
              <ArrowRightIcon className="h-3 w-3" />
            </button>
          ) : (
            <span className="widget-timestamp">{formatDate(starter.createdAt)}</span>
          )}
          <a
            href={`/api/starters/${starter.id}/download`}
            download
            onClick={(e) => e.stopPropagation()}
            className="rounded-[6px] p-1 text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--brand-700)]"
            title={starter.type === "SKILL" || starter.type === "PROMPT" ? "Add to Claude (.zip)" : "Download source (.zip)"}
            aria-label="Download starter"
          >
            <ArrowDownTrayIcon className="h-3.5 w-3.5" />
          </a>
          {canManage ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                if (confirm("Delete this starter?")) onDelete(starter.id);
              }}
              className="rounded-[6px] p-1 text-[var(--text-4)] opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
              title="Delete starter"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function StarterList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scanId = searchParams.get("scanId");
  const { canManageStarters } = usePermissions();
  const { data: starters, isLoading } = useStarterList();
  const { data: scanData } = usePulseScan(scanId ?? "");
  const scan = scanId ? scanData?.scan ?? null : null;
  const { mutate: deleteStarter } = useDeleteStarter();
  const { mutate: toggleFeatured } = useToggleStarterFeatured();
  const { mutateAsync: adopt, isPending: adopting } = useAdoptStarter();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  async function handleAdopt(starterId: string) {
    if (!scanId) return;
    await adopt({ scanId, starterId });
    router.push(`/app/pulse/${scanId}`);
  }

  const all = starters ?? [];
  // Tag-based recommendations when arriving from a Pulse scan — top matches first.
  const recommendations = scan ? recommendStartersForScan(scan, all).slice(0, 4) : [];
  const typeCount = (t: StarterType) => all.filter((s) => s.type === t).length;

  // Smart search: every whitespace-separated term must appear somewhere in the item's searchText
  // (name + summary + description + tags + hidden function/use-case keywords). So "sales email" or
  // "make a logo" find the right prompt even when those exact words aren't in the title.
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = all.filter(
    (s) =>
      (filter === "all" ? true : s.type === filter) &&
      (terms.length === 0 || terms.every((t) => s.searchText.includes(t))),
  );

  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: all.length },
    { id: "PROMPT", label: "Prompts", count: typeCount("PROMPT") },
    { id: "SKILL", label: "Skills", count: typeCount("SKILL") },
    { id: "PLUGIN", label: "Plugins", count: typeCount("PLUGIN") },
    { id: "KIT", label: "Kits", count: typeCount("KIT") },
    { id: "COLLECTION", label: "Collections", count: typeCount("COLLECTION") },
  ];

  return (
    <div className="space-y-5">
      {/* Recommendation banner when arriving from a Pulse scan */}
      {scan && (
        <section className="widget-card border-[var(--mist-border)] bg-[var(--mist)]">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-start gap-3">
              <SparklesIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-700)]" />
              <div>
                <p className="text-sm font-semibold text-[var(--text-1)]">
                  Recommended for {scan.projectName || "this project"}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-3)]">
                  {recommendations.length > 0
                    ? "Top matches for this scan are below — hit "
                    : "Pick a starter to link it to this scan — hit "}
                  <span className="font-mono uppercase">Use</span> on a card.
                </p>
              </div>
            </div>
            <Link href={`/app/pulse/${scan.id}`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
              Back to scan
            </Link>
          </div>
        </section>
      )}

      {/* Ranked recommendations from the scan's gaps, opportunities and failing checks */}
      {scan && recommendations.length > 0 && (
        <section>
          <div className="mb-2 flex items-center gap-2 px-0.5">
            <SparklesIcon className="h-4 w-4 text-[var(--brand-700)]" />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]">
              Recommended · {recommendations.length}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {recommendations.map((rec, i) => (
              <StarterCard
                key={rec.starter.id}
                starter={rec.starter}
                index={i}
                reasons={rec.reasons}
                onDelete={(id) => deleteStarter(id)}
                canManage={canManageStarters}
                scanId={scanId}
                onAdopt={handleAdopt}
                adopting={adopting}
                onToggleFeatured={(id, featured) => toggleFeatured({ id, featured })}
              />
            ))}
          </div>
        </section>
      )}

      {/* 01 // STARTERS — control strip */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">01</span>
            {" // STARTERS"}
          </span>
          <span className="widget-header__status">{all.length} TOTAL</span>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-4)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search starters — try “sales email”, “logo”, “debug”…"
              className="w-full rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] py-2 pl-9 pr-3 text-sm text-[var(--text-1)] outline-none transition placeholder:text-[var(--text-4)] focus:border-[var(--brand-400)]"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[4px] px-3 py-1.5 text-[13px] font-medium transition",
                  filter === tab.id
                    ? "bg-[var(--surface-0)] text-[var(--text-1)] shadow-sm"
                    : "text-[var(--text-3)] hover:text-[var(--text-1)]",
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "rounded-[4px] px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                    filter === tab.id
                      ? "bg-[var(--mist)] text-[var(--brand-700)]"
                      : "bg-[var(--surface-2)] text-[var(--text-4)]",
                  )}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {canManageStarters ? (
            <Link href="/app/starters/new" className={buttonStyles({ variant: "primary", size: "sm" })}>
              <PlusIcon className="h-4 w-4" />
              New starter
            </Link>
          ) : null}
          </div>
        </div>
      </section>

      {/* Cards grid */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)]"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">02</span>
              {" // EMPTY"}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <RectangleStackIcon className="mb-4 h-10 w-10 text-[var(--text-4)]" />
            <h3
              className="text-3xl leading-none tracking-[-0.03em] text-[var(--text-1)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {query
                ? `No starters match “${query.trim()}”`
                : filter === "all"
                  ? "No starters yet"
                  : `No ${TYPE_LABEL[filter as StarterType].toLowerCase()} starters`}
            </h3>
            {filter === "all" && canManageStarters && (
              <>
                <p className="mt-3 max-w-md text-sm text-[var(--text-3)]">
                  The Prompt→Production library — reusable prompts, skills, plugins and kits to leap a project forward.
                </p>
                <div className="mt-5">
                  <Link href="/app/starters/new" className={buttonStyles({ variant: "primary", size: "md" })}>
                    <PlusIcon className="h-4 w-4" />
                    New starter
                  </Link>
                </div>
              </>
            )}
          </div>
        </section>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((s, i) => (
            <StarterCard
              key={s.id}
              starter={s}
              index={i}
              onDelete={(id) => deleteStarter(id)}
              canManage={canManageStarters}
              scanId={scanId}
              onAdopt={handleAdopt}
              adopting={adopting}
              onToggleFeatured={(id, featured) => toggleFeatured({ id, featured })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
