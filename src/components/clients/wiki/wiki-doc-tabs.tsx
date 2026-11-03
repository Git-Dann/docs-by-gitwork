"use client";

import type { WikiSection } from "./wiki-sidebar";

/**
 * Tabs between the wiki's doc pages (IA, Developer Guide, API Docs, Architecture, Runbook,
 * Data Model). The sidebar shows them as ONE "Docs" row; this is how you move between them.
 *
 * Renders nothing for a single page — a lone tab is a label pretending to be a control.
 * The segmented-control shape is the platform's pick-one control (DESIGN.md, Care views).
 * It scrolls sideways rather than wrapping on a phone, so the row keeps one height.
 */
export function WikiDocTabs({
  sections,
  active,
  titles,
  onSelect,
}: {
  sections: WikiSection[];
  active: WikiSection;
  titles: Partial<Record<WikiSection, string>>;
  onSelect: (section: WikiSection) => void;
}) {
  if (sections.length < 2) return null;
  return (
    <div className="mb-4 max-w-full overflow-x-auto">
      <div
        role="tablist"
        aria-label="Docs"
        className="inline-flex min-w-max gap-0.5 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-0.5"
      >
        {sections.map((s) => {
          const on = s === active;
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onSelect(s)}
              className={[
                "whitespace-nowrap rounded-[6px] px-3 py-1.5 text-[11px] uppercase tracking-[0.05em] transition-colors",
                on
                  ? "bg-[var(--surface-0)] font-semibold text-[var(--brand-700)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                  : "text-[var(--text-3)] hover:text-[var(--text-1)]",
              ].join(" ")}
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {titles[s] ?? s}
            </button>
          );
        })}
      </div>
    </div>
  );
}
