"use client";

/**
 * Real A4-paged document renderer with height-measured auto-flow.
 *
 * Content is packed into physical A4 pages by MEASURING each block's rendered height (in a hidden
 * measurer at the true 170mm body width) and greedily filling each page up to its available body
 * height — so the builder, public share, print and PDF all show identical real pages. The cover is
 * always alone on a full-bleed page 1; an explicit page-break divider still forces a new page.
 * Falls back to author-driven `paginateSections` (cover + explicit breaks) for SSR / first paint,
 * then swaps to the measured layout once the client effect runs.
 *
 * Every non-cover page carries a quiet running header (`GITWORK.` wordmark · DOC TYPE · number) and
 * footer (company legal line · page n of N) inside its own 20mm margin box; the footer pins to the
 * sheet bottom via the flex column, so it never floats. `window.__docPaginated` is set once the
 * measured layout settles — the server PDF route waits on it before capturing.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { paginateSections } from "@/lib/proposal-pagination";
import { ProposalSectionPreview } from "@/components/proposals/proposal-section-preview";
import { useWorkspaceBranding } from "@/hooks/use-workspace-branding";
import { DEFAULT_DOC_THEME } from "@/types/proposal";
import type { ProposalDocument, ProposalSection } from "@/types/proposal";

const DOC_TYPE_LABEL: Record<string, string> = {
  PROPOSAL: "Proposal",
  SLA: "Service Level Agreement",
  SOW: "Statement of Work",
  MSA: "Master Service Agreement",
  NDA: "Non-Disclosure Agreement",
  CO: "Change Order",
  DSA: "Data Sharing Agreement",
  HANDOVER: "Handover",
  REPORT: "Report",
  BRIEF: "Brief",
  OTHER: "Document",
};

// Vertical gap between blocks on a page (Tailwind space-y-8 = 2rem).
const GAP_PX = 32;

function isCoverPage(pageSections: ProposalSection[]): boolean {
  return pageSections.length === 1 && pageSections[0].key === "cover";
}

function isPageBreak(section: ProposalSection): boolean {
  return (
    section.key === "divider" &&
    (section.data as { variant?: string } | undefined)?.variant === "page-break"
  );
}

/**
 * Do two pagination results place the same blocks on the same pages?
 *
 * Compared by section IDENTITY per page, not by object reference: `packPages` rebuilds its arrays
 * on every run, so a reference check is always "changed" and a deep-equality check would compare
 * every block's `data` — which is the very thing that changes while you type.
 */
function samePagination(a: ProposalSection[][], b: ProposalSection[][]): boolean {
  if (a.length !== b.length) return false;
  return a.every((page, index) => {
    const other = b[index];
    if (!other || page.length !== other.length) return false;
    return page.every((section, i) => (section.id ?? section.key) === (other[i].id ?? other[i].key));
  });
}

/** Greedily pack sections into pages using measured block heights + the per-page available height. */
function packPages(
  sections: ProposalSection[],
  heights: Map<number, number>,
  availablePx: number,
): ProposalSection[][] {
  const groups: ProposalSection[][] = [];
  let current: ProposalSection[] = [];
  let currentH = 0;
  const flush = () => {
    if (current.length) {
      groups.push(current);
      current = [];
      currentH = 0;
    }
  };

  sections.forEach((section, i) => {
    if (section.key === "cover") {
      flush();
      groups.push([section]); // cover is always alone on its own page
      return;
    }
    if (isPageBreak(section)) {
      flush(); // the break marker renders nothing; the page boundary communicates it
      return;
    }
    const h = heights.get(i) ?? 0;
    const withGap = current.length ? h + GAP_PX : h;
    if (current.length > 0 && currentH + withGap > availablePx) {
      flush();
      current.push(section);
      currentH = h;
    } else {
      current.push(section);
      currentH += withGap;
    }
  });
  flush();
  return groups;
}

export function PagedDocument({
  proposal,
  sections,
  trackSections = false,
  activeSectionId,
  onSelectSection,
  editable = false,
  onSectionChange,
  onSectionMetaChange,
}: {
  proposal: ProposalDocument;
  sections: ProposalSection[];
  /** Tag each section with data-doc-section attributes for the public engagement tracker. */
  trackSections?: boolean;
  /** Editor-only: id of the selected block (active highlight). Omitted on public/print. */
  activeSectionId?: string | null;
  /** Editor-only: click a non-inline block to open its inspector. Omitted on public/print. */
  onSelectSection?: (id: string) => void;
  /** Editor-only: the canvas is editable — text-first blocks render inline-editable fields. */
  editable?: boolean;
  /** Editor-only: write a block's data back to the draft (inline editing). */
  onSectionChange?: (sectionId: string, next: ProposalSection["data"]) => void;
  /** Editor-only: write a block's own title/caption back to the draft (inline heading editing). */
  onSectionMetaChange?: (sectionId: string, meta: { title?: string; description?: string }) => void;
}) {
  // SSR / first-paint fallback: author-driven (cover + explicit breaks). Swapped for the measured
  // layout by the effect below once block heights are known.
  const [pages, setPages] = useState<ProposalSection[][]>(() => paginateSections(sections));

  const measureRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Re-measure whenever the content (order / visibility / data) changes.
  const signature = useMemo(
    () => JSON.stringify(sections.map((s) => [s.id ?? s.key, s.key, s.isVisible, s.data])),
    [sections],
  );

  useEffect(() => {
    const measure = measureRef.current;
    const bodyEl = bodyRef.current;
    if (!measure || !bodyEl) return;

    let raf = 0;
    const recompute = () => {
      const availablePx = bodyEl.clientHeight; // exact per-page content height (A4 body)
      if (availablePx <= 0) return;
      const heights = new Map<number, number>();
      measure.querySelectorAll<HTMLElement>("[data-measure-index]").forEach((el) => {
        heights.set(Number(el.dataset.measureIndex), el.offsetHeight);
      });
      const packed = packPages(sections, heights, availablePx);
      const next = packed.length ? packed : paginateSections(sections);
      // ⚠️ Bail when the LAYOUT is unchanged. `packPages` returns fresh arrays every run, so
      // setting state unconditionally re-rendered the whole paged document on EVERY KEYSTROKE:
      // `signature` includes each section's `data`, so typing re-ran this effect, which set new
      // page arrays, which re-rendered every block — and the ResizeObserver watching the growing
      // textarea then fired and did it again. The visible symptom was the caret drifting as you
      // typed, because the field itself was being re-laid-out under it.
      //
      // Typing inside a block that does not change where a page breaks is now a no-op here.
      setPages((current) => (samePagination(current, next) ? current : next));
      (window as unknown as { __docPaginated?: boolean }).__docPaginated = true;
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(recompute);
    };

    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(bodyEl);
    ro.observe(measure);
    document.fonts?.ready.then(schedule).catch(() => {});
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [signature, sections]);

  const contentPageCount = pages.filter((p) => !isCoverPage(p)).length;
  const docTypeLabel = DOC_TYPE_LABEL[proposal.documentType] ?? "Document";
  const isGitwork = (proposal.metadata.docTheme ?? DEFAULT_DOC_THEME) === "gitwork";
  // Running-header agency label — from workspace branding, defaulting to Gitwork (live product
  // unchanged). A white-label / demo workspace can blank it, so the header shows the client only.
  const branding = useWorkspaceBranding().data;
  const agencyLabel = branding?.companyName ?? "GITWORK";
  // Per the reference NDA: header = `GITWORK.` wordmark (left) + `DOC TYPE · DOC NUMBER` (right);
  // footer = the company legal line (left) + `PAGE n OF N` (right). The wordmark carries the brand
  // period, so it reads as the mark rather than a bare word.
  const wordmark = agencyLabel ? `${agencyLabel}.` : "";
  const headerRight = [docTypeLabel.toUpperCase(), proposal.documentNumber ?? proposal.version ?? ""]
    .filter(Boolean)
    .join("  ·  ");
  // Legal line: workspace letterhead when set, else the Gitwork registration line from the cover.
  const legalLine =
    branding?.companyFooter?.left?.[0] ??
    (agencyLabel ? "GITWORK GROUP LTD  ·  COMPANY NO. 15756347" : "");
  let contentPageNumber = 0;

  // Blocks that participate in measurement: everything except the cover and page-break markers.
  const measurableSections = sections
    .map((section, index) => ({ section, index }))
    .filter(({ section }) => section.key !== "cover" && !isPageBreak(section));

  return (
    <div className="doc-a4-stack" data-doc-paginated="true">
      {/* Hidden measurer: a reference page (to read the exact available body height) + every
          block rendered once at the true 170mm body width so we can measure its height. */}
      {/* `position: fixed` (not absolute) so this off-screen measurer contributes NOTHING to page
          scroll — an absolute one with no clipping ancestor attaches to the shell root and grows the
          whole page. Fixed elements are excluded from scrollHeight yet still measure via offsetHeight. */}
      <div
        ref={measureRef}
        aria-hidden="true"
        style={{ position: "fixed", left: "-99999px", top: 0, width: "230mm", visibility: "hidden", pointerEvents: "none" }}
      >
        <div className="doc-a4-page">
          <div className="doc-a4-page__margin">
            <header className="doc-a4-page__header">
              <span>GITWORK</span>
              <span>—</span>
            </header>
            <div ref={bodyRef} className="doc-a4-page__body space-y-8" />
            <footer className="doc-a4-page__footer">
              <span>—</span>
              <span>—</span>
            </footer>
          </div>
        </div>
        <div className="proposal-document" style={{ width: "170mm" }}>
          <div className="space-y-8">
            {measurableSections.map(({ section, index }) => (
              <div key={section.id ?? `${section.key}-${index}`} data-measure-index={index}>
                <ProposalSectionPreview section={section} proposal={proposal} index={index} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {pages.map((pageSections, pageIndex) => {
        const cover = isCoverPage(pageSections);
        if (!cover) contentPageNumber += 1;

        const body = pageSections.map((section, index) => {
          const preview = (
            <ProposalSectionPreview
              section={section}
              proposal={proposal}
              index={index}
              activeSectionId={activeSectionId}
              onSelectSection={onSelectSection}
              editable={editable}
              onChange={
                onSectionChange ? (next) => onSectionChange(section.id ?? section.key, next) : undefined
              }
              onMetaChange={
                onSectionMetaChange
                  ? (meta) => onSectionMetaChange(section.id ?? section.key, meta)
                  : undefined
              }
            />
          );
          return trackSections ? (
            <div
              key={section.id ?? `${section.key}-${index}`}
              data-doc-section={section.key}
              data-doc-section-title={section.title}
            >
              {preview}
            </div>
          ) : (
            <div key={section.id ?? `${section.key}-${index}`}>{preview}</div>
          );
        });

        if (cover) {
          return (
            <div key={pageIndex} className="doc-a4-page">
              <div className="doc-a4-page__inner doc-a4-page__inner--cover">{body}</div>
            </div>
          );
        }

        return (
          <div key={pageIndex} className="doc-a4-page">
            <div className="doc-a4-page__margin">
              <header className="doc-a4-page__header">
                {/* Wordmark left, in ink (not muted) so it reads as the mark. */}
                <span
                  className="truncate"
                  style={
                    isGitwork
                      ? { color: "var(--doc-ink)", letterSpacing: "0.2em", fontWeight: 500 }
                      : undefined
                  }
                >
                  {wordmark || docTypeLabel}
                </span>
                <span className="shrink-0">{headerRight}</span>
              </header>
              <div className="doc-a4-page__body space-y-8">{body}</div>
              <footer className="doc-a4-page__footer">
                <span className="truncate">{legalLine || `${docTypeLabel}${proposal.version ? ` · ${proposal.version}` : ""}`}</span>
                <span className="shrink-0">
                  Page {contentPageNumber} of {contentPageCount}
                </span>
              </footer>
            </div>
          </div>
        );
      })}
    </div>
  );
}
