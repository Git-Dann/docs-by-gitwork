/**
 * Right-rail tabs (P-rail). The editor used to stack four widgets vertically — Signature panel,
 * Collaboration, Activity feed, Proof drafts — which forced the user to scroll past a wall of
 * surfaces to reach anything below the fold.
 *
 * This component consolidates them under a single tab strip so only one panel is mounted at a
 * time. Each child component keeps its own widget framing; we just gate which one renders.
 */

"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/format";

interface RightRailTab {
  id: string;
  label: string;
  panel: ReactNode;
  badge?: number;
}

interface RightRailTabsProps {
  tabs: RightRailTab[];
  defaultTabId?: string;
}

export function RightRailTabs({ tabs, defaultTabId }: RightRailTabsProps) {
  const [activeId, setActiveId] = useState<string>(defaultTabId ?? tabs[0]?.id ?? "");
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  if (!active) return null;

  return (
    <div className="space-y-3">
      <div className="inline-flex w-full max-w-full overflow-x-auto rounded-[10px] border border-[var(--border-2)] bg-white p-0.5 shadow-[var(--shadow-xs)]">
        {tabs.map((tab) => {
          const isActive = tab.id === active.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveId(tab.id)}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-[8px] px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] transition",
                isActive
                  ? "bg-[var(--brand-200)] text-[var(--brand-700)]"
                  : "text-[var(--text-4)] hover:text-[var(--text-2)]",
              )}
            >
              {tab.label}
              {typeof tab.badge === "number" && tab.badge > 0 ? (
                <span
                  className={cn(
                    "inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] px-1 font-mono text-[9px] font-semibold",
                    isActive
                      ? "bg-[var(--brand-700)] text-white"
                      : "bg-[var(--surface-1)] text-[var(--text-3)]",
                  )}
                >
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div>{active.panel}</div>
    </div>
  );
}
