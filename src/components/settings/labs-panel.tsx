"use client";

import { useState } from "react";
import { ArrowsPointingOutIcon, ArrowTopRightOnSquareIcon, SparklesIcon } from "@heroicons/react/24/outline";

import { BadgeStudio } from "@/components/settings/labs/badge-studio";
import { MotionLibrary } from "@/components/settings/labs/motion-library";

/**
 * Labs — the home for internal and experimental surfaces that are real enough to use
 * but are not products, so they should not take a top-level sidebar item or an /app
 * namespace of their own.
 *
 * The rule this encodes: /app/<name> is for a main product. A feature of a product
 * gets an entry point inside that product (Study sits inside Pulse). An
 * experiment lives here, and so does Deck's scratch editor (decks that belong to a
 * client are made in Docs).
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
  panel?: "badges" | "motion";
  /** Runs a server action and then opens what it created. */
  action?: "block-gallery";
  blurb: string;
  note?: string;
}

const ENTRIES: LabEntry[] = [
  {
    name: "Block gallery",
    action: "block-gallery",
    blurb: "One real document holding every block Docs can render, for checking a design or theme change.",
    note: "Re-running replaces the previous copy.",
  },
  {
    name: "Badge studio",
    panel: "badges",
    blurb: "Foundry Approved marks and the Pulse score badge, with the snippet that installs each one.",
    note: "Codes FA-01 … PS-04. See docs/badges.md.",
  },
  {
    name: "Motion library",
    panel: "motion",
    blurb: "Every shared piece of motion, live: spinners, skeletons, entrances, toasts, Lottie.",
    note: "Written up in docs/motion.md.",
  },
  {
    name: "Studio",
    href: "/app/studio",
    blurb: "On-brand social assets and App Store / Play Store screenshots, exported at every size.",
    note: "Runs in the browser. Nothing is uploaded.",
  },
  {
    name: "Deck",
    href: "/deck",
    blurb: "The slide editor on its own: build from a template, present, and save the deck as a file.",
    note: "A client deck belongs in Docs → + New → Deck.",
  },
  {
    name: "Brand guidelines",
    href: "/guidelines",
    blurb: "The Gitwork brand book as a 16:9 deck: logo, type, colour, and how Foundry sits under Gitwork.",
    note: "Admins edit the copy from the ⋯ menu.",
  },
  {
    name: "Canvas",
    href: "/canvas",
    blurb: "Thirty generative artwork tools. Export SVG, PNG or text for posts, backgrounds and decks.",
    note: "The page is the file. Source: Git-Dann/canvas.",
  },
  {
    name: "Mission Control",
    href: "/edge",
    blurb: "A chrome-free exec board for the Corsair Xeneon Edge: client health, your desk and the day.",
    note: "Renders as you. No key to distribute.",
  },
  {
    name: "Provenance",
    href: "/app/provenance",
    blurb: "Strike a Countermark from a Pulse scan: a signed, expiring certificate of what was found.",
    note: "Needs provenance.issue. See docs/provenance.md.",
  },
];

export function LabsPanel() {
  const [panel, setPanel] = useState<LabEntry["panel"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createBlockGallery() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/dev/seed-block-gallery", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Could not create the gallery.");

      // `apiOk(data)` returns the payload UNWRAPPED — there is no `{ data: … }` envelope.
      // This read `body.data.href` and threw "Cannot read properties of undefined" on every
      // click, because the gallery was built and the redirect was the only untested line.
      const href = typeof body?.href === "string" ? body.href : null;
      if (!href) throw new Error("The gallery was created but the server returned no link to it.");

      // Same tab: you asked for a document, so you get taken to it.
      window.location.href = href;
    } catch (cause) {
      // Surfaced, not swallowed — a silent no-op button is indistinguishable from a broken one.
      setError(cause instanceof Error ? cause.message : "Could not create the gallery.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">Labs</h2>
        <p className="mt-1.5 max-w-[64ch] text-[13.5px] leading-relaxed text-[var(--text-3)]">
          Useful internal tools that aren&apos;t products, kept out of the sidebar.
        </p>
      </div>

      <ul className="grid gap-3 md:grid-cols-2">
        {ENTRIES.map((entry) => (
          // Two-up from md, every card laid out identically: name + Open on one
          // row, a one-sentence blurb, then the mono note pinned to the bottom
          // (mt-auto) so notes line up across a row whatever the blurb length.
          // Keep the copy to one sentence each; the detail lives in the docs.
          <li key={entry.href ?? entry.panel ?? entry.action} className="app-card flex flex-col p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="min-w-0 text-[14.5px] font-semibold text-[var(--text-1)]">
                {entry.name}
              </h3>
              {entry.href ? (
                <a
                  href={entry.href}
                  target="_blank"
                  // noopener, NOT noreferrer: these are our own pages, and Deck's
                  // Back link reads the referrer to return you here. Stripping it
                  // sent Back to Docs instead.
                  rel="noopener"
                  className="app-button app-button-secondary app-button-sm shrink-0 whitespace-nowrap"
                >
                  Open
                  <ArrowTopRightOnSquareIcon className="ml-1.5 h-3.5 w-3.5" />
                </a>
              ) : entry.action ? (
                <button
                  type="button"
                  onClick={createBlockGallery}
                  disabled={busy}
                  className="app-button app-button-secondary app-button-sm shrink-0 whitespace-nowrap disabled:opacity-60"
                >
                  {busy ? "Creating…" : "Create"}
                  <SparklesIcon className="ml-1.5 h-3.5 w-3.5" />
                </button>
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
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-3)]">
              {entry.blurb}
            </p>
            {entry.note ? (
              <p className="mt-auto pt-2 font-mono text-[11px] leading-relaxed text-[var(--text-4)]">
                {entry.note}
              </p>
            ) : null}
            {entry.action && error ? (
              <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--danger-500)]">
                {error}
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
      <MotionLibrary open={panel === "motion"} onClose={() => setPanel(null)} />
    </div>
  );
}
