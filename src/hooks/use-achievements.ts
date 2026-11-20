"use client";

import { useQuery } from "@tanstack/react-query";
import { getMyAchievements } from "@/lib/api";

/** The signed-in person's own achievements (src/lib/achievements.ts). */
export function useMyAchievements(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["me", "achievements"] as const,
    queryFn: getMyAchievements,
    enabled: opts.enabled ?? true,
    staleTime: 5 * 60_000,
  });
}
