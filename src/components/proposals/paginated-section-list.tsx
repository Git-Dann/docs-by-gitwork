"use client";

/**
 * Editor-canvas-only: renders the section list with visual "Page N" seams approximating where
 * an A4 export would paginate. A guide, not a reflow — sections are the atomic unit (mirrors the
 * `break-inside: avoid` rule already applied at print time in globals.css): a section either
 * fits on the current page or starts a new one, it's never split mid-section.
 *
 * Kept in its own client component (rather than hooked directly into ProposalPreview) so the
 * public/print render paths — which may render server-side — never pick up client-only hooks;
 * only the editor canvas opts in via `paginate`.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ProposalSection } from "@/types/proposal";

const A4_RATIO = 297 / 210;
// Mirrors the @page margins in globals.css (16mm top / 18mm sides+bottom on a 210mm-wide page).
const MARGIN_TOP_RATIO = 16 / 210;
const MARGIN_BOTTOM_RATIO = 18 / 210;
const SECTION_GAP_PX = 32; // matches the stack's space-y-8

function usePageBreaks(sections: Array<{ id: string; sectionKey: string }>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sectionEls = useRef(new Map<string, HTMLDivElement>());
  const [breakBefore, setBreakBefore] = useState<Set<string>>(new Set());

  const sectionRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el) sectionEls.current.set(id, el);
    else sectionEls.current.delete(id);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let debounce: ReturnType<typeof setTimeout> | null = null;

    const recompute = () => {
      // Never reparent/remeasure while the operator is mid-edit inside the canvas — a stale
      // page count until they blur beats dropping their cursor out of an inline field.
      if (document.activeElement && container.contains(document.activeElement)) return;
      const width = container.clientWidth;
      if (!width) return;
      const pageHeight = width * A4_RATIO;
      const contentHeight = pageHeight - width * (MARGIN_TOP_RATIO + MARGIN_BOTTOM_RATIO);

      const next = new Set<string>();
      let used = 0;
      sections.forEach((section, i) => {
        const height = sectionEls.current.get(section.id)?.offsetHeight ?? 0;
        if (i === 0) {
          used = height;
          return;
        }
        // The cover always gets its own page, regardless of size — matches the print CSS's
        // unconditional `break-after: page` on .proposal-cover.
        const prevWasCover = sections[i - 1]?.sectionKey === "cover";
        if (prevWasCover || used + SECTION_GAP_PX + height > contentHeight) {
          next.add(section.id);
          used = height;
        } else {
          used += SECTION_GAP_PX + height;
        }
      });
      setBreakBefore(next);
    };

    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(recompute, 350);
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    sectionEls.current.forEach((el) => observer.observe(el));
    container.addEventListener("focusout", schedule);
    recompute();

    return () => {
      observer.disconnect();
      container.removeEventListener("focusout", schedule);
      if (debounce) clearTimeout(debounce);
    };
    // Re-observe when the section *set* changes (add/remove/reorder) — not on every draft edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections.map((s) => s.id).join("|")]);

  return { containerRef, sectionRef, breakBefore };
}

function PageBreakSeam({ pageNumber }: { pageNumber: number }) {
  return (
    <div aria-hidden="true" className="flex items-center gap-3 py-1">
      <span className="h-0 flex-1 border-t border-dashed border-[var(--border-2)]" />
      <span className="shrink-0 rounded-full border border-[var(--border-2)] bg-[var(--surface-canvas)] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
        Page {pageNumber}
      </span>
      <span className="h-0 flex-1 border-t border-dashed border-[var(--border-2)]" />
    </div>
  );
}

export function PaginatedSectionList({
  sections,
  renderSection,
}: {
  sections: ProposalSection[];
  renderSection: (section: ProposalSection, index: number) => ReactNode;
}) {
  const sectionMeta = sections.map((section, index) => ({
    id: section.id ?? `${section.key}-${index}`,
    sectionKey: section.key,
  }));
  const { containerRef, sectionRef, breakBefore } = usePageBreaks(sectionMeta);
  let pageNumber = 1;

  return (
    <div ref={containerRef} className="space-y-8 print:space-y-7">
      {sections.map((section, index) => {
        const id = section.id ?? `${section.key}-${index}`;
        const showSeam = breakBefore.has(id);
        if (showSeam) pageNumber += 1;
        return (
          <div key={id} ref={sectionRef(id)}>
            {showSeam ? <PageBreakSeam pageNumber={pageNumber} /> : null}
            {renderSection(section, index)}
          </div>
        );
      })}
    </div>
  );
}
