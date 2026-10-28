/**
 * Demo data for Staff → People (/demo/staff). Edits are applied to this in-memory copy
 * through the same validation the server uses (normaliseStaffDetails), so a bad value
 * is refused here exactly as it would be in the app.
 */

import { departmentsOf, normaliseStaffDetails, sortStaff, type StaffPerson, type StaffDetailsUpdate } from "@/lib/staff";

const base = (over: Partial<StaffPerson> & Pick<StaffPerson, "key" | "name">): StaffPerson => ({
  memberId: null,
  recordId: null,
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

export function resolveDemoStaff(pathname: string, init?: { method?: string; body?: unknown }): unknown {
  const body = (typeof init?.body === "string" ? JSON.parse(init.body) : {}) as StaffDetailsUpdate & {
    memberId?: string;
    name?: string;
    email?: string | null;
  };
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
  if (pathname === "/api/staff") return { people: sortStaff(people), departments: departmentsOf(people) };
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
