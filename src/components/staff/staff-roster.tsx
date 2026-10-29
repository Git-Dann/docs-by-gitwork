"use client";

/**
 * Staff → People: everyone on the team in one list (CLAUDE.md §87). Members who sign in
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
  sortStaffBy,
  type EmploymentType,
  type StaffFilter,
  type StaffPerson,
  type StaffSortKey,
} from "@/lib/staff";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { Pager } from "@/components/ui/pager";
import { SortHeader, type SortDir } from "@/components/ui/sort-header";
import { usePermissions } from "@/hooks/use-permissions";
import { useCreateStaffRecord, useStaffRoster, useUpdateStaffDetails } from "@/hooks/use-staff";

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  STAFF: "Staff",
  DEVELOPER: "Developer",
  GUEST: "Guest",
};

function PersonAvatar({ person }: { person: StaffPerson }) {
  // The shared Avatar falls back to initials when a stored photo URL is dead, rather
  // than showing the browser's broken-image icon.
  return <Avatar src={person.avatarUrl} name={person.name} size={32} />;
}

function formatStart(date: string | null): string {
  if (!date) return "—";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function DetailsDialog({
  person,
  people,
  onClose,
}: {
  person: StaffPerson;
  people: StaffPerson[];
  onClose: () => void;
}) {
  const [preferredName, setPreferredName] = useState(person.preferredName ?? "");
  const [pronouns, setPronouns] = useState(person.pronouns ?? "");
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
      preferredName: preferredName || null,
      pronouns: pronouns || null,
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
            Preferred name
            <input className="app-input mt-1 w-full" value={preferredName} maxLength={80} placeholder={person.name} onChange={(e) => setPreferredName(e.target.value)} />
          </label>
          <label className={field}>
            Pronouns
            <input className="app-input mt-1 w-full" value={pronouns} maxLength={30} placeholder="e.g. she/her" onChange={(e) => setPronouns(e.target.value)} />
          </label>
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

/** People per page: one screen on a laptop, so the list never becomes a scroll. */
const PAGE_SIZE = 20;

/** The person's name, linking to their profile when they have a Staff record. */
function PersonName({ person, basePath }: { person: StaffPerson; basePath: string }) {
  if (!person.recordId) {
    return (
      <p className="truncate font-medium text-[var(--text-1)]" title={person.name}>
        {person.name}
      </p>
    );
  }
  return (
    <p className="truncate font-medium" title={person.name}>
      <Link href={`${basePath}/${person.recordId}`} className="text-[var(--text-1)] hover:text-[var(--brand-600)] hover:underline">
        {person.name}
      </Link>
    </p>
  );
}

function roleLine(p: StaffPerson): string {
  return `${p.role ? ROLE_LABEL[p.role] ?? p.role : "No login"}${p.email ? ` · ${p.email}` : ""}`;
}

function jobTitleOf(p: StaffPerson): string | null {
  return p.jobTitle ?? (p.isDeveloper && p.primaryStack ? `${p.primaryStack} developer` : null);
}

function clientsOf(p: StaffPerson): string | null {
  return p.currentClients.length ? p.currentClients.map((c) => c.name).join(", ") : null;
}

function RowActions({
  person,
  showDevProfile,
  canEdit,
  onEdit,
}: {
  person: StaffPerson;
  showDevProfile: boolean;
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="flex shrink-0 justify-end gap-1.5">
      {person.isDeveloper && person.recordId && showDevProfile ? (
        <Link href={`/app/codeclear/candidates/${person.recordId}`} className="app-button app-button-tertiary app-button-xs" title="Scores, GitHub analysis and CV">
          Dev profile
        </Link>
      ) : null}
      {canEdit ? (
        <button type="button" className="app-button app-button-secondary app-button-xs" onClick={onEdit}>
          {person.recordId ? "Edit" : "Create profile"}
        </button>
      ) : null}
    </div>
  );
}

/** `basePath`: where profiles live. The demo passes /demo/staff, since /app is behind sign-in. */
export function StaffRoster({ basePath = "/app/staff" }: { basePath?: string } = {}) {
  const roster = useStaffRoster();
  const { canManageCode, hasModule } = usePermissions();
  const [filter, setFilterState] = useState<StaffFilter>({});
  const [sort, setSortState] = useState<{ key: StaffSortKey; dir: SortDir }>({ key: "name", dir: "asc" });
  const [page, setPage] = useState(0);
  // Any change to what is listed goes back to page one, so the page is never past the end.
  const setFilter = (next: StaffFilter | ((f: StaffFilter) => StaffFilter)) => {
    setFilterState(next);
    setPage(0);
  };
  const setSort = (next: (s: { key: StaffSortKey; dir: SortDir }) => { key: StaffSortKey; dir: SortDir }) => {
    setSortState(next);
    setPage(0);
  };
  const [editing, setEditing] = useState<StaffPerson | null>(null);
  const [adding, setAdding] = useState(false);

  const people = useMemo(() => roster.data?.people ?? [], [roster.data]);
  const shown = useMemo(() => sortStaffBy(filterStaff(people, filter), sort.key, sort.dir), [people, filter, sort]);
  const showDevProfiles = hasModule("devsignal") || hasModule("codeclear");

  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const pageRows = shown.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  const onSort = (key: StaffSortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "startDate" ? "desc" : "asc" }));
  const filtered = Boolean(filter.q || filter.department || filter.employmentType || filter.presence);

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">01</span>
          <span className="mx-1.5 text-[var(--text-4)]">{"//"}</span>
          People
        </span>
        {roster.data ? (
          <span className="widget-header__status">
            {filtered ? `${shown.length} of ${people.length}` : `${people.length} on the team`}
          </span>
        ) : null}
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
          {filtered ? (
            <button type="button" className="app-button app-button-tertiary app-button-sm" onClick={() => setFilter({})}>
              Clear filters
            </button>
          ) : null}
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
          <>
            {/* Phones: one card per person, so nothing sits off the side of a scrolling table. */}
            <ul className="divide-y divide-[var(--border-3)] md:hidden" aria-label="People">
              {pageRows.map((p) => (
                <li key={p.key} className="flex items-start gap-3 py-3">
                  <PersonAvatar person={p} />
                  <div className="min-w-0 flex-1">
                    <PersonName person={p} basePath={basePath} />
                    <p className="truncate font-mono text-[11px] text-[var(--text-4)]" title={roleLine(p)}>{roleLine(p)}</p>
                    <p className="mt-1 text-[13px] text-[var(--text-2)]">
                      {[jobTitleOf(p), clientsOf(p)].filter(Boolean).join(" · ") || "No details yet"}
                    </p>
                    <div className="mt-2">
                      <RowActions person={p} showDevProfile={showDevProfiles} canEdit={canManageCode} onEdit={() => setEditing(p)} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* From md: a fixed-layout table, edge to edge in the card. Columns that matter
                least drop out on narrower screens (Started below lg, Department below xl, Type
                below 2xl) rather than squeezing Clients to nothing. */}
            <div className="-mx-4 hidden overflow-x-auto md:block">
              <table className="app-table app-table--dense w-full table-fixed [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
                <thead>
                  <tr>
                    <SortHeader label="Person" k="name" sort={sort} onSort={onSort} className="w-[30%]" />
                    <SortHeader label="Job title" k="jobTitle" sort={sort} onSort={onSort} className="w-[18%]" />
                    <th className="hidden w-[12%] text-left xl:table-cell">Department</th>
                    <th className="hidden w-[10%] text-left 2xl:table-cell">Type</th>
                    <th className="text-left">Clients</th>
                    <SortHeader label="Started" k="startDate" sort={sort} onSort={onSort} className="hidden w-[90px] lg:table-cell" />
                    <th className="w-[132px] text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((p) => {
                    const title = jobTitleOf(p);
                    const clients = clientsOf(p);
                    return (
                      <tr key={p.key}>
                        <td>
                          <div className="flex min-w-0 items-center gap-3">
                            <PersonAvatar person={p} />
                            <div className="min-w-0">
                              <PersonName person={p} basePath={basePath} />
                              <p className="truncate font-mono text-[11px] text-[var(--text-4)]" title={roleLine(p)}>
                                {roleLine(p)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td>
                          <p className="truncate" title={title ?? undefined}>{title ?? "—"}</p>
                          {p.managerName ? (
                            <p className="truncate text-[11px] text-[var(--text-4)]" title={`Reports to ${p.managerName}`}>
                              Reports to {p.managerName}
                            </p>
                          ) : null}
                        </td>
                        <td className="hidden xl:table-cell">
                          <p className="truncate" title={p.department ?? undefined}>{p.department ?? "—"}</p>
                        </td>
                        <td className="hidden 2xl:table-cell">
                          <p className="truncate" title={p.employmentType ? EMPLOYMENT_TYPE_LABEL[p.employmentType] : undefined}>
                            {p.employmentType ? EMPLOYMENT_TYPE_LABEL[p.employmentType] : "—"}
                          </p>
                        </td>
                        <td>
                          <p className="truncate" title={clients ?? undefined}>{clients ?? "—"}</p>
                        </td>
                        <td className="hidden whitespace-nowrap font-mono text-[12px] text-[var(--text-3)] lg:table-cell">
                          {formatStart(p.startDate)}
                        </td>
                        <td>
                          <RowActions person={p} showDevProfile={showDevProfiles} canEdit={canManageCode} onEdit={() => setEditing(p)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager page={current} pageSize={PAGE_SIZE} total={shown.length} onPage={setPage} label="People pages" />
          </>
        )}
      </div>
      {editing ? <DetailsDialog person={editing} people={people} onClose={() => setEditing(null)} /> : null}
      {adding ? <AddPersonDialog onClose={() => setAdding(false)} /> : null}
    </section>
  );
}
