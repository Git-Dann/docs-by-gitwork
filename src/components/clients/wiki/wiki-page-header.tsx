"use client";

/**
 * The header every wiki page shares (Nov 2026): the group it sits in, its title, one sentence
 * saying what it is, and the page's own action on the right. Rendered once by the team's wiki
 * and once by the client's link, so all pages match and none draws its own.
 *
 * A page puts its action here with <WikiPageActions>, a portal into the slot on the right, so
 * the action stays in the section's own code (with its state) and still lands in the header.
 *
 * ⚠️ The slot element is never re-keyed: only the text block re-animates on a page change. A
 * portal pointing at a replaced node would drop its action.
 */
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { WikiSection } from "./wiki-sidebar";
import { WIKI_PAGE_DESCRIPTIONS, WIKI_PAGE_TITLES, wikiPageGroupLabel } from "@/lib/wiki-page-meta";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";
const SLOT_ID = "wiki-page-actions";

export function WikiPageHeader({ section, actions }: { section: WikiSection; actions?: ReactNode }) {
  const group = wikiPageGroupLabel(section);
  return (
    <header
      data-wiki-page-header
      className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-[var(--border-1)] pb-5"
    >
      {/* The title keeps at least 320px; wide actions wrap onto their own line rather than
          squeezing the description into a column of single words. */}
      <div key={section} className="motion-rise min-w-[min(100%,320px)] flex-1">
        {group ? (
          <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
            {group}
          </p>
        ) : null}
        <h1
          className="mt-1 text-[28px] font-normal leading-[1.15] tracking-[-0.02em] text-[var(--text-1)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {WIKI_PAGE_TITLES[section]}
        </h1>
        <p className="mt-1.5 max-w-2xl text-[14px] leading-6 text-[var(--text-3)]">{WIKI_PAGE_DESCRIPTIONS[section]}</p>
      </div>
      <div id={SLOT_ID} className="flex max-w-full flex-wrap items-center justify-end gap-2 empty:hidden">
        {actions}
      </div>
    </header>
  );
}

/**
 * Put a page's actions in the shared header's right-hand slot. With no wiki header on the page
 * (a section shown on its own, such as the standalone Design System page), they render where
 * they are as an ordinary toolbar, so an action can never silently disappear.
 */
export function WikiPageActions({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null | undefined>(undefined);
  useEffect(() => setSlot(document.getElementById(SLOT_ID)), []);
  if (slot === undefined) return null;
  if (slot === null) return <div className="mb-4 flex flex-wrap items-center justify-end gap-2">{children}</div>;
  return createPortal(children, slot);
}
