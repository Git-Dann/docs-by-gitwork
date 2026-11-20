/**
 * Demo data for HQ's "Needs you" list and the Money page, run through the real rules
 * (src/lib/needs-you.ts, src/lib/money.ts) so the demo shows what production would.
 * Every name and figure is invented.
 */

import {
  careItems,
  docItems,
  foremanItems,
  monitorItems,
  pulseItems,
  rankItems,
  requestItems,
  type NeedsYouDTO,
} from "@/lib/needs-you";
import { docTerms, summariseMoney, type DocLine, type MoneySummary } from "@/lib/money";
import { parseDealDraft, type DealDraft } from "@/lib/money-deals";
import { ACHIEVEMENTS, progressFor, type AchievementProgress } from "@/lib/achievements";

const hoursAgo = (now: Date, h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

export function demoNeedsYou(now: Date = new Date()): NeedsYouDTO {
  const items = [
    ...monitorItems(
      [
        { clientName: "Northwind Labs", clientSlug: "northwind", monitorId: "m-api", name: "Production API", state: "down", production: true, downSince: hoursAgo(now, 0.3), error: "HTTP 503" },
        { clientName: "Fairway Club", clientSlug: "fairway", monitorId: "m-web", name: "Members site", state: "flaky", production: true, downSince: hoursAgo(now, 2), error: null },
      ],
      now,
    ),
    ...foremanItems([
      {
        key: "OVERDUE_TASKS:cadenza",
        severity: "warn",
        category: "project",
        subjectLabel: "Cadenza",
        headline: "6 tasks overdue",
        evidence: ["Oldest is 9 days late: Checkout retry flow"],
        href: "/demo/tasks",
        metric: 6,
      },
    ]),
    ...careItems([{ supportClientId: "sc-1", clientName: "Northwind Labs", awaiting: 3, oldestAwaitingAt: hoursAgo(now, 30) }], now),
    ...requestItems([{ clientName: "Fairway Club", clientSlug: "fairway", newCount: 4, oldestAt: hoursAgo(now, 60) }], now),
    ...docItems([{ id: "doc-1", title: "Cadenza phase 2 proposal", clientName: "Cadenza", sharedAt: hoursAgo(now, 24 * 9), firstViewedAt: hoursAgo(now, 24 * 7) }], now),
    ...pulseItems([{ key: "url:fairway", name: "fairwayclub.co.uk", reasons: ["Score fell 7 points since the last scan"], urgent: 2, href: "/demo/pulse" }]),
  ];
  // The demo links stay inside the demo.
  const local = items.map((i) => ({ ...i, href: i.href.replace(/^\/app\//, "/demo/") }));
  return {
    items: rankItems(local),
    checked: ["monitors", "foreman", "care", "requests", "docs", "pulse"],
    failed: [],
    readAt: now.toISOString(),
  };
}

const role = (unitCost: number, months: number): DocLine => ({ itemName: "proposal-role:dev", quantity: months, unitCost, subtotal: unitCost * months, costKind: "ONE_OFF" });
const once = (subtotal: number): DocLine => ({ itemName: "Discovery", quantity: 1, unitCost: subtotal, subtotal, costKind: "ONE_OFF" });

function monthsAgo(now: Date, n: number, day = 8): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, day)).toISOString();
}

export function demoMoney(now: Date = new Date()): MoneySummary {
  const won = [
    { id: "w1", title: "Northwind platform build", clientId: "c1", wonAt: monthsAgo(now, 10), terms: docTerms([role(6500, 12), role(4200, 9), once(4500)], null) },
    { id: "w2", title: "Fairway members app", clientId: "c2", wonAt: monthsAgo(now, 7), terms: docTerms([role(5200, 8), once(3000)], { discount: 5 }) },
    { id: "w3", title: "Cadenza retainer", clientId: "c3", wonAt: monthsAgo(now, 5), terms: docTerms([role(3800, 12)], null) },
    { id: "w4", title: "Cadenza phase 1", clientId: "c3", wonAt: monthsAgo(now, 3), terms: docTerms([role(4800, 6)], { currency: "USD" }) },
    { id: "w5", title: "Brightwell discovery", clientId: "c4", wonAt: monthsAgo(now, 1), terms: docTerms([once(8500), role(4500, 4)], null) },
    { id: "w6", title: "Northwind support", clientId: "c1", wonAt: monthsAgo(now, 0, 3), terms: docTerms([role(2400, 12)], null) },
  ];
  const pipeline = [
    { id: "p1", title: "Cadenza phase 2", clientId: "c3", sharedAt: monthsAgo(now, 0, 2), viewed: true, terms: docTerms([role(5200, 6)], null) },
    { id: "p2", title: "Harbour Health discovery", clientId: null, sharedAt: monthsAgo(now, 0, 5), viewed: false, terms: docTerms([once(12000)], null) },
  ];
  return summariseMoney({
    now,
    fx: { base: "GBP", rates: { USD: 0.79, EUR: 0.85 }, asOf: now.toISOString().slice(0, 10) },
    clients: [
      { id: "c1", name: "Northwind Labs", slug: "northwind", team: { amount: 9800, currency: "USD", unpricedDevs: 0 }, retainerDays: null, retainerDaysUsed: null },
      { id: "c2", name: "Fairway Club", slug: "fairway", team: { amount: 4200, currency: "USD", unpricedDevs: 1 }, retainerDays: 6, retainerDaysUsed: 4 },
      { id: "c3", name: "Cadenza", slug: "cadenza", team: { amount: 6100, currency: "USD", unpricedDevs: 0 }, retainerDays: 4, retainerDaysUsed: 5 },
      { id: "c4", name: "Brightwell", slug: "brightwell", team: { amount: 3300, currency: "USD", unpricedDevs: 0 }, retainerDays: null, retainerDaysUsed: null },
      { id: "c5", name: "Quayside", slug: "quayside", team: null, retainerDays: null, retainerDaysUsed: null },
    ],
    won,
    pipeline,
  });
}

/** What reading a sample order form returns, through the real clean-up rules. */
export function demoDealDraft(): DealDraft & { clientId: string | null } {
  const text = "Order form, Harbour Health. Signed 12 November 2026. Senior developer £6,200 per month for 6 months. Discovery £4,500.";
  const draft = parseDealDraft(
    {
      title: "Harbour Health build",
      clientName: "Harbour Health",
      currency: "GBP",
      wonOn: "2026-11-12",
      lines: [
        { label: "Senior developer", kind: "monthly", amount: 6200, months: 6 },
        { label: "Discovery", kind: "once", amount: 4500 },
        { label: "Project management", kind: "monthly", amount: 1200, months: 6 },
      ],
    },
    text,
  );
  return { ...draft, clientId: null };
}

/** A developer a few weeks in: a streak going, silver on the plan, nearly bronze on time. */
export function demoAchievements(): { achievements: AchievementProgress[] } {
  const by = (id: string) => ACHIEVEMENTS.find((d) => d.id === id)!;
  return {
    achievements: [
      progressFor(by("standup-streak"), 23, 14),
      progressFor(by("on-the-plan"), 57),
      progressFor(by("on-time"), 8),
      progressFor(by("deals-won"), 2),
    ],
  };
}
