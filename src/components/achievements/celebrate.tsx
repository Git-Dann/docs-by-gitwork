"use client";

/**
 * Celebrating a newly reached tier, once per browser: a toast and, where the medal is on screen,
 * a confetti burst. The first time a browser sees someone's achievements it only remembers them,
 * so nobody opens Foundry to confetti for things done months ago (rules in src/lib/achievements.ts).
 */

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useMyAchievements } from "@/hooks/use-achievements";
import {
  ACHIEVEMENTS,
  CELEBRATED_KEY,
  TIER_LABEL,
  celebratedFrom,
  newlyReached,
  parseCelebrated,
  unitWords,
  type AchievementId,
  type AchievementProgress,
} from "@/lib/achievements";

function read(): string | null {
  try {
    return window.localStorage.getItem(CELEBRATED_KEY);
  } catch {
    return "{}"; // storage blocked: never celebrate rather than celebrate every visit
  }
}

/** Returns the ids being celebrated right now (for confetti); announces each with a toast. */
export function useCelebrateAchievements(progress: AchievementProgress[] | undefined): Set<AchievementId> {
  const { success } = useToast();
  const [fresh, setFresh] = useState<Set<AchievementId>>(new Set());
  useEffect(() => {
    if (!progress) return;
    const reached = newlyReached(progress, parseCelebrated(read()));
    try {
      window.localStorage.setItem(CELEBRATED_KEY, JSON.stringify(celebratedFrom(progress)));
    } catch {
      // nothing to do
    }
    if (reached.length === 0) return;
    setFresh(new Set(reached.map((r) => r.id)));
    for (const r of reached) {
      const def = ACHIEVEMENTS.find((d) => d.id === r.id)!;
      success(`${TIER_LABEL[r.tier!]}: ${def.name}`, unitWords(def, r.value));
    }
    const t = window.setTimeout(() => setFresh(new Set()), 2400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);
  return fresh;
}

/** Mounted on HQ: announces a new tier wherever the person lands, with no UI of its own. */
export function AchievementCelebrator() {
  const q = useMyAchievements();
  useCelebrateAchievements(q.data?.achievements);
  return null;
}
