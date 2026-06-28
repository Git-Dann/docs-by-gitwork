"use client";

import type { ComponentType, ReactNode, SVGProps } from "react";
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
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import type { WikiDTO } from "@/lib/api";
import type { WikiSection } from "./wiki-sidebar";

// JetBrains Mono stack — consistent with wiki-workspace / wiki-public-view.
const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

type DocSection = "ia" | "dev-guide" | "api-docs" | "architecture" | "runbook" | "data-model";

const SECTION_META: Record<
  Exclude<WikiSection, "dashboard" | "settings">,
  { label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }
> = {
  timeline: { label: "Timeline", icon: CalendarDaysIcon },
  "design-system": { label: "Brand", icon: CubeTransparentIcon },
  ia: { label: "Information Architecture", icon: BookOpenIcon },
  "dev-guide": { label: "Developer Guide", icon: CodeBracketIcon },
  "api-docs": { label: "API Docs", icon: ServerStackIcon },
  architecture: { label: "Architecture", icon: DocumentTextIcon },
  runbook: { label: "Runbook", icon: WrenchScrewdriverIcon },
  "data-model": { label: "Data Model", icon: CircleStackIcon },
  changelog: { label: "Changelog", icon: ClockIcon },
  "course-requests": { label: "Course Requests", icon: FlagIcon },
};

const SECTION_PAGE_TYPE: Record<DocSection, string> = {
  ia: "IA_GUIDE",
  "dev-guide": "DEV_API_GUIDE",
  "api-docs": "API_DOCS",
  architecture: "ARCHITECTURE",
  runbook: "RUNBOOK",
  "data-model": "DATA_MODEL",
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

/** "3 days ago" / "today" — gentle relative time for "last updated". */
function relativeDate(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const days = Math.floor((Date.now() - then) / 86_400_000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
    return formatDate(iso);
  } catch {
    return "";
  }
}

function nextMilestone(wiki: WikiDTO) {
  const ms = wiki.timeline.milestones;
  if (ms.length === 0) return null;
  const now = Date.now();
  const sorted = [...ms].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return sorted.find((m) => new Date(m.date).getTime() >= now) ?? sorted[sorted.length - 1];
}

function activePhase(wiki: WikiDTO) {
  const blocks = wiki.timeline.blocks;
  if (blocks.length === 0) return null;
  const now = Date.now();
  const inFlight = blocks.find(
    (b) => new Date(b.startDate).getTime() <= now && new Date(b.endDate).getTime() >= now,
  );
  return inFlight ?? blocks.find((b) => b.progress < 100) ?? blocks[blocks.length - 1];
}

/** First meaningful prose line of a markdown doc, for a preview snippet. */
function excerpt(content: unknown): string | null {
  if (typeof content !== "string") return null;
  const line = content
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("|") && !l.startsWith("---"));
  const base = (line ?? "").replace(/[#*`>_]/g, "").trim();
  return base ? (base.length > 130 ? `${base.slice(0, 130)}…` : base) : null;
}

function endpointCount(content: unknown): number | null {
  if (content && typeof content === "object") {
    const eps = (content as { endpoints?: unknown }).endpoints;
    if (Array.isArray(eps)) return eps.length;
  }
  return null;
}

/** A widget tile — a clickable card that surfaces real data from its section. */
function Widget({
  section,
  onSelect,
  children,
  wide,
}: {
  section: WikiSection;
  onSelect: (s: WikiSection) => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const meta = SECTION_META[section as Exclude<WikiSection, "dashboard" | "settings">];
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(section)}
      className={[
        "group flex flex-col rounded-[14px] border border-[var(--border-1)] bg-white p-5 text-left transition hover:border-[var(--brand-500)] hover:shadow-[0_10px_28px_-10px_rgba(0,0,0,0.14)]",
        wide ? "sm:col-span-2" : "",
      ].join(" ")}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] bg-[var(--brand-50)] text-[var(--brand-700)]">
            <Icon className="h-5 w-5" />
          </span>
          <span
            className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-2)]"
            style={{ fontFamily: MONO }}
          >
            {meta.label}
          </span>
        </div>
        <ArrowRightIcon className="h-4 w-4 text-[var(--text-4)] opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
      </div>
      <div className="flex-1">{children}</div>
    </button>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold leading-none text-[var(--text-1)]">{value}</div>
      <div
        className="mt-1 text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]"
        style={{ fontFamily: MONO }}
      >
        {label}
      </div>
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
  const sections = availableSections.filter(
    (s): s is Exclude<WikiSection, "dashboard" | "settings"> =>
      s !== "dashboard" && s !== "settings",
  );

  const pct = overallProgress(wiki);
  const phase = activePhase(wiki);
  const milestone = nextMilestone(wiki);
  const swatches = wiki.designSystem
    ? [
        ...(wiki.designSystem.tokens.colours?.primary ?? []),
        ...(wiki.designSystem.tokens.colours?.secondary ?? []),
        ...(wiki.designSystem.tokens.colours?.neutrals ?? []),
      ]
        .map((c) => c?.hex)
        .filter((h): h is string => Boolean(h))
        .slice(0, 8)
    : [];

  function docPage(section: DocSection) {
    const type = SECTION_PAGE_TYPE[section];
    return wiki.pages.find((p) => p.type === type) ?? null;
  }

  // Each section renders something real from its page — so the dashboard is a
  // live top-level summary, and any new section automatically contributes here.
  function widgetBody(section: Exclude<WikiSection, "dashboard" | "settings">): ReactNode {
    switch (section) {
      case "timeline": {
        return (
          <div className="space-y-3">
            {pct !== null && (
              <div>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-2xl font-semibold leading-none text-[var(--text-1)]">
                    {pct}%
                  </span>
                  <span className="text-[11px] text-[var(--text-4)]">
                    {wiki.timeline.blocks.length} phase
                    {wiki.timeline.blocks.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2,#eee)]">
                  <div
                    className="h-full rounded-full bg-[var(--brand-600)]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}
            {phase && (
              <p className="text-[13px] text-[var(--text-2)]">
                <span className="text-[var(--text-4)]">Now:</span> {phase.name}
              </p>
            )}
            {milestone && (
              <p className="text-[13px] text-[var(--text-2)]">
                <span className="text-[var(--text-4)]">Next:</span> {milestone.name} ·{" "}
                {formatDate(milestone.date)}
              </p>
            )}
            {pct === null && !phase && (
              <p className="text-[13px] text-[var(--text-4)]">Project roadmap & phases.</p>
            )}
          </div>
        );
      }
      case "design-system": {
        const ds = wiki.designSystem?.tokens;
        return (
          <div className="space-y-3">
            {swatches.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {swatches.map((hex, i) => (
                  <span
                    key={`${hex}-${i}`}
                    className="h-6 w-6 rounded-[6px] border border-[rgba(0,0,0,0.08)]"
                    style={{ backgroundColor: hex }}
                    title={hex}
                  />
                ))}
              </div>
            )}
            <p className="text-[13px] text-[var(--text-3)]">
              {ds?.brandVoice
                ? ds.brandVoice
                : ds?.typography?.displayFont
                  ? `${ds.typography.displayFont} · ${ds.typography.bodyFont}`
                  : "Brand colours, type & components"}
            </p>
          </div>
        );
      }
      case "changelog": {
        const latest = wiki.changelog[0];
        return (
          <div className="space-y-2">
            {latest ? (
              <>
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-[6px] bg-[var(--brand-50)] px-2 py-0.5 text-[12px] font-semibold text-[var(--brand-700)]"
                    style={{ fontFamily: MONO }}
                  >
                    v{latest.version}
                  </span>
                  <span className="text-[12px] text-[var(--text-4)]">
                    {latest.releasedAt ? formatDate(latest.releasedAt) : "Latest"}
                  </span>
                </div>
                <p className="line-clamp-2 text-[13px] text-[var(--text-2)]">{latest.title}</p>
                <p className="text-[11px] text-[var(--text-4)]">
                  {wiki.changelog.length} release{wiki.changelog.length === 1 ? "" : "s"}
                </p>
              </>
            ) : (
              <p className="text-[13px] text-[var(--text-4)]">Release notes.</p>
            )}
          </div>
        );
      }
      case "course-requests": {
        const reqs = wiki.courseRequests;
        const open = reqs.filter((r) => r.status === "NEW").length;
        return (
          <div className="flex items-end gap-6">
            <Metric value={String(open)} label="New" />
            <Metric value={String(reqs.length)} label="Total" />
          </div>
        );
      }
      case "api-docs": {
        const page = docPage("api-docs");
        const n = endpointCount(page?.content);
        return (
          <div className="space-y-1.5">
            {n !== null ? (
              <Metric value={String(n)} label="Endpoints" />
            ) : (
              <p className="text-[13px] text-[var(--text-3)]">REST API reference.</p>
            )}
            {page?.updatedAt && (
              <p className="text-[11px] text-[var(--text-4)]">
                Updated {relativeDate(page.updatedAt)}
              </p>
            )}
          </div>
        );
      }
      default: {
        // Markdown doc sections (ia / dev-guide / architecture / runbook / data-model)
        const page = docPage(section as DocSection);
        const snippet = excerpt(page?.content);
        return (
          <div className="space-y-1.5">
            <p className="line-clamp-2 text-[13px] text-[var(--text-3)]">
              {snippet ?? "Documentation."}
            </p>
            {page?.updatedAt && (
              <p className="text-[11px] text-[var(--text-4)]">
                Updated {relativeDate(page.updatedAt)}
              </p>
            )}
          </div>
        );
      }
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* Hero */}
      <section className="widget-card overflow-hidden">
        <div className="flex flex-col gap-5 p-6 md:p-8">
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

          {/* Honest progress readout — what's done vs. the plan, not "complete". */}
          {pct !== null && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span
                  className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-4)]"
                  style={{ fontFamily: MONO }}
                >
                  Project progress
                </span>
                <span className="text-[12px] font-medium text-[var(--text-2)]">
                  {pct}%{phase ? ` · ${phase.name}` : ""}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2,#eee)]">
                <div
                  className="h-full rounded-full bg-[var(--brand-600)] transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Section widgets — one per page, each showing live data */}
      {sections.length > 0 ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => (
            <Widget
              key={section}
              section={section}
              onSelect={onSelect}
              wide={section === "timeline"}
            >
              {widgetBody(section)}
            </Widget>
          ))}
        </div>
      ) : (
        <p className="mt-8 text-center text-sm text-[var(--text-4)]">
          No published sections yet.
        </p>
      )}
    </div>
  );
}
