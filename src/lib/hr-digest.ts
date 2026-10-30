/**
 * The weekly HR digest (docs/hr-platform.md): when it is due, and what it says. Pure, so the
 * timing and the wording are testable without a database, a clock or a mail server.
 *
 * It is HR's "For HR" card, delivered: what is coming up, what is waiting to be checked, and
 * whose record is incomplete. A quiet week sends nothing.
 */

import { COMING_UP_LABEL, daysUntil, type ComingUpItem, type MissingDetail } from "@/lib/hr";

/** Mondays from this hour, UK time. */
export const DIGEST_HOUR = 8;
/** The digest looks this far ahead. The For HR card shows 60 days; a week's email needs less. */
export const DIGEST_DAYS_AHEAD = 30;
const LIST_CAP = 8;
const TZ = "Europe/London";

function londonParts(now: Date): { weekday: number; hour: number; date: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return { weekday, hour: Number(get("hour")), date: `${get("year")}-${get("month")}-${get("day")}` };
}

/** ISO 8601 week, e.g. "2026-W45". The week belongs to the year its Thursday is in. */
export function isoWeekKey(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil((d.getTime() - yearStart) / 86_400_000 / 7 + 1 / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * The week a digest is due for, or null. Only on a Monday from 08:00 UK time, so it arrives
 * at the start of the week. A Monday the worker misses is skipped rather than sent late on a
 * Thursday: by then it's last week's news.
 */
export function digestWeekDue(now: Date): string | null {
  const { weekday, hour, date } = londonParts(now);
  if (weekday !== 1 || hour < DIGEST_HOUR) return null;
  return isoWeekKey(date);
}

/** Today's date in the UK, for counting days ahead. */
export function londonToday(now: Date): string {
  return londonParts(now).date;
}

export interface HrDigestInput {
  comingUp: ComingUpItem[];
  missing: MissingDetail[];
  /** Documents people have added that are waiting for HR to accept or send back. */
  toCheck: number;
}

export interface HrDigest {
  title: string;
  /** One line for the in-app notification. */
  body: string;
  text: string;
  html: string;
  counts: { comingUp: number; toCheck: number; missing: number };
}

const shortDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

function when(date: string, today: string): string {
  const d = daysUntil(date, today);
  if (d < 0) return `${shortDate(date)} (passed)`;
  if (d === 0) return "today";
  return shortDate(date);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The digest, or null when there is nothing to say: a quiet week sends nothing.
 *
 * ⚠️ Right-to-work dates come from the encrypted personal tier, and an email leaves Foundry.
 * They are left out and counted instead ("2 right-to-work dates: see Staff"), so the digest
 * carries no personal details while HR still knows to look. The For HR card shows them.
 */
export function composeHrDigest(input: HrDigestInput, today: string, appUrl: string): HrDigest | null {
  const upcoming = input.comingUp.filter((i) => daysUntil(i.date, today) <= DIGEST_DAYS_AHEAD);
  const comingUp = upcoming.filter((i) => i.kind !== "right-to-work");
  const rightToWork = upcoming.length - comingUp.length;
  const missing = input.missing;
  const toCheck = Math.max(0, input.toCheck);
  if (!comingUp.length && !rightToWork && !missing.length && !toCheck) return null;

  const base = appUrl.replace(/\/+$/, "");
  const parts: string[] = [];
  if (comingUp.length + rightToWork) parts.push(`${comingUp.length + rightToWork} coming up`);
  if (toCheck) parts.push(`${toCheck} to check`);
  if (missing.length) parts.push(plural(missing.length, "record incomplete", "records incomplete"));
  const title = `HR this week: ${parts.join(", ")}`;

  const lines: string[] = [title, ""];
  const html: string[] = [
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1C1917;max-width:560px">`,
    `<p style="margin:0 0 16px;font-size:16px;font-weight:600">${esc(title)}</p>`,
  ];
  const section = (heading: string) => {
    lines.push(heading.toUpperCase());
    html.push(
      `<p style="margin:20px 0 6px;font-family:Menlo,Consolas,monospace;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#78716C">${esc(heading)}</p>`,
    );
  };

  if (comingUp.length || rightToWork) {
    section(`Coming up in the next ${DIGEST_DAYS_AHEAD} days`);
    if (comingUp.length) html.push(`<ul style="margin:0;padding-left:18px">`);
    for (const i of comingUp.slice(0, LIST_CAP)) {
      const what = `${i.name} · ${COMING_UP_LABEL[i.kind].toLowerCase()}`;
      lines.push(`- ${what}: ${when(i.date, today)}`);
      html.push(`<li><a href="${esc(base + i.href)}" style="color:#1D4ED8">${esc(what)}</a> · ${esc(when(i.date, today))}</li>`);
    }
    if (comingUp.length) html.push(`</ul>`);
    if (comingUp.length > LIST_CAP) {
      lines.push(`and ${comingUp.length - LIST_CAP} more`);
      html.push(`<p style="margin:4px 0 0;color:#78716C">and ${comingUp.length - LIST_CAP} more</p>`);
    }
    if (rightToWork) {
      const line = `${plural(rightToWork, "right-to-work date", "right-to-work dates")}: see Staff (kept out of email).`;
      lines.push(line);
      html.push(`<p style="margin:4px 0 0;color:#78716C">${esc(line)}</p>`);
    }
  }
  if (toCheck) {
    section("Waiting for you to check");
    const line = `${plural(toCheck, "document", "documents")} people have added, waiting to be accepted or sent back.`;
    lines.push(line);
    html.push(`<p style="margin:0">${esc(line)}</p>`);
  }
  if (missing.length) {
    section("Records missing details");
    html.push(`<ul style="margin:0;padding-left:18px">`);
    for (const m of missing.slice(0, LIST_CAP)) {
      lines.push(`- ${m.name}: ${m.missing.join(", ")}`);
      html.push(
        `<li><a href="${esc(`${base}/app/staff/${m.recordId}`)}" style="color:#1D4ED8">${esc(m.name)}</a> · ${esc(m.missing.join(", "))}</li>`,
      );
    }
    html.push(`</ul>`);
    if (missing.length > LIST_CAP) {
      lines.push(`and ${missing.length - LIST_CAP} more`);
      html.push(`<p style="margin:4px 0 0;color:#78716C">and ${missing.length - LIST_CAP} more</p>`);
    }
  }

  const staffUrl = `${base}/app/staff`;
  lines.push("", `Open Staff: ${staffUrl}`);
  html.push(
    `<p style="margin:24px 0 0"><a href="${esc(staffUrl)}" style="color:#1D4ED8;font-weight:600">Open Staff</a></p>`,
    `<p style="margin:16px 0 0;font-size:12px;color:#78716C">Sent on Mondays to people with HR access in Foundry. Personal details stay in Foundry.</p>`,
    `</div>`,
  );

  const body = comingUp[0]
    ? `${comingUp[0].name} · ${COMING_UP_LABEL[comingUp[0].kind].toLowerCase()}, ${when(comingUp[0].date, today)}`
    : rightToWork
      ? `${plural(rightToWork, "right-to-work date", "right-to-work dates")} coming up`
      : toCheck
      ? `${plural(toCheck, "document", "documents")} waiting to be checked`
      : `${missing[0].name}: ${missing[0].missing.join(", ")}`;

  return {
    title,
    body,
    text: lines.join("\n"),
    html: html.join(""),
    counts: { comingUp: comingUp.length + rightToWork, toCheck, missing: missing.length },
  };
}
