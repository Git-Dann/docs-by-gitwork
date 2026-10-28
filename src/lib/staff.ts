/**
 * Staff (formerly Code): the people roster — everyone on the team, not only developers.
 * See CLAUDE.md §87 and docs/multi-tenant-roadmap.md, Phase 1.
 *
 * A person on the roster is a workspace member (someone who signs in), a Staff record
 * (the Candidate row: job title, clients, rates, CV…), or both, linked by
 * Candidate.memberId. Pure and framework-free, so the server, the page and the demo
 * share the same rules.
 */

export const EMPLOYMENT_TYPES = ["EMPLOYEE", "CONTRACTOR", "FREELANCER"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  EMPLOYEE: "Employee",
  CONTRACTOR: "Contractor",
  FREELANCER: "Freelancer",
};

export function isEmploymentType(value: unknown): value is EmploymentType {
  return typeof value === "string" && (EMPLOYMENT_TYPES as readonly string[]).includes(value);
}

export interface StaffClient {
  name: string;
  slug: string | null;
}

/** One person on the roster. */
export interface StaffPerson {
  /** Stable React key: `m:<memberId>` or `r:<recordId>`. */
  key: string;
  memberId: string | null;
  recordId: string | null;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  /** Their role in Foundry, or null when they have a record but no account. */
  role: string | null;
  jobTitle: string | null;
  department: string | null;
  employmentType: EmploymentType | null;
  startDate: string | null;
  managerRecordId: string | null;
  managerName: string | null;
  /** Has a GitHub handle, so a developer profile (scores, analysis) exists. */
  isDeveloper: boolean;
  primaryStack: string | null;
  currentClients: StaffClient[];
}

export interface StaffRoster {
  people: StaffPerson[];
  departments: string[];
}

/** Editable Staff details (PATCH /api/staff/[recordId]). */
export interface StaffDetailsUpdate {
  jobTitle?: string | null;
  department?: string | null;
  employmentType?: EmploymentType | null;
  startDate?: string | null;
  managerRecordId?: string | null;
}

/** Roster order: by name, ignoring case and accents. */
export function sortStaff(people: StaffPerson[]): StaffPerson[] {
  const collator = new Intl.Collator("en-GB", { sensitivity: "base" });
  return [...people].sort((a, b) => collator.compare(a.name, b.name));
}

export interface StaffFilter {
  q?: string;
  department?: string | null;
  employmentType?: EmploymentType | null;
  /** "account" = signs in to Foundry, "no-account" = a record only, "no-record" = signs in, no profile yet. */
  presence?: "account" | "no-account" | "no-record" | null;
}

export function filterStaff(people: StaffPerson[], filter: StaffFilter): StaffPerson[] {
  const q = filter.q?.trim().toLowerCase();
  return people.filter((p) => {
    if (filter.department && p.department !== filter.department) return false;
    if (filter.employmentType && p.employmentType !== filter.employmentType) return false;
    if (filter.presence === "account" && !p.memberId) return false;
    if (filter.presence === "no-account" && p.memberId) return false;
    if (filter.presence === "no-record" && p.recordId) return false;
    if (q) {
      const hay = [p.name, p.email, p.jobTitle, p.department, p.primaryStack, ...p.currentClients.map((c) => c.name)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Distinct, sorted department names, for the filter. */
export function departmentsOf(people: StaffPerson[]): string[] {
  return [...new Set(people.map((p) => p.department).filter((d): d is string => Boolean(d)))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/**
 * Validates and normalises a details update. Returns an error message for the first bad
 * field. Blank strings clear a field. Dates must be YYYY-MM-DD (a calendar date, no time).
 */
export function normaliseStaffDetails(input: StaffDetailsUpdate): { ok: true; value: StaffDetailsUpdate } | { ok: false; error: string } {
  const out: StaffDetailsUpdate = {};
  const text = (v: string | null | undefined, max: number, label: string): string | null | { error: string } => {
    if (v === null || v === undefined) return null;
    const t = v.trim();
    if (!t) return null;
    if (t.length > max) return { error: `${label} must be ${max} characters or fewer` };
    return t;
  };
  for (const [key, max, label] of [
    ["jobTitle", 80, "Job title"],
    ["department", 60, "Department"],
  ] as const) {
    if (input[key] !== undefined) {
      const r = text(input[key], max, label);
      if (r && typeof r === "object") return { ok: false, error: r.error };
      out[key] = r;
    }
  }
  if (input.employmentType !== undefined) {
    if (input.employmentType !== null && !isEmploymentType(input.employmentType)) {
      return { ok: false, error: "Employment type must be Employee, Contractor or Freelancer" };
    }
    out.employmentType = input.employmentType;
  }
  if (input.startDate !== undefined) {
    if (input.startDate === null || input.startDate === "") out.startDate = null;
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || Number.isNaN(Date.parse(`${input.startDate}T00:00:00Z`))) {
      return { ok: false, error: "Start date must be a date (YYYY-MM-DD)" };
    } else out.startDate = input.startDate;
  }
  if (input.managerRecordId !== undefined) out.managerRecordId = input.managerRecordId || null;
  return { ok: true, value: out };
}
