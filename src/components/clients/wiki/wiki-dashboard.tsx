"use client";

import {
  BookOpenIcon,
  CalendarDaysIcon,
  CircleStackIcon,
  ClockIcon,
  CodeBracketIcon,
  CubeTransparentIcon,
  DocumentTextIcon,
  FlagIcon,
  ServerStackIcon,
  WrenchScrewdriverIcon,
  ArrowRightIcon,
  MapPinIcon,
  RocketLaunchIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import type { ComponentType, SVGProps } from "react";
import type { WikiDTO } from "@/lib/api";
import type { WikiSection } from "./wiki-sidebar";

// JetBrains Mono stack — consistent with wiki-workspace / wiki-public-view.
const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

const SECTION_META: Record<
  Exclude<WikiSection, "dashboard" | "settings">,
  { label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }
> = {
  timeline: { label: "Timeline", icon: CalendarDaysIcon },
  "design-system": { label: "Design System", icon: CubeTransparentIcon },
  ia: { label: "Information Architecture", icon: BookOpenIcon },
  "dev-guide": { label: "Developer Guide", icon: CodeBracketIcon },
  "api-docs": { label: "API Docs", icon: ServerStackIcon },
  architecture: { label: "Architecture", icon: DocumentTextIcon },
  runbook: { label: "Runbook", icon: WrenchScrewdriverIcon },
  "data-model": { label: "Data Model", icon: CircleStackIcon },
  changelog: { label: "Changelog", icon: ClockIcon },
  "course-requests": { label: "Course Requests", icon: FlagIcon },
};

/** Weighted overall completion across all timeline blocks (by task count). */
function overallProgress(wiki: WikiDTO): number | null {
  const blocks = wiki.timeline.blocks;
  if (blocks.length === 0) return null;
  let done = 0;
  let total = 0;
  for (const b of blocks) {
    total += b.tasks.length;
    done += b.tasks.filter((t) => t.done).length;
  }
  if (total === 0) {
    return Math.round(blocks.reduce((sum, b) => sum + b.progress, 0) / blocks.length);
  }
  return Math.round((done / total) * 100);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/** The next milestone on/after today, else the most recent past one. */
function nextMilestone(wiki: WikiDTO) {
  const ms = wiki.timeline.milestones;
  if (ms.length === 0) return null;
  const now = Date.now();
  const sorted = [...ms].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return sorted.find((m) => new Date(m.date).getTime() >= now) ?? sorted[sorted.length - 1];
}

/** The phase in flight today, else the first unfinished phase. */
function activePhase(wiki: WikiDTO) {
  const blocks = wiki.timeline.blocks;
  if (blocks.length === 0) return null;
  const now = Date.now();
  const inFlight = blocks.find(
    (b) => new Date(b.startDate).getTime() <= now && new Date(b.endDate).getTime() >= now,
  );
  return inFlight ?? blocks.find((b) => b.progress < 100) ?? blocks[blocks.length - 1];
}

function sectionSubtitle(section: WikiSection, wiki: WikiDTO): string {
  switch (section) {
    case "timeline": {
      const pct = overallProgress(wiki);
      const phases = wiki.timeline.blocks.length;
      const phaseLabel = `${phases} phase${phases === 1 ? "" : "s"}`;
      return pct === null ? phaseLabel : `${pct}% complete · ${phaseLabel}`;
    }
    case "design-system":
      return "Brand tokens, colours & components";
    case "changelog": {
      const latest = wiki.changelog[0];
      if (!latest) return "Release notes";
      return `Latest: v${latest.version} — ${latest.title}`;
    }
    case "course-requests": {
      const n = wiki.courseRequests.length;
      return `${n} request${n === 1 ? "" : "s"}`;
    }
    default:
      return "Documentation";
  }
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-[12px] border border-[var(--border-1)] bg-white p-4">
      <div className="flex items-center gap-2 text-[var(--text-4)]">
        <Icon className="h-4 w-4" />
        <span
          className="text-[10px] uppercase tracking-[0.12em]"
          style={{ fontFamily: MONO }}
        >
          {label}
        </span>
      </div>
      <div className="mt-2 truncate text-lg font-semibold text-[var(--text-1)]">{value}</div>
      {sub ? <div className="mt-0.5 truncate text-[12px] text-[var(--text-4)]">{sub}</div> : null}
    </div>
  );
}

export function WikiDashboard({
  wiki,
  availableSections,
  onSelect,
}: {
  wiki: WikiDTO;
  availableSections: WikiSection[];
  onSelect: (section: WikiSection) => void;
}) {
  const tiles = availableSections.filter(
    (s): s is Exclude<WikiSection, "dashboard" | "settings"> =>
      s !== "dashboard" && s !== "settings",
  );
  const pct = overallProgress(wiki);
  const phase = activePhase(wiki);
  const milestone = nextMilestone(wiki);
  const latest = wiki.changelog[0] ?? null;
  const docCount = wiki.pages.length;

  // Top-level stat cards — only the ones that have real data.
  const stats: Array<{
    icon: ComponentType<SVGProps<SVGSVGElement>>;
    label: string;
    value: string;
    sub?: string;
  }> = [];
  if (phase) {
    stats.push({
      icon: CalendarDaysIcon,
      label: "Current phase",
      value: phase.name,
      sub: `${phase.progress}% complete`,
    });
  }
  if (milestone) {
    stats.push({
      icon: MapPinIcon,
      label: "Next milestone",
      value: milestone.name,
      sub: formatDate(milestone.date),
    });
  }
  if (latest) {
    stats.push({
      icon: RocketLaunchIcon,
      label: "Latest release",
      value: `v${latest.version}`,
      sub: latest.releasedAt ? formatDate(latest.releasedAt) : latest.title,
    });
  }
  if (docCount > 0) {
    stats.push({
      icon: DocumentTextIcon,
      label: "Documentation",
      value: `${docCount} page${docCount === 1 ? "" : "s"}`,
    });
  }

  const recentReleases = wiki.changelog.slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* Hero */}
      <section className="widget-card overflow-hidden">
        <div className="flex flex-col gap-5 p-6 md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              {wiki.designSystem?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={wiki.designSystem.logoUrl}
                  alt={`${wiki.clientName} logo`}
                  className="h-14 w-14 shrink-0 rounded-[10px] border border-[var(--border-1)] bg-white object-contain p-1.5"
                />
              ) : (
                <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[10px] border border-[var(--border-1)] bg-[var(--brand-50)] text-[var(--brand-700)]">
                  <Squares2X2Icon className="h-6 w-6" />
                </span>
              )}
              <div className="min-w-0">
                <p
                  className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-4)]"
                  style={{ fontFamily: MONO }}
                >
                  Knowledge Wiki
                </p>
                <h1
                  className="mt-1 truncate text-2xl text-[var(--text-1)] md:text-3xl"
                  style={{ fontFamily: "var(--font-serif), Georgia, serif" }}
                >
                  {wiki.clientName}
                </h1>
              </div>
            </div>

            {pct !== null && (
              <div className="shrink-0 rounded-[12px] border border-[var(--border-1)] bg-[var(--surface-1)] px-5 py-4 text-center">
                <div
                  className="text-3xl font-semibold text-[var(--brand-700)]"
                  style={{ fontFamily: MONO }}
                >
                  {pct}%
                </div>
                <div
                  className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[var(--text-4)]"
                  style={{ fontFamily: MONO }}
                >
                  Delivery complete
                </div>
              </div>
            )}
          </div>

          {/* Delivery progress bar */}
          {pct !== null && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2,#eee)]">
              <div
                className="h-full rounded-full bg-[var(--brand-600)] transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>
      </section>

      {/* Top-level stats pulled from the active sections */}
      {stats.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <StatCard key={s.label} {...s} />
          ))}
        </div>
      )}

      {/* Section tiles */}
      <h2
        className="mb-3 mt-7 text-[11px] uppercase tracking-[0.12em] text-[var(--text-4)]"
        style={{ fontFamily: MONO }}
      >
        Explore
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((section, i) => {
          const meta = SECTION_META[section];
          const Icon = meta.icon;
          return (
            <button
              key={section}
              type="button"
              onClick={() => onSelect(section)}
              className="group flex flex-col rounded-[12px] border border-[var(--border-1)] bg-white p-5 text-left transition hover:border-[var(--brand-500)] hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.12)]"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] bg-[var(--brand-50)] text-[var(--brand-700)]">
                  <Icon className="h-5 w-5" />
                </span>
                <span
                  className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-4)]"
                  style={{ fontFamily: MONO }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3
                className="mt-4 text-[12px] uppercase tracking-[0.06em] text-[var(--text-1)]"
                style={{ fontFamily: MONO }}
              >
                {meta.label}
              </h3>
              <p className="mt-1 line-clamp-2 text-[13px] text-[var(--text-3)]">
                {sectionSubtitle(section, wiki)}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--brand-700)] opacity-0 transition group-hover:opacity-100">
                Open <ArrowRightIcon className="h-3.5 w-3.5" />
              </span>
            </button>
          );
        })}
      </div>

      {/* Recent updates — a peek at the changelog right on the dashboard */}
      {recentReleases.length > 0 && (
        <div className="mt-7">
          <button
            type="button"
            onClick={() => onSelect("changelog")}
            className="mb-3 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--text-4)] transition hover:text-[var(--text-2)]"
            style={{ fontFamily: MONO }}
          >
            Recent updates <ArrowRightIcon className="h-3 w-3" />
          </button>
          <ul className="divide-y divide-[var(--border-1)] overflow-hidden rounded-[12px] border border-[var(--border-1)] bg-white">
            {recentReleases.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="shrink-0 rounded-[6px] bg-[var(--brand-50)] px-2 py-0.5 text-[11px] font-semibold text-[var(--brand-700)]"
                  style={{ fontFamily: MONO }}
                >
                  v{entry.version}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-1)]">
                  {entry.title}
                </span>
                {entry.releasedAt && (
                  <span className="shrink-0 text-[12px] text-[var(--text-4)]">
                    {formatDate(entry.releasedAt)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tiles.length === 0 && (
        <p className="mt-8 text-center text-sm text-[var(--text-4)]">
          No published sections yet.
        </p>
      )}
    </div>
  );
}
