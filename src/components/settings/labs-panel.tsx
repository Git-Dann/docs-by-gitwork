"use client";

import { useState } from "react";
import { ArrowsPointingOutIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";

import { BadgeStudio } from "@/components/settings/labs/badge-studio";

/**
 * Labs — the home for internal and experimental surfaces that are real enough to use
 * but are not products, so they should not take a top-level sidebar item or an /app
 * namespace of their own.
 *
 * The rule this encodes: /app/<name> is for a main product. A feature of a product
 * gets an entry point inside that product (Deck sits on the Docs toolbar). An
 * experiment lives here.
 *
 * An entry either opens a route in a new tab (`href`) or a surface in place
 * (`panel`). The badge studio is the second kind on purpose: `/app/settings/**`
 * sits in `UNGATED_APP_PREFIXES`, so giving it a route would make it reachable by
 * any signed-in member, while this section is Super-Admin-only.
 *
 * These are entry points, not routes — nothing is moved by listing it here, which
 * matters for /edge in particular: it hard-codes its own path in two duplicated
 * dark-mode regexes (theme-provider.tsx and the inline anti-flash script in
 * layout.tsx), so relocating it means editing both in the same commit or the board
 * flashes the wrong theme on first paint.
 */

interface LabEntry {
  name: string;
  /** Opens in a new tab. Mutually exclusive with `panel`. */
  href?: string;
  /** Opens in place, inside this section's gate. */
  panel?: "badges";
  blurb: string;
  note?: string;
}

const ENTRIES: LabEntry[] = [
  {
    name: "Badge studio",
    panel: "badges",
    blurb:
      "The Foundry Approved marks and the Pulse score badge, with the snippet that installs each one on a client's site. Pick a mark, set the ground it will sit on, and copy.",
    note: "Every mark has a permanent code (FA-01 … PS-04) — call them by it. Full reference: docs/badges.md.",
  },
  {
    name: "Mission Control",
    href: "/edge",
    blurb:
      "A dark, chrome-free exec board built for the Corsair Xeneon Edge — client health, your desk and the day's calendar on one always-on screen. Open it fullscreen on the device and sign in once.",
    note: "Renders as the signed-in viewer, so everything shows as you. No API key or token to distribute.",
  },
  {
    name: "Provenance",
    href: "/app/provenance",
    blurb:
      "Strike a Countermark from a completed Pulse scan — a signed, expiring certificate of what a piece of software was found to be, and what could not be established. The register is here; the certificate itself is a public link you send to a client, insurer or acquirer.",
    note: "Marks are UNSEALED until PROVENANCE_SIGNING_SECRET is set on the server, and say so on the certificate. Issuing needs the provenance.issue permission. See docs/provenance.md.",
  },
];

export function LabsPanel() {
  const [panel, setPanel] = useState<LabEntry["panel"] | null>(null);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">Labs</h2>
        <p className="mt-1.5 max-w-[64ch] text-[13.5px] leading-relaxed text-[var(--text-3)]">
          Internal surfaces that are useful but are not products, and are deliberately kept
          out of the sidebar.
        </p>
      </div>

      <ul className="space-y-3">
        {ENTRIES.map((entry) => (
          // Every card is laid out identically regardless of how long its copy
          // is: name + Open on one row, then blurb, then note. The previous
          // single flex row wrapped the button onto its own line once the text
          // block grew — so Mission Control showed Open top-right while Provenance,
          // whose note is longer, showed it bottom-left. Both text blocks share
          // one measure (62ch) so a long mono note can't sprawl wider than the
          // blurb above it either.
          <li key={entry.href ?? entry.panel} className="app-card p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="min-w-0 text-[14.5px] font-semibold text-[var(--text-1)]">
                {entry.name}
              </h3>
              {entry.href ? (
                <a
                  href={entry.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="app-button app-button-secondary app-button-sm shrink-0 whitespace-nowrap"
                >
                  Open
                  <ArrowTopRightOnSquareIcon className="ml-1.5 h-3.5 w-3.5" />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => setPanel(entry.panel ?? null)}
                  className="app-button app-button-secondary app-button-sm shrink-0 whitespace-nowrap"
                >
                  Open
                  {/* Deliberately NOT the external-link arrow the href entries
                      use — this one opens in place, and that glyph would promise
                      a new tab. Same button otherwise, so the row still reads as
                      one set. */}
                  <ArrowsPointingOutIcon className="ml-1.5 h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="mt-1.5 max-w-[62ch] text-[13.5px] leading-relaxed text-[var(--text-3)]">
              {entry.blurb}
            </p>
            {entry.note ? (
              <p className="mt-2 max-w-[62ch] font-mono text-[11px] leading-relaxed text-[var(--text-4)]">
                {entry.note}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="font-mono text-[11px] leading-relaxed text-[var(--text-4)]">
        Adding one? Put the entry point here rather than in the sidebar — see the note at the
        top of this file for where features and experiments each belong.
      </p>

      <BadgeStudio open={panel === "badges"} onClose={() => setPanel(null)} />
    </div>
  );
}
