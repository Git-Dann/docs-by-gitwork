/**
 * Dispatch's brief: what the panel opens on, before anyone types (Dan, 25 Nov 2026: "I didn't
 * want a chat bot, I wanted something smarter").
 *
 * It reads the client's tasks and releases and says, in a glance, what needs the person, what's
 * coming, and the two or three things Dispatch could do next **because of what it found**, each
 * with the reason. It is worked out here, with no AI call, so opening the panel costs nothing;
 * the model is only used when the person picks something or asks.
 *
 * Pure (data in, brief out) so every rule is tested. Who sees what follows Dispatch's rules
 * (docs/dispatch.md): "needs you" is only the person's own tasks; the per-person split of open
 * work is for admins; anyone may see how much has nobody assigned.
 */

import { isStuck, daysInProgress } from "@/lib/tasks/stuck";

const DAY_MS = 86_400_000;

export interface BriefTask {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  startedAt: string | null;
  createdAt: string;
  assignees: string[];
  mine: boolean;
  flagged: boolean;
  blocked: boolean;
  subtaskCount: number;
  subtaskDoneCount: number;
  release: string | null;
}

export interface BriefRelease {
  version: string;
  startDate: string | null;
  endDate: string | null;
  done: number;
  total: number;
}

export interface BriefInput {
  now: Date;
  clientName: string;
  isAdmin: boolean;
  /** Every open task on the client the person can see. */
  open: BriefTask[];
  /** Tasks finished in the last 7 days. */
  doneThisWeek: BriefTask[];
  releases: BriefRelease[];
  /** The task Dispatch was opened from, if any. */
  focus: BriefTask | null;
}

export type Tone = "danger" | "warning" | "brand" | "neutral";

export interface BriefStat {
  key: string;
  value: string;
  label: string;
  tone: Tone;
  /** Asked when the tile is picked. */
  prompt: string;
}

export interface NeedsYouRow {
  id: string;
  title: string;
  reason: string;
  tone: Tone;
}

export interface BriefSuggestion {
  id: string;
  title: string;
  /** Why it's suggested now, from what the brief found. */
  reason: string;
  prompt: string;
  needsInput?: boolean;
}

export interface FocusCard {
  id: string;
  title: string;
  facts: string[];
  tone: Tone;
  state: string;
}

export interface Brief {
  stats: BriefStat[];
  needsYou: NeedsYouRow[];
  /** Said when nothing on the client is the person's. */
  nothingMine: string | null;
  /** Open tasks per person, for admins only. */
  team: { name: string; count: number }[] | null;
  unassigned: number;
  focus: FocusCard | null;
  suggestions: BriefSuggestion[];
  /** One line on the last 7 days. */
  week: string;
}

const NEEDS_YOU_MAX = 6;
const SUGGESTIONS_MAX = 3;

/** "Thu 27 Nov", in UK time. */
export function shortDay(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" }).format(d);
}

function utcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Whole days from today to a date (negative = past). */
function daysUntil(iso: string, now: Date): number {
  return Math.round((utcDay(new Date(iso)) - utcDay(now)) / DAY_MS);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

const IN_PROGRESS = new Set(["DOING", "IN_REVIEW", "UI_DONE"]);

/** Why a task of the person's needs them, most urgent first; null when it doesn't. */
function needsYouReason(t: BriefTask, now: Date): { rank: number; reason: string; tone: Tone } | null {
  const due = t.dueDate ? daysUntil(t.dueDate, now) : null;
  if (due !== null && due < 0) return { rank: 0, reason: `Overdue ${plural(-due, "day")}`, tone: "danger" };
  if (t.blocked) return { rank: 1, reason: "Waiting on the client", tone: "warning" };
  if (isStuck(t, undefined, now)) return { rank: 2, reason: `In progress ${plural(daysInProgress(t, now) ?? 0, "day")}`, tone: "warning" };
  if (due === 0) return { rank: 3, reason: "Due today", tone: "warning" };
  if (due !== null && due <= 7) return { rank: 4, reason: `Due ${shortDay(t.dueDate!)}`, tone: "brand" };
  if (t.flagged) return { rank: 5, reason: "Flagged", tone: "warning" };
  if (t.status === "IN_REVIEW") return { rank: 6, reason: "In review", tone: "neutral" };
  if (t.status === "DOING") return { rank: 7, reason: "In progress", tone: "neutral" };
  return null;
}

/** The release that's on now or next (soonest end date from today), if any. */
export function currentRelease(releases: readonly BriefRelease[], now: Date): BriefRelease | null {
  const upcoming = releases
    .filter((r) => r.endDate && daysUntil(r.endDate, now) >= 0 && r.done < Math.max(r.total, 1))
    .sort((a, b) => new Date(a.endDate!).getTime() - new Date(b.endDate!).getTime());
  return upcoming[0] ?? null;
}

const quote = (title: string) => `“${title.length > 70 ? `${title.slice(0, 69)}…` : title}”`;

export function buildBrief(input: BriefInput): Brief {
  const { now, open, isAdmin } = input;
  const mine = open.filter((t) => t.mine);
  const unassigned = open.filter((t) => t.assignees.length === 0).length;

  const ranked = mine
    .map((t) => ({ t, why: needsYouReason(t, now) }))
    .filter((x): x is { t: BriefTask; why: NonNullable<ReturnType<typeof needsYouReason>> } => x.why !== null)
    .sort((a, b) => a.why.rank - b.why.rank || (a.t.dueDate ?? "9").localeCompare(b.t.dueDate ?? "9"));
  const needsYou = ranked.slice(0, NEEDS_YOU_MAX).map(({ t, why }) => ({ id: t.id, title: t.title, reason: why.reason, tone: why.tone }));

  const overdue = mine.filter((t) => t.dueDate && daysUntil(t.dueDate, now) < 0);
  const stuck = mine.filter((t) => isStuck(t, undefined, now));
  const thisWeek = mine.filter((t) => IN_PROGRESS.has(t.status) || (t.dueDate !== null && daysUntil(t.dueDate, now) <= 7));
  const attention = new Set([...overdue, ...stuck, ...mine.filter((t) => t.blocked)].map((t) => t.id)).size;
  const release = currentRelease(input.releases, now);

  const stats: BriefStat[] = [
    { key: "open", value: String(mine.length), label: "yours open", tone: "neutral", prompt: "What are my open tasks on this client, most urgent first?" },
    { key: "week", value: String(thisWeek.length), label: "this week", tone: "brand", prompt: "What are my tasks on this client this week?" },
    {
      key: "attention",
      value: String(attention),
      label: "need a look",
      tone: attention ? "warning" : "neutral",
      prompt: "Which of my tasks on this client are overdue, stuck or blocked, and what should I do about each?",
    },
  ];
  if (release) {
    const days = daysUntil(release.endDate!, now);
    stats.push({
      key: "release",
      value: release.version,
      label: days === 0 ? "ships today" : `ships in ${plural(days, "day")}`,
      tone: days <= 3 && release.done < release.total ? "warning" : "neutral",
      prompt: `Where is release ${release.version} up to? What's done, what's left, and is it on track for ${shortDay(release.endDate!)}?`,
    });
  }

  let nothingMine: string | null = null;
  let team: Brief["team"] = null;
  if (!mine.length) {
    nothingMine = `Nothing on ${input.clientName} is assigned to you.`;
    if (isAdmin) {
      const counts = new Map<string, number>();
      for (const t of open) for (const a of t.assignees) counts.set(a, (counts.get(a) ?? 0) + 1);
      team = [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 8);
    }
  }

  // ─── Suggestions: only what the brief has a reason for ───────────────────
  const suggestions: BriefSuggestion[] = [];
  const add = (s: BriefSuggestion) => {
    if (suggestions.length < SUGGESTIONS_MAX && !suggestions.some((x) => x.id === s.id)) suggestions.push(s);
  };

  const focus = input.focus ? focusCard(input.focus, now) : null;
  if (input.focus) for (const s of focusSuggestions(input.focus, now)) add(s);

  if (stuck[0]) {
    const t = stuck[0];
    add({
      id: "unstick",
      title: `Get ${quote(t.title)} moving`,
      reason: `In progress for ${plural(daysInProgress(t, now) ?? 0, "day")}`,
      prompt: `I've had ${quote(t.title)} in progress for ${plural(daysInProgress(t, now) ?? 0, "day")}. Look at the task, its comments, and anything related in Slack or the code, then tell me what's likely holding it up and the next step.`,
    });
  }
  if (overdue.length) {
    add({
      id: "overdue",
      title: "Sort out what's overdue",
      reason: `${plural(overdue.length, "task")} past due`,
      prompt: "Which of my overdue tasks on this client should I do first, and what should I tell the client about the rest?",
    });
  }
  if (release && daysUntil(release.endDate!, now) <= 14) {
    add({
      id: "release-notes",
      title: `Release notes for ${release.version}`,
      reason: `Ships ${shortDay(release.endDate!)} · ${release.done} of ${release.total} done`,
      prompt: `Write client-friendly release notes for ${release.version}: what's new and what's fixed, in plain English. Say if anything in it isn't done yet.`,
    });
  }
  if (mine.some((t) => IN_PROGRESS.has(t.status))) {
    const n = mine.filter((t) => IN_PROGRESS.has(t.status)).length;
    add({
      id: "standup",
      title: "Draft my stand-up",
      reason: `${plural(n, "task")} in progress`,
      prompt: "Draft my stand-up for this client from my tasks and the team's Slack channel: done, doing, blockers. Mention anything I've had in progress for too long.",
    });
  }
  if (!mine.length && unassigned > 0) {
    add(
      isAdmin
        ? {
            id: "assign",
            title: "Who should take the unassigned work?",
            reason: `${plural(unassigned, "open task")} with nobody on ${unassigned === 1 ? "it" : "them"}`,
            prompt: "Suggest who should pick up the unassigned tasks on this client, by platform and by who did similar work. Don't assign anything, just suggest.",
          }
        : {
            id: "pick-up",
            title: "Find something to pick up",
            reason: `${plural(unassigned, "open task")} with nobody on ${unassigned === 1 ? "it" : "them"}`,
            prompt: "Which unassigned tasks on this client could I pick up next? Suggest three that fit the work I've done before, and why.",
          },
    );
  }
  add({
    id: "changed",
    title: "What's changed this week?",
    reason: weekLine(input),
    prompt: "What's changed on this client in the last 7 days? Tasks, meetings, Slack.",
  });

  return { stats, needsYou, nothingMine, team, unassigned, focus, suggestions, week: weekLine(input) };
}

function weekLine(input: BriefInput): string {
  const weekAgo = input.now.getTime() - 7 * DAY_MS;
  const added = [...input.open, ...input.doneThisWeek].filter((t) => new Date(t.createdAt).getTime() >= weekAgo).length;
  return `${input.doneThisWeek.length} done, ${added} new in the last 7 days`;
}

const STATUS_WORDS: Record<string, string> = {
  BACKLOG: "In the backlog",
  TODO: "To do",
  DOING: "In progress",
  IN_REVIEW: "In review",
  UI_DONE: "In review",
  DONE: "Done",
};

function focusCard(t: BriefTask, now: Date): FocusCard {
  const facts: string[] = [];
  const days = daysInProgress(t, now);
  facts.push(days !== null && days > 0 ? `${STATUS_WORDS[t.status] ?? t.status} for ${plural(days, "day")}` : (STATUS_WORDS[t.status] ?? t.status));
  facts.push(t.assignees.length ? t.assignees.join(", ") : "Nobody assigned");
  if (t.dueDate) {
    const d = daysUntil(t.dueDate, now);
    facts.push(d < 0 && t.status !== "DONE" ? `Overdue ${plural(-d, "day")}` : `Due ${shortDay(t.dueDate)}`);
  }
  if (t.subtaskCount) facts.push(`${t.subtaskDoneCount} of ${t.subtaskCount} subtasks done`);
  if (t.release) facts.push(`In ${t.release}`);
  if (t.blocked) facts.push("Waiting on the client");
  if (t.flagged) facts.push("Flagged");
  const overdue = t.dueDate && t.status !== "DONE" && daysUntil(t.dueDate, now) < 0;
  const tone: Tone = overdue ? "danger" : t.blocked || isStuck(t, undefined, now) ? "warning" : t.status === "DONE" ? "neutral" : "brand";
  return { id: t.id, title: t.title, facts, tone, state: STATUS_WORDS[t.status] ?? t.status };
}

/** What makes sense for the task Dispatch was opened from, given where it's up to. */
function focusSuggestions(t: BriefTask, now: Date): BriefSuggestion[] {
  const out: BriefSuggestion[] = [];
  if (!t.subtaskCount && (t.status === "TODO" || t.status === "BACKLOG")) {
    out.push({
      id: "subtasks",
      title: "Break it into subtasks",
      reason: "Not started, no subtasks yet",
      prompt: "Break this task into subtasks with acceptance criteria, dependencies, rough estimates and platforms. Flag missing information and questions to ask the client.",
    });
  }
  if (t.status === "TODO" || t.status === "BACKLOG" || t.status === "DOING") {
    out.push({
      id: "impact",
      title: "What will this touch?",
      reason: "Impact analysis from the code",
      prompt:
        "Do an impact analysis for this task. Search and read the client's code first, then list the files, dependencies, APIs and features it touches, a suggested approach, and the areas most likely to break so we know what to retest.",
    });
  }
  if (isStuck(t, undefined, now)) {
    out.unshift({
      id: "unstick-focus",
      title: "Why is this stuck?",
      reason: `In progress for ${plural(daysInProgress(t, now) ?? 0, "day")}`,
      prompt: "This task has been in progress for a while. Look at it, its comments, and anything related in Slack or the code, then tell me what's likely holding it up and the next step.",
    });
  }
  if (t.status === "IN_REVIEW" || t.status === "UI_DONE" || t.status === "DOING") {
    out.push({
      id: "pr",
      title: "Write the PR description",
      reason: t.status === "DOING" ? "For when it goes to review" : "It's in review",
      prompt: "Write a pull request description for this task: summary, what changed, how to test, and anything reviewers should know.",
    });
    out.push({
      id: "tests",
      title: "Test cases",
      reason: "Positive, negative and edge cases",
      prompt: "Write test cases for this task: positive, negative and edge cases, with expected behaviour, using what was discussed in meetings and Slack.",
    });
  }
  if (t.status === "DONE") {
    out.push({
      id: "explain",
      title: "Explain it for the client",
      reason: "Done, in plain English",
      prompt: "Explain what this task delivered in plain English, as I'd tell the client.",
    });
  }
  return out;
}
