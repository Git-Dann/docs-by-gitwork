/**
 * People & HR rules (docs/hr-platform.md), Phase 1: the person record's employment and
 * sensitive tiers, suppliers, and who may see what. Pure and framework-free, so the
 * server, the profile page and the demo share exactly the same rules.
 *
 * Three tiers on a person:
 *   - directory: name, title, department, clients… (the existing Staff fields);
 *   - employment: supplier, contract end, probation, notice, working pattern;
 *   - sensitive: date of birth, address, NI number, ID, right to work, emergency contacts.
 */

// ── Who may see what ────────────────────────────────────────────────────────────

/** The viewer's relation to the person they're looking at. */
export type ProfileRelation = "self" | "manager" | "other";

export interface ProfileAccess {
  directory: boolean;
  employment: boolean;
  sensitive: boolean;
  editDirectory: boolean;
  editEmployment: boolean;
  editSensitive: boolean;
  accessLog: boolean;
}

/**
 * One rule for every surface. The person always sees their own record; their manager
 * sees employment but never the sensitive tier; HR sees what it has been granted.
 * Editing the sensitive tier needs the right to READ it as well: nobody writes over
 * values they aren't allowed to see.
 */
export function profileAccess(input: {
  relation: ProfileRelation;
  canViewStaff: boolean;
  canManageStaff: boolean;
  canManageHr: boolean;
  canViewSensitive: boolean;
}): ProfileAccess {
  const self = input.relation === "self";
  const directory = self || input.canViewStaff;
  const employment = self || input.relation === "manager" || input.canManageHr;
  const sensitive = self || input.canViewSensitive;
  return {
    directory,
    employment,
    sensitive,
    editDirectory: input.canManageStaff,
    editEmployment: input.canManageHr,
    editSensitive: self || (input.canManageHr && input.canViewSensitive),
    accessLog: input.canManageHr,
  };
}

// ── Access log ──────────────────────────────────────────────────────────────────

export const HR_ACCESS_ACTIONS = [
  "VIEW_SENSITIVE",
  "UPDATE_SENSITIVE",
  "UPDATE_EMPLOYMENT",
  "DOWNLOAD_DOCUMENT",
  "ADD_DOCUMENT",
  "REVIEW_DOCUMENT",
  "DELETE_DOCUMENT",
] as const;
export type HrAccessAction = (typeof HR_ACCESS_ACTIONS)[number];

export const HR_ACCESS_LABEL: Record<HrAccessAction, string> = {
  VIEW_SENSITIVE: "Viewed personal details",
  UPDATE_SENSITIVE: "Changed personal details",
  UPDATE_EMPLOYMENT: "Changed employment details",
  DOWNLOAD_DOCUMENT: "Opened a document",
  ADD_DOCUMENT: "Added a document",
  REVIEW_DOCUMENT: "Checked a document",
  DELETE_DOCUMENT: "Deleted a document",
};

export interface HrAccessEntry {
  id: string;
  action: HrAccessAction;
  actorName: string | null;
  detail: string | null;
  at: string;
}

/**
 * Whether a read of the sensitive tier is written to the log. A person reading their
 * own details is not logged: the log exists to show who ELSE looked.
 */
export function shouldLogSensitiveView(relation: ProfileRelation): boolean {
  return relation !== "self";
}

// ── Shared validation helpers ───────────────────────────────────────────────────

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "" and null clear; otherwise trimmed and length-checked. */
function text(v: unknown, max: number, label: string): Result<string | null> {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v !== "string") return { ok: false, error: `${label} must be text` };
  const t = v.trim();
  if (!t) return { ok: true, value: null };
  if (t.length > max) return { ok: false, error: `${label} must be ${max} characters or fewer` };
  return { ok: true, value: t };
}

/** A calendar date, YYYY-MM-DD. "" and null clear. */
function date(v: unknown, label: string): Result<string | null> {
  if (v === null || v === undefined || v === "") return { ok: true, value: null };
  if (typeof v !== "string" || !DATE_RE.test(v)) return { ok: false, error: `${label} must be a date (YYYY-MM-DD)` };
  const d = new Date(`${v}T00:00:00Z`);
  // Rejects 2026-02-30, which Date would quietly roll into March.
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
    return { ok: false, error: `${label} must be a real date` };
  }
  return { ok: true, value: v };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function email(v: unknown, label: string): Result<string | null> {
  const t = text(v, 200, label);
  if (!t.ok || t.value === null) return t;
  if (!EMAIL_RE.test(t.value)) return { ok: false, error: `${label} must be an email address` };
  return t;
}

// ── Employment tier ─────────────────────────────────────────────────────────────

export interface EmploymentDetails {
  supplierId: string | null;
  endDate: string | null;
  probationEndsOn: string | null;
  noticePeriodWeeks: number | null;
  daysPerWeek: number | null;
}

export type EmploymentUpdate = Partial<EmploymentDetails>;

/** Validates a partial update. Only the keys present are changed. */
export function normaliseEmployment(input: EmploymentUpdate): Result<EmploymentUpdate> {
  const out: EmploymentUpdate = {};
  if (input.supplierId !== undefined) out.supplierId = input.supplierId || null;
  for (const [key, label] of [
    ["endDate", "End date"],
    ["probationEndsOn", "Probation end"],
  ] as const) {
    if (input[key] !== undefined) {
      const r = date(input[key], label);
      if (!r.ok) return r;
      out[key] = r.value;
    }
  }
  if (input.noticePeriodWeeks !== undefined) {
    const n = input.noticePeriodWeeks;
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 52)) {
      return { ok: false, error: "Notice period must be a whole number of weeks, 0 to 52" };
    }
    out.noticePeriodWeeks = n;
  }
  if (input.daysPerWeek !== undefined) {
    const n = input.daysPerWeek;
    // Half days are the finest a working pattern goes; anything else is a typo.
    if (n !== null && (typeof n !== "number" || n < 0.5 || n > 7 || Math.round(n * 2) !== n * 2)) {
      return { ok: false, error: "Days per week must be between 0.5 and 7, in half days" };
    }
    out.daysPerWeek = n;
  }
  return { ok: true, value: out };
}

// ── Sensitive tier ──────────────────────────────────────────────────────────────

export interface EmergencyContact {
  name: string;
  relationship: string | null;
  phone: string;
}

export interface SensitiveDetails {
  dateOfBirth: string | null;
  homeAddress: string | null;
  personalPhone: string | null;
  personalEmail: string | null;
  niNumber: string | null;
  idDocumentNumber: string | null;
  rightToWorkExpiry: string | null;
  emergencyContacts: EmergencyContact[];
}

export const EMPTY_SENSITIVE: SensitiveDetails = {
  dateOfBirth: null,
  homeAddress: null,
  personalPhone: null,
  personalEmail: null,
  niNumber: null,
  idDocumentNumber: null,
  rightToWorkExpiry: null,
  emergencyContacts: [],
};

export const MAX_EMERGENCY_CONTACTS = 4;

/**
 * A UK National Insurance number: two letters, six digits, A to D. The first letter is
 * never D, F, I, Q, U or V; the second never D, F, I, O, Q, U or V. Spaces are allowed
 * on the way in and dropped.
 */
export function normaliseNiNumber(v: string): string | null {
  const t = v.replace(/\s+/g, "").toUpperCase();
  return /^[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\d{6}[A-D]$/.test(t) ? t : null;
}

/** "AB123456C" → "AB 12 34 56 C", the way it is printed on letters. */
export function formatNiNumber(v: string | null): string | null {
  if (!v || v.length !== 9) return v;
  return `${v.slice(0, 2)} ${v.slice(2, 4)} ${v.slice(4, 6)} ${v.slice(6, 8)} ${v.slice(8)}`;
}

/**
 * Validates the whole sensitive tier (it is saved as one encrypted value, so a save is
 * always the full set). `today` is passed in so the date-of-birth check is testable.
 */
export function normaliseSensitive(input: Partial<SensitiveDetails>, today: string): Result<SensitiveDetails> {
  const out: SensitiveDetails = { ...EMPTY_SENSITIVE, emergencyContacts: [] };

  const dob = date(input.dateOfBirth, "Date of birth");
  if (!dob.ok) return dob;
  if (dob.value && dob.value >= today) return { ok: false, error: "Date of birth must be in the past" };
  out.dateOfBirth = dob.value;

  const rtw = date(input.rightToWorkExpiry, "Right to work expiry");
  if (!rtw.ok) return rtw;
  out.rightToWorkExpiry = rtw.value;

  for (const [key, max, label] of [
    ["homeAddress", 400, "Home address"],
    ["personalPhone", 40, "Personal phone"],
    ["idDocumentNumber", 40, "ID number"],
  ] as const) {
    const r = text(input[key], max, label);
    if (!r.ok) return r;
    out[key] = r.value;
  }

  const pe = email(input.personalEmail, "Personal email");
  if (!pe.ok) return pe;
  out.personalEmail = pe.value;

  if (input.niNumber) {
    const ni = normaliseNiNumber(input.niNumber);
    if (!ni) return { ok: false, error: "NI number must look like AB 12 34 56 C" };
    out.niNumber = ni;
  }

  const contacts = Array.isArray(input.emergencyContacts) ? input.emergencyContacts : [];
  for (const [i, c] of contacts.entries()) {
    const n = text(c?.name, 120, "Contact name");
    const rel = text(c?.relationship, 60, "Relationship");
    const ph = text(c?.phone, 40, "Contact phone");
    if (!n.ok) return n;
    if (!rel.ok) return rel;
    if (!ph.ok) return ph;
    // A row left entirely blank is an empty slot, not an error.
    if (!n.value && !rel.value && !ph.value) continue;
    if (!n.value || !ph.value) {
      return { ok: false, error: `Emergency contact ${i + 1} needs a name and a phone number` };
    }
    out.emergencyContacts.push({ name: n.value, relationship: rel.value, phone: ph.value });
  }
  if (out.emergencyContacts.length > MAX_EMERGENCY_CONTACTS) {
    return { ok: false, error: `Up to ${MAX_EMERGENCY_CONTACTS} emergency contacts` };
  }
  return { ok: true, value: out };
}

/** Reads a decrypted payload defensively: an older or damaged value never crashes the page. */
export function parseSensitive(raw: unknown): SensitiveDetails {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const contacts = Array.isArray(o.emergencyContacts) ? o.emergencyContacts : [];
  return {
    dateOfBirth: str(o.dateOfBirth),
    homeAddress: str(o.homeAddress),
    personalPhone: str(o.personalPhone),
    personalEmail: str(o.personalEmail),
    niNumber: str(o.niNumber),
    idDocumentNumber: str(o.idDocumentNumber),
    rightToWorkExpiry: str(o.rightToWorkExpiry),
    emergencyContacts: contacts
      .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>) : {}))
      .filter((c) => str(c.name) && str(c.phone))
      .map((c) => ({ name: str(c.name)!, relationship: str(c.relationship), phone: str(c.phone)! })),
  };
}

/** Which sensitive fields changed, by label: what the access log records instead of values. */
export function changedSensitiveFields(before: SensitiveDetails, after: SensitiveDetails): string[] {
  const labels: Array<[keyof SensitiveDetails, string]> = [
    ["dateOfBirth", "date of birth"],
    ["homeAddress", "home address"],
    ["personalPhone", "personal phone"],
    ["personalEmail", "personal email"],
    ["niNumber", "NI number"],
    ["idDocumentNumber", "ID number"],
    ["rightToWorkExpiry", "right to work expiry"],
    ["emergencyContacts", "emergency contacts"],
  ];
  return labels
    .filter(([k]) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map(([, label]) => label);
}

// ── Suppliers ───────────────────────────────────────────────────────────────────

export interface SupplierInput {
  name?: string;
  companyNumber?: string | null;
  vatNumber?: string | null;
  country?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  agreementRenewsOn?: string | null;
  notes?: string | null;
}

export interface SupplierRecord {
  id: string;
  name: string;
  companyNumber: string | null;
  vatNumber: string | null;
  country: string | null;
  contactName: string | null;
  contactEmail: string | null;
  agreementRenewsOn: string | null;
  notes: string | null;
  archived: boolean;
  /** People on the roster supplied by this company. */
  peopleCount: number;
}

/** Validates a supplier create (`requireName`) or a partial update. */
export function normaliseSupplier(input: SupplierInput, requireName: boolean): Result<SupplierInput> {
  const out: SupplierInput = {};
  if (input.name !== undefined || requireName) {
    const n = text(input.name, 120, "Name");
    if (!n.ok) return n;
    if (!n.value) return { ok: false, error: "Enter the company's name" };
    out.name = n.value;
  }
  for (const [key, max, label] of [
    ["companyNumber", 40, "Company number"],
    ["vatNumber", 40, "VAT number"],
    ["country", 60, "Country"],
    ["contactName", 120, "Contact name"],
    ["notes", 2000, "Notes"],
  ] as const) {
    if (input[key] !== undefined) {
      const r = text(input[key], max, label);
      if (!r.ok) return r;
      out[key] = r.value;
    }
  }
  if (input.contactEmail !== undefined) {
    const r = email(input.contactEmail, "Contact email");
    if (!r.ok) return r;
    out.contactEmail = r.value;
  }
  if (input.agreementRenewsOn !== undefined) {
    const r = date(input.agreementRenewsOn, "Agreement renewal");
    if (!r.ok) return r;
    out.agreementRenewsOn = r.value;
  }
  return { ok: true, value: out };
}

/** How many days until a date ("YYYY-MM-DD"), negative once passed. */
export function daysUntil(dateStr: string, today: string): number {
  const ms = Date.parse(`${dateStr}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** A date that needs attention: passed, or within `withinDays`. Drives the amber/red chips. */
export function dateAttention(dateStr: string | null, today: string, withinDays = 30): "passed" | "soon" | null {
  if (!dateStr) return null;
  const d = daysUntil(dateStr, today);
  if (d < 0) return "passed";
  if (d <= withinDays) return "soon";
  return null;
}

// ── Archive, restore, delete ────────────────────────────────────────────────────

/**
 * What can be done to a person's whole record, and by whom. Someone who signs in is
 * archived on their membership (the Settings → Team rule: Admins and above, never
 * yourself, never someone at or above your rank). Someone without a login is archived
 * on their record by anyone who manages Staff.
 */
export interface StaffLifecycle {
  hasLogin: boolean;
  archived: boolean;
  archivedAt: string | null;
  /** False once a membership is past its 30-day window. A record-only person is always restorable. */
  restorable: boolean;
  canArchive: boolean;
  canDelete: boolean;
  /** Why Delete isn't offered, in words; null when it is. */
  deleteBlockedReason: string | null;
}

/**
 * Delete is for a record made by mistake. Anyone with history is archived instead,
 * because deleting them would erase who did what (placements, analysis, assessments).
 */
export function deleteBlockReason(input: {
  hasLogin: boolean;
  placements: number;
  analysisRuns: number;
  assessments: number;
}): string | null {
  if (input.hasLogin) return "They sign in to Foundry, so archive them instead.";
  if (input.placements) return "They have client placements, so archive them instead.";
  if (input.analysisRuns || input.assessments) return "They have developer reviews on file, so archive them instead.";
  return null;
}

// ── The profile DTO ─────────────────────────────────────────────────────────────

export interface StaffProfile {
  recordId: string;
  memberId: string | null;
  name: string;
  preferredName: string | null;
  pronouns: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: string | null;
  jobTitle: string | null;
  department: string | null;
  employmentType: string | null;
  startDate: string | null;
  managerRecordId: string | null;
  managerName: string | null;
  currentClients: Array<{ name: string; slug: string | null }>;
  isDeveloper: boolean;
  relation: ProfileRelation;
  access: ProfileAccess;
  /** Null when the viewer may not see the employment tier. */
  employment: (EmploymentDetails & { supplierName: string | null }) | null;
  /** Whether a sensitive record exists. The values come from a separate, logged request. */
  hasSensitive: boolean;
  lifecycle: StaffLifecycle;
}

// ── Activity, availability, coming up ───────────────────────────────────────────

export interface StaffActivity {
  /** Tasks they completed per day over the last 26 weeks. Empty when they don't sign in. */
  completedByDay: Array<{ date: string; value: number }>;
  completedTotal: number;
  placements: Array<{
    clientName: string;
    slug: string | null;
    /** The project within the client, and any note on the placement (from Code's Engagements). */
    projectName: string | null;
    notes: string | null;
    startDate: string;
    endDate: string | null;
    allocationPercent: number;
  }>;
  /** Leave in the next 90 days. `label` is only the type for the person or HR; anyone else sees "Off". */
  upcomingLeave: Array<{ start: string; end: string; label: string; pending: boolean }>;
  /** This year's allowance, for the person, HR and leave approvers only. */
  allowance: { allocated: number; used: number; pending: number; remaining: number } | null;
  developer: { githubHandle: string; primaryStack: string | null; techStacks: string[] } | null;
}

export type ComingUpKind = "contract-end" | "probation-end" | "supplier-renewal" | "right-to-work" | "document-expiry";

export const COMING_UP_LABEL: Record<ComingUpKind, string> = {
  "contract-end": "Contract ends",
  "probation-end": "Probation ends",
  "supplier-renewal": "Agreement renews",
  "right-to-work": "Right to work expires",
  "document-expiry": "Document expires",
};

export interface ComingUpItem {
  kind: ComingUpKind;
  date: string;
  /** Who or what: a person's name, or a supplier's. */
  name: string;
  /** Where to go to deal with it. */
  href: string;
}

export interface MissingDetail {
  recordId: string;
  name: string;
  missing: string[];
}

export const COMING_UP_DAYS = 60;

/** The dated things HR needs to act on soon (passed ones included), soonest first. */
export function comingUpWithin(items: ComingUpItem[], today: string, days = COMING_UP_DAYS): ComingUpItem[] {
  return items
    .filter((i) => daysUntil(i.date, today) <= days)
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

/**
 * What a record is missing that HR will need. Kept to facts the record should have for
 * everyone: a contractor also needs to be tied to a supplier (or marked as direct by
 * having an end date), and everyone needs personal details on file.
 */
export function missingDetailsFor(p: {
  employmentType: string | null;
  startDate: string | null;
  managerRecordId: string | null;
  supplierId: string | null;
  hasSensitive: boolean;
  isTopOfTree: boolean;
}): string[] {
  const out: string[] = [];
  if (!p.employmentType) out.push("type");
  if (!p.startDate) out.push("start date");
  if (!p.managerRecordId && !p.isTopOfTree) out.push("manager");
  if (p.employmentType === "CONTRACTOR" && !p.supplierId) out.push("supplier");
  if (!p.hasSensitive) out.push("personal details");
  return out;
}
