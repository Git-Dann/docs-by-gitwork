/**
 * Achievements: what Foundry recognises a person for. Pure, so every rule is tested.
 *
 * The design rule (Dan, Nov 2026: "entice people to use the platform"): reward the behaviours that
 * keep Foundry TRUE, never activity for its own sake. A task created and closed the same day is
 * logging, and §67 measured 583 of ~720 done tasks being exactly that, so "tasks done" is not an
 * achievement here; finishing work that was already on the plan is.
 *
 *  - Earned, never granted: every figure is worked out from data Foundry already holds, so it
 *    can't be clicked for and there's nothing to store.
 *  - Personal, not ranked: no leaderboard puts one developer against another.
 *  - Leave and bank holidays never break a streak.
 */

export type AchievementId = "standup-streak" | "on-the-plan" | "on-time" | "deals-won";

export type Tier = "bronze" | "silver" | "gold";

export interface AchievementDef {
  id: AchievementId;
  name: string;
  /** What earns it, in one sentence. */
  rule: string;
  /** Units, singular and plural ("day", "days"). */
  unit: [string, string];
  /** Thresholds for bronze, silver, gold. */
  tiers: [number, number, number];
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "standup-streak",
    name: "Standup streak",
    rule: "Working days in a row with your morning standup posted. Leave and bank holidays don't break it.",
    unit: ["day", "days"],
    tiers: [5, 20, 60],
  },
  {
    id: "on-the-plan",
    name: "On the plan",
    rule: "Tasks you finished in the last 90 days that were already in a category or release, and weren't made the day they were finished.",
    unit: ["task", "tasks"],
    tiers: [10, 50, 150],
  },
  {
    id: "on-time",
    name: "On time",
    rule: "Tasks you finished by their due date in the last 90 days.",
    unit: ["task", "tasks"],
    tiers: [10, 40, 120],
  },
  {
    id: "deals-won",
    name: "Deals won",
    rule: "Documents you own that a client accepted or signed.",
    unit: ["deal", "deals"],
    tiers: [1, 5, 15],
  },
];

export interface AchievementProgress {
  id: AchievementId;
  /** The figure the tiers are measured against (for a streak, the best run). */
  value: number;
  /** For a streak: the run that's going now. */
  current: number | null;
  tier: Tier | null;
  /** The next threshold, or null at gold. */
  next: number | null;
  /** 0–1 towards the next tier (1 at gold). */
  share: number;
}

const TIER_ORDER: Tier[] = ["bronze", "silver", "gold"];

export function progressFor(def: AchievementDef, value: number, current: number | null = null): AchievementProgress {
  let tier: Tier | null = null;
  def.tiers.forEach((t, i) => {
    if (value >= t) tier = TIER_ORDER[i];
  });
  const reached = tier ? TIER_ORDER.indexOf(tier) + 1 : 0;
  const next = reached < 3 ? def.tiers[reached] : null;
  const from = reached === 0 ? 0 : def.tiers[reached - 1];
  const share = next == null ? 1 : Math.max(0, Math.min(1, (value - from) / (next - from)));
  return { id: def.id, value, current, tier, next, share };
}

// ── Standup streak ─────────────────────────────────────────────────────────────

/** YYYY-MM-DD, UTC. */
export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The current and best run of working days with a standup, walking back from `today`.
 * A weekend, a bank holiday or a day off never breaks a run and never counts towards it.
 * Today only counts once it's posted, so a run isn't shown as broken before the day is over.
 */
export function standupStreak(input: {
  posted: Set<string>;
  daysOff: Set<string>;
  today: Date;
  /** How far back to look. */
  days: number;
}): { current: number; best: number } {
  const { posted, daysOff, today, days } = input;
  let current = 0;
  let best = 0;
  let run = 0;
  let stillCurrent = true;
  const todayKey = ymd(today);
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const key = ymd(d);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6 || daysOff.has(key)) continue;
    if (posted.has(key)) {
      run += 1;
      best = Math.max(best, run);
      if (stillCurrent) current = run;
    } else {
      if (key === todayKey) continue; // the day isn't over yet
      stillCurrent = false;
      run = 0;
    }
  }
  return { current, best };
}

// ── Tasks ──────────────────────────────────────────────────────────────────────

export interface FinishedTask {
  createdAt: string;
  completedAt: string;
  dueDate: string | null;
  planned: boolean;
}

/** Finished work that was on the plan before the day it was finished. */
export function countOnThePlan(tasks: FinishedTask[]): number {
  return tasks.filter((t) => t.planned && t.createdAt.slice(0, 10) < t.completedAt.slice(0, 10)).length;
}

/** Finished on or before its due date (by day). Tasks with no due date don't count either way. */
export function countOnTime(tasks: FinishedTask[]): number {
  return tasks.filter((t) => t.dueDate && t.completedAt.slice(0, 10) <= t.dueDate.slice(0, 10)).length;
}

// ── Celebrating a new tier ─────────────────────────────────────────────────────

/** What this browser has already celebrated: achievement id → tier. */
export type CelebratedMap = Partial<Record<AchievementId, Tier>>;

export const CELEBRATED_KEY = "foundry.achievements.celebrated.v1";

/**
 * Tiers reached that haven't been celebrated here yet. The first time a browser sees someone's
 * achievements it celebrates nothing (they're shown, not announced), so nobody opens Foundry to
 * a burst of confetti for things they did months ago.
 */
export function newlyReached(progress: AchievementProgress[], celebrated: CelebratedMap | null): AchievementProgress[] {
  if (celebrated == null) return [];
  return progress.filter((p) => {
    if (!p.tier) return false;
    const seen = celebrated[p.id];
    return !seen || TIER_ORDER.indexOf(p.tier) > TIER_ORDER.indexOf(seen);
  });
}

export function celebratedFrom(progress: AchievementProgress[]): CelebratedMap {
  const out: CelebratedMap = {};
  for (const p of progress) if (p.tier) out[p.id] = p.tier;
  return out;
}

export function parseCelebrated(raw: string | null): CelebratedMap | null {
  if (raw == null) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: CelebratedMap = {};
    for (const def of ACHIEVEMENTS) {
      const t = (v as Record<string, unknown>)[def.id];
      if (t === "bronze" || t === "silver" || t === "gold") out[def.id] = t;
    }
    return out;
  } catch {
    return {};
  }
}

/** "12 days", "1 task". */
export function unitWords(def: AchievementDef, n: number): string {
  return `${n} ${n === 1 ? def.unit[0] : def.unit[1]}`;
}

export const TIER_LABEL: Record<Tier, string> = { bronze: "Bronze", silver: "Silver", gold: "Gold" };
