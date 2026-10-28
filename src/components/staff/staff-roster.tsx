"use client";

/**
 * Staff → People: everyone on the team in one list (CLAUDE.md §86). Members who sign in
 * and Staff records (developers and contractors who don't) side by side, with job title,
 * department, employment type and the clients they're on.
 *
 * Developer profiles (scores, GitHub analysis, CV) still live at
 * /app/codeclear/candidates/[id]; a developer's row links there.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/format";
import {
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABEL,
  filterStaff,
  type EmploymentType,
  type StaffFilter,
  type StaffPerson,
} from "@/lib/staff";
import { Modal } from "@/components/ui/modal";
import { usePermissions } from "@/hooks/use-permissions";
import { useCreateStaffRecord, useStaffRoster, useUpdateStaffDetails } from "@/hooks/use-staff";

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  STAFF: "Staff",
  DEVELOPER: "Developer",
  GUEST: "Guest",
};

function Initials({ person }: { person: StaffPerson }) {
  const initials = person.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  if (person.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={person.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] font-mono text-[11px] text-[var(--text-3)]"
    >
      {initials || "?"}
    </span>
  );
}

function formatStart(date: string | null): string {
  if (!date) return "—";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

function DetailsDialog({
  person,
  people,
  onClose,
}: {
  person: StaffPerson;
  people: StaffPerson[];
  onClose: () => void;
}) {
  const [jobTitle, setJobTitle] = useState(person.jobTitle ?? "");
  const [department, setDepartment] = useState(person.department ?? "");
  const [employmentType, setEmploymentType] = useState<EmploymentType | "">(person.employmentType ?? "");
  const [startDate, setStartDate] = useState(person.startDate ?? "");
  const [managerRecordId, setManagerRecordId] = useState(person.managerRecordId ?? "");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateStaffRecord();
  const update = useUpdateStaffDetails();
  const busy = create.isPending || update.isPending;

  // A manager must have a Staff record, and can't be the person themselves.
  const managers = people.filter((p) => p.recordId && p.recordId !== person.recordId);

  const save = async () => {
    setError(null);
    const details = {
      jobTitle: jobTitle || null,
      department: department || null,
      employmentType: employmentType || null,
      startDate: startDate || null,
      managerRecordId: managerRecordId || null,
    };
    try {
      if (person.recordId) await update.mutateAsync({ recordId: person.recordId, update: details });
      else await create.mutateAsync({ memberId: person.memberId ?? undefined, ...details });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  };

  const field = "block text-[12px] font-medium text-[var(--text-2)]";
  return (
    <Modal open onClose={onClose} title={`01 // ${person.name}`} panelClassName="w-full max-w-lg">
      <div className="space-y-4 px-5 py-4">
        {!person.recordId ? (
          <p className="text-[13px] text-[var(--text-3)]">
            {person.name} signs in to Foundry but has no Staff profile yet. Saving creates one.
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={field}>
            Job title
            <input className="app-input mt-1 w-full" value={jobTitle} maxLength={80} onChange={(e) => setJobTitle(e.target.value)} />
          </label>
          <label className={field}>
            Department
            <input
              className="app-input mt-1 w-full"
              value={department}
              maxLength={60}
              list="staff-departments"
              onChange={(e) => setDepartment(e.target.value)}
            />
            <datalist id="staff-departments">
              {[...new Set(people.map((p) => p.department).filter(Boolean))].map((d) => (
                <option key={d} value={d!} />
              ))}
            </datalist>
          </label>
          <label className={field}>
            Employment
            <select
              className="app-select mt-1 w-full"
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value as EmploymentType | "")}
            >
              <option value="">Not set</option>
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EMPLOYMENT_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className={field}>
            Start date
            <input type="date" className="app-input mt-1 w-full" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className={cn(field, "sm:col-span-2")}>
            Manager
            <select className="app-select mt-1 w-full" value={managerRecordId} onChange={(e) => setManagerRecordId(e.target.value)}>
              <option value="">No manager</option>
              {managers.map((m) => (
                <option key={m.recordId!} value={m.recordId!}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error ? (
          <p role="alert" className="text-[13px] text-[var(--danger-500)]">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-[var(--border-2)] px-5 py-3">
        <button type="button" className="app-button app-button-secondary app-button-sm" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="app-button app-button-primary app-button-sm" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : person.recordId ? "Save" : "Create profile"}
        </button>
      </div>
    </Modal>
  );
}

function AddPersonDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateStaffRecord();
  const field = "block text-[12px] font-medium text-[var(--text-2)]";

  const save = async () => {
    setError(null);
    try {
      await create.mutateAsync({ name, email: email.trim() || null, jobTitle: jobTitle || null });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add");
    }
  };

  return (
    <Modal open onClose={onClose} title="01 // ADD SOMEONE" panelClassName="w-full max-w-md">
      <div className="space-y-4 px-5 py-4">
        <p className="text-[13px] text-[var(--text-3)]">
          For someone who works with you but doesn&rsquo;t sign in, like a contractor. To give someone a login, invite
          them in Settings → People &amp; access.
        </p>
        <label className={field}>
          Name
          <input className="app-input mt-1 w-full" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={field}>
          Email (optional)
          <input type="email" className="app-input mt-1 w-full" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className={field}>
          Job title (optional)
          <input className="app-input mt-1 w-full" value={jobTitle} maxLength={80} onChange={(e) => setJobTitle(e.target.value)} />
        </label>
        {error ? (
          <p role="alert" className="text-[13px] text-[var(--danger-500)]">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-[var(--border-2)] px-5 py-3">
        <button type="button" className="app-button app-button-secondary app-button-sm" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="app-button app-button-primary app-button-sm"
          disabled={!name.trim() || create.isPending}
          onClick={() => void save()}
        >
          {create.isPending ? "Adding…" : "Add"}
        </button>
      </div>
    </Modal>
  );
}

export function StaffRoster() {
  const roster = useStaffRoster();
  const { canManageCode, hasModule } = usePermissions();
  const [filter, setFilter] = useState<StaffFilter>({});
  const [editing, setEditing] = useState<StaffPerson | null>(null);
  const [adding, setAdding] = useState(false);

  const people = useMemo(() => roster.data?.people ?? [], [roster.data]);
  const shown = useMemo(() => filterStaff(people, filter), [people, filter]);
  const showDevProfiles = hasModule("devsignal") || hasModule("codeclear");

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">01</span>
          <span className="mx-1.5 text-[var(--text-4)]">{"//"}</span>
          People
        </span>
        {roster.data ? <span className="widget-header__status">{people.length} on the team</span> : null}
      </div>
      <div className="widget-body space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            className="app-input min-w-[200px] flex-1 sm:max-w-xs"
            placeholder="Search people, roles, clients…"
            aria-label="Search people"
            value={filter.q ?? ""}
            onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
          />
          {roster.data?.departments.length ? (
            <select
              className="app-select w-full sm:w-auto"
              aria-label="Department"
              value={filter.department ?? ""}
              onChange={(e) => setFilter((f) => ({ ...f, department: e.target.value || null }))}
            >
              <option value="">All departments</option>
              {roster.data.departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          ) : null}
          <select
            className="app-select w-full sm:w-auto"
            aria-label="Employment"
            value={filter.employmentType ?? ""}
            onChange={(e) => setFilter((f) => ({ ...f, employmentType: (e.target.value || null) as EmploymentType | null }))}
          >
            <option value="">All types</option>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EMPLOYMENT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <select
            className="app-select w-full sm:w-auto"
            aria-label="Account"
            value={filter.presence ?? ""}
            onChange={(e) => setFilter((f) => ({ ...f, presence: (e.target.value || null) as StaffFilter["presence"] }))}
          >
            <option value="">Everyone</option>
            <option value="account">Signs in to Foundry</option>
            <option value="no-account">No login</option>
            <option value="no-record">No profile yet</option>
          </select>
          {canManageCode ? (
            <button type="button" className="app-button app-button-secondary app-button-sm sm:ml-auto" onClick={() => setAdding(true)}>
              Add someone
            </button>
          ) : null}
        </div>

        {roster.isPending ? (
          <p className="text-sm text-[var(--text-3)]">Loading the team…</p>
        ) : roster.isError ? (
          <p role="alert" className="text-sm text-[var(--danger-500)]">
            Could not load the team: {roster.error instanceof Error ? roster.error.message : "unknown error"}
          </p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-[var(--text-3)]">{people.length ? "Nobody matches these filters." : "Nobody on the team yet."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="app-table app-table--dense min-w-[860px]">
              <thead>
                <tr>
                  <th className="text-left">Person</th>
                  <th className="w-[170px] text-left">Job title</th>
                  <th className="w-[130px] text-left">Department</th>
                  <th className="w-[110px] text-left">Type</th>
                  <th className="w-[180px] text-left">Clients</th>
                  <th className="w-[100px] text-left">Started</th>
                  <th className="w-[130px] text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.key}>
                    <td>
                      <div className="flex min-w-0 items-center gap-3">
                        <Initials person={p} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[var(--text-1)]" title={p.name}>
                            {p.name}
                          </p>
                          <p className="truncate font-mono text-[11px] text-[var(--text-4)]" title={p.email ?? undefined}>
                            {p.role ? ROLE_LABEL[p.role] ?? p.role : "No login"}
                            {p.email ? ` · ${p.email}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="truncate" title={p.jobTitle ?? undefined}>
                      {p.jobTitle ?? (p.isDeveloper && p.primaryStack ? `${p.primaryStack} developer` : "—")}
                      {p.managerName ? (
                        <span className="block truncate text-[11px] text-[var(--text-4)]">Reports to {p.managerName}</span>
                      ) : null}
                    </td>
                    <td className="truncate" title={p.department ?? undefined}>{p.department ?? "—"}</td>
                    <td>{p.employmentType ? EMPLOYMENT_TYPE_LABEL[p.employmentType] : "—"}</td>
                    <td className="truncate" title={p.currentClients.map((c) => c.name).join(", ") || undefined}>
                      {p.currentClients.length ? p.currentClients.map((c) => c.name).join(", ") : "—"}
                    </td>
                    <td className="whitespace-nowrap font-mono text-[12px] text-[var(--text-3)]">{formatStart(p.startDate)}</td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        {p.isDeveloper && p.recordId && showDevProfiles ? (
                          <Link
                            href={`/app/codeclear/candidates/${p.recordId}`}
                            className="app-button app-button-tertiary app-button-xs"
                          >
                            Profile
                          </Link>
                        ) : null}
                        {canManageCode ? (
                          <button
                            type="button"
                            className="app-button app-button-secondary app-button-xs"
                            onClick={() => setEditing(p)}
                          >
                            {p.recordId ? "Edit" : "Create profile"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing ? <DetailsDialog person={editing} people={people} onClose={() => setEditing(null)} /> : null}
      {adding ? <AddPersonDialog onClose={() => setAdding(false)} /> : null}
    </section>
  );
}
