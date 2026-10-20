"use client";

import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import {
  BanknotesIcon,
  BoltIcon,
  BookOpenIcon,
  CalculatorIcon,
  TableCellsIcon,
  ViewColumnsIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  ChartBarSquareIcon,
  ChartPieIcon,
  CheckIcon,
  ChevronDownIcon,
  PlusIcon,
  CircleStackIcon,
  ClockIcon,
  CodeBracketIcon,
  Cog6ToothIcon,
  CpuChipIcon,
  CubeTransparentIcon,
  DocumentDuplicateIcon,
  DocumentTextIcon,
  FlagIcon,
  GlobeAltIcon,
  LifebuoyIcon,
  NewspaperIcon,
  PresentationChartLineIcon,
  RocketLaunchIcon,
  ServerStackIcon,
  Squares2X2Icon,
  VideoCameraIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import type { WikiSection } from "./wiki-sidebar";
import {
  GROUP_HEADINGS_ABOVE,
  SECTION_BLURB,
  SECTION_GROUP,
  WIKI_SECTION_GROUPS,
  groupAddable,
  isDocPageSection,
  type GroupedWikiSection,
} from "@/lib/wiki-section-groups";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

const SECTION_ICON: Record<WikiSection, IconType> = {
  dashboard: Squares2X2Icon,
  timeline: CalendarDaysIcon,
  monitors: BoltIcon,
  documents: DocumentDuplicateIcon,
  intake: FlagIcon,
  launchpad: RocketLaunchIcon,
  insights: ChartPieIcon,
  costs: BanknotesIcon,
  estimates: CalculatorIcon,
  comparisons: TableCellsIcon,
  sheets: ViewColumnsIcon,
  roundup: NewspaperIcon,
  delivery: ChartBarSquareIcon,
  support: LifebuoyIcon,
  metrics: PresentationChartLineIcon,
  meetings: VideoCameraIcon,
  platforms: GlobeAltIcon,
  "code-handover": CpuChipIcon,
  "design-system": CubeTransparentIcon,
  ia: BookOpenIcon,
  "dev-guide": CodeBracketIcon,
  "api-docs": ServerStackIcon,
  architecture: DocumentTextIcon,
  runbook: WrenchScrewdriverIcon,
  "data-model": CircleStackIcon,
  changelog: ClockIcon,
  "course-requests": FlagIcon,
  "golf-data": ChartBarIcon,
  settings: Cog6ToothIcon,
};

const GROUP_ORDER = Object.keys(SECTION_GROUP) as WikiSection[];

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

/**
 * Compact wiki nav for narrow (mobile) viewports — one button that opens a list of the
 * sections, instead of a sideways-scrolling strip (which on a full wiki was 13+ items wide and
 * hid most of them). Used on the client's share link and on the internal wiki below md.
 *
 * Mirrors the desktop sidebar: the same five groups (headings only on a long list), and the six
 * doc pages as ONE "Docs" entry — the page has tabs between them. The internal wiki also passes
 * `addable`, so "+ Add New" is reachable on a phone.
 */
export function WikiMobileNav({
  sections,
  active,
  titles,
  onSelect,
  addable = [],
  onAdd,
  emptySections = [],
}: {
  sections: WikiSection[];
  active: WikiSection;
  titles: Record<WikiSection, string>;
  onSelect: (section: WikiSection) => void;
  addable?: Array<{ section: WikiSection; label: string }>;
  onAdd?: (section: WikiSection) => void;
  emptySections?: WikiSection[];
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const empty = new Set(emptySections);
  // Doc pages collapse into one entry that opens the one you're on, else the first.
  const docs = sections.filter(isDocPageSection);
  const docsTarget = docs.includes(active as never) ? active : docs[0];
  const rows: { section: WikiSection; label: string; covers: WikiSection[] }[] = [];
  for (const sct of sections) {
    if (isDocPageSection(sct)) {
      if (sct === docs[0]) rows.push({ section: docsTarget, label: "Docs", covers: docs });
      continue;
    }
    rows.push({ section: sct, label: titles[sct], covers: [sct] });
  }
  const isOn = (r: { covers: WikiSection[] }) => r.covers.includes(active);
  const grouped = rows.filter((r) => r.section !== "dashboard" && r.section !== "settings").length > GROUP_HEADINGS_ABOVE;
  const groupOf = (sct: WikiSection) => SECTION_GROUP[sct as GroupedWikiSection] ?? null;
  // Dashboard first, then the groups in sidebar order, then Settings — the desktop order.
  const ordered = grouped
    ? [
        ...rows.filter((r) => r.section === "dashboard"),
        // Within a group, the sidebar's order (the map's key order), not the order sections
        // happen to arrive in — so the phone and desktop lists read the same.
        ...WIKI_SECTION_GROUPS.flatMap((g) =>
          rows
            .filter((r) => groupOf(r.section) === g.id)
            .sort((a, b) => GROUP_ORDER.indexOf(a.section) - GROUP_ORDER.indexOf(b.section)),
        ),
        ...rows.filter((r) => r.section !== "dashboard" && r.section !== "settings" && !groupOf(r.section)),
        ...rows.filter((r) => r.section === "settings"),
      ]
    : rows;

  const activeRow = rows.find(isOn);
  const ActiveIcon = activeRow?.label === "Docs" ? BookOpenIcon : SECTION_ICON[active] ?? Squares2X2Icon;
  const activeTitle = activeRow?.label ?? titles[active];
  const heading = (label: string) => (
    <p
      key={`h-${label}`}
      className="px-3 pb-1 pt-3 text-[var(--text-4)]"
      style={{ fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}
    >
      {label}
    </p>
  );

  let lastGroup: string | null | undefined;
  return (
    <div ref={ref} className="relative py-2">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setAdding(false);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center gap-2.5 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2.5 text-left transition hover:bg-[var(--surface-1)]"
      >
        <ActiveIcon className="h-4 w-4 shrink-0 text-[var(--brand-700)]" />
        <span
          className="min-w-0 flex-1 truncate font-semibold uppercase text-[var(--brand-700)]"
          style={{ fontFamily: MONO, fontSize: "12px", letterSpacing: "0.05em" }}
        >
          {activeTitle}
        </span>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-[var(--text-4)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-[70vh] overflow-y-auto rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] py-1.5 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)]"
        >
          {adding ? (
            <>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-[var(--text-3)] hover:bg-[var(--surface-1)]"
              >
                <ChevronDownIcon className="h-3.5 w-3.5 rotate-90" /> Back to sections
              </button>
              {groupAddable(addable).map((g) => (
                <div key={g.id ?? "other"}>
                  {g.label ? heading(g.label) : null}
                  {g.items.map((item) => (
                    <button
                      key={item.section}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpen(false);
                        setAdding(false);
                        onAdd?.(item.section);
                      }}
                      className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-[var(--surface-1)]"
                    >
                      <span className="text-[13px] text-[var(--text-1)]">{item.label}</span>
                      {SECTION_BLURB[item.section as GroupedWikiSection] ? (
                        <span className="text-[11px] text-[var(--text-4)]">
                          {SECTION_BLURB[item.section as GroupedWikiSection]}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ))}
            </>
          ) : (
            <>
              {ordered.map((r) => {
                const g = grouped && r.section !== "dashboard" && r.section !== "settings" ? groupOf(r.section) : null;
                const head =
                  grouped && g && g !== lastGroup
                    ? heading(WIKI_SECTION_GROUPS.find((x) => x.id === g)?.label ?? g)
                    : null;
                lastGroup = g;
                const Icon = r.label === "Docs" ? BookOpenIcon : SECTION_ICON[r.section] ?? Squares2X2Icon;
                const on = isOn(r);
                const isEmpty = r.covers.every((c) => empty.has(c));
                return (
                  <div key={r.label + r.section}>
                    {head}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpen(false);
                        onSelect(r.section);
                      }}
                      className={[
                        "flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition",
                        on
                          ? "bg-[var(--brand-50)] text-[var(--brand-700)]"
                          : isEmpty
                            ? "text-[var(--text-4)] hover:bg-[var(--surface-1)]"
                            : "text-[var(--text-2)] hover:bg-[var(--surface-1)]",
                      ].join(" ")}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span
                        className="min-w-0 flex-1 truncate uppercase"
                        style={{ fontFamily: MONO, fontSize: "11px", letterSpacing: "0.05em" }}
                      >
                        {r.label}
                      </span>
                      {isEmpty && !on ? (
                        <span className="shrink-0 text-[9px] text-[var(--text-4)]" style={{ fontFamily: MONO, letterSpacing: "0.08em" }}>
                          EMPTY
                        </span>
                      ) : null}
                      {on && <CheckIcon className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  </div>
                );
              })}
              {addable.length > 0 && onAdd ? (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="mt-1 flex w-full items-center gap-2.5 border-t border-[var(--border-1)] px-3 pb-1 pt-3 text-left text-[var(--text-3)] hover:text-[var(--text-1)]"
                >
                  <PlusIcon className="h-4 w-4 shrink-0" />
                  <span className="uppercase" style={{ fontFamily: MONO, fontSize: "11px", letterSpacing: "0.05em" }}>
                    Add New
                  </span>
                </button>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}
