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
} from "@heroicons/react/24/outline";
import {
  useStarterList,
  useDeleteStarter,
  useLoadStartersDemo,
  useAdoptStarter,
} from "@/hooks/use-starters";
import { usePulseScan } from "@/hooks/use-pulse";
import { usePermissions } from "@/hooks/use-permissions";
import { cn, formatDate } from "@/lib/format";
import { Button, buttonStyles } from "@/components/ui/button";
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
}: {
  starter: StarterListItem;
  index: number;
  onDelete: (id: string) => void;
  canManage: boolean;
  scanId: string | null;
  onAdopt: (id: string) => void;
  adopting: boolean;
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
        <TypeBadge type={starter.type} />
      </div>

      <Link href={`/app/starters/${starter.id}`} className="block min-w-0 px-5 pt-5">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-[var(--text-1)] group-hover:text-[var(--brand-700)]">
          {starter.name}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[var(--text-3)]">{starter.summary}</p>
      </Link>

      {primaryTag && (
        <span className="mx-5 mt-3 inline-flex w-fit items-center gap-1.5 rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-3)]">
          <TagIcon className="h-3 w-3" />
          {primaryTag}
        </span>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-[var(--border-2)] px-5 py-3">
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
  const { mutateAsync: loadDemo, isPending: loadingDemo } = useLoadStartersDemo();
  const { mutateAsync: adopt, isPending: adopting } = useAdoptStarter();
  const [filter, setFilter] = useState<Filter>("all");

  async function handleLoadDemo() {
    await loadDemo();
  }

  async function handleAdopt(starterId: string) {
    if (!scanId) return;
    await adopt({ scanId, starterId });
    router.push(`/app/pulse/${scanId}`);
  }

  const all = starters ?? [];
  const typeCount = (t: StarterType) => all.filter((s) => s.type === t).length;

  const filtered = all.filter((s) => (filter === "all" ? true : s.type === filter));

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
                  Pick a starter to link it to this scan — hit <span className="font-mono uppercase">Use</span> on a card.
                </p>
              </div>
            </div>
            <Link href={`/app/pulse/${scan.id}`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
              Back to scan
            </Link>
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
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
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

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleLoadDemo}
              loading={loadingDemo}
              leadingIcon={!loadingDemo ? <RectangleStackIcon className="h-4 w-4" /> : null}
            >
              {loadingDemo ? "Loading…" : "Load demo"}
            </Button>
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-52 animate-pulse rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)]"
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
              {filter === "all" ? "No starters yet" : `No ${TYPE_LABEL[filter as StarterType].toLowerCase()} starters`}
            </h3>
            {filter === "all" && (
              <>
                <p className="mt-3 max-w-md text-sm text-[var(--text-3)]">
                  Gitwork&apos;s Prompt→Production library — reusable prompts, skills, plugins and kits to leap a
                  project forward. Load the built-ins to get started.
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={handleLoadDemo}
                    loading={loadingDemo}
                    leadingIcon={!loadingDemo ? <RectangleStackIcon className="h-4 w-4" /> : null}
                  >
                    {loadingDemo ? "Loading…" : "Load Gitwork starters"}
                  </Button>
                  {canManageStarters ? (
                    <Link href="/app/starters/new" className={buttonStyles({ variant: "primary", size: "md" })}>
                      <PlusIcon className="h-4 w-4" />
                      New starter
                    </Link>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </section>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
