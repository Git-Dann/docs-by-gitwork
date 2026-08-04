"use client";

/**
 * Per-block speaker notes (`DocumentSection.speakerNotes`).
 *
 * Presenter-only: surfaced in presentation mode's Notes drawer and NEVER in the doc body, the
 * public share view, or the PDF (see DESIGN.md → Presentation Mode).
 *
 * Lives in its own module — not inside `proposal-builder-panel.tsx` — because the editor's right
 * properties rail renders it as its own numbered group (`02 // SPEAKER NOTES`) beside the
 * dynamically-imported builder panel. Keeping it separate means the rail can show the notes group
 * without statically pulling the whole section-editor bundle into the first load.
 */

import type { ProposalDocument } from "@/types/proposal";

export function SpeakerNotesField({
  proposal,
  sectionIndex,
  onProposalChange,
}: {
  proposal: ProposalDocument;
  /** Index into `proposal.sections` — the caller resolves it, so this stays a dumb field. */
  sectionIndex: number;
  onProposalChange: (proposal: ProposalDocument) => void;
}) {
  const section = proposal.sections[sectionIndex];
  if (!section) return null;

  return (
    <div>
      <label className="block">
        <span className="sr-only">Speaker notes</span>
        <textarea
          value={section.speakerNotes ?? ""}
          onChange={(event) =>
            onProposalChange({
              ...proposal,
              sections: proposal.sections.map((entry, index) =>
                index === sectionIndex ? { ...entry, speakerNotes: event.target.value } : entry,
              ),
            })
          }
          rows={3}
          placeholder="Talking points shown only to you in presentation mode…"
          className="app-textarea"
        />
      </label>
      <p className="mt-1.5 text-xs leading-5 text-[var(--text-4)]">
        Only visible in presentation mode (the Notes toggle) — never in the doc, share link, or PDF.
      </p>
    </div>
  );
}
