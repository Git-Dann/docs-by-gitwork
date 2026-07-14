"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ProposalSectionPreview } from "@/components/proposals/proposal-section-preview";
import type { ProposalDocument, ProposalSection } from "@/types/proposal";

/**
 * Presentation slide — a card that FILLS the stage (minus a small margin) in BOTH dimensions, so
 * it's near-full-width AND tall on any screen (not a fixed-aspect box that letterboxes one way or
 * the other). Every slide shares this frame: the cover fills it edge-to-edge; a content slide
 * carries a group of blocks (height-packed upstream to the available height) that fill the width.
 *
 * The card is sized by CSS (its wrapper is inset from the stage), so the full-width/tall look never
 * depends on JS measurement. Measurement is only used to (a) report the content width + available
 * height up for packing, and (b) shrink a lone over-tall block so it always fits with no scroll.
 */

export const CARD_MARGIN = 32; // card inset from each stage edge
export const CARD_PAD_X = 96;
export const CARD_PAD_Y = 72;
export const SLIDE_GAP = 28; // matches the content stack gap (space-y-7)
// Floor for the packing height so short screens (e.g. a 720p/1080p projector) still pack a few
// blocks per slide instead of one-per-slide; on a shorter card the group then scales to fit.
export const MIN_AVAIL_H = 760;
// Sensible pre-measure defaults so packing isn't wild before the card reports its real size.
export const FALLBACK_DIMS = { contentW: 1180, availH: 820 };

export function deriveDims(cardW: number, cardH: number): { contentW: number; availH: number } {
  return {
    contentW: Math.max(420, cardW - CARD_PAD_X * 2),
    availH: Math.max(MIN_AVAIL_H, cardH - CARD_PAD_Y * 2),
  };
}

export function PresentationSlide({
  sections,
  isCover,
  proposal,
  onDims,
  slideKey,
}: {
  /** The section(s) on this slide — a single cover, or a height-packed group of content blocks. */
  sections: Array<{ section: ProposalSection; index: number }>;
  isCover: boolean;
  proposal: ProposalDocument;
  /** Reports the measured content width + available height up for packing (stable callback). */
  onDims?: (dims: { contentW: number; availH: number }) => void;
  /** Changes per slide so the fit effect re-measures the new group. */
  slideKey: string | number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState(FALLBACK_DIMS);
  const [innerScale, setInnerScale] = useState(1);
  const docTheme = proposal.metadata.docTheme ?? "foundry";

  // Measure the (CSS-sized) card → content column width + available height. Reported up for
  // packing. Keeps the fallback if the card can't be measured (e.g. a 0-size headless context).
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const measure = () => {
      const cw = card.clientWidth;
      const ch = card.clientHeight;
      if (cw <= 0 || ch <= 0) return;
      const dims = deriveDims(cw, ch);
      setBox((prev) => (prev.contentW === dims.contentW && prev.availH === dims.availH ? prev : dims));
      onDims?.(dims);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(card);
    return () => ro.disconnect();
  }, [onDims]);

  // Shrink the content group only if its natural height exceeds the box (a lone tall block).
  useLayoutEffect(() => {
    if (isCover) {
      setInnerScale(1);
      return;
    }
    const content = contentRef.current;
    if (!content) return;
    const recompute = () => {
      const natural = content.offsetHeight || 1;
      // Fit to the ACTUAL card content box (not the floored packing height), so a group packed to
      // the floor still shrinks to fit a shorter card instead of being clipped.
      const card = cardRef.current;
      const actualAvail = card ? Math.max(160, card.clientHeight - CARD_PAD_Y * 2) : box.availH;
      const next = Math.min(1, actualAvail / natural);
      setInnerScale(next > 0 && Number.isFinite(next) ? next : 1);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(content);
    if (cardRef.current) ro.observe(cardRef.current);
    document.fonts?.ready.then(recompute).catch(() => {});
    return () => ro.disconnect();
  }, [isCover, slideKey, box.availH]);

  return (
    <div
      ref={cardRef}
      data-doc-theme={docTheme}
      className="proposal-document h-full w-full overflow-hidden rounded-[18px] shadow-[0_28px_72px_-16px_rgba(0,0,0,0.55)]"
    >
      {isCover ? (
        // Cover fills the card edge-to-edge — its own layout/background provides the design.
        <div className="h-full w-full [&_.document-cover]:!h-full [&_.document-cover]:!min-h-0 [&_.proposal-cover]:h-full">
          {sections.map(({ section, index }) => (
            <ProposalSectionPreview key={section.id ?? section.key} section={section} proposal={proposal} index={index} />
          ))}
        </div>
      ) : (
        <div
          className="flex h-full w-full justify-center overflow-hidden"
          style={{ padding: `${CARD_PAD_Y}px ${CARD_PAD_X}px` }}
        >
          <div style={{ width: box.contentW, transform: `scale(${innerScale})`, transformOrigin: "top center" }}>
            <div ref={contentRef} className="space-y-7" style={{ width: "100%" }}>
              {sections.map(({ section, index }) => (
                <ProposalSectionPreview key={section.id ?? section.key} section={section} proposal={proposal} index={index} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
