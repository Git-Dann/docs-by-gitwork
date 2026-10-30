"use client";

/**
 * A person's profile in Staff (docs/hr-platform.md, Phase 1): the directory tier anyone
 * with Staff can see, the employment tier for them, their manager and HR, the personal
 * details only they and HR can see, and the log of who looked.
 *
 * What each viewer gets is decided on the server (profileAccess in src/lib/hr.ts) and
 * arrives as `profile.access`; this page only renders what it is handed. Personal details
 * are fetched only when the viewer presses Show, because every look by someone other than
 * the person is logged.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeftIcon, EyeIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { EMPLOYMENT_TYPE_LABEL, isEmploymentType, type StaffPerson } from "@/lib/staff";
import {
  EMPTY_SENSITIVE,
  HR_ACCESS_LABEL,
  MAX_EMERGENCY_CONTACTS,
  formatNiNumber,
  type EmergencyContact,
  type SensitiveDetails,
  type StaffActivity,
  type StaffProfile,
} from "@/lib/hr";
import { Avatar } from "@/components/ui/avatar";
import { WidgetCard } from "@/components/codeclear/codeclear-shared";
import { DetailsDialog } from "@/components/staff/staff-roster";
import { DocumentsCard } from "@/components/staff/staff-documents";
import { DateWithAttention, Field, HeaderAction, formatDate, label, today } from "@/components/staff/profile-parts";
import { ActivityHeatmap } from "@/components/ui/easyui/activity-heatmap";
import { DatePicker } from "@/components/ui/date-picker";
import { useStaffRoster } from "@/hooks/use-staff";
import {
  useAccessLog,
  useDeleteStaffRecord,
  useSetArchived,
  useStaffActivity,
  useStaffPersonal,
  useStaffProfile,
  useSuppliers,
  useUpdateEmployment,
  useUpdateStaffPersonal,
} from "@/hooks/use-hr";

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  STAFF: "Staff",
  DEVELOPER: "Developer",
  GUEST: "Guest",
};

// ── 02 // EMPLOYMENT ────────────────────────────────────────────────────────────

function EmploymentCard({ profile, number, className }: { profile: StaffProfile; number: string; className?: string }) {
  const e = profile.employment!;
  const [editing, setEditing] = useState(false);
  const [supplierId, setSupplierId] = useState(e.supplierId ?? "");
  const [endDate, setEndDate] = useState(e.endDate ?? "");
  const [probationEndsOn, setProbationEndsOn] = useState(e.probationEndsOn ?? "");
  const [notice, setNotice] = useState(e.noticePeriodWeeks?.toString() ?? "");
  const [days, setDays] = useState(e.daysPerWeek?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const suppliers = useSuppliers(editing && profile.access.editEmployment);
  const save = useUpdateEmployment(profile.recordId);

  const start = () => {
    setSupplierId(e.supplierId ?? "");
    setEndDate(e.endDate ?? "");
    setProbationEndsOn(e.probationEndsOn ?? "");
    setNotice(e.noticePeriodWeeks?.toString() ?? "");
    setDays(e.daysPerWeek?.toString() ?? "");
    setError(null);
    setEditing(true);
  };

  const submit = async () => {
    setError(null);
    try {
      await save.mutateAsync({
        supplierId: supplierId || null,
        endDate: endDate || null,
        probationEndsOn: probationEndsOn || null,
        noticePeriodWeeks: notice.trim() ? Number(notice) : null,
        daysPerWeek: days.trim() ? Number(days) : null,
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  };

  return (
    <WidgetCard
      number={number}
      name="Employment"
      className={className}
      action={profile.access.editEmployment && !editing ? <HeaderAction onClick={start} label="Edit employment details">Edit</HeaderAction> : undefined}
    >
      {editing ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={cn(label, "sm:col-span-2")}>
              Supplied by
              <select className="app-select mt-1 w-full" value={supplierId} onChange={(ev) => setSupplierId(ev.target.value)}>
                <option value="">Not supplied (engaged directly)</option>
                {(suppliers.data?.suppliers ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Contract end or leaving date
              <DatePicker className="mt-1 w-full" value={endDate} onChange={setEndDate} />
            </label>
            <label className={label}>
              Probation ends
              <DatePicker className="mt-1 w-full" value={probationEndsOn} onChange={setProbationEndsOn} />
            </label>
            <label className={label}>
              Notice period (weeks)
              <input type="number" min={0} max={52} step={1} inputMode="numeric" className="app-input mt-1 w-full" value={notice} onChange={(ev) => setNotice(ev.target.value)} />
            </label>
            <label className={label}>
              Days per week
              <input type="number" min={0.5} max={7} step={0.5} inputMode="decimal" className="app-input mt-1 w-full" value={days} onChange={(ev) => setDays(ev.target.value)} />
            </label>
          </div>
          {error ? (
            <p role="alert" className="text-[13px] text-[var(--danger-500)]">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button type="button" className="app-button app-button-secondary app-button-sm" onClick={() => setEditing(false)} disabled={save.isPending}>
              Cancel
            </button>
            <button type="button" className="app-button app-button-primary app-button-sm" onClick={() => void submit()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Supplied by" className="sm:col-span-2">
              {e.supplierName ?? "Engaged directly"}
            </Field>
            <Field label="Contract end">
              <DateWithAttention value={e.endDate} />
            </Field>
            <Field label="Probation ends">
              <DateWithAttention value={e.probationEndsOn} />
            </Field>
            <Field label="Notice period">{e.noticePeriodWeeks === null ? "—" : `${e.noticePeriodWeeks} week${e.noticePeriodWeeks === 1 ? "" : "s"}`}</Field>
            <Field label="Days per week">{e.daysPerWeek === null ? "—" : String(e.daysPerWeek)}</Field>
        </dl>
      )}
    </WidgetCard>
  );
}

// ── 03 // PERSONAL DETAILS ──────────────────────────────────────────────────────

function ContactsEditor({ contacts, onChange }: { contacts: EmergencyContact[]; onChange: (c: EmergencyContact[]) => void }) {
  const set = (i: number, patch: Partial<EmergencyContact>) => onChange(contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-3">
      <p className="widget-data-label text-[var(--text-4)]">Emergency contacts</p>
      {contacts.map((c, i) => (
        <div key={i} className="grid gap-2 rounded-[6px] border border-[var(--border-2)] p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <input className="app-input w-full" aria-label={`Contact ${i + 1} name`} placeholder="Name" value={c.name} maxLength={120} onChange={(ev) => set(i, { name: ev.target.value })} />
          <input className="app-input w-full" aria-label={`Contact ${i + 1} relationship`} placeholder="Relationship" value={c.relationship ?? ""} maxLength={60} onChange={(ev) => set(i, { relationship: ev.target.value })} />
          <input className="app-input w-full" aria-label={`Contact ${i + 1} phone`} placeholder="Phone" type="tel" value={c.phone} maxLength={40} onChange={(ev) => set(i, { phone: ev.target.value })} />
          <button type="button" className="app-button app-button-tertiary app-button-sm" onClick={() => onChange(contacts.filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}
      {contacts.length < MAX_EMERGENCY_CONTACTS ? (
        <button type="button" className="app-button app-button-secondary app-button-sm" onClick={() => onChange([...contacts, { name: "", relationship: "", phone: "" }])}>
          Add a contact
        </button>
      ) : null}
    </div>
  );
}

function PersonalForm({ initial, recordId, onDone }: { initial: SensitiveDetails; recordId: string; onDone: () => void }) {
  const [d, setD] = useState<SensitiveDetails>({ ...initial, niNumber: formatNiNumber(initial.niNumber) });
  const [error, setError] = useState<string | null>(null);
  const save = useUpdateStaffPersonal(recordId);
  const set = (patch: Partial<SensitiveDetails>) => setD((cur) => ({ ...cur, ...patch }));

  const submit = async () => {
    setError(null);
    try {
      await save.mutateAsync(d);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          Date of birth
          <DatePicker className="mt-1 w-full" value={d.dateOfBirth ?? ""} max={today()} onChange={(v) => set({ dateOfBirth: v || null })} />
        </label>
        <label className={label}>
          NI number
          <input className="app-input mt-1 w-full uppercase" value={d.niNumber ?? ""} placeholder="AB 12 34 56 C" maxLength={13} autoComplete="off" onChange={(ev) => set({ niNumber: ev.target.value || null })} />
        </label>
        <label className={label}>
          Personal phone
          <input type="tel" className="app-input mt-1 w-full" value={d.personalPhone ?? ""} maxLength={40} onChange={(ev) => set({ personalPhone: ev.target.value || null })} />
        </label>
        <label className={label}>
          Personal email
          <input type="email" className="app-input mt-1 w-full" value={d.personalEmail ?? ""} maxLength={200} onChange={(ev) => set({ personalEmail: ev.target.value || null })} />
        </label>
        <label className={cn(label, "sm:col-span-2")}>
          Home address
          <textarea className="app-input mt-1 w-full py-2" rows={3} value={d.homeAddress ?? ""} maxLength={400} onChange={(ev) => set({ homeAddress: ev.target.value || null })} />
        </label>
        <label className={label}>
          ID number (passport or card)
          <input className="app-input mt-1 w-full" value={d.idDocumentNumber ?? ""} maxLength={40} autoComplete="off" onChange={(ev) => set({ idDocumentNumber: ev.target.value || null })} />
        </label>
        <label className={label}>
          Right to work expires
          <DatePicker className="mt-1 w-full" value={d.rightToWorkExpiry ?? ""} onChange={(v) => set({ rightToWorkExpiry: v || null })} />
        </label>
      </div>
      <ContactsEditor contacts={d.emergencyContacts} onChange={(emergencyContacts) => set({ emergencyContacts })} />
      {error ? (
        <p role="alert" className="text-[13px] text-[var(--danger-500)]">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <button type="button" className="app-button app-button-secondary app-button-sm" onClick={onDone} disabled={save.isPending}>
          Cancel
        </button>
        <button type="button" className="app-button app-button-primary app-button-sm" onClick={() => void submit()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function PersonalCard({ profile, number, className }: { profile: StaffProfile; number: string; className?: string }) {
  const self = profile.relation === "self";
  // Your own details load straight away; anyone else's wait for a deliberate, logged look.
  const [revealed, setRevealed] = useState(self);
  const [editing, setEditing] = useState(false);
  const personal = useStaffPersonal(profile.recordId, revealed);

  if (!revealed) {
    return (
      <WidgetCard
        number={number}
        name="Personal details"
        className={className}
        action={
          <HeaderAction onClick={() => setRevealed(true)} label="Show personal details">
            <EyeIcon aria-hidden className="h-3.5 w-3.5" />
            Show
          </HeaderAction>
        }
      >
        <p className="flex items-center gap-2 text-[13px] text-[var(--text-3)]">
          <LockClosedIcon aria-hidden className="h-4 w-4 shrink-0" />
          Hidden. Showing them is recorded in the access log.
        </p>
      </WidgetCard>
    );
  }

  const d = personal.data ?? EMPTY_SENSITIVE;
  return (
    <WidgetCard
      number={number}
      name="Personal details"
      status={self ? "Only you and HR" : "Viewing is logged"}
      statusTone={self ? "info" : "warning"}
      className={className}
      action={profile.access.editSensitive && !editing && personal.data ? <HeaderAction onClick={() => setEditing(true)} label="Edit personal details">Edit</HeaderAction> : undefined}
    >
      {personal.isPending ? (
        <p className="text-[13px] text-[var(--text-3)]">Loading…</p>
      ) : personal.isError ? (
        <p role="alert" className="text-[13px] text-[var(--danger-500)]">
          {personal.error instanceof Error ? personal.error.message : "Could not load personal details"}
        </p>
      ) : editing ? (
        <PersonalForm initial={d} recordId={profile.recordId} onDone={() => setEditing(false)} />
      ) : (
        <div className="space-y-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Date of birth">{formatDate(d.dateOfBirth)}</Field>
            <Field label="NI number">
              <span className="font-mono">{formatNiNumber(d.niNumber) ?? "—"}</span>
            </Field>
            <Field label="Personal phone">{d.personalPhone ?? "—"}</Field>
            <Field label="Personal email">{d.personalEmail ?? "—"}</Field>
            <Field label="Home address" className="sm:col-span-2">
              <span className="whitespace-pre-line">{d.homeAddress ?? "—"}</span>
            </Field>
            <Field label="ID number">
              <span className="font-mono">{d.idDocumentNumber ?? "—"}</span>
            </Field>
            <Field label="Right to work until">
              <DateWithAttention value={d.rightToWorkExpiry} />
            </Field>
          </dl>
          <div>
            <p className="widget-data-label text-[var(--text-4)]">Emergency contacts</p>
            {d.emergencyContacts.length ? (
              <ul className="mt-2 divide-y divide-[var(--border-3)]">
                {d.emergencyContacts.map((c, i) => (
                  <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-[14px]">
                    <span className="text-[var(--text-1)]">
                      {c.name}
                      {c.relationship ? <span className="text-[var(--text-3)]"> · {c.relationship}</span> : null}
                    </span>
                    <span className="font-mono text-[13px] text-[var(--text-2)]">{c.phone}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[14px] text-[var(--text-3)]">None yet</p>
            )}
          </div>
        </div>
      )}
    </WidgetCard>
  );
}

// ── 04 // ACCESS LOG ────────────────────────────────────────────────────────────

const LOG_PREVIEW = 5;

function AccessLogCard({ recordId, number, className }: { recordId: string; number: string; className?: string }) {
  const log = useAccessLog(recordId, true);
  const [all, setAll] = useState(false);
  const entries = log.data?.entries ?? [];
  const shown = all ? entries : entries.slice(0, LOG_PREVIEW);
  return (
    <WidgetCard
      number={number}
      name="HR access log"
      status={log.data ? `${entries.length} entr${entries.length === 1 ? "y" : "ies"}` : undefined}
      statusTone="muted"
      className={className}
      action={entries.length > LOG_PREVIEW ? <HeaderAction onClick={() => setAll((v) => !v)} label={all ? "Show fewer log entries" : "Show the whole access log"}>{all ? "Show fewer" : "Show all"}</HeaderAction> : undefined}
    >
      {log.isPending ? (
        <p className="text-[13px] text-[var(--text-3)]">Loading…</p>
      ) : log.isError ? (
        <p role="alert" className="text-[13px] text-[var(--danger-500)]">
          {log.error instanceof Error ? log.error.message : "Could not load the log"}
        </p>
      ) : entries.length === 0 ? (
        <p className="text-[13px] text-[var(--text-3)]">No views or changes yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border-3)]">
          {shown.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
              <span className="min-w-0 text-[14px] text-[var(--text-1)]">
                {e.actorName ?? "Someone"} <span className="text-[var(--text-3)]">· {HR_ACCESS_LABEL[e.action].toLowerCase()}</span>
                {e.detail ? <span className="block text-[12px] text-[var(--text-4)]">{e.detail}</span> : null}
              </span>
              <time className="shrink-0 font-mono text-[12px] text-[var(--text-3)]" dateTime={e.at}>
                {new Date(e.at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </time>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

// ── Archive / restore / delete ──────────────────────────────────────────────────

/**
 * The record-level actions, beside the name. Each asks once before it acts: archiving
 * someone who signs in removes their Foundry access immediately, and delete cannot be
 * undone. Delete only appears when the record has no history (the server decides).
 */
function PersonActions({ profile, basePath }: { profile: StaffProfile; basePath: string }) {
  const router = useRouter();
  const l = profile.lifecycle;
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setArchived = useSetArchived();
  const remove = useDeleteStaffRecord();
  const busy = setArchived.isPending || remove.isPending;

  const run = async () => {
    setError(null);
    try {
      if (confirm === "delete") {
        await remove.mutateAsync(profile.recordId);
        router.push(basePath);
        return;
      }
      await setArchived.mutateAsync({ recordId: profile.recordId, memberId: l.hasLogin ? profile.memberId : null, archived: !l.archived });
      setConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  if (confirm) {
    const sentence =
      confirm === "delete"
        ? `Delete ${profile.name}'s record for good?`
        : l.hasLogin
          ? `Archive ${profile.name}? Their Foundry access stops now. You can restore them for 30 days. Their Google account is separate.`
          : `Archive ${profile.name}? They leave every list and can be restored any time.`;
    return (
      <div className="flex max-w-md flex-col items-end gap-2 text-right">
        <p className="text-[13px] text-[var(--text-2)]">{sentence}</p>
        {error ? (
          <p role="alert" className="text-[13px] text-[var(--danger-500)]">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button type="button" className="app-button app-button-secondary app-button-sm" onClick={() => setConfirm(null)} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="app-button app-button-danger app-button-sm" onClick={() => void run()} disabled={busy}>
            {busy ? "Working…" : confirm === "delete" ? "Delete" : "Archive"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {profile.isDeveloper ? (
        <Link href={`/app/codeclear/candidates/${profile.recordId}`} className="app-button app-button-tertiary app-button-sm">
          Dev profile
        </Link>
      ) : null}
      {l.canArchive && l.archived && l.restorable ? (
        <button type="button" className="app-button app-button-secondary app-button-sm" onClick={() => void run()} disabled={busy}>
          {busy ? "Restoring…" : "Restore"}
        </button>
      ) : null}
      {l.canArchive && !l.archived ? (
        <button type="button" className="app-button app-button-secondary app-button-sm" onClick={() => setConfirm("archive")}>
          Archive
        </button>
      ) : null}
      {l.canDelete ? (
        <button type="button" className="app-button app-button-tertiary app-button-sm text-[var(--danger-500)]" onClick={() => setConfirm("delete")}>
          Delete
        </button>
      ) : null}
      {error ? (
        <p role="alert" className="basis-full text-right text-[13px] text-[var(--danger-500)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ── Activity and time off ───────────────────────────────────────────────────────

/** Tasks they completed per day (EasyUI's Activity Heatmap), and every client they've been placed on. */
function ActivityCard({ activity, hasLogin, number }: { activity: StaffActivity | undefined; hasLogin: boolean; number: string }) {
  return (
    <WidgetCard number={number} name="Activity" status={activity && hasLogin ? `${activity.completedTotal} tasks in 26 weeks` : undefined} statusTone="muted">
      {!activity ? (
        <p className="text-[13px] text-[var(--text-3)]">Loading…</p>
      ) : (
        <div className="space-y-5">
          {hasLogin ? (
            <ActivityHeatmap
              data={activity.completedByDay}
              weeks={26}
              weekStart={1}
              unit="tasks completed"
              ariaLabel={`Tasks completed per day: ${activity.completedTotal} in the last 26 weeks.`}
            />
          ) : (
            <p className="text-[13px] text-[var(--text-3)]">They don&apos;t sign in, so there&apos;s no task activity.</p>
          )}
          <div>
            <p className="widget-data-label text-[var(--text-4)]">Placements</p>
            {activity.placements.length ? (
              <ul className="mt-2 divide-y divide-[var(--border-3)]">
                {activity.placements.map((pl, i) => (
                  <li key={`${pl.clientName}:${pl.startDate}:${i}`} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
                    <span className="min-w-0 truncate text-[var(--text-1)]" title={pl.clientName}>
                      {pl.clientName}
                      {pl.allocationPercent < 100 ? <span className="text-[var(--text-3)]"> · {pl.allocationPercent}%</span> : null}
                    </span>
                    <span className="shrink-0 font-mono text-[12px] text-[var(--text-3)]">
                      {formatDate(pl.startDate)} – {pl.endDate ? formatDate(pl.endDate) : "now"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[13px] text-[var(--text-3)]">None yet.</p>
            )}
          </div>
        </div>
      )}
    </WidgetCard>
  );
}

/** Leave in the next 90 days and, for the person, HR and approvers, this year's allowance. */
function TimeOffCard({ activity, number }: { activity: StaffActivity | undefined; number: string }) {
  const a = activity?.allowance;
  return (
    <WidgetCard number={number} name="Time off" status="Next 90 days" statusTone="muted">
      {!activity ? (
        <p className="text-[13px] text-[var(--text-3)]">Loading…</p>
      ) : (
        <div className="space-y-4">
          {a ? (
            <dl className="grid grid-cols-3 gap-4">
              <Field label="Allowance">{a.allocated} days</Field>
              <Field label="Used">{a.used}{a.pending ? <span className="text-[var(--text-3)]"> +{a.pending} pending</span> : null}</Field>
              <Field label="Left">{a.remaining}</Field>
            </dl>
          ) : null}
          {activity.upcomingLeave.length ? (
            <ul className="divide-y divide-[var(--border-3)]">
              {activity.upcomingLeave.map((l) => (
                <li key={`${l.start}:${l.end}`} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
                  <span className="text-[var(--text-1)]">
                    {l.label}
                    {l.pending ? <span className="text-[var(--text-3)]"> · waiting for approval</span> : null}
                  </span>
                  <span className="shrink-0 font-mono text-[12px] text-[var(--text-3)]">
                    {l.start === l.end ? formatDate(l.start) : `${formatDate(l.start)} – ${formatDate(l.end)}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-[var(--text-3)]">Nothing booked.</p>
          )}
        </div>
      )}
    </WidgetCard>
  );
}

// ── The page ────────────────────────────────────────────────────────────────────

/**
 * `mode="me"` is the same record opened by its owner from Backstage → Me: no way back to
 * People and no archive or delete, but every card works exactly as it does on Staff.
 */
export function StaffProfileView({
  recordId,
  basePath = "/app/staff",
  mode = "staff",
}: {
  recordId: string;
  basePath?: string;
  mode?: "staff" | "me";
}) {
  const profile = useStaffProfile(recordId);
  const activity = useStaffActivity(recordId);
  const roster = useStaffRoster();
  const [editingDirectory, setEditingDirectory] = useState(false);

  if (profile.isPending) return <p className="text-sm text-[var(--text-3)]">Loading…</p>;
  if (profile.isError || !profile.data) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-[var(--danger-500)]">
          {profile.error instanceof Error ? profile.error.message : "Could not load this person"}
        </p>
        <Link href={basePath} className="app-button app-button-secondary app-button-sm">
          Back to People
        </Link>
      </div>
    );
  }

  const p = profile.data;
  const displayName = p.preferredName || p.name;
  const type = isEmploymentType(p.employmentType) ? EMPLOYMENT_TYPE_LABEL[p.employmentType] : null;
  const rosterPerson: StaffPerson | undefined = roster.data?.people.find((x) => x.recordId === p.recordId);

  // Numbered in reading order. Two independent columns (who they are | what's private about
  // them), so a short card never stretches to match a tall one beside it.
  let n = 0;
  const next = () => String(++n).padStart(2, "0");
  const dev = activity.data?.developer ?? null;
  const overview = (
    <WidgetCard
      number={next()}
      name="Overview"
      status={p.role ? ROLE_LABEL[p.role] ?? p.role : "No login"}
      statusTone={p.role ? "info" : "muted"}
      action={
        p.access.editDirectory && rosterPerson && !editingDirectory ? (
          <HeaderAction onClick={() => setEditingDirectory(true)} label="Edit overview">
            Edit
          </HeaderAction>
        ) : undefined
      }
    >
      {editingDirectory && rosterPerson ? (
        <DetailsDialog inline person={rosterPerson} people={roster.data?.people ?? []} onClose={() => setEditingDirectory(false)} />
      ) : (
      <dl className="grid gap-4 sm:grid-cols-2">
        {p.preferredName && p.preferredName !== p.name ? <Field label="Legal name">{p.name}</Field> : null}
        <Field label="Email">{p.email ?? "—"}</Field>
        <Field label="Type">{type ?? "—"}</Field>
        <Field label="Started">{formatDate(p.startDate)}</Field>
        <Field label="Manager">
          {p.managerRecordId && p.managerName ? (
            <Link href={`${basePath}/${p.managerRecordId}`} className="hover:text-[var(--brand-600)] hover:underline">
              {p.managerName}
            </Link>
          ) : (
            "—"
          )}
        </Field>
        <Field label="Clients" className="sm:col-span-2">
          {p.currentClients.length ? p.currentClients.map((c) => c.name).join(", ") : "—"}
        </Field>
        {dev ? (
          <>
            <Field label="GitHub">
              <a href={`https://github.com/${dev.githubHandle}`} target="_blank" rel="noreferrer noopener" className="hover:text-[var(--brand-600)] hover:underline">
                {dev.githubHandle}
              </a>
            </Field>
            <Field label="Stack">{[dev.primaryStack, ...dev.techStacks.filter((t) => t !== dev.primaryStack)].filter(Boolean).slice(0, 4).join(", ") || "—"}</Field>
          </>
        ) : null}
      </dl>
      )}
    </WidgetCard>
  );
  const employment = p.employment ? <EmploymentCard key={JSON.stringify(p.employment)} profile={p} number={next()} /> : null;
  const timeOff = p.lifecycle.hasLogin ? <TimeOffCard activity={activity.data} number={next()} /> : null;
  const activityCard = <ActivityCard activity={activity.data} hasLogin={p.lifecycle.hasLogin} number={next()} />;
  // Documents are personal: the person, their manager (only what's shared with them) and HR.
  const documents = p.access.employment ? <DocumentsCard recordId={p.recordId} number={next()} /> : null;
  const personal = p.access.sensitive ? <PersonalCard profile={p} number={next()} /> : null;
  const accessLog = p.access.accessLog ? <AccessLogCard recordId={p.recordId} number={next()} /> : null;

  return (
    <div className="space-y-5">
      {mode === "staff" ? (
        <Link href={basePath} className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-3)] hover:text-[var(--text-1)]">
          <ArrowLeftIcon aria-hidden className="h-4 w-4" />
          People
        </Link>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar src={p.avatarUrl} name={displayName} size={48} />
          <div className="min-w-0">
            <h2 className="truncate text-[22px] font-semibold leading-tight tracking-[-0.01em] text-[var(--text-1)]" title={displayName}>
              {displayName}
            </h2>
            <p className="truncate text-[14px] text-[var(--text-3)]" title={[p.jobTitle, p.department, p.pronouns].filter(Boolean).join(" · ")}>
              {[p.jobTitle, p.department, p.pronouns].filter(Boolean).join(" · ") || "No job title yet"}
            </p>
          </div>
        </div>
        {mode === "staff" ? <PersonActions profile={p} basePath={basePath} /> : null}
      </div>

      {p.lifecycle.archived ? (
        <p className="rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2 text-[13px] text-[var(--text-2)]">
          Archived{p.lifecycle.archivedAt ? ` on ${formatDate(p.lifecycle.archivedAt.slice(0, 10))}` : ""}.{" "}
          {p.lifecycle.restorable
            ? p.lifecycle.hasLogin
              ? "They have no access to Foundry and can be restored for 30 days from then."
              : "They can be restored any time."
            : "Past the 30-day window: reinstate them from Settings → People & access."}
        </p>
      ) : null}

      {/* Two independent columns: the person and their work on the left, what they've done
          and what's private on the right. Reading order matches the numbering. */}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="min-w-0 space-y-5">
          {overview}
          {employment}
          {timeOff}
        </div>
        <div className="min-w-0 space-y-5">
          {activityCard}
          {documents}
          {personal}
          {accessLog}
        </div>
      </div>
    </div>
  );
}
