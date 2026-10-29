/**
 * Demo data for Staff → People (/demo/staff). Edits are applied to this in-memory copy
 * through the same validation the server uses (normaliseStaffDetails), so a bad value
 * is refused here exactly as it would be in the app.
 */

import { departmentsOf, normaliseStaffDetails, sortStaff, type StaffPerson, type StaffDetailsUpdate } from "@/lib/staff";
import {
  EMPTY_SENSITIVE,
  changedSensitiveFields,
  deleteBlockReason,
  normaliseEmployment,
  normaliseSensitive,
  normaliseSupplier,
  profileAccess,
  type EmploymentDetails,
  type HrAccessAction,
  type HrAccessEntry,
  type SensitiveDetails,
  type StaffProfile,
  type SupplierInput,
  type SupplierRecord,
} from "@/lib/hr";

const base = (over: Partial<StaffPerson> & Pick<StaffPerson, "key" | "name">): StaffPerson => ({
  memberId: null,
  recordId: null,
  preferredName: null,
  pronouns: null,
  archivedAt: null,
  email: null,
  avatarUrl: null,
  role: null,
  jobTitle: null,
  department: null,
  employmentType: null,
  startDate: null,
  managerRecordId: null,
  managerName: null,
  isDeveloper: false,
  primaryStack: null,
  currentClients: [],
  ...over,
});

const people: StaffPerson[] = [
  base({ key: "m:1", memberId: "m1", recordId: "r1", name: "Priya Shah", email: "priya@northwind.co", role: "SUPER_ADMIN", jobTitle: "Managing director", department: "Leadership", employmentType: "EMPLOYEE", startDate: "2019-04-01" }),
  base({ key: "m:2", memberId: "m2", recordId: "r2", name: "Tom Okafor", email: "tom@northwind.co", role: "ADMIN", jobTitle: "Delivery lead", department: "Delivery", employmentType: "EMPLOYEE", startDate: "2021-09-06", managerRecordId: "r1", currentClients: [{ name: "Acme Retail", slug: "acme" }, { name: "Fairway Nine", slug: "fairway" }] }),
  base({ key: "m:3", memberId: "m3", recordId: "r3", name: "Ali Hassan", email: "ali@northwind.co", role: "DEVELOPER", department: "Engineering", employmentType: "CONTRACTOR", isDeveloper: true, primaryStack: "React Native", managerRecordId: "r2", currentClients: [{ name: "Acme Retail", slug: "acme" }] }),
  base({ key: "m:4", memberId: "m4", name: "Bea Lindqvist", email: "bea@northwind.co", role: "STAFF" }),
  // No login and no history: the one record Delete is offered on.
  base({ key: "r:6", recordId: "r6", name: "Jo Reed", email: "jo@example.com", jobTitle: "Copywriter", employmentType: "FREELANCER" }),
  // Someone who has left, so People → Archived has a row.
  base({ key: "r:7", recordId: "r7", name: "Dana Pike", email: "dana@example.com", jobTitle: "QA contractor", employmentType: "CONTRACTOR", archivedAt: "2026-10-02T09:00:00.000Z" }),
  base({ key: "r:5", recordId: "r5", name: "Carlos Mendes", email: "carlos@freelance.dev", jobTitle: "Brand designer", department: "Design", employmentType: "FREELANCER", startDate: "2025-11-17", currentClients: [{ name: "Fairway Nine", slug: "fairway" }] }),
];

function relink() {
  const names = new Map(people.filter((p) => p.recordId).map((p) => [p.recordId!, p.name]));
  for (const p of people) p.managerName = p.managerRecordId ? names.get(p.managerRecordId) ?? null : null;
}
relink();

function apply(p: StaffPerson, v: StaffDetailsUpdate) {
  if (v.jobTitle !== undefined) p.jobTitle = v.jobTitle;
  if (v.department !== undefined) p.department = v.department;
  if (v.employmentType !== undefined) p.employmentType = v.employmentType;
  if (v.startDate !== undefined) p.startDate = v.startDate;
  if (v.managerRecordId !== undefined) p.managerRecordId = v.managerRecordId;
  relink();
}

// ── HR (docs/hr-platform.md): the demo viewer is HR, looking at other people's records ──

const suppliers: Array<Omit<SupplierRecord, "peopleCount">> = [
  {
    id: "s1",
    name: "Indus Dev Partners",
    companyNumber: "0123456",
    vatNumber: null,
    country: "Pakistan",
    contactName: "Sana Iqbal",
    contactEmail: "sana@indusdev.example",
    agreementRenewsOn: "2026-11-20",
    notes: null,
    archived: false,
  },
];

const employment = new Map<string, EmploymentDetails>([
  ["r1", { supplierId: null, endDate: null, probationEndsOn: null, noticePeriodWeeks: 12, daysPerWeek: 5 }],
  ["r2", { supplierId: null, endDate: null, probationEndsOn: "2026-11-10", noticePeriodWeeks: 4, daysPerWeek: 4 }],
  ["r3", { supplierId: "s1", endDate: "2027-03-31", probationEndsOn: null, noticePeriodWeeks: 2, daysPerWeek: 5 }],
]);

const sensitive = new Map<string, SensitiveDetails>([
  [
    "r2",
    {
      ...EMPTY_SENSITIVE,
      dateOfBirth: "1990-06-14",
      homeAddress: "12 Quay Street\nManchester\nM3 3JE",
      personalPhone: "07700 900123",
      niNumber: "AB123456C",
      rightToWorkExpiry: null,
      emergencyContacts: [{ name: "Ada Okafor", relationship: "Partner", phone: "07700 900456" }],
    },
  ],
]);

const accessLog: Array<HrAccessEntry & { recordId: string }> = [];
let logSeq = 0;
function log(recordId: string, action: HrAccessAction, detail: string | null = null) {
  accessLog.unshift({ id: `l${++logSeq}`, recordId, action, actorName: "You (demo)", detail, at: new Date().toISOString() });
}

const emptyEmployment = (): EmploymentDetails => ({ supplierId: null, endDate: null, probationEndsOn: null, noticePeriodWeeks: null, daysPerWeek: null });

function demoProfile(p: StaffPerson): StaffProfile {
  const access = profileAccess({ relation: "other", canViewStaff: true, canManageStaff: false, canManageHr: true, canViewSensitive: true });
  const e = employment.get(p.recordId!) ?? emptyEmployment();
  return {
    recordId: p.recordId!,
    memberId: p.memberId,
    name: p.name,
    preferredName: p.preferredName,
    pronouns: p.pronouns,
    email: p.email,
    avatarUrl: p.avatarUrl,
    role: p.role,
    jobTitle: p.jobTitle,
    department: p.department,
    employmentType: p.employmentType,
    startDate: p.startDate,
    managerRecordId: p.managerRecordId,
    managerName: p.managerName,
    currentClients: p.currentClients,
    isDeveloper: p.isDeveloper,
    relation: "other",
    access,
    employment: { ...e, supplierName: suppliers.find((s) => s.id === e.supplierId)?.name ?? null },
    hasSensitive: sensitive.has(p.recordId!),
    lifecycle: demoLifecycle(p),
  };
}

// The demo viewer is an Admin with Staff manage, so every action the rules allow is offered.
function demoLifecycle(p: StaffPerson) {
  const blocked = deleteBlockReason({ hasLogin: Boolean(p.memberId), placements: p.currentClients.length, analysisRuns: p.isDeveloper ? 1 : 0, assessments: 0 });
  return {
    hasLogin: Boolean(p.memberId),
    archived: Boolean(p.archivedAt),
    archivedAt: p.archivedAt,
    restorable: true,
    canArchive: p.role !== "SUPER_ADMIN",
    canDelete: !blocked,
    deleteBlockedReason: blocked,
  };
}

// A stable pseudo-random week of work per person, so the heatmap looks lived-in and doesn't flicker.
function demoActivity(p: StaffPerson) {
  const days: Array<{ date: string; value: number }> = [];
  let seed = [...(p.recordId ?? "x")].reduce((a, c) => a + c.charCodeAt(0), 0);
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const today = new Date();
  for (let i = 26 * 7 - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    days.push({ date: d.toISOString().slice(0, 10), value: p.memberId && !weekend ? Math.floor(rand() * 5) : 0 });
  }
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  return {
    completedByDay: p.memberId ? days : [],
    completedTotal: days.reduce((a, d) => a + d.value, 0),
    placements: p.currentClients.map((c, i) => ({ clientName: c.name, slug: c.slug, startDate: `2025-0${i + 3}-01`, endDate: null, allocationPercent: i ? 50 : 100 })),
    upcomingLeave: p.memberId ? [{ start: inDays(12), end: inDays(16), label: "Annual leave", pending: false }] : [],
    allowance: p.memberId ? { allocated: 25, used: 14, pending: 0, remaining: 11 } : null,
    developer: p.isDeveloper ? { githubHandle: "alihassan", primaryStack: p.primaryStack, techStacks: ["TypeScript", "Swift"] } : null,
  };
}

function demoHrOverview() {
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  return {
    comingUp: [
      { kind: "probation-end", date: inDays(12), name: "Tom Okafor", href: "/app/staff/r2" },
      { kind: "supplier-renewal", date: inDays(22), name: "Indus Dev Partners", href: "/app/staff/suppliers" },
      { kind: "contract-end", date: inDays(48), name: "Carlos Mendes", href: "/app/staff/r5" },
    ],
    missing: [
      { recordId: "r3", name: "Ali Hassan", missing: ["start date", "personal details"] },
      { recordId: "r5", name: "Carlos Mendes", missing: ["manager", "personal details"] },
    ],
  };
}

/** Settings → Team's archive and restore, which Staff uses for anyone who signs in. */
export function resolveDemoTeamArchive(pathname: string, method: string): unknown {
  const m = pathname.match(/^\/api\/team\/members\/([^/]+)\/(archive|restore)$/);
  if (!m || method !== "POST") return undefined;
  const p = people.find((x) => x.memberId === decodeURIComponent(m[1]));
  if (!p) return { error: "Member not found", __status: 404 };
  p.archivedAt = m[2] === "archive" ? new Date().toISOString() : null;
  return { ok: true };
}

function resolveDemoHr(pathname: string, method: string, body: Record<string, unknown>): unknown {
  if (pathname === "/api/staff/suppliers") {
    if (method === "POST") {
      const v = normaliseSupplier(body as SupplierInput, true);
      if (!v.ok) return { error: v.error, __status: 400 };
      const id = `s${suppliers.length + 1}`;
      suppliers.push({ id, name: v.value.name!, companyNumber: null, vatNumber: null, country: null, contactName: null, contactEmail: null, agreementRenewsOn: null, notes: null, archived: false, ...v.value });
      return { id };
    }
    return {
      suppliers: suppliers.map((s) => ({ ...s, peopleCount: [...employment.values()].filter((e) => e.supplierId === s.id).length })),
    };
  }
  const sup = pathname.match(/^\/api\/staff\/suppliers\/([^/]+)$/);
  if (sup && method === "PATCH") {
    const s = suppliers.find((x) => x.id === decodeURIComponent(sup[1]));
    if (!s) return { error: "Supplier not found", __status: 404 };
    const v = normaliseSupplier(body as SupplierInput, false);
    if (!v.ok) return { error: v.error, __status: 400 };
    Object.assign(s, v.value);
    if (typeof body.archived === "boolean") s.archived = body.archived;
    return { ok: true };
  }
  if (pathname === "/api/staff/hr-overview") return demoHrOverview();
  const m = pathname.match(/^\/api\/staff\/([^/]+)(?:\/(employment|personal|access-log|archive|activity))?$/);
  if (!m) return undefined;
  const recordId = decodeURIComponent(m[1]);
  const p = people.find((x) => x.recordId === recordId);
  if (!p) return m[2] || method === "GET" || method === "DELETE" ? { error: "Staff record not found", __status: 404 } : undefined;
  if (!m[2] && method === "DELETE") {
    const reason = demoLifecycle(p).deleteBlockedReason;
    if (reason) return { error: reason, __status: 400 };
    people.splice(people.indexOf(p), 1);
    return { ok: true, name: p.name };
  }
  if (!m[2]) return method === "GET" ? demoProfile(p) : undefined;
  if (m[2] === "activity") return demoActivity(p);
  if (m[2] === "archive" && method === "POST") {
    if (p.memberId) return { error: "They sign in to Foundry, so they're archived on their login.", __status: 400 };
    p.archivedAt = body.archived === false ? null : new Date().toISOString();
    return { ok: true };
  }
  if (m[2] === "employment" && method === "PATCH") {
    const v = normaliseEmployment(body);
    if (!v.ok) return { error: v.error, __status: 400 };
    employment.set(recordId, { ...(employment.get(recordId) ?? emptyEmployment()), ...v.value });
    log(recordId, "UPDATE_EMPLOYMENT", Object.keys(v.value).join(", "));
    return { ok: true };
  }
  if (m[2] === "personal") {
    const before = sensitive.get(recordId) ?? { ...EMPTY_SENSITIVE, emergencyContacts: [] };
    if (method === "PUT") {
      const v = normaliseSensitive(body as Partial<SensitiveDetails>, new Date().toISOString().slice(0, 10));
      if (!v.ok) return { error: v.error, __status: 400 };
      const changed = changedSensitiveFields(before, v.value);
      sensitive.set(recordId, v.value);
      if (changed.length) log(recordId, "UPDATE_SENSITIVE", changed.join(", "));
      return v.value;
    }
    log(recordId, "VIEW_SENSITIVE");
    return before;
  }
  if (m[2] === "access-log") {
    return {
      entries: accessLog
        .filter((e) => e.recordId === recordId)
        .map((e) => ({ id: e.id, action: e.action, actorName: e.actorName, detail: e.detail, at: e.at })),
    };
  }
  return undefined;
}

export function resolveDemoStaff(pathname: string, init?: { method?: string; body?: unknown }, search?: URLSearchParams): unknown {
  const body = (typeof init?.body === "string" ? JSON.parse(init.body) : {}) as StaffDetailsUpdate & {
    memberId?: string;
    name?: string;
    email?: string | null;
  };
  const hr = resolveDemoHr(pathname, init?.method ?? "GET", body as Record<string, unknown>);
  if (hr !== undefined) return hr;
  if (pathname === "/api/staff" && init?.method === "POST") {
    const details = normaliseStaffDetails(body);
    if (!details.ok) return { error: details.error, __status: 400 };
    const recordId = `r${people.length + 10}`;
    const existing = body.memberId ? people.find((p) => p.memberId === body.memberId) : undefined;
    if (existing) {
      existing.recordId = recordId;
      apply(existing, details.value);
    } else {
      if (!body.name?.trim()) return { error: "Enter a name", __status: 400 };
      const p = base({ key: `r:${recordId}`, recordId, name: body.name.trim(), email: body.email ?? null });
      apply(p, details.value);
      people.push(p);
    }
    return { recordId };
  }
  if (pathname === "/api/staff") {
    const archivedView = search?.get("view") === "archived";
    const shown = people.filter((p) => Boolean(p.archivedAt) === archivedView);
    return { people: sortStaff(shown), departments: departmentsOf(shown) };
  }
  const m = pathname.match(/^\/api\/staff\/([^/]+)$/);
  if (m && init?.method === "PATCH") {
    const p = people.find((x) => x.recordId === decodeURIComponent(m[1]));
    if (!p) return { error: "Staff record not found", __status: 404 };
    const details = normaliseStaffDetails(body);
    if (!details.ok) return { error: details.error, __status: 400 };
    apply(p, details.value);
    return { ok: true };
  }
  return undefined;
}
