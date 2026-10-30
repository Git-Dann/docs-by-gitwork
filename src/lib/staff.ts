/**
 * Staff (formerly Code): the people roster — everyone on the team, not only developers.
 * See CLAUDE.md §87 and docs/multi-tenant-roadmap.md, Phase 1.
 *
 * A person on the roster is a workspace member (someone who signs in), a Staff record
 * (the Candidate row: job title, clients, rates, CV…), or both, linked by
 * Candidate.memberId. Pure and framework-free, so the server, the page and the demo
 * share the same rules.
 */

export const EMPLOYMENT_TYPES = ["EMPLOYEE", "DIRECTOR", "CONTRACTOR", "FREELANCER"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  EMPLOYEE: "Employee",
  DIRECTOR: "Director",
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
  preferredName: string | null;
  pronouns: string | null;
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
  /** Set only in the archived view: when they were archived (membership or record). */
  archivedAt: string | null;
}

export interface StaffRoster {
  people: StaffPerson[];
  departments: string[];
}

/** Editable Staff details (PATCH /api/staff/[recordId]). */
export interface StaffDetailsUpdate {
  preferredName?: string | null;
  pronouns?: string | null;
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
    ["preferredName", 80, "Preferred name"],
    ["pronouns", 30, "Pronouns"],
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
      return { ok: false, error: "Employment type must be Employee, Director, Contractor or Freelancer" };
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

export type StaffSortKey = "name" | "jobTitle" | "startDate";

/**
 * Sorts by one column. A person with no value (no job title, no start date) goes last in
 * BOTH directions, so a column is never led by a run of blanks. Ties fall back to name.
 */
export function sortStaffBy(people: StaffPerson[], key: StaffSortKey, dir: "asc" | "desc"): StaffPerson[] {
  const collator = new Intl.Collator("en-GB", { sensitivity: "base" });
  const val = (p: StaffPerson): string | null => {
    if (key === "name") return p.name;
    if (key === "jobTitle") return p.jobTitle ?? (p.isDeveloper && p.primaryStack ? `${p.primaryStack} developer` : null);
    return p.startDate;
  };
  const sign = dir === "asc" ? 1 : -1;
  return [...people].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (va === null && vb !== null) return 1;
    if (vb === null && va !== null) return -1;
    if (va !== null && vb !== null) {
      const c = collator.compare(va, vb);
      if (c !== 0) return c * sign;
    }
    return collator.compare(a.name, b.name);
  });
}

// ── Grouping, org chart, export (People as cards) ──────────────────────────────

export type StaffGroupId = "admins" | "staff" | "developers" | "guests" | "no-login";

export const STAFF_GROUP_LABEL: Record<StaffGroupId, string> = {
  admins: "Admins",
  staff: "Staff",
  developers: "Developers",
  guests: "Guests",
  "no-login": "No login",
};

const GROUP_ORDER: StaffGroupId[] = ["admins", "staff", "developers", "guests", "no-login"];

/** Which heading someone sits under: their Foundry role, or "No login" for a record only. */
export function staffGroupOf(p: Pick<StaffPerson, "role">): StaffGroupId {
  switch (p.role) {
    case "SUPER_ADMIN":
    case "ADMIN":
      return "admins";
    case "STAFF":
      return "staff";
    case "DEVELOPER":
      return "developers";
    case "GUEST":
      return "guests";
    default:
      return p.role ? "staff" : "no-login";
  }
}

/** People under their headings, in heading order, keeping the order they came in. Empty groups are left out. */
export function groupStaff(people: StaffPerson[]): Array<{ id: StaffGroupId; label: string; people: StaffPerson[] }> {
  const by = new Map<StaffGroupId, StaffPerson[]>();
  for (const p of people) {
    const g = staffGroupOf(p);
    by.set(g, [...(by.get(g) ?? []), p]);
  }
  return GROUP_ORDER.filter((g) => by.has(g)).map((g) => ({ id: g, label: STAFF_GROUP_LABEL[g], people: by.get(g)! }));
}

export interface OrgNode {
  person: StaffPerson;
  reports: OrgNode[];
}

/**
 * The org chart, drawn from each record's manager. A manager who isn't on the list
 * (archived, or not on this view) makes their reports roots rather than vanishing, and
 * a loop (A manages B manages A) is broken rather than recursing forever.
 */
export function buildOrgTree(people: StaffPerson[]): OrgNode[] {
  const byRecord = new Map(people.filter((p) => p.recordId).map((p) => [p.recordId!, p]));
  const children = new Map<string, StaffPerson[]>();
  const roots: StaffPerson[] = [];
  for (const p of people) {
    const m = p.managerRecordId;
    if (m && byRecord.has(m) && m !== p.recordId) children.set(m, [...(children.get(m) ?? []), p]);
    else roots.push(p);
  }
  const seen = new Set<string>();
  const build = (p: StaffPerson): OrgNode => {
    seen.add(p.key);
    const kids = (p.recordId ? children.get(p.recordId) ?? [] : []).filter((k) => !seen.has(k.key));
    return { person: p, reports: sortStaff(kids).map(build) };
  };
  const tree = sortStaff(roots).map(build);
  // Anyone only reachable through a loop becomes a root, so nobody is dropped.
  for (const p of sortStaff(people)) if (!seen.has(p.key)) tree.push(build(p));
  return tree;
}

export interface OrgTier {
  id: "leadership" | "admins" | Exclude<StaffGroupId, "admins">;
  label: string;
  nodes: OrgNode[];
}

/**
 * The org chart's tiers. Gitwork has no list of who manages whom: the admins are the
 * managers. So anyone without a manager is placed by role: Super Admins as leadership, then
 * Admins, then everyone else under the same headings as the cards. Someone whose manager IS
 * set hangs under that person instead, so a real reporting line always wins over the default.
 */
export function orgTiers(tree: OrgNode[]): OrgTier[] {
  const by = new Map<OrgTier["id"], OrgNode[]>();
  for (const n of tree) {
    const id: OrgTier["id"] =
      n.person.role === "SUPER_ADMIN" ? "leadership" : n.person.role === "ADMIN" ? "admins" : (staffGroupOf(n.person) as Exclude<StaffGroupId, "admins">);
    by.set(id, [...(by.get(id) ?? []), n]);
  }
  const order: OrgTier["id"][] = ["leadership", "admins", "staff", "developers", "guests", "no-login"];
  const label = (id: OrgTier["id"]) => (id === "leadership" ? "Leadership" : STAFF_GROUP_LABEL[id]);
  return order.filter((id) => by.has(id)).map((id) => ({ id, label: label(id), nodes: by.get(id)! }));
}

/** One CSV cell: quoted when needed, and formula-looking text neutralised for spreadsheets. */
function csvCell(v: string | null | undefined): string {
  let s = v ?? "";
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The roster as CSV (no rates, no personal details): what an accountant or a spreadsheet needs. */
export function staffToCsv(people: StaffPerson[]): string {
  const header = ["Name", "Email", "Role", "Job title", "Department", "Type", "Started", "Manager", "Clients"];
  const rows = people.map((p) => [
    p.name,
    p.email,
    p.role ?? "No login",
    p.jobTitle,
    p.department,
    p.employmentType ? EMPLOYMENT_TYPE_LABEL[p.employmentType] : null,
    p.startDate,
    p.managerName,
    p.currentClients.map((c) => c.name).join("; "),
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}
