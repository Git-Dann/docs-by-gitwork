"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ComponentType, ReactNode, SVGProps } from "react";
import {
  BookOpenIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  CircleStackIcon,
  ClockIcon,
  CodeBracketIcon,
  CpuChipIcon,
  CubeTransparentIcon,
  DocumentTextIcon,
  FlagIcon,
  ServerStackIcon,
  BoltIcon,
  DocumentDuplicateIcon,
  WrenchScrewdriverIcon,
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  Squares2X2Icon,
  GlobeAltIcon,
  UserIcon,
  EnvelopeIcon,
  PhoneIcon,
} from "@heroicons/react/24/outline";
import type { WikiDTO } from "@/lib/api";
import type { WikiSection } from "./wiki-sidebar";

// JetBrains Mono stack — consistent with wiki-workspace / wiki-public-view.
const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";
// Editorial serif — Fraunces (Gitwork parent brand), falling back to the app's
// DM Serif. Used for the hero name + pull-out stat figures per the Gitwork brand
// guide, paired with mono labels (the DESIGN.md data signature).
const SERIF = "var(--font-fraunces), var(--font-display), 'Times New Roman', Georgia, serif";
// Playfair Display italic — the Gitwork brand-guide "step numeral" motif, used as
// a faint editorial index on each widget card.
const PLAYFAIR = "var(--font-playfair), var(--font-fraunces), Georgia, serif";

type DocSection = "ia" | "dev-guide" | "api-docs" | "architecture" | "runbook" | "data-model";

const SECTION_META: Record<
  Exclude<WikiSection, "dashboard" | "settings">,
  { label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }
> = {
  timeline: { label: "Timeline", icon: CalendarDaysIcon },
  monitors: { label: "Monitors", icon: BoltIcon },
  documents: { label: "Documents", icon: DocumentDuplicateIcon },
  intake: { label: "Requests", icon: FlagIcon },
  "code-handover": { label: "Code Handover", icon: CpuChipIcon },
  "design-system": { label: "Brand", icon: CubeTransparentIcon },
  ia: { label: "Information Architecture", icon: BookOpenIcon },
  "dev-guide": { label: "Developer Guide", icon: CodeBracketIcon },
  "api-docs": { label: "API Docs", icon: ServerStackIcon },
  architecture: { label: "Architecture", icon: DocumentTextIcon },
  runbook: { label: "Runbook", icon: WrenchScrewdriverIcon },
  "data-model": { label: "Data Model", icon: CircleStackIcon },
  changelog: { label: "Changelog", icon: ClockIcon },
  "course-requests": { label: "Course Requests", icon: FlagIcon },
  "golf-data": { label: "Golf Data", icon: ChartBarIcon },
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

function normalizeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function displayHost(url: string): string {
  try {
    return new URL(normalizeUrl(url)).host.replace(/^www\./, "");
  } catch {
    return url;
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

const ROMAN_NUMERALS: [number, string][] = [
  [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"],
  [100, "c"], [90, "xc"], [50, "l"], [40, "xl"],
  [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
];

/** Lowercase roman numeral — the editorial section marker (i., ii., iii. …). */
function toRomanLower(n: number): string {
  let num = n;
  let result = "";
  for (const [value, symbol] of ROMAN_NUMERALS) {
    while (num >= value) {
      result += symbol;
      num -= value;
    }
  }
  return result;
}

/** A widget tile — a clickable card that surfaces real data from its section. */
function Widget({
  section,
  onSelect,
  children,
  wide,
  numeral,
}: {
  section: WikiSection;
  onSelect: (s: WikiSection) => void;
  children: ReactNode;
  wide?: boolean;
  numeral?: string;
}) {
  const meta = SECTION_META[section as Exclude<WikiSection, "dashboard" | "settings">];
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(section)}
      className={[
        "group relative flex flex-col overflow-hidden rounded-[14px] border border-[var(--border-1)] bg-[var(--surface-0)] p-5 text-left transition hover:border-[var(--brand-500)] hover:shadow-[0_10px_28px_-10px_rgba(0,0,0,0.14)]",
        wide ? "sm:col-span-2" : "",
      ].join(" ")}
    >
      <div className="relative mb-3 flex items-center gap-2">
        {/* Editorial step numeral (Playfair italic) — a real section marker,
            echoing the Gitwork brand guide's "i. ii. iii." motif. */}
        {numeral && (
          <span
            aria-hidden
            className="text-[15px] text-[var(--brand-600)]"
            style={{ fontFamily: PLAYFAIR, fontStyle: "italic", fontWeight: 500 }}
          >
            {numeral}.
          </span>
        )}
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] bg-[var(--brand-50)] text-[var(--brand-700)]">
          <Icon className="h-5 w-5" />
        </span>
        <span
          className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-2)]"
          style={{ fontFamily: MONO }}
        >
          {meta.label}
        </span>
        <ArrowRightIcon className="ml-auto h-4 w-4 text-[var(--text-4)] opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
      </div>
      <div className="relative flex-1">{children}</div>
    </button>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div
        className="text-[38px] leading-none text-[var(--text-1)]"
        style={{ fontFamily: SERIF, fontWeight: 600, letterSpacing: "-0.01em" }}
      >
        {value}
      </div>
      <div
        className="mt-2 text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]"
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
  const activeMonitors = wiki.monitors.monitors.filter((m) => m.enabled);
  const monitorSeverity: Record<string, number> = { UP: 0, UNKNOWN: 1, DEGRADED: 2, DOWN: 3 };
  const worstMonitor = activeMonitors.reduce<string | null>(
    (worst, m) => (worst == null || monitorSeverity[m.status] > monitorSeverity[worst] ? m.status : worst),
    null,
  );

  const sections = availableSections
    .filter(
      (s): s is Exclude<WikiSection, "dashboard" | "settings"> =>
        s !== "dashboard" && s !== "settings",
    )
    // The status card only appears once at least one system is tracked — no
    // page/content means the button stays hidden.
    .filter((s) => s !== "monitors" || activeMonitors.length > 0)
    .filter((s) => s !== "documents" || wiki.documents.documents.length > 0);

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
                  <span className="text-[38px] leading-none text-[var(--text-1)]" style={{ fontFamily: SERIF, fontWeight: 600, letterSpacing: "-0.01em" }}>
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
      case "monitors": {
        const M: Record<string, { label: string; color: string }> = {
          UP: { label: "All systems operational", color: "#059669" },
          DEGRADED: { label: "Some systems degraded", color: "#b45309" },
          DOWN: { label: "Service disruption", color: "#e11d48" },
          UNKNOWN: { label: "Monitoring pending", color: "#6b7280" },
        };
        const meta = M[worstMonitor ?? "UNKNOWN"];
        const up = activeMonitors.filter((m) => m.status === "UP").length;
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
              <span className="text-[14px] font-semibold" style={{ color: meta.color }}>
                {meta.label}
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-4)]">
              {up}/{activeMonitors.length} up · {activeMonitors.length} monitor
              {activeMonitors.length === 1 ? "" : "s"}
            </p>
          </div>
        );
      }
      case "documents": {
        const docs = wiki.documents.documents;
        return (
          <div className="space-y-1.5">
            <Metric value={String(docs.length)} label={docs.length === 1 ? "Document" : "Documents"} />
            {docs[0] && (
              <p className="truncate text-[12px] text-[var(--text-4)]">Latest: {docs[0].title}</p>
            )}
          </div>
        );
      }
      case "intake": {
        const items = wiki.intakeItems;
        const open = items.filter((r) => r.status === "NEW" || r.status === "TRIAGED").length;
        return items.length > 0 ? (
          <div className="flex items-end gap-6">
            <Metric value={String(open)} label="Open" />
            <Metric value={String(items.length)} label="Total" />
          </div>
        ) : (
          <p className="text-[13px] text-[var(--text-4)]">No requests submitted yet.</p>
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
      case "golf-data": {
        const reqs = wiki.courseRequests;
        const added = reqs.filter((r) => r.status === "ADDED").length;
        return (
          <div className="flex items-end gap-6">
            <Metric value={String(added)} label="Live courses" />
            <Metric value="3" label="Providers" />
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

  const teamCount = wiki.productTeam.length + wiki.team.length;
  const footerStats = buildFooterStats(wiki, activeMonitors, worstMonitor);

  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* Masthead — a fixed-navy editorial band (the client's front door), always
          dark regardless of the app theme, so every colour here is hardcoded
          rather than pulled from the light/dark `--text-*`/`--surface-*` tokens. */}
      <section className="rounded-[14px] bg-[#0F172A] p-6 md:p-9">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="flex min-w-0 items-start gap-4">
              {wiki.designSystem?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={wiki.designSystem.logoUrl}
                  alt={`${wiki.clientName} logo`}
                  className="mt-1 h-12 w-12 shrink-0 overflow-hidden rounded-[10px] border border-white/10 bg-white object-cover"
                />
              ) : (
                <span className="mt-1 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.06] text-white/70">
                  <Squares2X2Icon className="h-6 w-6" />
                </span>
              )}
              <div className="min-w-0">
                <p
                  className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50"
                  style={{ fontFamily: MONO }}
                >
                  Knowledge Wiki
                </p>
                <h1
                  className="mt-1.5 break-words pb-1 text-[40px] leading-[1.12] text-white md:text-[52px]"
                  style={{ fontFamily: SERIF, fontWeight: 600, letterSpacing: "-0.02em" }}
                >
                  {wiki.clientName}
                  <span className="text-[var(--brand-400)]">.</span>
                </h1>
                <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-white/60">
                  Everything about your project — timeline, docs, code and the
                  team behind it — in one place.
                </p>
              </div>
            </div>

            {/* Teams — stacked avatars with a name + italic-bio tooltip on
                hover. Product (account leads) above Delivery (the devs). */}
            {(wiki.productTeam.length > 0 || wiki.team.length > 0) && (
              <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                <span
                  className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35"
                  style={{ fontFamily: MONO }}
                >
                  Team · {teamCount}
                </span>
                {wiki.productTeam.length > 0 && (
                  <TeamStack label="Product" members={wiki.productTeam} />
                )}
                {wiki.team.length > 0 && (
                  <TeamStack label="Delivery" members={wiki.team} />
                )}
              </div>
            )}
          </div>

          {/* Portal client info — website + primary contact */}
          {(wiki.website || wiki.contact) && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
              {wiki.website && (
                <a
                  href={normalizeUrl(wiki.website)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-white/70 transition hover:text-white"
                >
                  <GlobeAltIcon className="h-4 w-4 text-white/40" />
                  {displayHost(wiki.website)}
                </a>
              )}
              {wiki.contact?.name && (
                <span className="inline-flex items-center gap-1.5 text-white/70">
                  <UserIcon className="h-4 w-4 text-white/40" />
                  {wiki.contact.name}
                </span>
              )}
              {wiki.contact?.email && (
                <a
                  href={`mailto:${wiki.contact.email}`}
                  className="inline-flex items-center gap-1.5 text-white/70 transition hover:text-white"
                >
                  <EnvelopeIcon className="h-4 w-4 text-white/40" />
                  {wiki.contact.email}
                </a>
              )}
              {wiki.contact?.phone && (
                <a
                  href={`tel:${wiki.contact.phone}`}
                  className="inline-flex items-center gap-1.5 text-white/70 transition hover:text-white"
                >
                  <PhoneIcon className="h-4 w-4 text-white/40" />
                  {wiki.contact.phone}
                </a>
              )}
            </div>
          )}

          {/* Quick links — the featured platform's production + staging URLs. */}
          {wiki.headerLinks &&
            (wiki.headerLinks.productionUrl || wiki.headerLinks.stagingUrl) && (
              <div className="flex flex-wrap items-center gap-2">
                {wiki.headerLinks.productionUrl && (
                  <a
                    href={normalizeUrl(wiki.headerLinks.productionUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-[8px] bg-[var(--brand-600)] px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-[var(--brand-700)]"
                  >
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                    Production
                  </a>
                )}
                {wiki.headerLinks.stagingUrl && (
                  <a
                    href={normalizeUrl(wiki.headerLinks.stagingUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-[8px] border border-white/15 bg-white/[0.06] px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-white/10"
                  >
                    <ArrowTopRightOnSquareIcon className="h-4 w-4 text-white/60" />
                    Staging
                  </a>
                )}
              </div>
            )}
        </div>
      </section>

      {sections.length > 0 && (
        <>
          {/* Section widgets — one per page, each showing live data. Auto-fit
              columns (not a fixed 1/2/3 breakpoint grid) so a trailing row
              with fewer cards than columns stretches to fill the width
              instead of leaving a dangling gap; `items-start` lets each card
              size to its own content instead of stretching to match a taller
              sibling (e.g. the wide Timeline card) in the same row. */}
          <div
            className="mt-4 grid items-start gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}
          >
            {sections.map((section, i) => (
              <Widget
                key={section}
                section={section}
                onSelect={onSelect}
                wide={section === "timeline"}
                numeral={toRomanLower(i + 1)}
              >
                {widgetBody(section)}
              </Widget>
            ))}
          </div>

          {/* Closing stat band — bookends the masthead, mirroring the Gitwork
              brand guide's "our standard" close. Only real, available data. */}
          {footerStats.length > 0 && (
            <section className="mt-4 rounded-[14px] bg-[#0F172A] p-6 md:p-8">
              <p
                className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50"
                style={{ fontFamily: MONO }}
              >
                Project overview
              </p>
              {/* No max-width — the previous `max-w-lg` cap forced a wrap to
                  two lines despite the band having plenty of room to spare. */}
              <h2
                className="mt-2 text-[22px] leading-snug text-white md:text-[26px]"
                style={{ fontFamily: SERIF, fontWeight: 600 }}
              >
                Everything about {wiki.clientName}, ready when you need it.
              </h2>
              <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-4">
                {footerStats.map((stat) => (
                  <div key={stat.label}>
                    <div
                      className="text-[26px] leading-none"
                      style={{
                        fontFamily: SERIF,
                        fontWeight: 600,
                        color: stat.color ?? "#ffffff",
                      }}
                    >
                      {stat.value}
                    </div>
                    <div
                      className="mt-1.5 text-[9.5px] uppercase tracking-[0.1em] text-white/45"
                      style={{ fontFamily: MONO }}
                    >
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {sections.length === 0 && (
        <p className="mt-8 text-center text-sm text-[var(--text-4)]">
          No published sections yet.
        </p>
      )}
    </div>
  );
}

/**
 * Real, available data only — a stat is omitted rather than shown as
 * zero/empty. Completion % and team size render elsewhere (the timeline
 * card and the masthead's team stack, respectively) so they're not
 * duplicated here.
 */
function buildFooterStats(
  wiki: WikiDTO,
  activeMonitors: WikiDTO["monitors"]["monitors"],
  worstMonitor: string | null,
): { value: string; label: string; color?: string }[] {
  const stats: { value: string; label: string; color?: string }[] = [];
  if (wiki.documents.documents.length > 0) {
    stats.push({
      value: String(wiki.documents.documents.length),
      label: wiki.documents.documents.length === 1 ? "Document" : "Documents",
    });
  }
  if (activeMonitors.length > 0) {
    const STATUS: Record<string, { value: string; color?: string }> = {
      UP: { value: "Up", color: "#4ADE80" },
      DEGRADED: { value: "Degraded", color: "#FBBF24" },
      DOWN: { value: "Down", color: "#F87171" },
      UNKNOWN: { value: "—" },
    };
    const s = STATUS[worstMonitor ?? "UNKNOWN"];
    stats.push({ value: s.value, label: "All systems", color: s.color });
  }
  return stats;
}

/**
 * Avatar + hover tooltip. The tooltip is rendered in a portal to document.body
 * (position: fixed) so it always sits above the masthead and any other card,
 * and is clamped to the viewport so long names never run off-screen.
 */
function AvatarWithTooltip({ member }: { member: WikiDTO["team"][number] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ cx: number; top: number } | null>(null);

  const show = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAnchor({ cx: r.left + r.width / 2, top: r.top });
  };
  const hide = () => setAnchor(null);

  return (
    <div
      ref={ref}
      className="relative"
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <TeamAvatar name={member.name} initials={member.initials} avatarUrl={member.avatarUrl} />
      {anchor && <MemberTooltip anchor={anchor} name={member.name} bio={member.bio} />}
    </div>
  );
}

function MemberTooltip({
  anchor,
  name,
  bio,
}: {
  anchor: { cx: number; top: number };
  name: string;
  bio: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(anchor.cx);

  // Keep the centred tooltip fully on-screen (clamp its half-width to the viewport).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const half = el.offsetWidth / 2;
    const margin = 8;
    setLeft(Math.max(margin + half, Math.min(anchor.cx, window.innerWidth - margin - half)));
  }, [anchor.cx]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      style={{ position: "fixed", left, top: anchor.top - 8, transform: "translate(-50%, -100%)" }}
      className="pointer-events-none z-[100] rounded-md bg-[var(--text-1)] px-2.5 py-1.5 text-center shadow-lg"
    >
      <span className="block whitespace-nowrap text-[11px] font-medium text-[var(--surface-0)]">{name}</span>
      {bio && <span className="mt-0.5 block text-[10px] italic text-[var(--surface-0)]/70">{bio}</span>}
    </div>,
    document.body,
  );
}

/** Renders inside the fixed-navy masthead — colours are hardcoded, not the
 * light/dark `--text-*`/`--surface-*` tokens, since this band never flips. */
function TeamStack({ label, members }: { label: string; members: WikiDTO["team"] }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/40"
        style={{ fontFamily: MONO }}
      >
        {label}
      </span>
      <div className="flex -space-x-2">
        {members.slice(0, 6).map((m, i) => (
          <AvatarWithTooltip key={i} member={m} />
        ))}
        {members.length > 6 && (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white/80 ring-2 ring-[#0F172A]">
            +{members.length - 6}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Stacked team avatar. Falls back to initials when the avatar URL is missing OR
 * fails to load — some dev avatars are auth-gated (Google/Drive) or stale URLs
 * that 404 for anonymous public viewers, which otherwise renders a broken image.
 */
function TeamAvatar({
  name,
  initials,
  avatarUrl,
}: {
  name: string;
  initials: string;
  avatarUrl: string | null;
}) {
  const [failed, setFailed] = useState(false);
  if (avatarUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setFailed(true)}
        className="h-8 w-8 rounded-full object-cover ring-2 ring-[#0F172A]"
      />
    );
  }
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(59,130,246,0.22)] text-[11px] font-semibold text-[#BFDBFE] ring-2 ring-[#0F172A]">
      {initials}
    </span>
  );
}
