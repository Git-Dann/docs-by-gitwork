/**
 * Demo data for the Portal Timeline card and the weekly update, run through the real rules
 * (src/lib/client-delivery-timeline.ts, src/lib/weekly-update.ts). Every name is invented.
 */

import { groupByWeek, weekStart, type DeliveryItem, type LoadedTimeline } from "@/lib/client-delivery-timeline";
import { plainDraft, weeklyFacts, type WeeklyUpdateResult } from "@/lib/weekly-update";

const daysAgo = (now: Date, d: number, h = 11) => {
  const x = new Date(now.getTime() - d * 86_400_000);
  x.setUTCHours(h, 0, 0, 0);
  return x.toISOString();
};

export function demoDeliveryTimeline(slug: string, now: Date = new Date()): LoadedTimeline {
  const task = (id: string) => `/app/portal/${slug}/tasks?task=${id}`;
  const items: DeliveryItem[] = [
    { id: "shipped:1", kind: "shipped", at: daysAgo(now, 0), title: "2.4.0 on iOS", detail: "Approved by Priya Anand", href: null, people: [], group: "Booking flow" },
    { id: "done:1", kind: "done", at: daysAgo(now, 0, 10), title: "Send booking confirmations by email", detail: null, href: task("t1"), people: ["Umer"], group: "v2.4 · Bookings" },
    { id: "done:2", kind: "done", at: daysAgo(now, 1), title: "Let members cancel a booking up to 24 hours before", detail: null, href: task("t2"), people: ["Umer", "Jamal"], group: "v2.4 · Bookings" },
    { id: "done:3", kind: "done", at: daysAgo(now, 2), title: "Fix the calendar showing the wrong day for late bookings", detail: null, href: task("t3"), people: ["Jamal"], group: "v2.4 · Bookings" },
    { id: "meeting:1", kind: "meeting", at: daysAgo(now, 2, 14), title: "Weekly check-in", detail: "Agreed to release the booking changes on Friday and start the reports next week.", href: null, people: [], group: null },
    { id: "incident:1", kind: "incident", at: daysAgo(now, 3, 7), title: "Production API went down", detail: "Back after 12 min", href: "/app/monitors", people: [], group: null },
    { id: "request:1", kind: "request", at: daysAgo(now, 3), title: "Add a waiting list when a class is full", detail: "Raised by Priya Anand", href: null, people: [], group: null },
    { id: "started:1", kind: "started", at: daysAgo(now, 1, 15), title: "Monthly usage report for club managers", detail: null, href: task("t4"), people: ["Abdullah"], group: "Reports" },
    { id: "done:4", kind: "done", at: daysAgo(now, 8), title: "Move hosting to the client's own cloud account", detail: null, href: task("t5"), people: ["Syed"], group: "Platform" },
    { id: "done:5", kind: "done", at: daysAgo(now, 9), title: "Automatic releases for the web app", detail: null, href: task("t6"), people: ["Syed"], group: "Platform" },
    { id: "tidy:old", kind: "tidy", at: daysAgo(now, 9, 11), title: "7 older tasks marked done together", detail: "Platform. Closed in one go and never started on the board, so not counted as work done this week.", href: null, people: [], group: null },
    { id: "document:1", kind: "document", at: daysAgo(now, 10), title: "Reports: statement of work", detail: "Accepted", href: null, people: [], group: null },
    { id: "done:6", kind: "done", at: daysAgo(now, 16), title: "New sign-up screens", detail: null, href: task("t7"), people: ["Umer"], group: "Onboarding" },
  ];
  const from = weekStart(new Date(now.getTime() - 7 * 7 * 86_400_000));
  return {
    clientName: "Northwind Labs",
    contacts: [
      { name: "Priya Anand", email: "priya@example.com" },
      { name: "Tom Hale", email: "tom@example.com" },
    ],
    weeks: groupByWeek(items, from, now),
    state: {
      inProgress: [
        { id: "t4", title: "Monthly usage report for club managers", group: "Reports", people: ["Abdullah"], dueDate: null },
        { id: "t8", title: "Waiting list when a class is full", group: "v2.5", people: ["Umer"], dueDate: daysAgo(now, 2) },
      ],
      upNext: [
        { id: "t9", title: "Export reports as CSV", group: "Reports", people: [], dueDate: daysAgo(now, -9) },
        { id: "t10", title: "Push notifications for booking reminders", group: "v2.5", people: [], dueDate: null },
      ],
      waitingOnClient: [
        { id: "blocked:t11", title: "Payments in the app", need: "We need admin access to your Stripe account.", since: daysAgo(now, 4), href: null },
        { id: "approve:c2", title: "2.4.0 on Android", need: "Approve the release", since: daysAgo(now, 1), href: null },
      ],
      nextRelease: { label: "v2.5 · Waiting lists", endDate: daysAgo(now, -18), done: 3, total: 9 },
    },
    from: from.toISOString(),
    readAt: now.toISOString(),
    failed: [],
  };
}

export function demoWeeklyUpdate(slug: string, week: "this" | "last", now: Date = new Date()): WeeklyUpdateResult {
  const t = demoDeliveryTimeline(slug, now);
  const w = t.weeks[week === "last" ? 1 : 0];
  const facts = weeklyFacts(t, w, { author: "Dan Lindsay", now });
  return {
    draft: plainDraft(facts),
    source: "plain",
    reason: "The demo shows the plain version. With AI on, it's written in your own voice from the same facts.",
    cached: false,
    facts,
    to: t.contacts.map((c) => c.email).filter((e): e is string => Boolean(e)),
    week: { start: w.start, label: w.label },
    failed: [],
  };
}

/** ⌘K record search on the demo: a fixed set, matched with the same all-words rule as the server. */
export function demoSearch(q: string | null): import("@/lib/global-search").SearchResponse {
  const query = (q ?? "").trim();
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  const all: import("@/lib/global-search").SearchHit[] = [
    { id: "task:t1", group: "Tasks", title: "Send booking confirmations by email", hint: "Northwind Labs · Done", href: "/app/portal/northwind/tasks?task=t1" },
    { id: "task:t8", group: "Tasks", title: "Waiting list when a class is full", hint: "Northwind Labs · Doing", href: "/app/portal/northwind/tasks?task=t8" },
    { id: "task:t9", group: "Tasks", title: "Export reports as CSV", hint: "Northwind Labs · To do", href: "/app/portal/northwind/tasks?task=t9" },
    { id: "request:r1", group: "Requests", title: "Add a waiting list when a class is full", hint: "Northwind Labs · Open", href: "/app/portal/northwind/wiki#intake" },
    { id: "meeting:m1", group: "Meetings", title: "Weekly check-in", hint: "Northwind Labs · 18 Nov 2026", href: "/app/portal/northwind" },
    { id: "care:c1", group: "Care", title: "Booking email never arrived", hint: "Northwind Labs · sam@example.com", href: "/app/care" },
    { id: "person:p1", group: "People", title: "Umer Farooq", hint: "Senior developer", href: "/app/staff/r2" },
  ];
  const hits = words.length ? all.filter((h) => words.every((w) => `${h.title} ${h.hint}`.toLowerCase().includes(w))) : [];
  return { query, hits, failed: [] };
}
