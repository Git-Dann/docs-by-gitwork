"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowsPointingOutIcon,
  Bars3Icon,
  EllipsisHorizontalIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PrinterIcon,
  XMarkIcon,
  ArrowUturnLeftIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { fuzzySearch } from "@/lib/fuzzy-search";
import { menuItem, menuPanel } from "@/components/ui/menu-styles";
import {
  CHAPTERS,
  EDITABLE_FIELDS,
  GUIDELINES_SOURCE_URL,
  GUIDELINES_VERSION,
  PAGES,
  PAGE_COUNT,
  fieldText,
  overrideKey,
  pageNumber,
  type EditableField,
  type GuidelineOverrides,
  type GuidelinePage,
} from "@/lib/guidelines/content";
import { GitworkWordmark } from "./brand-marks";
import { GuideProvider } from "./guide-context";
import { SlideFrame } from "./slide-frame";
import { GuidelineSlide } from "./slides";
import "./guidelines.css";

type SaveState = "idle" | "saving" | "saved" | "error";

/** What the sidebar and breadcrumb call a page. The cover's title is a headline, not a name. */
function navTitle(overrides: GuidelineOverrides, page: GuidelinePage): string {
  if (page.kind === "cover") return "Cover";
  if (page.kind === "chapter") return "Chapter cover";
  return fieldText(overrides, page, "title");
}

/**
 * The Gitwork brand guidelines: a sidebar of chapters, a top bar that always says where you are,
 * and every page as a 16:9 slide, stacked so the whole book scrolls. Present mode shows one slide
 * at a time, full screen.
 *
 * Editing is deliberately out of the way: admins switch it on from the ⋯ menu (or E), every line
 * of copy becomes editable in place, and each change saves for the whole workspace.
 */
export function GuidelinesViewer({
  initialOverrides,
  canEdit,
}: {
  initialOverrides: GuidelineOverrides;
  canEdit: boolean;
}) {
  const [overrides, setOverrides] = useState<GuidelineOverrides>(initialOverrides);
  const [editing, setEditing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [current, setCurrent] = useState(0);
  const [presenting, setPresenting] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLElement | null)[]>([]);
  // Two copies of the sidebar exist (the desktop rail and the phone drawer), so two search boxes.
  const railSearch = useRef<HTMLInputElement>(null);
  const drawerSearch = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(overrides);
  latest.current = overrides;

  const placed = PAGES[current];

  // ── Navigation ────────────────────────────────────────────────────────────

  const goToIndex = useCallback((index: number, smooth = true) => {
    const i = Math.max(0, Math.min(PAGE_COUNT - 1, index));
    setCurrent(i);
    slideRefs.current[i]?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  }, []);

  const goTo = useCallback(
    (pageId: string) => {
      const found = PAGES.find((p) => p.page.id === pageId);
      if (!found) return;
      setDrawer(false);
      goToIndex(found.index);
    },
    [goToIndex],
  );

  // Open on the page named in the URL, if any.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    const found = PAGES.find((p) => p.page.id === id);
    if (found) requestAnimationFrame(() => goToIndex(found.index, false));
  }, [goToIndex]);

  // The page in view is the last one whose top has passed a line a third of the way down.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const line = el.getBoundingClientRect().top + el.clientHeight / 3;
        let next = 0;
        slideRefs.current.forEach((node, i) => {
          if (node && node.getBoundingClientRect().top <= line) next = i;
        });
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) next = PAGE_COUNT - 1;
        setCurrent(next);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Keep the address bar on the current page, so a copied URL opens where you are.
  useEffect(() => {
    const id = PAGES[current]?.page.id;
    if (id && window.location.hash.slice(1) !== id) {
      window.history.replaceState(null, "", `#${id}`);
    }
  }, [current]);

  // ── Saving edits ──────────────────────────────────────────────────────────

  const persist = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        const res = await fetch("/api/guidelines", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ overrides: latest.current }),
        });
        if (!res.ok) throw new Error(String(res.status));
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 500);
  }, []);

  const setField = useCallback(
    (page: GuidelinePage, field: EditableField, value: string) => {
      setOverrides((prev) => {
        const next = { ...prev };
        const key = overrideKey(page.id, field);
        // Empty, or the default typed back in: that is not an edit, so do not store one.
        if (!value || value === (page[field] ?? "")) delete next[key];
        else next[key] = value;
        latest.current = next;
        return next;
      });
      persist();
    },
    [persist],
  );

  const resetPage = useCallback(
    (page: GuidelinePage) => {
      setOverrides((prev) => {
        const next = { ...prev };
        for (const f of EDITABLE_FIELDS[page.kind]) delete next[overrideKey(page.id, f)];
        latest.current = next;
        return next;
      });
      persist();
    },
    [persist],
  );

  const resetAll = useCallback(() => {
    if (!window.confirm("Reset every edit in the guidelines to the original copy? This changes it for everyone.")) return;
    setOverrides({});
    latest.current = {};
    persist();
  }, [persist]);

  const pageHasEdits = (page: GuidelinePage) =>
    EDITABLE_FIELDS[page.kind].some((f) => overrideKey(page.id, f) in overrides);
  const editCount = Object.keys(overrides).length;

  // ── Keyboard ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || (presenting && e.key === " ")) {
        e.preventDefault();
        goToIndex(current + 1, !presenting);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goToIndex(current - 1, !presenting);
      } else if (e.key === "/" && !presenting) {
        e.preventDefault();
        if (window.matchMedia("(min-width: 1024px)").matches) {
          railSearch.current?.focus();
        } else {
          setDrawer(true);
          requestAnimationFrame(() => drawerSearch.current?.focus());
        }
      } else if (e.key === "Escape") {
        if (presenting) setPresenting(false);
        else if (editing) setEditing(false);
        setDrawer(false);
      } else if (e.key.toLowerCase() === "e" && canEdit && !presenting) {
        setEditing((v) => !v);
      } else if (e.key.toLowerCase() === "p") {
        setPresenting((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, presenting, editing, canEdit, goToIndex]);

  // Returning from present mode lands on the slide you were presenting.
  useEffect(() => {
    if (!presenting) slideRefs.current[current]?.scrollIntoView({ block: "start" });
    // Only when the mode flips, not on every page change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenting]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/guidelines#${placed.page.id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard refused: the address bar already holds the link */
    }
  }

  const context = useMemo(
    () => ({ overrides, editing: editing && canEdit, setField, goTo }),
    [overrides, editing, canEdit, setField, goTo],
  );

  const results = useMemo(
    () =>
      query.trim()
        ? fuzzySearch(PAGES, query, (p) => [p.page.title, p.page.subtitle, p.chapter.title, p.page.keywords, fieldText(overrides, p.page, "note")])
        : [],
    [query, overrides],
  );

  const sidebar = (searchRef: React.RefObject<HTMLInputElement | null>) => (
    <Sidebar
      currentIndex={current}
      query={query}
      setQuery={setQuery}
      results={results}
      searchRef={searchRef}
      onPick={goTo}
      overrides={overrides}
    />
  );

  return (
    <GuideProvider value={context}>
      {/* fixed inset-0, not h-[100dvh]: the deck owns the window, so it must fill it exactly
          whatever the browser reports for the viewport height. */}
      <div className="gl-root fixed inset-0 flex overflow-hidden bg-[#F4F2EE] text-[#1A1A1E]">
        {/* Sidebar, desktop */}
        <aside className="gl-print-hide hidden w-[264px] shrink-0 border-r border-[rgba(12,12,24,0.08)] bg-[#FBFAF8] lg:flex lg:flex-col">
          {sidebar(railSearch)}
        </aside>

        {/* Sidebar, phone and tablet */}
        {drawer ? (
          <div className="gl-print-hide fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Contents">
            <button type="button" aria-label="Close contents" className="absolute inset-0 bg-[rgba(12,12,24,0.35)]" onClick={() => setDrawer(false)} />
            <div className="absolute inset-y-0 left-0 flex w-[min(300px,86vw)] flex-col bg-[#FBFAF8] shadow-[0_12px_32px_-4px_rgba(0,0,0,0.25)]">
              <div className="flex justify-end px-2 pt-2">
                <button type="button" onClick={() => setDrawer(false)} aria-label="Close" className="rounded-[6px] p-2 text-[#6B6B6B] hover:bg-[rgba(12,12,24,0.05)]">
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
              {sidebar(drawerSearch)}
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <header className="gl-print-hide relative shrink-0 border-b border-[rgba(12,12,24,0.08)] bg-[#FBFAF8]">
            <div className="flex h-14 items-center gap-2 px-3 sm:px-5">
              <button
                type="button"
                onClick={() => setDrawer(true)}
                aria-label="Open contents"
                className="rounded-[6px] p-2 text-[#1A1A1E] hover:bg-[rgba(12,12,24,0.05)] lg:hidden"
              >
                <Bars3Icon className="h-5 w-5" />
              </button>
              <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-2 text-[13.5px]">
                <button
                  type="button"
                  onClick={() => goTo(placed.chapter.pages[0].id)}
                  className="hidden shrink-0 text-[#6B6B6B] hover:text-[#1A1A1E] sm:inline"
                >
                  {placed.chapter.number} {placed.chapter.title}
                </button>
                <span aria-hidden className="hidden text-[#B5B1A9] sm:inline">
                  /
                </span>
                <span className="truncate font-medium" title={navTitle(overrides, placed.page)}>
                  {navTitle(overrides, placed.page)}
                </span>
              </nav>

              {editing && canEdit ? (
                <div className="hidden items-center gap-2 rounded-[6px] bg-[rgba(107,82,255,0.10)] px-2.5 py-1 sm:flex">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5B43E8]">
                    Editing
                  </span>
                  <span className="font-mono text-[11px] text-[#6B6B6B]">
                    {saveState === "saving" ? "Saving…" : saveState === "error" ? "Couldn't save" : saveState === "saved" ? "Saved" : "Click any text"}
                  </span>
                  <button type="button" onClick={() => setEditing(false)} className="ml-1 rounded-[4px] px-1.5 text-[12px] font-semibold text-[#5B43E8] hover:bg-[rgba(107,82,255,0.12)]">
                    Done
                  </button>
                </div>
              ) : null}

              <a
                href={GUIDELINES_SOURCE_URL}
                target="_blank"
                rel="noopener noreferrer"
                title="The Gitwork design system these guidelines are built from"
                className="hidden shrink-0 items-center gap-1.5 rounded-[6px] px-2 py-1 text-[12.5px] text-[#6B6B6B] transition hover:bg-[rgba(12,12,24,0.05)] hover:text-[#1A1A1E] md:flex"
              >
                Design system
                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
              </a>
              <span className="shrink-0 font-mono text-[12px] tracking-[0.06em] text-[#6B6B6B]" aria-live="polite">
                p. {pageNumber(current)} / {pageNumber(PAGE_COUNT - 1)}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <NavButton label="Previous page" onClick={() => goToIndex(current - 1)} disabled={current === 0}>
                  <ArrowLeftIcon className="h-4 w-4" />
                </NavButton>
                <NavButton label="Next page" onClick={() => goToIndex(current + 1)} disabled={current === PAGE_COUNT - 1}>
                  <ArrowRightIcon className="h-4 w-4" />
                </NavButton>
              </div>

              <Menu>
                <MenuButton
                  aria-label="More options"
                  className="shrink-0 rounded-[6px] p-2 text-[#6B6B6B] hover:bg-[rgba(12,12,24,0.05)] hover:text-[#1A1A1E] data-[open]:bg-[rgba(12,12,24,0.05)]"
                >
                  <EllipsisHorizontalIcon className="h-5 w-5" />
                </MenuButton>
                <MenuItems anchor="bottom end" className={cn(menuPanel, "w-[240px]")}>
                  <MenuItem>
                    <button type="button" className={menuItem} onClick={() => setPresenting(true)}>
                      <ArrowsPointingOutIcon className="mr-2.5 h-4 w-4" /> Present
                      <Kbd>P</Kbd>
                    </button>
                  </MenuItem>
                  <MenuItem>
                    <button type="button" className={menuItem} onClick={copyLink}>
                      <LinkIcon className="mr-2.5 h-4 w-4" /> {copied ? "Link copied" : "Copy link to this page"}
                    </button>
                  </MenuItem>
                  <MenuItem>
                    <a href={GUIDELINES_SOURCE_URL} target="_blank" rel="noopener noreferrer" className={menuItem}>
                      <ArrowTopRightOnSquareIcon className="mr-2.5 h-4 w-4" /> Open the design system
                    </a>
                  </MenuItem>
                  <MenuItem>
                    <button type="button" className={menuItem} onClick={() => window.print()}>
                      <PrinterIcon className="mr-2.5 h-4 w-4" /> Print or save as PDF
                    </button>
                  </MenuItem>
                  {canEdit ? (
                    <>
                      <div className="my-1 h-px bg-[rgba(0,0,0,0.08)]" />
                      <MenuItem>
                        <button type="button" className={menuItem} onClick={() => setEditing((v) => !v)}>
                          <PencilSquareIcon className="mr-2.5 h-4 w-4" /> {editing ? "Stop editing" : "Edit text"}
                          <Kbd>E</Kbd>
                        </button>
                      </MenuItem>
                      {pageHasEdits(placed.page) ? (
                        <MenuItem>
                          <button type="button" className={menuItem} onClick={() => resetPage(placed.page)}>
                            <ArrowUturnLeftIcon className="mr-2.5 h-4 w-4" /> Reset this page&apos;s text
                          </button>
                        </MenuItem>
                      ) : null}
                      {editCount ? (
                        <MenuItem>
                          <button type="button" className={menuItem} onClick={resetAll}>
                            <ArrowUturnLeftIcon className="mr-2.5 h-4 w-4" /> Reset all edits ({editCount})
                          </button>
                        </MenuItem>
                      ) : null}
                    </>
                  ) : null}
                </MenuItems>
              </Menu>
            </div>
            {/* Progress through the book. */}
            <div className="absolute bottom-[-1px] left-0 h-[2px] bg-[#6B52FF] transition-[width] duration-200" style={{ width: `${((current + 1) / PAGE_COUNT) * 100}%` }} />
          </header>

          {/* The deck */}
          <div ref={scroller} className="gl-scroller min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-3 py-5 sm:gap-6 sm:px-6 sm:py-8">
              {PAGES.map(({ page, chapter, index }) => (
                <section
                  key={page.id}
                  id={page.id}
                  ref={(node) => {
                    slideRefs.current[index] = node;
                  }}
                  aria-label={`${pageNumber(index)} ${page.title}`}
                  className={cn(
                    "gl-page scroll-mt-5 overflow-hidden rounded-[10px] shadow-[0_0_0_1px_rgba(12,12,24,0.08)] sm:rounded-[14px]",
                    editing && canEdit && "gl-editing",
                  )}
                >
                  <SlideFrame>
                    <GuidelineSlide page={page} chapter={chapter} index={index} />
                  </SlideFrame>
                </section>
              ))}
              <p className="gl-print-hide pb-6 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-[#6B6B6B]">
                End of the guidelines · {GUIDELINES_VERSION}
              </p>
            </div>
          </div>
        </div>

        {presenting ? (
          <Presenter index={current} onIndex={(i) => goToIndex(i, false)} onExit={() => setPresenting(false)} />
        ) : null}
      </div>
    </GuideProvider>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="ml-auto rounded-[4px] border border-[rgba(0,0,0,0.12)] px-1.5 font-mono text-[10.5px] text-[#6B6B6B]">
      {children}
    </kbd>
  );
}

function NavButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[rgba(12,12,24,0.10)] bg-[#FFFFFF] text-[#1A1A1E] transition hover:bg-[#F4F2EE] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Sidebar({
  currentIndex,
  query,
  setQuery,
  results,
  searchRef,
  onPick,
  overrides,
}: {
  currentIndex: number;
  query: string;
  setQuery: (q: string) => void;
  results: typeof PAGES;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onPick: (pageId: string) => void;
  overrides: GuidelineOverrides;
}) {
  const current = PAGES[currentIndex];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
        <GitworkWordmark height={26} />
        <span className="rounded-[4px] border border-[rgba(12,12,24,0.10)] px-1.5 py-0.5 font-mono text-[10px] tracking-[0.06em] text-[#6B6B6B]">
          {GUIDELINES_VERSION}
        </span>
      </div>
      <div className="px-3">
        <label className="relative block">
          <span className="sr-only">Search the guidelines</span>
          <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A968E]" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search guidelines"
            className="h-9 w-full rounded-[8px] border border-[rgba(12,12,24,0.10)] bg-[#FFFFFF] py-2 pl-8 pr-8 text-[16px] text-[#1A1A1E] placeholder:text-[#9A968E] focus:border-[#6B52FF] focus:outline-none sm:text-[13px]"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-[4px] border border-[rgba(12,12,24,0.12)] px-1.5 font-mono text-[10px] text-[#9A968E]">
            /
          </kbd>
        </label>
      </div>

      <nav aria-label="Chapters" className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {query.trim() ? (
          results.length ? (
            <ul>
              {results.map((r) => (
                <li key={r.page.id}>
                  <button
                    type="button"
                    onClick={() => onPick(r.page.id)}
                    className="flex w-full items-baseline gap-2 rounded-[6px] px-2.5 py-2 text-left hover:bg-[rgba(12,12,24,0.05)]"
                  >
                    <span className="font-mono text-[10.5px] text-[#9A968E]">{pageNumber(r.index)}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] text-[#1A1A1E]">
                        {r.page.kind === "chapter" ? `${r.chapter.title} (chapter)` : navTitle(overrides, r.page)}
                      </span>
                      <span className="block truncate text-[11.5px] text-[#6B6B6B]">{r.chapter.title}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2.5 py-3 text-[13px] text-[#6B6B6B]">Nothing matches “{query}”.</p>
          )
        ) : (
          <ul className="space-y-0.5">
            {CHAPTERS.map((chapter) => {
              const active = current.chapter.id === chapter.id;
              const first = chapter.pages[0];
              return (
                <li key={chapter.id}>
                  <button
                    type="button"
                    onClick={() => onPick(first.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13.5px] transition",
                      active ? "bg-[#FFFFFF] font-medium text-[#1A1A1E] shadow-[0_0_0_1px_rgba(12,12,24,0.08)]" : "text-[#3A3A40] hover:bg-[rgba(12,12,24,0.04)]",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-[18px] min-w-[22px] items-center justify-center rounded-[4px] px-1 font-mono text-[10px]",
                        active ? "bg-[#6B52FF] text-white" : "bg-[rgba(12,12,24,0.06)] text-[#6B6B6B]",
                      )}
                    >
                      {chapter.number}
                    </span>
                    {first.kind === "chapter" ? fieldText(overrides, first, "title") : chapter.title}
                  </button>
                  {active ? (
                    <ul className="ml-[22px] mt-1 border-l border-[rgba(12,12,24,0.10)] pb-1.5">
                      {chapter.pages
                        .filter((p) => p.kind !== "chapter")
                        .map((p) => {
                          const on = current.page.id === p.id;
                          return (
                            <li key={p.id}>
                              <button
                                type="button"
                                onClick={() => onPick(p.id)}
                                aria-current={on ? "page" : undefined}
                                className={cn(
                                  "relative flex w-full items-center py-1.5 pl-4 pr-2 text-left text-[13px] transition",
                                  on ? "font-medium text-[#1A1A1E]" : "text-[#6B6B6B] hover:text-[#1A1A1E]",
                                )}
                              >
                                {on ? <span aria-hidden className="absolute -left-[3.5px] h-[6px] w-[6px] rounded-full bg-[#6B52FF]" /> : null}
                                <span className="truncate" title={navTitle(overrides, p)}>
                                  {navTitle(overrides, p)}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      <div className="space-y-2 border-t border-[rgba(12,12,24,0.08)] p-3">
        <a
          href="/email/gitwork-wordmark-ink.png"
          download="gitwork-wordmark-ink.png"
          className="flex h-9 w-full items-center justify-center gap-2 rounded-[8px] bg-[#0C0C18] text-[13px] font-semibold text-[#F2EDE4] transition hover:bg-[#25253A]"
        >
          <ArrowDownTrayIcon className="h-4 w-4" /> Download the wordmark
        </a>
        <Link href="/app/settings/labs" className="flex h-8 items-center justify-center gap-1.5 text-[12.5px] text-[#6B6B6B] hover:text-[#1A1A1E]">
          <ArrowLeftIcon className="h-3.5 w-3.5" /> Foundry
        </Link>
      </div>
    </div>
  );
}

/** One slide at a time, letterboxed to the screen. Arrows, space and the buttons move; Esc leaves. */
function Presenter({ index, onIndex, onExit }: { index: number; onIndex: (i: number) => void; onExit: () => void }) {
  const { page, chapter } = PAGES[index];
  const exit = useRef(onExit);
  exit.current = onExit;
  // Full screen once, on open. Leaving full screen (Esc, or the browser's own control) leaves present mode.
  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
    const onChange = () => {
      if (!document.fullscreenElement) exit.current();
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);
  return (
    <div className="gl-print-hide fixed inset-0 z-50 flex flex-col bg-[#0C0C18]" role="dialog" aria-modal="true" aria-label="Presenting the guidelines">
      <div className="flex min-h-0 flex-1 items-center justify-center p-2 sm:p-6">
        <div className="flex h-full w-full items-center justify-center">
          <SlideFrame fit="contain">
            <GuidelineSlide page={page} chapter={chapter} index={index} />
          </SlideFrame>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-center gap-3 pb-4 text-[#F2EDE4]">
        <button type="button" aria-label="Previous slide" onClick={() => onIndex(index - 1)} disabled={index === 0} className="rounded-[6px] p-2 hover:bg-[rgba(255,255,255,0.10)] disabled:opacity-30">
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <span className="font-mono text-[12px] tracking-[0.08em] text-[rgba(242,237,228,0.7)]">
          {pageNumber(index)} / {pageNumber(PAGE_COUNT - 1)}
        </span>
        <button type="button" aria-label="Next slide" onClick={() => onIndex(index + 1)} disabled={index === PAGE_COUNT - 1} className="rounded-[6px] p-2 hover:bg-[rgba(255,255,255,0.10)] disabled:opacity-30">
          <ArrowRightIcon className="h-5 w-5" />
        </button>
        <button type="button" onClick={onExit} className="ml-4 rounded-[6px] px-3 py-1.5 text-[13px] hover:bg-[rgba(255,255,255,0.10)]">
          Exit <span className="font-mono text-[11px] text-[rgba(242,237,228,0.6)]">Esc</span>
        </button>
      </div>
    </div>
  );
}
