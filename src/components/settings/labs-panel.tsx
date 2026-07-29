import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";

/**
 * Labs — the home for internal and experimental surfaces that are real enough to use
 * but are not products, so they should not take a top-level sidebar item or an /app
 * namespace of their own.
 *
 * The rule this encodes: /app/<name> is for a main product. A feature of a product
 * gets an entry point inside that product (Deck sits on the Docs toolbar). An
 * experiment lives here.
 *
 * These are entry points, not routes — nothing is moved by listing it here, which
 * matters for /edge in particular: it hard-codes its own path in two duplicated
 * dark-mode regexes (theme-provider.tsx and the inline anti-flash script in
 * layout.tsx), so relocating it means editing both in the same commit or the board
 * flashes the wrong theme on first paint.
 */

interface LabEntry {
  name: string;
  href: string;
  blurb: string;
  note?: string;
}

const ENTRIES: LabEntry[] = [
  {
    name: "Mission Control",
    href: "/edge",
    blurb:
      "A dark, chrome-free exec board built for the Corsair Xeneon Edge — client health, your desk and the day's calendar on one always-on screen. Open it fullscreen on the device and sign in once.",
    note: "Renders as the signed-in viewer, so everything shows as you. No API key or token to distribute.",
  },
  {
    name: "Assay",
    href: "/app/assay",
    blurb:
      "Strike a Countermark from a completed Pulse scan — a signed, expiring certificate of what a piece of software was found to be, and what could not be established. The register is here; the certificate itself is a public link you send to a client, insurer or acquirer.",
    note: "Marks are UNSEALED until ASSAY_SIGNING_SECRET is set on the server, and say so on the certificate. Issuing needs the assay.issue permission. See docs/assay.md.",
  },
];

export function LabsPanel() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">Labs</h2>
        <p className="mt-1.5 max-w-[64ch] text-[13.5px] leading-relaxed text-[var(--text-3)]">
          Internal surfaces that are useful but are not products. They open in a new tab and
          are deliberately kept out of the sidebar.
        </p>
      </div>

      <ul className="space-y-3">
        {ENTRIES.map((entry) => (
          // Every card is laid out identically regardless of how long its copy
          // is: name + Open on one row, then blurb, then note. The previous
          // single flex row wrapped the button onto its own line once the text
          // block grew — so Mission Control showed Open top-right while Assay,
          // whose note is longer, showed it bottom-left. Both text blocks share
          // one measure (62ch) so a long mono note can't sprawl wider than the
          // blurb above it either.
          <li key={entry.href} className="app-card p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="min-w-0 text-[14.5px] font-semibold text-[var(--text-1)]">
                {entry.name}
              </h3>
              <a
                href={entry.href}
                target="_blank"
                rel="noopener noreferrer"
                className="app-button app-button-secondary app-button-sm shrink-0 whitespace-nowrap"
              >
                Open
                <ArrowTopRightOnSquareIcon className="ml-1.5 h-3.5 w-3.5" />
              </a>
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
    </div>
  );
}
