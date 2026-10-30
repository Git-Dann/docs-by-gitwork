/**
 * Demo data for Staff → People (/demo/staff). Edits are applied to this in-memory copy
 * through the same validation the server uses (normaliseStaffDetails), so a bad value
 * is refused here exactly as it would be in the app.
 */

import { departmentsOf, normaliseStaffDetails, sortStaff, type StaffPerson, type StaffDetailsUpdate } from "@/lib/staff";
import type { CodeClearCandidateDetail, CodeClearNoteRecord } from "@/types/codeclear";
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
import {
  STAFF_DOCUMENT_LABEL,
  STAFF_DOCUMENT_TYPES,
  isStaffDocumentType,
  normaliseDocumentMeta,
  parseHrDocumentSettings,
  requirementsFor,
  safeDriveLink,
  type HrDocumentSettings,
  type StaffDocumentRecord,
} from "@/lib/hr-documents";

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

// ── Documents: the demo viewer is HR ──────────────────────────────────────────────

let docSettings: HrDocumentSettings = { selfUploadTypes: ["PHOTO_ID", "CERTIFICATE"], driveEnabled: true };
let docSeq = 10;
const demoDocs = new Map<string, StaffDocumentRecord[]>([
  [
    "r2",
    [
      { id: "d1", type: "CONTRACT", title: "Contract", status: "ON_FILE", visibility: "PERSON_HR", filename: "tom-okafor-contract.pdf", size: 182_000, link: null, hasFile: true, expiresOn: null, note: null, uploadedBySelf: false, createdAt: "2021-09-01T09:00:00.000Z", drive: { state: "copied", error: null } },
      { id: "d2", type: "RIGHT_TO_WORK", title: "Right to work", status: "ON_FILE", visibility: "PERSON_HR", filename: "passport.jpg", size: 640_000, link: null, hasFile: true, expiresOn: new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10), note: null, uploadedBySelf: false, createdAt: "2021-09-01T09:00:00.000Z", drive: { state: "copied", error: null } },
      { id: "d3", type: "NDA", title: "NDA", status: "TO_CHECK", visibility: "PERSON_HR", filename: "nda-signed.pdf", size: 98_000, link: null, hasFile: true, expiresOn: null, note: null, uploadedBySelf: true, createdAt: new Date().toISOString(), drive: { state: "failed", error: "Nobody in this workspace has connected Google." } },
    ],
  ],
  [
    "r3",
    [{ id: "d4", type: "NDA", title: "NDA", status: "ON_FILE", visibility: "PERSON_HR", filename: null, size: null, link: "https://drive.google.com/file/d/demo/view", hasFile: false, expiresOn: null, note: null, uploadedBySelf: false, createdAt: "2025-03-01T09:00:00.000Z", drive: null }],
  ],
]);

function demoDocumentsView(p: StaffPerson) {
  const docs = demoDocs.get(p.recordId!) ?? [];
  const today = new Date().toISOString().slice(0, 10);
  return {
    documents: docs,
    required: requirementsFor(p.employmentType, docs.map((d) => ({ type: d.type, status: d.status, expiresOn: d.expiresOn, createdAt: d.createdAt })), today),
    uploadTypes: [...STAFF_DOCUMENT_TYPES],
    canManage: true,
    settings: docSettings,
  };
}

function resolveDemoDocuments(pathname: string, method: string, body: unknown): unknown {
  if (pathname === "/api/staff/document-settings") {
    if (method === "PATCH") docSettings = parseHrDocumentSettings(body);
    return docSettings;
  }
  const one = pathname.match(/^\/api\/staff\/documents\/([^/]+)(?:\/(drive))?$/);
  if (one) {
    for (const [recordId, list] of demoDocs) {
      const d = list.find((x) => x.id === one[1]);
      if (!d) continue;
      if (one[2] === "drive") {
        d.drive = { state: "copied", error: null };
        return { ok: true };
      }
      if (method === "DELETE") {
        demoDocs.set(recordId, list.filter((x) => x.id !== d.id));
        log(recordId, "DELETE_DOCUMENT", STAFF_DOCUMENT_LABEL[d.type]);
        return { ok: true };
      }
      const b = (body ?? {}) as { review?: string; note?: string | null };
      if (b.review) {
        d.status = b.review === "accept" ? "ON_FILE" : "REJECTED";
        d.note = b.review === "reject" ? b.note ?? null : d.note;
        log(recordId, "REVIEW_DOCUMENT", `${STAFF_DOCUMENT_LABEL[d.type]}: ${b.review === "accept" ? "accepted" : "sent back"}`);
      }
      return d;
    }
    return { error: "Document not found", __status: 404 };
  }
  const m = pathname.match(/^\/api\/staff\/([^/]+)\/documents(?:\/(request|link))?$/);
  if (!m) return undefined;
  const p = people.find((x) => x.recordId === decodeURIComponent(m[1]));
  if (!p) return { error: "Staff record not found", __status: 404 };
  const list = demoDocs.get(p.recordId!) ?? [];
  if (method === "GET") return demoDocumentsView(p);
  const fields: Record<string, unknown> =
    body instanceof FormData ? Object.fromEntries([...body.entries()].filter(([, v]) => typeof v === "string")) : ((body ?? {}) as Record<string, unknown>);
  if (m[2] === "request") {
    if (!isStaffDocumentType(fields.type)) return { error: "Choose what kind of document to ask for", __status: 400 };
    const d: StaffDocumentRecord = { id: `d${++docSeq}`, type: fields.type, title: STAFF_DOCUMENT_LABEL[fields.type], status: "REQUESTED", visibility: "PERSON_HR", filename: null, size: null, link: null, hasFile: false, expiresOn: null, note: null, uploadedBySelf: false, createdAt: new Date().toISOString(), drive: null };
    demoDocs.set(p.recordId!, [d, ...list]);
    return d;
  }
  const meta = normaliseDocumentMeta(fields);
  if (!meta.ok) return { error: meta.error, __status: 400 };
  let link: string | null = null;
  if (m[2] === "link") {
    link = safeDriveLink(fields.link);
    if (!link) return { error: "Paste a Google Drive or Google Docs link (https://drive.google.com/…)", __status: 400 };
  }
  const file = body instanceof FormData ? body.get("file") : null;
  const d: StaffDocumentRecord = {
    id: `d${++docSeq}`,
    type: meta.value.type,
    title: meta.value.type === "OTHER" && file instanceof File ? file.name : meta.value.title,
    status: "ON_FILE",
    visibility: meta.value.visibility,
    filename: file instanceof File ? file.name : null,
    size: file instanceof File ? file.size : null,
    link,
    hasFile: file instanceof File,
    expiresOn: meta.value.expiresOn,
    note: null,
    uploadedBySelf: false,
    createdAt: new Date().toISOString(),
    drive: file instanceof File ? { state: docSettings.driveEnabled ? "copied" : "off", error: null } : null,
  };
  demoDocs.set(p.recordId!, [d, ...list.filter((x) => !(x.status === "REQUESTED" && x.type === d.type))]);
  log(p.recordId!, "ADD_DOCUMENT", STAFF_DOCUMENT_LABEL[d.type]);
  return d;
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
  const docs = resolveDemoDocuments(
    pathname,
    init?.method ?? "GET",
    typeof FormData !== "undefined" && init?.body instanceof FormData ? init.body : typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
  );
  if (docs !== undefined) return docs;
  const body = (typeof init?.body === "string" ? JSON.parse(init.body) : {}) as StaffDetailsUpdate & {
    memberId?: string;
    name?: string;
    email?: string | null;
  };
  // Backstage → Me: the demo viewer is Tom (r2).
  if (pathname === "/api/staff/me") return { recordId: "r2" };
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

// ── Code's side of a developer (Staff profile → Developer card) ──────────────────

const candidateEdits = new Map<string, Partial<CodeClearCandidateDetail>>();
const candidateNotes = new Map<string, CodeClearNoteRecord[]>([
  ["r3", [{ id: "n1", candidateId: "r3", body: "Strong on React Native performance work; pair him with Tom on the Acme release.", createdBy: "Tom Okafor", createdAt: "2026-09-14T10:00:00.000Z" }]],
]);

function demoCandidate(recordId: string): CodeClearCandidateDetail | null {
  const p = people.find((x) => x.recordId === recordId);
  if (!p || !p.isDeveloper) return null;
  const now = "2026-10-01T00:00:00.000Z";
  return {
    id: recordId,
    workspaceId: "demo",
    rateCardPersonId: null,
    name: p.name,
    githubHandle: "alihassan",
    email: p.email,
    primaryStack: p.primaryStack ?? "TypeScript",
    techStacks: [p.primaryStack ?? "TypeScript", "TypeScript", "Swift"],
    signalSources: [],
    location: "Lahore",
    bio: null,
    wikiBio: "Mobile, end to end",
    status: "PLACED" as CodeClearCandidateDetail["status"],
    tier: "TIER_2",
    tierManualOverride: null,
    effectiveTier: "TIER_2",
    origin: "INTERNAL",
    devGroup: "BENCH",
    published: false,
    avatarUrl: null,
    linkedinUrl: "https://www.linkedin.com/in/example",
    cvUrl: null,
    portfolioUrl: null,
    yearsExperience: 6,
    hourlyRate: null,
    currency: "USD",
    monthlyRate: 4200,
    monthlyRateCurrency: "USD",
    timezone: "Asia/Karachi",
    availability: "ENGAGED",
    recheckDueAt: null,
    createdAt: now,
    updatedAt: now,
    score: null,
    scoreDraft: null,
    latestGitHubAnalysis: null,
    githubAnalysisRuns: [],
    placements: [],
    notes: candidateNotes.get(recordId) ?? [],
    activityLog: [],
    checks: [],
    analysisState: "NEVER_RUN",
    currentClients: p.currentClients.map((c) => ({ id: c.slug, name: c.name, slug: c.slug })),
    ...candidateEdits.get(recordId),
  };
}

export function resolveDemoCandidate(pathname: string, init?: { method?: string; body?: unknown }): unknown {
  const m = pathname.match(/^\/api\/codeclear\/candidates\/([^/]+)(\/notes)?$/);
  if (!m) return undefined;
  const id = decodeURIComponent(m[1]);
  if (!demoCandidate(id)) return { error: "Not found", __status: 404 };
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
  if (m[2] && init?.method === "POST") {
    const note: CodeClearNoteRecord = { id: `n${Date.now()}`, candidateId: id, body: String(body.body ?? ""), createdBy: "You", createdAt: new Date().toISOString() };
    candidateNotes.set(id, [note, ...(candidateNotes.get(id) ?? [])]);
    return { note };
  }
  if (!m[2] && init?.method === "PATCH") candidateEdits.set(id, { ...candidateEdits.get(id), ...body });
  return { candidate: demoCandidate(id) };
}
