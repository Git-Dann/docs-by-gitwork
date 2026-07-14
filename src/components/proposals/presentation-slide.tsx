"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ProposalSectionPreview } from "@/components/proposals/proposal-section-preview";
import type { ProposalDocument, ProposalSection } from "@/types/proposal";

/**
 * Presentation slide — a fixed "master" card that is uniformly scaled to fit the stage. Every slide
 * shares this frame, cover included, so the deck is consistent. The master is TALL (near-square,
 * not 16:9) so a slide fills the vertical space like the old full-height cover rather than sitting
 * in a short letterbox.
 *
 * A content slide carries a GROUP of sections (height-packed upstream in <PresentationMode> so a
 * slide is full, not one sparse block), rendered top-aligned inside the card's margin. If a group
 * is still taller than the content box (a lone long block), it scales down uniformly so it always
 * fits with no scroll. The cover fills the card edge-to-edge (its own background/artwork).
 */

// Fixed master (px). Tall on purpose — scaled to fit, it fills a landscape stage's height. Content
// sections are measured + packed against SLIDE_CONTENT_* upstream.
export const SLIDE_W = 1280;
export const SLIDE_H = 1120;
export const SLIDE_PAD_X = 88;
export const SLIDE_PAD_Y = 80;
export const SLIDE_CONTENT_W = SLIDE_W - SLIDE_PAD_X * 2; // 1104
export const SLIDE_CONTENT_H = SLIDE_H - SLIDE_PAD_Y * 2; // 960
export const SLIDE_GAP = 28; // matches the content stack gap below (space-y-7)

export function PresentationSlide({
  sections,
  isCover,
  proposal,
  slideKey,
}: {
  /** The section(s) on this slide — a single cover, or a height-packed group of content blocks. */
  sections: Array<{ section: ProposalSection; index: number }>;
  isCover: boolean;
  proposal: ProposalDocument;
  /** Changes per slide so the fit effect re-measures the new group. */
  slideKey: string | number;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Scale of the whole master card so it fits the stage; inner scale shrinks an over-tall group.
  const [cardScale, setCardScale] = useState(1);
  const [innerScale, setInnerScale] = useState(1);
  const docTheme = proposal.metadata.docTheme ?? "foundry";

  // Fit the fixed master card to the stage (uniform scale, leaving a small margin).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const recompute = () => {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      if (w <= 0 || h <= 0) return;
      const next = Math.min((w * 0.96) / SLIDE_W, (h * 0.96) / SLIDE_H);
      setCardScale(next > 0 && Number.isFinite(next) ? next : 1);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  // Shrink the content group if its natural height still exceeds the content box (lone tall block).
  useLayoutEffect(() => {
    if (isCover) {
      setInnerScale(1);
      return;
    }
    const content = contentRef.current;
    if (!content) return;
    const recompute = () => {
      const natural = content.offsetHeight || 1;
      const next = Math.min(1, SLIDE_CONTENT_H / natural);
      setInnerScale(next > 0 && Number.isFinite(next) ? next : 1);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(content);
    document.fonts?.ready.then(recompute).catch(() => {});
    return () => ro.disconnect();
  }, [isCover, slideKey]);

  return (
    <div ref={stageRef} className="relative h-full w-full">
      <div
        data-doc-theme={docTheme}
        className="proposal-document absolute left-1/2 top-1/2 overflow-hidden rounded-[18px] shadow-[0_28px_72px_-16px_rgba(0,0,0,0.55)]"
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          transform: `translate(-50%, -50%) scale(${cardScale})`,
        }}
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
            style={{ padding: `${SLIDE_PAD_Y}px ${SLIDE_PAD_X}px` }}
          >
            <div style={{ transform: `scale(${innerScale})`, transformOrigin: "top center", width: "100%" }}>
              <div ref={contentRef} className="space-y-7" style={{ width: "100%" }}>
                {sections.map(({ section, index }) => (
                  <ProposalSectionPreview key={section.id ?? section.key} section={section} proposal={proposal} index={index} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
