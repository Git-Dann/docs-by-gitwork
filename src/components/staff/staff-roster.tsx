"use client";

/**
 * Staff → People: everyone on the team in one list (CLAUDE.md §87). Members who sign in
 * and Staff records (developers and contractors who don't) side by side, with job title,
 * department, employment type and the clients they're on.
 *
 * A developer's Code side (GitHub, Bench, rate, clients, CV, notes) is on their Staff page
 * too: one page per developer. /app/codeclear/candidates/[id] now serves Hiring's external
 * candidates only and sends anyone on the team here.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/format";
import {
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABEL,
  filterStaff,
  sortStaffBy,
  buildOrgTree,
  groupStaff,
  staffToCsv,
  type OrgNode,
  type EmploymentType,
  type StaffFilter,
  type StaffPerson,
  type StaffSortKey,
} from "@/lib/staff";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/segmented";
import { usePermissions } from "@/hooks/use-permissions";
import { useCreateStaffRecord, useStaffRoster, useUpdateStaffDetails } from "@/hooks/use-staff";
import { useDocumentSettings, useHrOverview, useSetArchived, useUpdateDocumentSettings } from "@/hooks/use-hr";
import { STAFF_DOCUMENT_LABEL, STAFF_DOCUMENT_TYPES, type HrDocumentSettings } from "@/lib/hr-documents";
import { StaffHrTour, useStaffHrTour } from "@/components/staff/staff-hr-tour";
import { COMING_UP_LABEL, dateAttention } from "@/lib/hr";

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  STAFF: "Staff",
  DEVELOPER: "Developer",
  GUEST: "Guest",
};

function formatStart(date: string | null): string {
  if (!date) return "—";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * A person's directory details. In a dialog from People ("Create profile"), or `inline`
 * inside the profile's Overview card, so the profile edits in place like its other cards.
 */
export function DetailsDialog({
  person,
  people,
  onClose,
  inline = false,
}: {
  person: StaffPerson;
  people: StaffPerson[];
  onClose: () => void;
  inline?: boolean;
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
  // Plain JSX, not a component defined here: a component declared in render would remount
  // the inputs on every keystroke and drop focus.
  const content = (
    <>
      <div className={inline ? "space-y-4" : "space-y-4 px-5 py-4"}>
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
            <DatePicker className="mt-1 w-full" value={startDate} onChange={setStartDate} />
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
      <div className={inline ? "flex justify-end gap-2" : "flex justify-end gap-2 border-t border-[var(--border-2)] px-5 py-3"}>
        <button type="button" className="app-button app-button-secondary app-button-sm" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="app-button app-button-primary app-button-sm" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : person.recordId ? "Save" : "Create profile"}
        </button>
      </div>
    </>
  );
  return inline ? (
    <div className="space-y-4">{content}</div>
  ) : (
    <Modal open onClose={onClose} title={`01 // ${person.name}`} panelClassName="w-full max-w-lg">
      {content}
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

// ── A person's card ─────────────────────────────────────────────────────────────

/** EasyUI's macOS Folder Cards spring (stiffness 350, damping 25): the tabs rise like cards from a folder's pocket. */
const PEEK_SPRING = { type: "spring" as const, stiffness: 350, damping: 25 };

function subtitleOf(p: StaffPerson): string {
  return p.jobTitle ?? (p.isDeveloper && p.primaryStack ? `${p.primaryStack} developer` : p.role ? ROLE_LABEL[p.role] ?? p.role : "No login");
}

function metaOf(p: StaffPerson, archived: boolean): string {
  const bits = [
    p.department,
    p.employmentType ? EMPLOYMENT_TYPE_LABEL[p.employmentType] : null,
    archived ? (p.archivedAt ? `Archived ${formatStart(p.archivedAt.slice(0, 10))}` : "Left") : p.startDate ? `Since ${formatStart(p.startDate)}` : null,
  ];
  return bits.filter(Boolean).join(" · ");
}

/**
 * One person. The card opens their profile. On hover their clients rise from behind it
 * like cards from a folder (EasyUI's macOS Folder Cards motion); the same clients are
 * also written on the card, so nothing is hover-only, and reduced motion keeps them still.
 */
function PersonCard({
  person,
  basePath,
  archived,
  onCreateProfile,
}: {
  person: StaffPerson;
  basePath: string;
  archived: boolean;
  onCreateProfile?: () => void;
}) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState(false);
  const restore = useSetArchived();
  const { isAdminOrAbove, canManageCode, canManageHr } = usePermissions();
  const canRestore = person.memberId ? isAdminOrAbove : canManageCode || canManageHr;
  const tabs = person.currentClients.slice(0, 3);
  const lift = hover && !reduce;

  const body = (
    <>
      <div className="flex items-start gap-3">
        <Avatar src={person.avatarUrl} name={person.name} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-[var(--text-1)]" title={person.name}>
            {person.preferredName || person.name}
          </p>
          <p className="truncate text-[13px] text-[var(--text-3)]" title={subtitleOf(person)}>
            {subtitleOf(person)}
          </p>
        </div>
      </div>
      <p className="mt-3 truncate font-mono text-[11px] text-[var(--text-4)]" title={metaOf(person, archived)}>
        {metaOf(person, archived) || "No details yet"}
      </p>
      <p className="mt-1 truncate text-[12px] text-[var(--text-3)]" title={clientsOf(person) ?? undefined}>
        {clientsOf(person) ?? "No clients"}
      </p>
    </>
  );

  const cardClass =
    "relative z-10 block h-full rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-4 transition-colors hover:border-[var(--border-1)]";

  return (
    <div className={cn("relative pt-3", lift && "z-20")} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      {/* The folder's peek: their clients as sheets tucked behind the card, nearly its full
          width like EasyUI's pocket cards, each inset a little more the deeper it sits. On
          hover they fan up in steps so every client's name shows on its own strip. */}
      {tabs.map((c, i) => (
        <motion.span
          key={c.name}
          aria-hidden
          initial={false}
          animate={lift ? { y: -14 - i * 15, rotate: [0, -0.6, 0.6][i] } : { y: 12, rotate: 0 }}
          transition={PEEK_SPRING}
          className={cn(
            "absolute top-0 h-9 truncate rounded-t-[8px] border border-b-0 border-[var(--border-2)] px-3 pt-1 font-mono text-[10px] text-[var(--text-3)] shadow-[var(--shadow-xs)]",
            i === 0 ? "bg-[var(--surface-1)]" : "bg-[var(--surface-2)]",
          )}
          style={{ left: 6 + i * 8, right: 6 + i * 8, zIndex: 3 - i }}
        >
          {c.name}
        </motion.span>
      ))}
      {/* z-10 here, not only on the card inside: this wrapper's transform makes its own
          stacking context, so the tabs (z 1-3) would otherwise paint over the card. */}
      <motion.div className="relative z-10 h-full" animate={lift ? { y: -2 } : { y: 0 }} transition={PEEK_SPRING}>
        {person.recordId ? (
          <Link href={`${basePath}/${person.recordId}`} className={cardClass}>
            {body}
          </Link>
        ) : (
          <div className={cardClass}>
            {body}
            {onCreateProfile ? (
              <button type="button" className="app-button app-button-secondary app-button-xs mt-3" onClick={onCreateProfile}>
                Create profile
              </button>
            ) : null}
          </div>
        )}
      </motion.div>
      {archived && canRestore && (person.recordId || person.memberId) ? (
        <button
          type="button"
          className="app-button app-button-secondary app-button-xs absolute bottom-3 right-3 z-20"
          disabled={restore.isPending}
          title={restore.error instanceof Error ? restore.error.message : undefined}
          onClick={() => restore.mutate({ recordId: person.recordId ?? "", memberId: person.memberId, archived: false })}
        >
          {restore.isPending ? "Restoring…" : restore.isError ? "Couldn't restore" : "Restore"}
        </button>
      ) : null}
    </div>
  );
}

function clientsOf(p: StaffPerson): string | null {
  return p.currentClients.length ? p.currentClients.map((c) => c.name).join(", ") : null;
}

// ── Org chart ───────────────────────────────────────────────────────────────────

function OrgBranch({ nodes, basePath }: { nodes: OrgNode[]; basePath: string }) {
  return (
    <ul className="space-y-1">
      {nodes.map((n) => (
        <li key={n.person.key}>
          <div className="flex items-center gap-2.5 py-1">
            <Avatar src={n.person.avatarUrl} name={n.person.name} size={28} />
            <div className="min-w-0">
              {n.person.recordId ? (
                <Link href={`${basePath}/${n.person.recordId}`} className="truncate text-[14px] font-medium text-[var(--text-1)] hover:text-[var(--brand-600)] hover:underline">
                  {n.person.preferredName || n.person.name}
                </Link>
              ) : (
                <span className="truncate text-[14px] font-medium text-[var(--text-1)]">{n.person.name}</span>
              )}
              <span className="ml-2 text-[12px] text-[var(--text-3)]">{subtitleOf(n.person)}</span>
            </div>
          </div>
          {n.reports.length ? (
            <div className="ml-3.5 border-l border-[var(--border-2)] pl-5">
              <OrgBranch nodes={n.reports} basePath={basePath} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

// ── HR: coming up and missing details ──────────────────────────────────────────

/**
 * This business's document settings: which types people may add themselves (otherwise HR
 * adds them, or asks), and whether uploads are copied to Google Drive. Both off by default.
 */
function DocumentSettingsDialog({ onClose }: { onClose: () => void }) {
  const current = useDocumentSettings(true);
  const save = useUpdateDocumentSettings();
  const [draft, setDraft] = useState<HrDocumentSettings | null>(null);
  const value = draft ?? current.data ?? null;
  const toggle = (t: (typeof STAFF_DOCUMENT_TYPES)[number]) =>
    value &&
    setDraft({
      ...value,
      selfUploadTypes: value.selfUploadTypes.includes(t) ? value.selfUploadTypes.filter((x) => x !== t) : [...value.selfUploadTypes, t],
    });
  return (
    <Modal open onClose={onClose} title="01 // DOCUMENT SETTINGS" panelClassName="w-full max-w-lg">
      <div className="space-y-5 px-5 py-4">
        {!value ? (
          <p className="text-[13px] text-[var(--text-3)]">Loading…</p>
        ) : (
          <>
            <div>
              <p className="widget-data-label text-[var(--text-4)]">People can add their own</p>
              <p className="mt-1 text-[12px] text-[var(--text-3)]">
                Anything else is added by HR, or asked for. What people add waits for HR to check it.
              </p>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {STAFF_DOCUMENT_TYPES.map((t) => (
                  <label key={t} className="flex items-center gap-2 text-[13px] text-[var(--text-1)]">
                    <input type="checkbox" checked={value.selfUploadTypes.includes(t)} onChange={() => toggle(t)} />
                    {STAFF_DOCUMENT_LABEL[t]}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-start gap-2 text-[13px] text-[var(--text-1)]">
              <input type="checkbox" className="mt-0.5" checked={value.driveEnabled} onChange={(e) => setDraft({ ...value, driveEnabled: e.target.checked })} />
              <span>
                Copy uploads to Google Drive
                <span className="block text-[12px] text-[var(--text-3)]">
                  Into a &ldquo;Foundry HR&rdquo; folder, one folder per person, in the workspace owner&apos;s Drive. Opening a file
                  straight from Drive isn&apos;t in Foundry&apos;s access log, so share that folder with HR only.
                </span>
              </span>
            </label>
          </>
        )}
        {save.error ? (
          <p role="alert" className="text-[13px] text-[var(--danger-500)]">
            {save.error instanceof Error ? save.error.message : "Could not save"}
          </p>
        ) : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-[var(--border-2)] px-5 py-3">
        <button type="button" className="app-button app-button-secondary app-button-sm" onClick={onClose} disabled={save.isPending}>
          Cancel
        </button>
        <button
          type="button"
          className="app-button app-button-primary app-button-sm"
          disabled={!draft || save.isPending}
          onClick={() => draft && save.mutate(draft, { onSuccess: onClose })}
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

function HrOverviewCard({ basePath, onTour }: { basePath: string; onTour: () => void }) {
  const overview = useHrOverview(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const data = overview.data;
  const appHref = (href: string) => (basePath === "/app/staff" ? href : href.replace("/app/staff", basePath));
  return (
    <section className="widget-card" data-tour="staff-hr">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">02</span>
          <span className="mx-1.5 text-[var(--text-4)]">{"//"}</span>
          For HR
        </span>
        <span className="flex items-center gap-3">
          <span className="widget-header__status">Next 60 days</span>
          <button
            type="button"
            data-tour="staff-doc-settings"
            onClick={() => setSettingsOpen(true)}
            className="font-mono text-[10px] font-semibold uppercase tracking-[1px] text-[var(--brand-600)] hover:underline"
          >
            Document settings
          </button>
        </span>
      </div>
      <div className="widget-body grid gap-6 md:grid-cols-2">
        <div className="min-w-0">
          <p className="widget-data-label text-[var(--text-4)]">Coming up</p>
          {overview.isPending ? (
            <p className="mt-2 text-[13px] text-[var(--text-3)]">Loading…</p>
          ) : !data?.comingUp.length ? (
            <p className="mt-2 text-[13px] text-[var(--text-3)]">Nothing due.</p>
          ) : (
            <ul className="mt-2 divide-y divide-[var(--border-3)]">
              {data.comingUp.map((i) => {
                const att = dateAttention(i.date, today);
                return (
                  <li key={`${i.kind}:${i.name}:${i.date}`} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
                    <Link href={appHref(i.href)} className="min-w-0 truncate text-[var(--text-1)] hover:underline" title={`${COMING_UP_LABEL[i.kind]}: ${i.name}`}>
                      {i.name} <span className="text-[var(--text-3)]">· {COMING_UP_LABEL[i.kind].toLowerCase()}</span>
                    </Link>
                    <span className={cn("shrink-0 font-mono text-[12px]", att === "passed" ? "text-[var(--danger-500)]" : "text-[var(--warning-500)]")}>
                      {formatStart(i.date)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="min-w-0">
          <p className="widget-data-label text-[var(--text-4)]">Missing details</p>
          {overview.isPending ? (
            <p className="mt-2 text-[13px] text-[var(--text-3)]">Loading…</p>
          ) : !data?.missing.length ? (
            <p className="mt-2 text-[13px] text-[var(--text-3)]">Every record is complete.</p>
          ) : (
            <ul className="mt-2 divide-y divide-[var(--border-3)]">
              {data.missing.slice(0, 8).map((m) => (
                <li key={m.recordId} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
                  <Link href={`${basePath}/${m.recordId}`} className="min-w-0 truncate text-[var(--text-1)] hover:underline">
                    {m.name}
                  </Link>
                  <span className="min-w-0 truncate text-right text-[12px] text-[var(--text-3)]" title={m.missing.join(", ")}>
                    {m.missing.join(", ")}
                  </span>
                </li>
              ))}
              {data.missing.length > 8 ? (
                <li className="py-2 text-[12px] text-[var(--text-4)]">and {data.missing.length - 8} more</li>
              ) : null}
            </ul>
          )}
        </div>
      </div>
      <div className="border-t border-[var(--border-3)] px-4 py-2">
        <button type="button" onClick={onTour} className="text-[12px] text-[var(--text-3)] hover:text-[var(--text-1)] hover:underline">
          Show the tour again
        </button>
      </div>
      {settingsOpen ? <DocumentSettingsDialog onClose={() => setSettingsOpen(false)} /> : null}
    </section>
  );
}

// ── The page ────────────────────────────────────────────────────────────────────

function downloadCsv(people: StaffPerson[]) {
  const blob = new Blob([staffToCsv(people)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `team-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** `basePath`: where profiles live. The demo passes /demo/staff, since /app is behind sign-in. */
export function StaffRoster({
  basePath = "/app/staff",
  initialView = "active",
}: { basePath?: string; initialView?: "active" | "archived" } = {}) {
  const [view, setView] = useState<"active" | "archived">(initialView);
  const [layout, setLayout] = useState<"cards" | "org">("cards");
  const roster = useStaffRoster(view);
  const { canManageCode, canManageHr } = usePermissions();
  const [filter, setFilter] = useState<StaffFilter>({});
  const [sort, setSort] = useState<StaffSortKey>("name");
  const [editing, setEditing] = useState<StaffPerson | null>(null);
  const [adding, setAdding] = useState(false);

  const people = useMemo(() => roster.data?.people ?? [], [roster.data]);
  const shown = useMemo(() => sortStaffBy(filterStaff(people, filter), sort, sort === "startDate" ? "desc" : "asc"), [people, filter, sort]);
  const groups = useMemo(() => groupStaff(shown), [shown]);
  const tree = useMemo(() => buildOrgTree(shown), [shown]);
  const filtered = Boolean(filter.q || filter.department || filter.employmentType);
  const archived = view === "archived";
  // The tour points at the cards and the For HR card, so it waits for both to be on screen.
  const tour = useStaffHrTour({ canManageHr, archived, hasPeople: groups.length > 0 && layout === "cards" });

  return (
    <div className="space-y-5">
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">01</span>
            <span className="mx-1.5 text-[var(--text-4)]">{"//"}</span>
            People
          </span>
          {roster.data ? (
            <span className="widget-header__status">
              {filtered ? `${shown.length} of ${people.length}` : archived ? `${people.length} archived` : `${people.length} on the team`}
            </span>
          ) : null}
        </div>
        <div className="widget-body space-y-5">
          <div className="flex flex-wrap items-center gap-2" data-tour="staff-filters">
            <Segmented
              label="Show"
              value={view}
              onChange={setView}
              options={[
                { value: "active", label: "Active" },
                { value: "archived", label: "Archived" },
              ]}
            />
            <input
              type="search"
              className="app-input min-w-[180px] flex-1 sm:max-w-xs"
              placeholder="Search people…"
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
              aria-label="Type"
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
            {layout === "cards" ? (
              <select className="app-select w-full sm:w-auto" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as StaffSortKey)}>
                <option value="name">By name</option>
                <option value="startDate">Newest first</option>
              </select>
            ) : null}
            <div className="flex items-center gap-2 sm:ml-auto">
              {!archived ? (
                <Segmented
                  label="Layout"
                  value={layout}
                  onChange={setLayout}
                  options={[
                    { value: "cards", label: "Cards" },
                    { value: "org", label: "Org chart" },
                  ]}
                />
              ) : null}
              <button
                type="button"
                className="app-button app-button-tertiary app-button-sm"
                onClick={() => downloadCsv(shown)}
                disabled={!shown.length}
                title="Download this list as a spreadsheet (no rates or personal details)"
              >
                <ArrowDownTrayIcon aria-hidden className="h-4 w-4" />
                CSV
              </button>
              {canManageCode && !archived ? (
                <button type="button" className="app-button app-button-secondary app-button-sm" onClick={() => setAdding(true)}>
                  Add someone
                </button>
              ) : null}
            </div>
          </div>

          {roster.isPending ? (
            <p className="text-sm text-[var(--text-3)]">Loading the team…</p>
          ) : roster.isError ? (
            <p role="alert" className="text-sm text-[var(--danger-500)]">
              Could not load the team: {roster.error instanceof Error ? roster.error.message : "unknown error"}
            </p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-[var(--text-3)]">
              {people.length ? "Nobody matches these filters." : archived ? "Nobody has been archived." : "Nobody on the team yet."}
            </p>
          ) : layout === "org" && !archived ? (
            <OrgBranch nodes={tree} basePath={basePath} />
          ) : (
            groups.map((g, gi) => (
              <div key={g.id} data-tour={gi === 0 ? "staff-people" : undefined}>
                <p className="widget-data-label mb-1 text-[var(--text-4)]">
                  {g.label} <span className="text-[var(--text-4)]">· {g.people.length}</span>
                </p>
                <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {g.people.map((p) => (
                    <PersonCard
                      key={p.key}
                      person={p}
                      basePath={basePath}
                      archived={archived}
                      onCreateProfile={canManageCode && !p.recordId ? () => setEditing(p) : undefined}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
        {editing ? <DetailsDialog person={editing} people={people} onClose={() => setEditing(null)} /> : null}
        {adding ? <AddPersonDialog onClose={() => setAdding(false)} /> : null}
      </section>
      {canManageHr && !archived ? <HrOverviewCard basePath={basePath} onTour={tour.start} /> : null}
      {canManageHr ? <StaffHrTour open={tour.open} onClose={tour.close} /> : null}
    </div>
  );
}
