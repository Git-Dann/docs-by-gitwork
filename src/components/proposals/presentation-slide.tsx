"use client";

import { useEffect, useRef, useState } from "react";
import { ProposalSectionPreview } from "@/components/proposals/proposal-section-preview";
import type { ProposalDocument, ProposalSection } from "@/types/proposal";

/**
 * One presentation slide — a cream document page (never white) with content anchored TOP-LEFT and
 * consistent margins, so the frame is identical on every slide and nothing jumps around. The page
 * fills the stage at a fixed max width; content that's taller than the page is scaled down
 * uniformly from the top-left corner so the whole slide fits with no scroll (a fitting slide stays
 * 1×). Layout height is read via offsetHeight (pre-transform) so measuring the scaled node isn't
 * circular. The card carries `.proposal-document`, so slides match the real doc palette/type.
 */
export function PresentationSlide({
  section,
  proposal,
  index,
}: {
  section: ProposalSection;
  proposal: ProposalDocument;
  index: number;
}) {
  const padRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // The cover renders its own full-bleed layout — every other section gets page margins.
  const isCover = section.key === "cover";

  useEffect(() => {
    const pad = padRef.current;
    const content = contentRef.current;
    if (!pad || !content) return;

    let raf = 0;
    const recompute = () => {
      const availH = pad.clientHeight;
      const naturalH = content.offsetHeight || 1;
      // Content already fills the width; only shrink (never enlarge) to fit the height.
      const next = Math.min(1, availH / naturalH);
      setScale(next > 0 && Number.isFinite(next) ? next : 1);
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(recompute);
    };

    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(pad);
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
    <div className="proposal-document relative h-full w-full max-w-[1280px] overflow-hidden rounded-[16px] shadow-[0_24px_64px_-12px_rgba(0,0,0,0.5)]">
      <div className="absolute inset-0" ref={padRef} style={{ padding: isCover ? 0 : "56px 64px" }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: "100%" }}>
          <div ref={contentRef} style={{ width: "100%" }}>
            <ProposalSectionPreview section={section} proposal={proposal} index={index} />
          </div>
        </div>
      </div>
    </div>
  );
}
