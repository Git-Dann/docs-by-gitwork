/**
 * The weekly client update: the email Dan writes to clients on a Friday (Campfire, Gaia), drafted
 * from the delivery timeline. Pure, so the facts, the plain draft and the checks are tested.
 *
 * Three rules:
 *  - Drafted, never sent. A person reads it, edits it and sends it from their own mail.
 *  - Only what happened. The AI is given the facts and told it may only rephrase them, a reply that
 *    describes finished work in a week with none is thrown away, and the facts are shown beside the
 *    draft so the person sending it can check every line.
 *  - The plain draft is always there, so an AI outage never leaves the page empty.
 */

import {
  shortDay,
  type DeliveryItem,
  type DeliveryState,
  type DeliveryTimeline,
  type DeliveryWeek,
} from "@/lib/client-delivery-timeline";

export interface WeeklyFacts {
  clientName: string;
  /** "20 Nov": the day the update is written for (the week's last working day so far). */
  dateLabel: string;
  weekLabel: string;
  /** First names to greet. */
  greet: string[];
  /** Who signs it. */
  signOff: string;
  isFriday: boolean;
  /** Finished work, grouped by release or category. */
  done: Array<{ group: string | null; items: Array<{ title: string; people: string[] }> }>;
  shipped: Array<{ title: string; detail: string | null }>;
  outages: Array<{ title: string; detail: string | null }>;
  meetings: Array<{ title: string; detail: string | null }>;
  inProgress: Array<{ title: string; group: string | null; people: string[] }>;
  upNext: Array<{ title: string; group: string | null }>;
  needFromYou: Array<{ title: string; need: string }>;
  nextRelease: DeliveryState["nextRelease"];
  /** The developers who did something this week, first names. */
  team: string[];
}

export interface WeeklyDraft {
  subject: string;
  body: string;
}

const MAX_PER_GROUP = 8;

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The facts for one week of the timeline. */
export function weeklyFacts(t: DeliveryTimeline, week: DeliveryWeek, opts: { author: string; now: Date }): WeeklyFacts {
  const of = (k: DeliveryItem["kind"]) => week.items.filter((i) => i.kind === k);

  const groups = new Map<string, Array<{ title: string; people: string[] }>>();
  for (const i of of("done")) {
    const key = i.group ?? "";
    const list = groups.get(key) ?? [];
    list.push({ title: i.title, people: i.people });
    groups.set(key, list);
  }
  const done = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([group, items]) => ({ group: group || null, items: items.slice(0, MAX_PER_GROUP) }));

  const team: string[] = [];
  for (const i of week.items) for (const p of i.people) if ((i.kind === "done" || i.kind === "started") && !team.includes(p)) team.push(p);

  const greet = t.contacts
    .map((c) => c.name.trim().split(/\s+/)[0])
    .filter(Boolean)
    .filter((n, i, all) => all.indexOf(n) === i)
    .slice(0, 2);

  // The day the update describes: today if it's in this week, else the Friday of that week.
  const start = new Date(`${week.start}T00:00:00Z`);
  const friday = new Date(start.getTime() + 4 * 86_400_000);
  const day = opts.now.getTime() < friday.getTime() + 86_400_000 && opts.now >= start ? opts.now : friday;

  return {
    clientName: t.clientName,
    dateLabel: shortDay(day),
    weekLabel: week.label,
    greet,
    signOff: opts.author.trim().split(/\s+/)[0] || "The Gitwork team",
    isFriday: day.getUTCDay() === 5,
    done,
    shipped: of("shipped").map((i) => ({ title: i.title, detail: i.detail })),
    outages: of("incident").map((i) => ({ title: i.title, detail: i.detail })),
    meetings: of("meeting").map((i) => ({ title: i.title, detail: i.detail })),
    inProgress: t.state.inProgress.slice(0, 8).map((o) => ({ title: o.title, group: o.group, people: o.people })),
    upNext: t.state.upNext.slice(0, 6).map((o) => ({ title: o.title, group: o.group })),
    needFromYou: t.state.waitingOnClient.slice(0, 8).map((w) => ({ title: w.title, need: w.need })),
    nextRelease: t.state.nextRelease,
    team,
  };
}

export type WeeklyUpdateSource = "ai" | "plain";

export interface WeeklyUpdateResult {
  draft: WeeklyDraft;
  source: WeeklyUpdateSource;
  /** Why the plain draft was used, when it was. */
  reason: string | null;
  cached: boolean;
  facts: WeeklyFacts;
  to: string[];
  week: { start: string; label: string };
  failed: string[];
}

export function weeklySubject(f: WeeklyFacts): string {
  return `${f.clientName}: weekly update, ${f.dateLabel}`;
}

/** True when there's nothing from this week to report. */
export function quietWeek(f: WeeklyFacts): boolean {
  return f.done.length === 0 && f.shipped.length === 0 && f.outages.length === 0 && f.meetings.length === 0;
}

/** The draft written without AI: the same shape Dan uses, in plain lines. */
export function plainDraft(f: WeeklyFacts): WeeklyDraft {
  const lines: string[] = [];
  lines.push(f.greet.length ? `Hi ${joinNames(f.greet)},` : "Hi,");
  lines.push("");
  lines.push(quietWeek(f) ? "A quick update on where things are this week." : "Here's a quick summary of this week.");

  if (f.shipped.length) {
    lines.push("", "Released");
    for (const s of f.shipped) lines.push(`- ${s.title}${s.detail ? `. ${s.detail}.` : ""}`);
  }
  for (const g of f.done) {
    lines.push("", g.group ? `${g.group}: done` : "Done this week");
    for (const i of g.items) lines.push(`- ${i.title}`);
  }
  if (f.outages.length) {
    lines.push("", "Service");
    for (const o of f.outages) lines.push(`- ${o.title}${o.detail ? `. ${o.detail}.` : ""}`);
  }
  if (f.inProgress.length || f.upNext.length) {
    lines.push("", f.isFriday ? "Next week" : "Coming up");
    for (const i of f.inProgress) lines.push(`- Carrying on with ${lowerFirst(i.title)}`);
    for (const i of f.upNext.slice(0, Math.max(0, 6 - f.inProgress.length))) lines.push(`- Starting ${lowerFirst(i.title)}`);
  }
  if (f.nextRelease) {
    const due = f.nextRelease.endDate ? `, due ${shortDay(new Date(f.nextRelease.endDate))}` : "";
    lines.push("", `${f.nextRelease.label} is ${f.nextRelease.done} of ${f.nextRelease.total} done${due}.`);
  }
  if (f.needFromYou.length) {
    lines.push("", "What we need from you");
    for (const n of f.needFromYou) lines.push(`- ${n.title}: ${n.need}`);
  }
  lines.push("", f.isFriday ? "Have a great weekend," : "Cheers,", f.signOff);
  return { subject: weeklySubject(f), body: lines.join("\n") };
}

function lowerFirst(s: string): string {
  // Keep acronyms and names ("API", "iOS", "Spark") as they are.
  if (/^[A-Z]{2,}/.test(s) || /^[A-Z][a-z]+[A-Z]/.test(s)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** How Dan writes these, from his own emails to clients. Kept here so it's reviewed with the code. */
export const WEEKLY_UPDATE_SYSTEM = `You write the weekly update email a UK software agency (Gitwork) sends its client on a Friday. You are given the facts of the week as JSON. Write it the way the head of product writes it.

How it reads:
- Open with "Hi <first names>," then one short line ("Here's a quick summary of this week." or "A quick update on this week. It's been a good one." only if a lot was finished).
- Lead with what got finished and what it means for the client and their users, in plain English. Say what it lets them do, not how it was built. No ticket numbers, no counts of tasks, no jargon (say "the test site" not "staging environment" only if it reads better).
- Group by workstream: one short heading per release or area, then a few bullets or a short paragraph.
- Name the developers by first name where it helps ("Umer has the groundwork done").
- Then what's next ("Next week we'll…"), then a "What we need from you" list when there is anything the client needs to do, each a clear ask.
- Mention an outage plainly if there was one, with how long it lasted.
- Calm, confident and warm. British English. Short paragraphs. No em dashes. No hype words (exciting, delighted, crucial, seamless, journey, leverage).
- Close with "Have a great weekend," on a Friday, otherwise "Cheers,", then the sign-off name on its own line.

Hard rules:
- Use only the facts given. Never add work, dates, figures, people or promises that aren't there.
- Every piece of work you mention must come from the facts. You may shorten or rephrase a title, but not invent one.
- If the week was quiet, say so briefly and focus on what's in progress.

Reply with JSON only: {"subject": "<Client>: weekly update, <date>", "body": "<plain text email, \\n for new lines, '- ' for bullets>"}`;

export function promptFacts(f: WeeklyFacts): string {
  return JSON.stringify(
    {
      client: f.clientName,
      date: f.dateLabel,
      greet: f.greet,
      signOff: f.signOff,
      friday: f.isFriday,
      finished: f.done,
      released: f.shipped,
      outages: f.outages,
      meetings: f.meetings,
      inProgress: f.inProgress,
      upNext: f.upNext,
      needFromClient: f.needFromYou,
      nextRelease: f.nextRelease,
    },
    null,
    1,
  );
}

/** Em dashes and en dashes used as dashes become commas; trailing space trimmed. */
export function tidy(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The AI's reply, checked. Null (use the plain draft) when it isn't the right shape, or when it
 * reads as if the week had work in it that the facts don't.
 */
export function parseWeeklyDraft(raw: unknown, f: WeeklyFacts): WeeklyDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const body = typeof r.body === "string" ? tidy(r.body) : "";
  if (body.length < 40 || body.length > 6000) return null;
  // A quiet week mustn't come back describing finished work.
  if (quietWeek(f) && /\b(finished|shipped|released|completed|is now live|went live)\b/i.test(body)) return null;
  const subject = typeof r.subject === "string" && r.subject.trim() ? tidy(r.subject).slice(0, 160) : weeklySubject(f);
  return { subject, body };
}

/** A Gmail compose link with the draft filled in. Nothing is sent or stored. */
export function gmailComposeUrl(to: string[], draft: WeeklyDraft): string {
  const p = new URLSearchParams({ view: "cm", fs: "1", to: to.join(","), su: draft.subject, body: draft.body });
  return `https://mail.google.com/mail/?${p.toString()}`;
}
