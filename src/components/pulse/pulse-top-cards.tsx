"use client";

import { useEffect, useState } from "react";
import { PulseOverview } from "@/components/pulse/pulse-overview";
import { PulseStudiesPanel } from "@/components/pulse/pulse-studies-panel";
import { PulseStartersPanel } from "@/components/pulse/pulse-starters-panel";
import { PulseEmbedTopCard } from "@/components/pulse/pulse-embed-panel";

const STORAGE_KEY = "gitwork.pulse.topcards.collapsed";

/**
 * The four top Pulse cards (Portfolio · Research studies · Starters · Public embed) as one
 * uniform, collapse-in-unison row. Collapsed by default on first load to save room; the chevron
 * in any card header toggles all four together (kept in sync + persisted so the row stays
 * uniform in both states — no ragged mixed heights).
 */
export function PulseTopCards() {
  const [collapsed, setCollapsed] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate the persisted preference (default collapsed) after mount.
  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v !== null) setCollapsed(v === "1");
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed, hydrated]);

  const onToggle = () => setCollapsed((c) => !c);

  return (
    <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-4">
      <PulseOverview collapsed={collapsed} onToggle={onToggle} />
      <PulseStudiesPanel collapsed={collapsed} onToggle={onToggle} />
      <PulseStartersPanel collapsed={collapsed} onToggle={onToggle} />
      <PulseEmbedTopCard collapsed={collapsed} onToggle={onToggle} />
    </div>
  );
}
