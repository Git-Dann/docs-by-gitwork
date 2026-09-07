"use client";

import { useEffect, useState } from "react";
import { PulseOverview } from "@/components/pulse/pulse-overview";
import { PulseStudiesPanel } from "@/components/pulse/pulse-studies-panel";
import { PulseSalesPagePanel } from "@/components/pulse/pulse-sales-page-panel";
import { PulseEmbedTopCard } from "@/components/pulse/pulse-embed-panel";

const STORAGE_KEY = "gitwork.pulse.topcards.collapsed";

/**
 * The four top Pulse cards (Portfolio · Research studies · Sales page · Public embed) as one
 * uniform, collapse-in-unison row. Collapsed by default on first load to save room; the chevron
 * in any card header toggles all four together (kept in sync + persisted so the row stays
 * uniform in both states — no ragged mixed heights).
 *
 * Cards 03 and 04 are the TWO DOORS to the same free scanner — the standalone page
 * gitwork.co.uk links to, and the widget dropped into someone else's page. They convert
 * differently, which is the whole reason each scan records which door it came through.
 *
 * Starters used to sit at 03. It was moved out rather than squeezed: it already has a
 * front door (the mono `· STARTERS` link in the HQ context strip), and a library of
 * reusable prompts is not a sibling of "how the outside world reaches Pulse".
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
      <PulseSalesPagePanel collapsed={collapsed} onToggle={onToggle} />
      <PulseEmbedTopCard collapsed={collapsed} onToggle={onToggle} />
    </div>
  );
}
