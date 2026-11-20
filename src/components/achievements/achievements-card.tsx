"use client";

/**
 * Your achievements, on your own Staff page (Backstage → Me). Each is earned from what Foundry
 * already records (src/lib/achievements.ts): a medal per tier reached, a bar to the next one, and
 * the rule in words, so nobody has to guess what counts.
 */

import { FireIcon, TrophyIcon } from "@heroicons/react/24/solid";
import { TrophyIcon as TrophyOutline } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { useMyAchievements } from "@/hooks/use-achievements";
import { Skeleton } from "@/components/ui/motion/skeleton";
import { ACHIEVEMENTS, TIER_LABEL, unitWords, type AchievementProgress, type Tier } from "@/lib/achievements";
import { useCelebrateAchievements } from "@/components/achievements/celebrate";
import { Confetti } from "@/components/ui/motion/confetti";

const MONO = { fontFamily: "var(--font-mono)" } as const;

/**
 * Tiers deepen through the brand blue, not bronze/silver/gold metals: DESIGN.md allows no hue
 * outside the blue family and the semantic set. The tier is also written next to the medal.
 */
const MEDAL: Record<Tier, string> = {
  bronze: "border-[var(--brand-300)] bg-[var(--brand-50)] text-[var(--brand-700)]",
  silver: "border-[var(--brand-500)] bg-[var(--brand-100)] text-[var(--brand-800)]",
  gold: "border-[var(--brand-700)] bg-[var(--brand-600)] text-white",
};

export function AchievementsCard({ number }: { number: string }) {
  const q = useMyAchievements();
  const fresh = useCelebrateAchievements(q.data?.achievements);
  const list = q.data?.achievements ?? [];
  return (
    <section className="widget-card" aria-label="Achievements">
      <div className="widget-header shrink-0">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{number}</span>{" // Achievements"}
        </span>
        <span className="widget-header__status" style={MONO}>
          {list.filter((a) => a.tier).length} of {list.length} earned
        </span>
      </div>
      {q.isPending ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : list.length === 0 ? (
        <p className="p-4 text-sm text-[var(--text-3)]">Nothing to earn here yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border-1)]">
          {list.map((a) => (
            <Row key={a.id} a={a} celebrate={fresh.has(a.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ a, celebrate }: { a: AchievementProgress; celebrate: boolean }) {
  const def = ACHIEVEMENTS.find((d) => d.id === a.id)!;
  const streak = a.id === "standup-streak";
  return (
    <li className="flex items-center gap-3 px-4 py-3" title={def.rule}>
      <div className="relative">
        <Medal tier={a.tier} />
        {celebrate ? <Confetti /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium text-[var(--text-1)]">{def.name}</span>
          {a.tier ? (
            <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-3)]" style={MONO}>
              {TIER_LABEL[a.tier]}
            </span>
          ) : null}
          {streak && a.current ? (
            <span className="inline-flex items-center gap-0.5 text-xs font-medium text-[var(--text-2)]" title="Your run right now">
              <FireIcon className="h-3.5 w-3.5 text-[var(--warning-500)]" aria-hidden /> {a.current} now
            </span>
          ) : null}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <span
              className="block h-full rounded-full bg-[var(--brand-500)] transition-[width] duration-700"
              style={{ width: `${Math.round(a.share * 100)}%` }}
            />
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-3)]">
            {a.next == null ? `${streak ? "Best " : ""}${unitWords(def, a.value)}` : `${a.value} / ${a.next}`}
          </span>
        </div>
        <p className="mt-1 text-xs text-[var(--text-3)]">
          {a.next == null
            ? "Every tier earned."
            : `${unitWords(def, a.next - a.value)} to ${TIER_LABEL[a.tier === "bronze" ? "silver" : a.tier === "silver" ? "gold" : "bronze"]}${streak ? " (your best run counts)" : ""}`}
        </p>
      </div>
    </li>
  );
}

function Medal({ tier }: { tier: Tier | null }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-[10px] border-2",
        tier ? MEDAL[tier] : "border-dashed border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-4)]",
      )}
    >
      {tier ? <TrophyIcon className="h-4 w-4" /> : <TrophyOutline className="h-4 w-4" />}
    </span>
  );
}
