"use client";

import { useEffect, useRef, useState } from "react";
import { ProposalSectionPreview } from "@/components/proposals/proposal-section-preview";
import type { ProposalDocument, ProposalSection } from "@/types/proposal";

/**
 * One presentation slide — renders a single section at a fixed content width and scales it down
 * uniformly so the WHOLE slide fits the stage with no scroll (the old card scrolled tall slides,
 * covers especially). Scale = min(availW/naturalW, availH/naturalH, 1): a slide that fits renders
 * at 1×; a tall one shrinks to fit. Layout size is read via offsetWidth/offsetHeight (pre-transform),
 * so measuring the scaled node is not circular. Mirrors the scale-to-fit pattern used by Studio.
 */
const SLIDE_W = 960;
// Leave a little breathing room so content never kisses the card edge.
const SAFETY = 0.94;

export function PresentationSlide({
  section,
  proposal,
  index,
}: {
  section: ProposalSection;
  proposal: ProposalDocument;
  index: number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // The cover renders its own full-bleed layout — every other section gets page padding.
  const isCover = section.key === "cover";

  useEffect(() => {
    const card = cardRef.current;
    const content = contentRef.current;
    if (!card || !content) return;

    let raf = 0;
    const recompute = () => {
      const availW = card.clientWidth * SAFETY;
      const availH = card.clientHeight * SAFETY;
      const naturalW = content.offsetWidth || SLIDE_W;
      const naturalH = content.offsetHeight || 1;
      const next = Math.min(availW / naturalW, availH / naturalH, 1);
      setScale(next > 0 && Number.isFinite(next) ? next : 1);
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(recompute);
    };

    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(card);
    ro.observe(content);
    // Re-measure once webfonts load (serif/mono metrics shift the natural height).
    document.fonts?.ready.then(schedule).catch(() => {});

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // Re-run when the slide changes so the new section is measured fresh.
  }, [index]);

  return (
    <div
      ref={cardRef}
      className="relative flex h-full w-full max-w-[1120px] items-center justify-center overflow-hidden rounded-[14px] bg-white text-[var(--text-1)] shadow-[0_24px_64px_-12px_rgba(0,0,0,0.5)]"
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}>
        <div
          ref={contentRef}
          className="proposal-document overflow-hidden rounded-[6px]"
          style={{ width: SLIDE_W, padding: isCover ? 0 : "48px 56px" }}
        >
          <ProposalSectionPreview section={section} proposal={proposal} index={index} />
        </div>
      </div>
    </div>
  );
}
