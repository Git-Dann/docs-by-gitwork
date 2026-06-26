"use client";

import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  BanknotesIcon,
  BeakerIcon,
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CodeBracketIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowRightCircleIcon,
  ArrowUpRightIcon,
  GlobeAltIcon,
  MagnifyingGlassIcon,
  PauseCircleIcon,
  PencilIcon,
  PlayCircleIcon,
  PlusIcon,
  SignalIcon,
  SparklesIcon,
  TrashIcon,
  VideoCameraIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { buttonStyles } from "@/components/ui/button-styles";
import { LogoImagePicker } from "@/components/ui/logo-image-picker";
import { CountrySelect, PhoneInput, WebsiteInput } from "@/components/ui/contact-fields";
import { ClientDesignFormModal } from "@/components/clients/client-design-form";
import { ClientPlatformFormModal } from "@/components/clients/client-platform-form";
import { StatusBadge } from "@/components/status-badge";
import {
  useClientDetail,
  useClientMeetings,
  useClientSlackActivity,
  useIngestClientMeeting,
  useLinkMeetingActionItemTask,
  useUpdateMeetingDecision,
  useCreateClientDesign,
  useCreateClientPlatform,
  useDeleteClientDesign,
  useDeleteClientPlatform,
  useRevealClientBank,
  useSetClientStatus,
  useAddClientTouchpoint,
  useUpdateClient,
  useUpdateClientDesign,
  useUpdateClientPlatform,
} from "@/hooks/use-proposals";
import { useCreateTask, useDeleteTask, useTasks } from "@/hooks/use-tasks";
import { cn, formatDate, taskRef } from "@/lib/format";
import { detectPlatformIcon } from "@/lib/platform-icons";
import { fetchSlackChannels, type SlackAvailableChannel, type ScribeMeeting, type ScribeCandidate, type ScribeActionItem } from "@/lib/api";
import { TASK_STATUS_LABELS, type TaskDTO } from "@/types/tasks";
import type {
  ClientBankReveal,
  ClientBankSummary,
  ClientDetailRecord,
  ClientDesignRecord,
  ClientPlatformRecord,
  ClientTouchpoint,
  LeadStage,
  TouchpointType,
} from "@/types/client";

type EditFormState = {
  name: string;
  logoUrl: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  country: string;
  notes: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone: string;
  googleDriveFolderUrl: string;
  clickupUrl: string;
  slackChannelId: string;
  slackInternalChannelId: string;
  slackExternalChannelId: string;
  retainerDays: string;
  retainerDaysUsed: string;
};

/** Field-type validation for the edit-client form. Returns the first error, or null if valid. */
function validateEditForm(f: EditFormState): string | null {
  const email = f.primaryContactEmail.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Enter a valid contact email address.";
  }
  // Website is stored with the https:// scheme; require a dotted host.
  if (f.website.trim() && !/\.[a-z]{2,}/i.test(f.website.replace(/^https?:\/\//i, "").trim())) {
    return "Enter a valid website address (e.g. client.com).";
  }
  for (const [label, url] of [
    ["Google Drive folder", f.googleDriveFolderUrl],
    ["ClickUp folder", f.clickupUrl],
  ] as const) {
    const v = url.trim();
    if (v && !/^https?:\/\/\S+\.\S+/i.test(v)) {
      return `Enter a valid ${label} URL (including https://).`;
    }
  }
  for (const [label, days] of [
    ["Retainer days", f.retainerDays],
    ["Used this month", f.retainerDaysUsed],
  ] as const) {
    const t = days.trim();
    if (t !== "" && (!Number.isInteger(Number(t)) || Number(t) < 0 || Number(t) > 31)) {
      return `${label} must be a whole number between 0 and 31.`;
    }
  }
  return null;
}

/** Official Slack mark (4-colour). Labels the Internal / External channel fields. */
function SlackGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 122.8 122.8" aria-hidden="true" focusable="false">
      <path d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9z" fill="#E01E5A" />
      <path d="M32.3 77.6c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z" fill="#E01E5A" />
      <path d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2z" fill="#36C5F0" />
      <path d="M45.2 32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z" fill="#36C5F0" />
      <path d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2z" fill="#2EB67D" />
      <path d="M90.5 45.2c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z" fill="#2EB67D" />
      <path d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9z" fill="#ECB22E" />
      <path d="M77.6 90.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z" fill="#ECB22E" />
    </svg>
  );
}

const LEAD_STAGE_OPTIONS: { value: LeadStage; label: string }[] = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "PROPOSAL_SENT", label: "Proposal sent" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
];
const TOUCHPOINT_LABEL: Record<TouchpointType, string> = {
  CALL: "Call",
  EMAIL: "Email",
  MEETING: "Meeting",
  NOTE: "Note",
};

/** Lead CRM workspace — editable stage/follow-up/source/value + a touchpoint activity log.
 *  Shown on the client detail only while the client's status is LEAD. */
function LeadWorkspace({
  slug,
  client,
  touchpoints,
}: {
  slug: string;
  client: ClientDetailRecord["client"];
  touchpoints: ClientTouchpoint[];
}) {
  const update = useUpdateClient(slug);
  const addTp = useAddClientTouchpoint(slug);
  const [source, setSource] = useState(client.leadSource ?? "");
  const [value, setValue] = useState(client.leadValue != null ? String(client.leadValue) : "");
  const [tpType, setTpType] = useState<TouchpointType>("NOTE");
  const [tpNote, setTpNote] = useState("");

  const saveSource = () => {
    const next = source.trim();
    if ((client.leadSource ?? "") !== next) update.mutate({ leadSource: next || null });
  };
  const saveValue = () => {
    const next = value.trim() ? Number(value) : null;
    if ((client.leadValue ?? null) !== next) update.mutate({ leadValue: next });
  };
  async function log() {
    if (tpType === "NOTE" && !tpNote.trim()) return;
    try {
      await addTp.mutateAsync({ type: tpType, note: tpNote.trim() || undefined });
      setTpNote("");
    } catch {
      /* surfaced via mutation state */
    }
  }

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label">LEAD</span>
      </div>
      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="widget-data-label mb-1.5 block">Stage</span>
              <select
                value={client.leadStage ?? "NEW"}
                onChange={(e) => update.mutate({ leadStage: e.target.value as LeadStage })}
                className="app-input"
              >
                {LEAD_STAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="widget-data-label mb-1.5 block">Next follow-up</span>
              <input
                type="date"
                value={client.leadFollowUpAt ? client.leadFollowUpAt.slice(0, 10) : ""}
                onChange={(e) => update.mutate({ leadFollowUpAt: e.target.value || null })}
                className="app-input"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="widget-data-label mb-1.5 block">Source</span>
              <input value={source} onChange={(e) => setSource(e.target.value)} onBlur={saveSource} className="app-input" />
            </label>
            <label className="block">
              <span className="widget-data-label mb-1.5 block">Est. value (£)</span>
              <input value={value} onChange={(e) => setValue(e.target.value)} onBlur={saveValue} type="number" min="0" className="app-input" />
            </label>
          </div>
        </div>

        <div className="space-y-3">
          <span className="widget-data-label">Activity</span>
          <div className="flex items-center gap-2">
            <select value={tpType} onChange={(e) => setTpType(e.target.value as TouchpointType)} className="app-input w-28">
              {(Object.keys(TOUCHPOINT_LABEL) as TouchpointType[]).map((t) => (
                <option key={t} value={t}>{TOUCHPOINT_LABEL[t]}</option>
              ))}
            </select>
            <input
              value={tpNote}
              onChange={(e) => setTpNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void log(); }}
              placeholder="Log a call, email, note…"
              className="app-input flex-1"
            />
            <Button type="button" variant="primary" size="sm" onClick={() => void log()} disabled={addTp.isPending}>
              Log
            </Button>
          </div>
          <ul className="space-y-2">
            {touchpoints.length === 0 ? (
              <li className="text-sm text-[var(--text-4)]">No activity logged yet.</li>
            ) : (
              touchpoints.map((t) => (
                <li key={t.id} className="rounded-[6px] border border-[var(--border-2)] px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[var(--text-2)]">{TOUCHPOINT_LABEL[t.type]}</span>
                    <span className="widget-timestamp">{formatDate(t.occurredAt)}</span>
                  </div>
                  {t.note ? <p className="mt-0.5 text-[var(--text-3)]">{t.note}</p> : null}
                  {t.authorName ? <p className="mt-0.5 text-[11px] text-[var(--text-4)]">{t.authorName}</p> : null}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function ClientDetail({ slug }: { slug: string }) {
  const router = useRouter();
  const { data, isPending, error } = useClientDetail(slug);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [bankOpen, setBankOpen] = useState(false);
  const [platformModal, setPlatformModal] = useState<{
    open: boolean;
    platform: ClientPlatformRecord | null;
  }>({ open: false, platform: null });
  const [platformError, setPlatformError] = useState<string | null>(null);
  const [deletingPlatformId, setDeletingPlatformId] = useState<string | null>(null);

  const [designModal, setDesignModal] = useState<{
    open: boolean;
    design: ClientDesignRecord | null;
  }>({ open: false, design: null });
  const [designError, setDesignError] = useState<string | null>(null);
  const [deletingDesignId, setDeletingDesignId] = useState<string | null>(null);

  const updateClientMutation = useUpdateClient(slug);
  const createPlatformMutation = useCreateClientPlatform(slug);
  const createDesignMutation = useCreateClientDesign(slug);
  const slackActivity = useClientSlackActivity(slug);
  const setStatus = useSetClientStatus(slug);
  // Pause (→ INACTIVE) modal state.
  const [pausing, setPausing] = useState(false);
  const [resumeAtInput, setResumeAtInput] = useState("");
  const [pauseNoteInput, setPauseNoteInput] = useState("");
  const [statusError, setStatusError] = useState<string | null>(null);

  if (isPending) {
    return (
      <div className="widget-card">
        <div className="widget-body py-16 text-center">
          <p className="widget-data-label animate-pulse">Loading client…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="widget-card">
        <div className="widget-body py-16 text-center">
          <p className="text-sm text-rose-700">
            {(error as Error)?.message ?? "Client unavailable"}
          </p>
        </div>
      </div>
    );
  }

  const { client, lifecycle, proposals, proofDocuments, platforms, designs, pulseScans, supportClient, placements, studies, touchpoints } = data;
  const isSuggested = client.source === "SUGGESTED";
  // Leads show only the lead workspace + contact/notes — project/delivery info is hidden
  // until they become a client (status flips to ACTIVE via "Convert to client").
  const isLead = client.status === "LEAD";

  async function changeStatus(
    status: "ACTIVE" | "INACTIVE" | "LEAD",
    extra?: { resumeAt?: string | null; pauseNote?: string | null },
  ) {
    setStatusError(null);
    try {
      await setStatus.mutateAsync({ status, ...extra });
      setPausing(false);
      setResumeAtInput("");
      setPauseNoteInput("");
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Status change failed");
    }
  }
  const activationChecklist = buildActivationChecklist({ client, proposals, platforms, designs });

  function openEdit() {
    setEditForm({
      name: client.name,
      logoUrl: client.logoUrl ?? "",
      website: client.website ?? "",
      addressLine1: client.addressLine1 ?? "",
      addressLine2: client.addressLine2 ?? "",
      city: client.city ?? "",
      postcode: client.postcode ?? "",
      country: client.country ?? "",
      notes: client.notes ?? "",
      primaryContactName: client.primaryContactName ?? "",
      primaryContactEmail: client.primaryContactEmail ?? "",
      primaryContactPhone: client.primaryContactPhone ?? "",
      googleDriveFolderUrl: client.googleDriveFolderUrl ?? "",
      clickupUrl: client.clickupUrl ?? "",
      slackChannelId: client.slackChannelId ?? "",
      slackInternalChannelId: client.slackInternalChannelId ?? "",
      slackExternalChannelId: client.slackExternalChannelId ?? "",
      retainerDays: client.retainerDays != null ? String(client.retainerDays) : "",
      retainerDaysUsed: client.retainerDaysUsed != null ? String(client.retainerDaysUsed) : "",
    });
    setEditing(true);
  }

  async function handleSaveClient() {
    if (!editForm) return;
    const validationError = validateEditForm(editForm);
    if (validationError) {
      setEditError(validationError);
      return;
    }
    setEditError(null);
    try {
      const updated = await updateClientMutation.mutateAsync({
        name: editForm.name,
        logoUrl: editForm.logoUrl || undefined,
        website: editForm.website || undefined,
        addressLine1: editForm.addressLine1 || undefined,
        addressLine2: editForm.addressLine2 || undefined,
        city: editForm.city || undefined,
        postcode: editForm.postcode || undefined,
        country: editForm.country || undefined,
        notes: editForm.notes || undefined,
        primaryContactName: editForm.primaryContactName || undefined,
        primaryContactEmail: editForm.primaryContactEmail || undefined,
        primaryContactPhone: editForm.primaryContactPhone || undefined,
        googleDriveFolderUrl: editForm.googleDriveFolderUrl || undefined,
        clickupUrl: editForm.clickupUrl || undefined,
        slackChannelId: editForm.slackChannelId || undefined,
        slackInternalChannelId: editForm.slackInternalChannelId || undefined,
        slackExternalChannelId: editForm.slackExternalChannelId || undefined,
        retainerDays: editForm.retainerDays.trim() === "" ? null : Number(editForm.retainerDays),
        retainerDaysUsed: editForm.retainerDaysUsed.trim() === "" ? null : Number(editForm.retainerDaysUsed),
      });
      setEditing(false);
      setEditForm(null);
      // Renaming changes the slug; the current route (/app/portal/[oldSlug]) would 404
      // ("client not found") on refetch. Move to the new slug when it changes.
      const nextSlug = updated?.client?.slug;
      if (nextSlug && nextSlug !== slug) {
        router.replace(`/app/portal/${nextSlug}`);
      }
    } catch (err) {
      setEditError((err as Error).message);
    }
  }

  async function handleSavePlatform(input: {
    name: string;
    platformType?: string;
    url?: string;
    stagingUrl?: string;
    repoUrl?: string;
    username?: string;
    password?: string;
    notes?: string;
  }) {
    setPlatformError(null);
    try {
      if (!platformModal.platform) {
        await createPlatformMutation.mutateAsync(input);
      }
      setPlatformModal({ open: false, platform: null });
    } catch (err) {
      setPlatformError((err as Error).message);
    }
  }

  async function handleSaveDesign(input: {
    name: string;
    url?: string;
    notes?: string;
  }) {
    setDesignError(null);
    try {
      if (!designModal.design) {
        await createDesignMutation.mutateAsync(input);
      }
      setDesignModal({ open: false, design: null });
    } catch (err) {
      setDesignError((err as Error).message);
    }
  }

  const addressParts = [
    client.addressLine1,
    client.addressLine2,
    client.city,
    client.postcode,
    client.country,
  ].filter(Boolean);

  const hasContactInfo =
    client.primaryContactName ||
    client.primaryContactEmail ||
    client.primaryContactPhone ||
    addressParts.length > 0 ||
    client.website;

  return (
    <div className="space-y-5">

      {client.status === "PENDING_REVIEW" && (
        <PendingReviewBanner
          slug={slug}
          companyName={client.legalCompanyName ?? client.name}
          checklist={activationChecklist}
        />
      )}

      {/* ── 01 // CLIENT RECORD ── */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">01</span>
            {" // CLIENT RECORD"}
          </span>
          <div className="flex items-center gap-2">
            {isSuggested && (
              <span className="flex items-center gap-1 rounded-[4px] border border-[rgba(0,0,0,0.08)] bg-[var(--surface-1)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-3)]"
                style={{ fontFamily: "var(--font-mono)" }}>
                <SparklesIcon className="h-3 w-3 text-[var(--brand-700)]" />
                Suggested
              </span>
            )}
            {supportClient && (
              <Link
                href="/app/care"
                title="Open in Care"
                className="flex items-center gap-1 rounded-[4px] border border-[var(--mist-border)] bg-[var(--mist)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-700)] transition hover:opacity-80"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                <ChatBubbleLeftRightIcon className="h-3 w-3" />
                Care
              </Link>
            )}
            {/* Integration quick-links */}
            {client.googleDriveFolderUrl && (
              <a
                href={client.googleDriveFolderUrl}
                target="_blank"
                rel="noreferrer"
                title="Open Google Drive folder"
                className="opacity-40 hover:opacity-80 transition-opacity"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://www.google.com/s2/favicons?domain=drive.google.com&sz=16"
                  alt="Google Drive"
                  className="h-4 w-4 grayscale"
                />
              </a>
            )}
            {client.clickupUrl && (
              <a
                href={client.clickupUrl}
                target="_blank"
                rel="noreferrer"
                title="Open ClickUp folder"
                className="opacity-40 hover:opacity-80 transition-opacity"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://www.google.com/s2/favicons?domain=app.clickup.com&sz=16"
                  alt="ClickUp"
                  className="h-4 w-4 grayscale"
                />
              </a>
            )}
            {!isSuggested && client.status === "LEAD" && (
              <Button type="button" variant="primary" size="xs" onClick={() => changeStatus("ACTIVE")} disabled={setStatus.isPending}>
                <ArrowRightCircleIcon className="h-3 w-3" />
                Convert to client
              </Button>
            )}
            {!isSuggested && client.status === "ACTIVE" && (
              <Button type="button" variant="secondary" size="xs" onClick={() => setPausing(true)}>
                <PauseCircleIcon className="h-3 w-3" />
                Pause
              </Button>
            )}
            {!isSuggested && client.status === "INACTIVE" && (
              <Button type="button" variant="primary" size="xs" onClick={() => changeStatus("ACTIVE")} disabled={setStatus.isPending}>
                <PlayCircleIcon className="h-3 w-3" />
                Reactivate
              </Button>
            )}
            <Button type="button" variant="secondary" size="xs" onClick={openEdit}>
              <PencilIcon className="h-3 w-3" />
              Edit
            </Button>
          </div>
        </div>

        {/* Paused banner — shown for INACTIVE clients with the pick-back-up date + reason. */}
        {client.status === "INACTIVE" && (
          <div className="border-t border-[var(--border-3)] bg-amber-50 px-6 py-3 text-sm dark:bg-amber-950/30">
            <span className="font-medium text-amber-800 dark:text-amber-300">Paused.</span>{" "}
            <span className="text-amber-700 dark:text-amber-200">
              {client.resumeAt ? `Pick back up ${formatDate(client.resumeAt)}.` : "No resume date set."}
              {client.pauseNote ? ` ${client.pauseNote}` : ""}
            </span>
          </div>
        )}
        {statusError && (
          <div className="border-t border-[var(--border-3)] bg-rose-50 px-6 py-2 text-sm text-rose-700">{statusError}</div>
        )}

        <div className="p-6">
          <div className="flex flex-wrap items-start gap-5">
            {/* Avatar */}
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-[var(--surface-1)]">
              {client.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={client.logoUrl}
                  alt={`${client.name} logo`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-2xl font-semibold text-[var(--text-2)]">
                  {client.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            {/* Identity */}
            <div className="flex-1">
              <h2
                className="text-3xl leading-none tracking-[-0.03em] text-[var(--text-1)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {client.name}
              </h2>

              {/* External links */}
              {(client.website || client.googleDriveFolderUrl || client.clickupUrl) && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {client.website && (
                    <a
                      href={client.website.startsWith("http") ? client.website : `https://${client.website}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-[var(--brand-700)] hover:underline"
                    >
                      <GlobeAltIcon className="h-4 w-4" />
                      {client.website.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                  {client.googleDriveFolderUrl && (
                    <a
                      href={client.googleDriveFolderUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors"
                    >
                      <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                      Google Drive
                    </a>
                  )}
                  {client.clickupUrl && (
                    <a
                      href={client.clickupUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors"
                    >
                      <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                      ClickUp
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Right-side action stack — bottom-aligned. */}
            <div className="ml-auto flex flex-col items-end justify-end gap-2 self-stretch">
              {client.bank?.onFile && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setBankOpen(true)}
                >
                  <BanknotesIcon className="h-4 w-4 text-[var(--brand-700)]" />
                  Bank details
                </Button>
              )}
              <Link
                href={`/app/portal/${slug}/wiki`}
                title="Open knowledge wiki"
                className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)]"
              >
                <BookOpenIcon className="h-3.5 w-3.5" />
                Wiki →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Lead workspace (LEAD only) — CRM fields + touchpoint activity log. */}
      {client.status === "LEAD" && (
        <LeadWorkspace slug={slug} client={client} touchpoints={touchpoints} />
      )}

      {!isLead && (
        <>
      {/* ── 02-06 // STATS ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard number="02" label="DOCS" value={proposals.length} />
        <StatCard number="03" label="PLATFORMS" value={platforms.length} />
        <StatCard number="04" label="DESIGNS" value={designs.length} />
        <StatCard number="05" label="PULSE SCANS" value={pulseScans.length} />
        <StatCard
          number="06"
          label="DEVS"
          value={(placements ?? []).filter((p) => !p.endDate).length}
          action={
            <Link
              href={`/app/portal/${slug}/tasks`}
              className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-white px-2 py-1 text-[11px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)]"
            >
              Tasks →
            </Link>
          }
        />
      </div>

      {/* ── 07 // SLACK ACTIVITY ── */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">07</span>
            {" // SLACK ACTIVITY"}
          </span>
          <div className="flex items-center gap-2">
            {slackActivity.data?.channelName && client.slackChannelId && (
              <a
                href={`https://slack.com/app_redirect?channel=${client.slackChannelId}`}
                target="_blank"
                rel="noreferrer"
                className="widget-header__status hover:text-[var(--brand-700)] transition-colors"
                title="Open in Slack"
              >
                <ChatBubbleLeftRightIcon className="h-3 w-3" />
                {slackActivity.data.channelName}
              </a>
            )}
            {slackActivity.data?.configured && (
              <button
                type="button"
                onClick={() => void slackActivity.refetch()}
                disabled={slackActivity.isFetching}
                className="rounded-[4px] p-1 text-[var(--text-4)] hover:bg-[var(--surface-1)] hover:text-[var(--brand-700)] transition-colors"
                title="Refresh"
              >
                <ArrowPathIcon className={cn("h-3.5 w-3.5", slackActivity.isFetching && "animate-spin")} />
              </button>
            )}
          </div>
        </div>
        <SlackActivityBody
          data={slackActivity.data}
          isLoading={slackActivity.isPending}
          onConfigureClick={openEdit}
        />
      </section>
        </>
      )}

      {/* ── 08 // CONTACT (renumbered 02 in the lead view) ── */}
      {(hasContactInfo || isLead) && (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">{isLead ? "02" : "08"}</span>
              {" // CONTACT"}
            </span>
            <Button type="button" variant="secondary" size="xs" onClick={openEdit}>
              <PencilIcon className="h-3 w-3" />
              Edit
            </Button>
          </div>
          <div className="p-6">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {(client.primaryContactName || client.primaryContactEmail || client.primaryContactPhone) && (
                <div className="space-y-1.5">
                  <p className="widget-data-label mb-2">Primary contact</p>
                  {client.primaryContactName && (
                    <p className="text-sm font-medium text-[var(--text-1)]">
                      {client.primaryContactName}
                    </p>
                  )}
                  {client.primaryContactEmail && (
                    <a
                      href={`mailto:${client.primaryContactEmail}`}
                      className="block text-sm text-[var(--brand-700)] hover:underline"
                    >
                      {client.primaryContactEmail}
                    </a>
                  )}
                  {client.primaryContactPhone && (
                    <a
                      href={`tel:${client.primaryContactPhone}`}
                      className="block text-sm text-[var(--text-2)]"
                    >
                      {client.primaryContactPhone}
                    </a>
                  )}
                </div>
              )}

              {client.website && (
                <div className="space-y-1.5">
                  <p className="widget-data-label mb-2">Website</p>
                  <a
                    href={client.website.startsWith("http") ? client.website : `https://${client.website}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-[var(--brand-700)] hover:underline"
                  >
                    {client.website.replace(/^https?:\/\//, "")}
                  </a>
                </div>
              )}

              {addressParts.length > 0 && (
                <div className="space-y-1.5">
                  <p className="widget-data-label mb-2">Address</p>
                  {[client.addressLine1, client.addressLine2].filter(Boolean).map((line, i) => (
                    <p key={i} className="text-sm text-[var(--text-2)]">{line}</p>
                  ))}
                  {(client.city || client.postcode) && (
                    <p className="text-sm text-[var(--text-2)]">
                      {[client.city, client.postcode].filter(Boolean).join(", ")}
                    </p>
                  )}
                  {client.country && (
                    <p className="text-sm text-[var(--text-2)]">{client.country}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {!isLead && (
        <>
      {/* ── 09 // BILLING ── */}
      {(client.legalCompanyName ||
        client.vatNumber ||
        client.companyNumber ||
        client.invoiceEmail ||
        client.billingAddressLine1) && (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">09</span>
              {" // BILLING"}
            </span>
            <Button type="button" variant="secondary" size="xs" onClick={openEdit}>
              <PencilIcon className="h-3 w-3" />
              Edit
            </Button>
          </div>
          <div className="p-6">
            <div className="grid gap-6 sm:grid-cols-3">
              {client.legalCompanyName && (
                <div className="space-y-1.5">
                  <p className="widget-data-label mb-2">Registered name</p>
                  <p className="text-sm text-[var(--text-1)]">{client.legalCompanyName}</p>
                </div>
              )}
              {client.companyNumber && (
                <div className="space-y-1.5">
                  <p className="widget-data-label mb-2">Company number</p>
                  <p className="font-mono text-sm text-[var(--text-1)]">{client.companyNumber}</p>
                </div>
              )}
              {client.vatNumber && (
                <div className="space-y-1.5">
                  <p className="widget-data-label mb-2">VAT number</p>
                  <p className="font-mono text-sm text-[var(--text-1)]">{client.vatNumber}</p>
                </div>
              )}
              {client.invoiceEmail && (
                <div className="space-y-1.5">
                  <p className="widget-data-label mb-2">Invoice email</p>
                  <p className="text-sm text-[var(--text-1)] [overflow-wrap:anywhere]">
                    {client.invoiceEmail}
                  </p>
                </div>
              )}
            </div>
            {client.billingAddressLine1 && (
              <div className="mt-6 border-t border-[var(--border-3)] pt-5">
                <p className="widget-data-label mb-2">Billing address</p>
                <p className="text-sm leading-relaxed text-[var(--text-1)]">
                  {[
                    client.billingAddressLine1,
                    client.billingAddressLine2,
                    client.billingCity,
                    client.billingCounty,
                    client.billingPostcode,
                    client.billingCountry,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Bank details now live behind the header button → BankDetailsModal (bottom of file) */}
      {client.bank?.onFile && (
        <BankDetailsModal
          open={bankOpen}
          onClose={() => setBankOpen(false)}
          slug={slug}
          bank={client.bank}
        />
      )}

      {/* ── 10 // PLATFORMS ── */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">10</span>
            {" // PLATFORMS"}
          </span>
          {!isSuggested && (
            <button
              type="button"
              onClick={() => { setPlatformError(null); setPlatformModal({ open: true, platform: null }); }}
              className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--text-3)] hover:bg-[var(--surface-1)] hover:text-[var(--brand-700)] transition-colors"
              title="Add platform"
            >
              <PlusIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="p-5">
          {platforms.length === 0 ? (
            <div className="rounded-[6px] border border-dashed border-[rgba(0,0,0,0.12)] py-10 text-center">
              <p className="text-sm text-[var(--text-4)]">
                {isSuggested ? "Save this client to start adding platforms." : (
                  <button
                    type="button"
                    onClick={() => { setPlatformError(null); setPlatformModal({ open: true, platform: null }); }}
                    className="text-[var(--brand-700)] hover:underline"
                  >
                    + Add your first platform
                  </button>
                )}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {platforms.map((platform) => (
                <PlatformCard
                  key={platform.id}
                  platform={platform}
                  slug={slug}
                  deletingId={deletingPlatformId}
                  setDeletingId={setDeletingPlatformId}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── 11 // DESIGNS + 12 // MEETING NOTES (side by side) ── */}
      <div className="grid grid-cols-2 gap-4">
      {/* 11 // DESIGNS */}
      <section className="widget-card flex flex-col">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">11</span>
            {" // DESIGNS"}
          </span>
          <div className="flex items-center gap-1">
            {!isSuggested && (
              <button
                type="button"
                onClick={() => { setDesignError(null); setDesignModal({ open: true, design: null }); }}
                className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--text-3)] hover:bg-[var(--surface-1)] hover:text-[var(--brand-700)] transition-colors"
                title="Add design"
              >
                <PlusIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col p-5">
          {designs.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-[6px] border border-dashed border-[rgba(0,0,0,0.12)] py-10 text-center">
              <p className="text-sm text-[var(--text-4)]">
                {isSuggested ? "Save this client to start adding design files." : (
                  <button
                    type="button"
                    onClick={() => { setDesignError(null); setDesignModal({ open: true, design: null }); }}
                    className="text-[var(--brand-700)] hover:underline"
                  >
                    + Add your first design
                  </button>
                )}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {designs.map((design) => (
                <DesignCard
                  key={design.id}
                  design={design}
                  slug={slug}
                  deletingId={deletingDesignId}
                  setDeletingId={setDeletingDesignId}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 12 // MEETING NOTES (Scribe) — quiet, client-scoped Google Meet notes */}
      <section className="widget-card">
        <MeetingNotesSection slug={slug} />
      </section>
      </div>
        </>
      )}

      {/* ── 13 // NOTES (renumbered 03 in the lead view; always shown for leads) ── */}
      {(client.notes || isLead) && (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">{isLead ? "03" : "13"}</span>
              {" // NOTES"}
            </span>
            {isLead && (
              <Button type="button" variant="secondary" size="xs" onClick={openEdit}>
                <PencilIcon className="h-3 w-3" />
                Edit
              </Button>
            )}
          </div>
          <div className="p-6">
            {client.notes ? (
              <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--text-2)]">
                {client.notes}
              </p>
            ) : (
              <p className="text-sm text-[var(--text-4)]">No notes yet — add some via Edit.</p>
            )}
          </div>
        </section>
      )}

      {!isLead && (
        <>
      {/* ── ACTIVITY — 2×2 grid ── */}
      {/* Row 1: Documents + Pulse */}
      <div className="grid grid-cols-2 gap-4">

        {/* 14 // DOCUMENTS */}
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">14</span>
              {" // DOCUMENTS"}
            </span>
            <span className="widget-header__status">
              {proposals.length} linked
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="app-table min-w-full">
              <thead>
                <tr>
                  <th className="text-left">Document</th>
                  <th className="text-left">Status</th>
                  <th className="text-left">Updated</th>
                  <th className="text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {proposals.length ? (
                  proposals.map((proposal) => (
                    <tr key={proposal.id}>
                      <td>
                        <p className="font-medium text-[var(--text-1)]">{proposal.title}</p>
                      </td>
                      <td>
                        <StatusBadge status={proposal.status} />
                      </td>
                      <td>
                        <span className="widget-timestamp">{formatDate(proposal.updatedAt)}</span>
                      </td>
                      <td>
                        <Link
                          href={`/app/docs/${proposal.id}`}
                          className={buttonStyles({ variant: "secondary", size: "xs" })}
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="text-sm text-[var(--text-4)]" colSpan={4}>
                      No documents linked yet. Add this client&rsquo;s name to any document draft to link it here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>


        {/* 15 // PULSE SCANS */}
        <section className="widget-card">
            <div className="widget-header">
              <span className="widget-header__label">
                <span className="widget-header__label--number">15</span>
                {" // PULSE SCANS"}
              </span>
              {pulseScans.length > 0 && (
                <span className="widget-header__status">
                  <SignalIcon className="h-3 w-3" />
                  {pulseScans.length} scan{pulseScans.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {pulseScans.length === 0 ? (
              <div className="p-5">
                {client.status === "PENDING_REVIEW" ? (
                  <div className="rounded-[6px] border border-dashed border-[rgba(0,0,0,0.12)] py-10 text-center">
                    <p className="px-6 text-sm text-[var(--text-4)]">
                      Pulse scans run once this client is moved to workflow — keeps us
                      from scanning a product URL before it&apos;s officially in our pipeline.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-[6px] border border-dashed border-[rgba(0,0,0,0.12)] py-10 text-center">
                    <p className="text-sm text-[var(--text-4)]">
                      <Link href="/app/pulse" className="text-[var(--brand-700)] hover:underline">
                        + Run a Pulse scan for this client
                      </Link>
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="app-table min-w-full">
                  <thead>
                    <tr>
                      <th className="text-left">Project</th>
                      <th className="text-left">Score</th>
                      <th className="text-left">Date</th>
                      <th className="text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pulseScans.map((scan) => (
                      <tr key={scan.id}>
                        <td className="font-medium text-[var(--text-1)]">{scan.projectName}</td>
                        <td>
                          {scan.healthScore !== null ? (
                            <span
                              className="text-xl leading-none text-[var(--text-1)]"
                              style={{ fontFamily: "var(--font-display)" }}
                            >
                              {scan.healthScore}
                            </span>
                          ) : (
                            <span className="text-[var(--text-4)]">—</span>
                          )}
                        </td>
                        <td>
                          <span className="widget-timestamp">{formatDate(scan.createdAt)}</span>
                        </td>
                        <td>
                          <Link
                            href={`/app/pulse/${scan.id}`}
                            className={buttonStyles({ variant: "secondary", size: "xs" })}
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

      </div>

      {/* Row 2: Developers + Studies */}
      <div className="grid grid-cols-2 gap-4">
        {/* 16 // DEVELOPERS */}
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">16</span>
              {" // DEVELOPERS"}
            </span>
            {placements && placements.length > 0 ? (
              <span className="widget-header__status">
                {placements.filter((p) => !p.endDate).length} active
                {placements.filter((p) => p.endDate).length > 0 &&
                  ` · ${placements.filter((p) => p.endDate).length} past`}
              </span>
            ) : (
              <Link
                href="/app/codeclear/candidates"
                className="widget-header__status hover:text-[var(--brand-700)] transition-colors"
              >
                Assign in Code →
              </Link>
            )}
          </div>
          <ClientDevelopersSection
            clientId={client.id}
            clientName={client.name}
            placements={placements ?? []}
          />
        </section>


        {/* 17 // STUDIES */}
        {!isSuggested && (
          <section className="widget-card">
            <div className="widget-header">
              <span className="widget-header__label">
                <span className="widget-header__label--number">17</span>
                {" // STUDIES"}
              </span>
              <div className="flex items-center gap-2">
                {studies.length > 0 && (
                  <span className="widget-header__status">
                    <BeakerIcon className="h-3 w-3" />
                    {studies.length} stud{studies.length !== 1 ? "ies" : "y"}
                  </span>
                )}
                <Link
                  href={`/app/study/new?clientId=${client.id}`}
                  className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--text-3)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--brand-700)]"
                  title="New study for this client"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
            {studies.length === 0 ? (
              <div className="p-4">
                <div className="flex items-center justify-center rounded-[6px] border border-dashed border-[rgba(0,0,0,0.12)] py-10 text-center w-full">
                  <p className="text-sm text-[var(--text-4)]">
                    <Link
                      href={`/app/study/new?clientId=${client.id}`}
                      className="text-[var(--brand-700)] hover:underline"
                    >
                      + Start a research study for this client
                    </Link>
                  </p>
                </div>
              </div>
            ) : (
            <div className="overflow-x-auto">
              <table className="app-table min-w-full">
                <thead>
                  <tr>
                    <th className="text-left">Title</th>
                    <th className="text-left">Mode</th>
                    <th className="text-left">Personas</th>
                    <th className="text-left">Sessions</th>
                    <th className="text-left">Status</th>
                    <th className="text-left">Created</th>
                    <th className="text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {studies.map((study) => (
                    <tr key={study.id}>
                      <td>
                        <p className="font-medium text-[var(--text-1)]">{study.title}</p>
                      </td>
                      <td>
                        <span
                          className="inline-flex items-center rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]"
                        >
                          {study.sessionMode === "GROUP" ? "GROUP" : "1-ON-1"}
                        </span>
                      </td>
                      <td className="text-[var(--text-3)]">
                        {study.selectedPersonaIds.length}
                      </td>
                      <td className="text-[var(--text-3)]">
                        {study.completedSessionCount}/{study.sessionCount}
                      </td>
                      <td>
                        <span
                          className={
                            "inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] " +
                            (study.status === "COMPLETED"
                              ? "bg-emerald-50 text-emerald-700"
                              : study.status === "RUNNING" || study.status === "PLAN_GENERATING"
                              ? "bg-amber-50 text-amber-700"
                              : study.status === "FAILED"
                              ? "bg-red-50 text-red-700"
                              : "bg-[var(--surface-1)] text-[var(--text-3)]")
                          }
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          {(study.status === "RUNNING" || study.status === "PLAN_GENERATING") && (
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          )}
                          {study.status.toLowerCase().replace("_", " ")}
                        </span>
                      </td>
                      <td>
                        <span className="widget-timestamp">{formatDate(study.createdAt)}</span>
                      </td>
                      <td>
                        <Link
                          href={`/app/study/${study.id}`}
                          className={buttonStyles({ variant: "secondary", size: "xs" })}
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </section>
        )}

      </div>

      {/* Full-width optionals */}
        {/* 18 // PROOF DOCUMENTS */}
        {proofDocuments.length > 0 && (
          <section className="widget-card">
            <div className="widget-header">
              <span className="widget-header__label">
                <span className="widget-header__label--number">18</span>
                {" // PROOF DOCUMENTS"}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="app-table min-w-full">
                <thead>
                  <tr>
                    <th className="text-left">Document</th>
                    <th className="text-left">Source</th>
                    <th className="text-left">Updated</th>
                    <th className="text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {proofDocuments.map((document) => (
                    <tr key={document.id}>
                      <td className="font-medium text-[var(--text-1)]">{document.title}</td>
                      <td className="text-[var(--text-3)]">{document.proposalTitle || "—"}</td>
                      <td>
                        <span className="widget-timestamp">{formatDate(document.updatedAt)}</span>
                      </td>
                      <td>
                        <a
                          href={document.shareUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={buttonStyles({ variant: "secondary", size: "xs" })}
                        >
                          Open
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

      {/* ── 19 // LIFECYCLE ── */}
      {lifecycle.length > 0 && (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">19</span>
              {" // LIFECYCLE"}
            </span>
          </div>
          <div className="grid gap-2 p-5 md:grid-cols-2 xl:grid-cols-4">
            {lifecycle.map((event) => (
              <div key={event.id} className="rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      event.status === "done" ? "bg-emerald-500" : event.status === "ready" ? "bg-blue-500" : "bg-amber-400",
                    )}
                  />
                  <p className="truncate text-xs font-semibold text-[var(--text-1)]">{event.label}</p>
                </div>
                <p className="mt-1 truncate text-[11px] text-[var(--text-3)]">{event.detail}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]">
                  {formatDate(event.at)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
        </>
      )}

      {/* ── Edit client modal ── */}
      {pausing && (
        <div className="fixed inset-0 z-30">
          <button
            type="button"
            aria-label="Close"
            className="app-dialog-backdrop absolute inset-0"
            onClick={() => setPausing(false)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="app-dialog-panel w-full max-w-sm overflow-hidden">
              <div className="widget-header">
                <span className="widget-header__label">PAUSE CLIENT</span>
              </div>
              <div className="p-6">
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">Pause {client.name}</h2>
                <p className="mt-1 text-sm text-[var(--text-4)]">Parks the client under Inactive. Set an optional date to pick it back up.</p>
                <div className="mt-4 space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Pick back up (optional)</span>
                    <input type="date" value={resumeAtInput} onChange={(e) => setResumeAtInput(e.target.value)} className="app-input" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Reason (optional)</span>
                    <textarea value={pauseNoteInput} onChange={(e) => setPauseNoteInput(e.target.value)} rows={2} className="app-input min-h-[56px]" placeholder="e.g. Phase 1 MVP done — resuming for Phase 2." />
                  </label>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setPausing(false)}>Cancel</Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={setStatus.isPending}
                    onClick={() => void changeStatus("INACTIVE", { resumeAt: resumeAtInput || null, pauseNote: pauseNoteInput || null })}
                  >
                    {setStatus.isPending ? "Pausing…" : "Pause client"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {editing && editForm && (
        <ClientEditModal
          form={editForm}
          onChange={setEditForm}
          onSave={() => void handleSaveClient()}
          onClose={() => {
            setEditing(false);
            setEditForm(null);
            setEditError(null);
          }}
          isSaving={updateClientMutation.isPending}
          error={editError}
          slug={slug}
          slackProvisionError={client.slackProvisionError ?? null}
        />
      )}

      {/* ── Platform modal (create only — edit handled in card) ── */}
      {platformModal.open && !platformModal.platform && (
        <ClientPlatformFormModal
          slug={slug}
          onSave={(input) => void handleSavePlatform(input)}
          onClose={() => setPlatformModal({ open: false, platform: null })}
          isSaving={createPlatformMutation.isPending}
          error={platformError}
        />
      )}

      {/* ── Design modal (create only — edit handled in card) ── */}
      {designModal.open && !designModal.design && (
        <ClientDesignFormModal
          onSave={(input) => void handleSaveDesign(input)}
          onClose={() => setDesignModal({ open: false, design: null })}
          isSaving={createDesignMutation.isPending}
          error={designError}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MeetingNotesSection — Scribe: client-scoped Google Meet notes, surfaced quietly here.
function meetingStatusChip(status: ScribeMeeting["status"]): { label: string; cls: string } {
  switch (status) {
    case "SUMMARISED":
      return { label: "Ready", cls: "bg-emerald-50 text-emerald-700" };
    case "TRANSCRIBED":
      return { label: "Summarising", cls: "bg-amber-50 text-amber-700" };
    case "AWAITING_TRANSCRIPT":
      return { label: "Awaiting", cls: "bg-[var(--surface-1)] text-[var(--text-3)]" };
    case "ERROR":
      return { label: "Error", cls: "bg-red-50 text-red-700" };
    default:
      return { label: "No notes", cls: "bg-[var(--surface-1)] text-[var(--text-3)]" };
  }
}

function formatTimeRange(startISO?: string | null, endISO?: string | null): string {
  if (!startISO) return "";
  try {
    const opts = { hour: "2-digit", minute: "2-digit", hour12: false } as const;
    const s = new Date(startISO).toLocaleTimeString("en-GB", opts);
    const e = endISO ? new Date(endISO).toLocaleTimeString("en-GB", opts) : "";
    return e ? `${s}–${e}` : s;
  } catch {
    return "";
  }
}

function scribeSourceFileUrl(meeting: Pick<ScribeMeeting, "conferenceRecordName">): string | null {
  const id = meeting.conferenceRecordName?.trim();
  if (!id || id.includes("/")) return null;
  return `https://docs.google.com/document/d/${encodeURIComponent(id)}/edit`;
}

function MeetingNotesSection({ slug }: { slug: string }) {
  const PAGE_SIZE = 5;
  const [page, setPage] = useState(0);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => { setQuery(input.trim()); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [input]);

  const { data, isLoading } = useClientMeetings(slug, true, query);
  const ingest = useIngestClientMeeting(slug);
  const createTask = useCreateTask();
  const deleteTask = useDeleteTask();
  const linkTask = useLinkMeetingActionItemTask(slug);
  const updateDecision = useUpdateMeetingDecision(slug);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addingTaskId, setAddingTaskId] = useState<string | null>(null);
  // Session-local overrides for instant feedback before the meetings query refetches the
  // persistent taskId link: addedTaskIds = added this session, removedItemIds = removed this session.
  const [addedTaskIds, setAddedTaskIds] = useState<Record<string, boolean>>({});
  const [removedItemIds, setRemovedItemIds] = useState<Record<string, boolean>>({});
  const [addingAll, setAddingAll] = useState(false);
  const [viewing, setViewing] = useState<ScribeMeeting | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Manual "grab a note" picker — pulls EVERY recent Meet call (unfiltered by name/domain) so a
  // call that wasn't auto-matched (different naming, internal-only attendees) can be grabbed by hand.
  const allCallsQ = useClientMeetings(slug, pickerOpen, "", true);

  // The action item's title becomes the task title; the fuller text becomes the description
  // (falling back to the text as the title for older notes that have no AI title yet).
  function taskFromItem(it: { title: string | null; text: string }) {
    const title = it.title?.trim() || it.text;
    const description = it.title?.trim() && it.text !== it.title?.trim() ? it.text : undefined;
    return { title, description };
  }

  async function addActionItemAsTask(clientId: string, item: { id: string; title: string | null; text: string }) {
    if (!viewing) return;
    setAddingTaskId(item.id);
    try {
      const task = await createTask.mutateAsync({
        clientId,
        ...taskFromItem(item),
        metadata: {
          source: "scribe_meeting",
          sourceMeetingId: viewing.id,
          sourceMeetingTitle: viewing.title,
          sourceMeetingStartedAt: viewing.startedAt ?? viewing.createdAt,
          sourceActionItemId: item.id,
          sourceActionTitle: item.title ?? taskFromItem(item).title,
          sourceActionText: item.text,
        },
      });
      const result = await linkTask.mutateAsync({ meetingId: viewing.id, actionItemId: item.id, taskId: task.id });
      setViewing(result.meeting);
      setAddedTaskIds((s) => ({ ...s, [item.id]: true }));
      setRemovedItemIds((s) => { const n = { ...s }; delete n[item.id]; return n; });
    } catch { /* swallow */ } finally { setAddingTaskId(null); }
  }

  // Click an already-added item → delete its board task and unlink (reverts to "Add task").
  async function removeActionItemTask(item: { id: string; taskId: string | null }) {
    if (!viewing || !item.taskId) return;
    setAddingTaskId(item.id);
    try {
      try { await deleteTask.mutateAsync(item.taskId); } catch { /* task may already be gone */ }
      const result = await linkTask.mutateAsync({ meetingId: viewing.id, actionItemId: item.id, taskId: null });
      setViewing(result.meeting);
      setRemovedItemIds((s) => ({ ...s, [item.id]: true }));
      setAddedTaskIds((s) => { const n = { ...s }; delete n[item.id]; return n; });
    } catch { /* swallow */ } finally { setAddingTaskId(null); }
  }

  // Bulk: add every not-yet-added action item to the client's board, one at a time.
  async function addAllActionItems(clientId: string, items: { id: string; title: string | null; text: string; taskId: string | null }[]) {
    if (!viewing) return;
    setAddingAll(true);
    try {
      for (const it of items) {
        if (it.taskId || addedTaskIds[it.id]) continue;
        setAddingTaskId(it.id);
        try {
          const task = await createTask.mutateAsync({
            clientId,
            ...taskFromItem(it),
            metadata: {
              source: "scribe_meeting",
              sourceMeetingId: viewing.id,
              sourceMeetingTitle: viewing.title,
              sourceMeetingStartedAt: viewing.startedAt ?? viewing.createdAt,
              sourceActionItemId: it.id,
              sourceActionTitle: it.title ?? taskFromItem(it).title,
              sourceActionText: it.text,
            },
          });
          const result = await linkTask.mutateAsync({ meetingId: viewing.id, actionItemId: it.id, taskId: task.id });
          setViewing(result.meeting);
          setAddedTaskIds((s) => ({ ...s, [it.id]: true }));
        } catch { /* swallow per-item */ }
      }
    } finally { setAddingTaskId(null); setAddingAll(false); }
  }

  async function fetchNotes(args: { calendarEventId: string; meetingCode: string | null; title: string; start?: string; end?: string; attendees?: string[]; }) {
    if (!args.meetingCode) return;
    setBusyId(args.calendarEventId);
    try { await ingest.mutateAsync({ calendarEventId: args.calendarEventId, meetingCode: args.meetingCode, title: args.title, start: args.start, end: args.end, attendees: args.attendees }); }
    catch { /* error via ingest.isError */ } finally { setBusyId(null); }
  }

  async function createManualMeetingTask(meeting: ScribeMeeting, title: string, description: string) {
    if (!meeting.clientId) return;
    await createTask.mutateAsync({
      clientId: meeting.clientId,
      title,
      description: description.trim() || undefined,
      metadata: {
        source: "scribe_meeting",
        sourceMeetingId: meeting.id,
        sourceMeetingTitle: meeting.title,
        sourceMeetingStartedAt: meeting.startedAt ?? meeting.createdAt,
        sourceActionTitle: title,
        sourceActionText: description.trim() || "Created manually from the meeting notes.",
      },
    });
  }

  const meetings = data?.meetings ?? [];
  const candidates = data?.candidates ?? [];
  type Row = | { kind: "candidate"; c: (typeof candidates)[0] } | { kind: "meeting"; m: ScribeMeeting };
  // One list sorted by the call's start date (newest first), NOT a candidates block then a
  // meetings block. A candidate and the meeting it becomes share the same date slot, so hitting
  // "Fetch notes" just swaps the button in place — the row never jumps position.
  const rowDate = (r: Row) => (r.kind === "candidate" ? r.c.start : r.m.startedAt ?? r.m.createdAt) ?? "";
  const rows: Row[] = [
    ...candidates.map((c) => ({ kind: "candidate" as const, c })),
    ...meetings.map((m) => ({ kind: "meeting" as const, m })),
  ].sort((a, b) => rowDate(b).localeCompare(rowDate(a)));
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <>
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">12</span>
          {" // MEETING NOTES"}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            title="Grab notes from a recent call that wasn't auto-matched"
            className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-white px-2 py-0.5 text-[11px] font-medium text-[var(--text-3)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <PlusIcon className="h-3 w-3" />
            Grab note
          </button>
          <span className="widget-header__status">
            <VideoCameraIcon className="h-3 w-3" />
            Scribe
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-4">
        {Boolean(data) && rows.length > 0 && (
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-4)]" />
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search calls…"
              className="w-full rounded-[6px] border border-[var(--border-2)] bg-white py-1.5 pl-8 pr-3 text-sm text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:border-[var(--accent)] focus:outline-none" />
          </div>
        )}
        {isLoading && <p className="widget-data-label animate-pulse py-4 text-center">Loading…</p>}
        {!isLoading && rows.length === 0 && (
          <div className="rounded-[6px] border border-dashed border-[rgba(0,0,0,0.12)] py-8 text-center">
            <p className="text-sm text-[var(--text-4)]">
              {data?.calendarConnected ? (query ? `No calls matching "${query}".` : "No recent calls with this client.") : "Connect Google Calendar to capture Scribe notes from your Meet calls."}
            </p>
          </div>
        )}
        {pageRows.length > 0 && (
          <div className="divide-y divide-[rgba(0,0,0,0.05)] rounded-[6px] border border-[rgba(0,0,0,0.08)] overflow-hidden">
            {pageRows.map((row) => {
              if (row.kind === "candidate") {
                const c = row.c;
                const busy = busyId === c.calendarEventId;
                return (
                  <div key={c.calendarEventId} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-white">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-1)]">{c.title}</p>
                      <p className="widget-timestamp mt-0.5">{formatDate(c.start)}</p>
                    </div>
                    <button type="button" disabled={busy || !c.meetingCode} onClick={() => void fetchNotes(c)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-[6px] bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50">
                      {busy ? (<><span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />Fetching</>) : (<><SparklesIcon className="h-3 w-3" />Fetch notes</>)}
                    </button>
                  </div>
                );
              }
              const m = row.m;
              const chip = meetingStatusChip(m.status);
              const ready = m.status === "SUMMARISED";
              const retryable = m.status === "NO_TRANSCRIPT" || m.status === "ERROR";
              const busy = busyId === m.calendarEventId;
              return (
                <div key={m.calendarEventId ?? m.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-white">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--text-1)]">{m.title}</p>
                    <p className="widget-timestamp mt-0.5">{formatDate(m.startedAt ?? m.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className={cn("inline-flex items-center rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]", chip.cls)} style={{ fontFamily: "var(--font-mono)" }}>{chip.label}</span>
                    {ready ? (
                      <button type="button" onClick={() => setViewing(m)}
                        className="inline-flex items-center gap-1 rounded-[6px] border border-[rgba(0,0,0,0.14)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--text-2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]">
                        View notes<ArrowUpRightIcon className="h-3 w-3" />
                      </button>
                    ) : (retryable && m.calendarEventId && m.meetingCode) ? (
                      <button type="button" disabled={busy}
                        onClick={() => void fetchNotes({ calendarEventId: m.calendarEventId!, meetingCode: m.meetingCode, title: m.title, start: m.startedAt ?? undefined, end: m.endedAt ?? undefined, attendees: m.attendees })}
                        className="inline-flex items-center gap-1 rounded-[6px] border border-[rgba(0,0,0,0.14)] px-2.5 py-1 text-xs font-medium text-[var(--text-3)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50">
                        {busy ? "Retrying…" : "Retry"}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-1">
            <span className="widget-timestamp">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rows.length)} of {rows.length}</span>
            <div className="flex items-center gap-1">
              <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)} title="Previous"
                className="rounded-[4px] p-1 text-[var(--text-3)] hover:bg-[var(--surface-1)] disabled:opacity-30 transition-colors">
                <ChevronUpIcon className="h-4 w-4" />
              </button>
              <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} title="Next"
                className="rounded-[4px] p-1 text-[var(--text-3)] hover:bg-[var(--surface-1)] disabled:opacity-30 transition-colors">
                <ChevronDownIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        {ingest.isError && <p className="text-xs text-rose-600">{(ingest.error as Error)?.message ?? "Couldn't fetch notes."}</p>}
      </div>

      {viewing && (
        <MeetingNotesModal
          slug={slug}
          meeting={viewing}
          onClose={() => setViewing(null)}
          onRefetch={viewing.calendarEventId && viewing.meetingCode
            ? () => void fetchNotes({ calendarEventId: viewing.calendarEventId!, meetingCode: viewing.meetingCode, title: viewing.title, start: viewing.startedAt ?? undefined, end: viewing.endedAt ?? undefined, attendees: viewing.attendees })
            : undefined}
          isRefetching={busyId === viewing.calendarEventId}
          onAddTask={addActionItemAsTask}
          onRemoveTask={removeActionItemTask}
          onAddAll={viewing.clientId
            ? () => void addAllActionItems(viewing.clientId!, viewing.actionItems.map((a) => ({ id: a.id, title: a.title, text: a.text, taskId: a.taskId })))
            : undefined}
          addingTaskId={addingTaskId}
          addedTaskIds={Object.fromEntries(viewing.actionItems.map((a) => [a.id, removedItemIds[a.id] ? false : (Boolean(a.taskId) || Boolean(addedTaskIds[a.id]))]))}
          isAddingAll={addingAll}
          isCreatingManualTask={createTask.isPending}
          onCreateManualTask={(title, description) => createManualMeetingTask(viewing, title, description)}
          isUpdatingDecision={updateDecision.isPending}
          onAddDecision={async (decisionText) => {
            const result = await updateDecision.mutateAsync({ meetingId: viewing.id, decisionText });
            setViewing(result.meeting);
          }}
          onRemoveDecision={async (removeDecisionIndex) => {
            const result = await updateDecision.mutateAsync({ meetingId: viewing.id, removeDecisionIndex });
            setViewing(result.meeting);
          }}
        />
      )}

      {pickerOpen && (
        <GrabNoteModal
          calls={allCallsQ.data?.candidates ?? []}
          loading={allCallsQ.isLoading}
          calendarConnected={allCallsQ.data?.calendarConnected ?? false}
          busyId={busyId}
          onGrab={(c) => void fetchNotes(c)}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}

// GrabNoteModal — manual escape hatch: browse EVERY recent Meet call (not just auto-matched
// ones) and pull any call's Gemini notes into this client. The ingest route attributes to the
// page's client explicitly, so naming mismatches don't matter — the human picks the right call.
function GrabNoteModal({
  calls,
  loading,
  calendarConnected,
  busyId,
  onGrab,
  onClose,
}: {
  calls: ScribeCandidate[];
  loading: boolean;
  calendarConnected: boolean;
  busyId: string | null;
  onGrab: (c: ScribeCandidate) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const filtered = needle ? calls.filter((c) => c.title.toLowerCase().includes(needle)) : calls;

  return (
    <div className="app-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="app-dialog-panel flex max-h-[80vh] w-full max-w-[560px] flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-1)] px-5 py-4">
          <div className="min-w-0">
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-700)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              <VideoCameraIcon className="h-3 w-3" />
              Scribe
            </span>
            <h3 className="mt-1.5 text-lg leading-tight text-[var(--text-1)]" style={{ fontFamily: "var(--font-display)" }}>
              Grab a note
            </h3>
            <p className="mt-1 text-xs text-[var(--text-3)]">
              Pick any recent Meet call to pull its notes into this client — handy when a call wasn&apos;t auto-matched.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-[4px] p-1 text-[var(--text-4)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
            title="Close"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-[var(--border-1)] px-5 py-3">
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-4)]" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by title…"
              autoFocus
              className="w-full rounded-[6px] border border-[var(--border-2)] bg-white py-1.5 pl-8 pr-3 text-sm text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:border-[var(--accent)] focus:outline-none"
            />
          </div>
          {calendarConnected && !loading && calls.length > 0 && (
            <p className="mt-2 text-[11px] text-[var(--text-4)]">
              {calls.length} recent {calls.length === 1 ? "call" : "calls"} — already-captured ones are hidden.
            </p>
          )}
        </div>

        {/* Fixed-height scroll area so the picker stays a contained dialog no matter how many
            calls come back (a busy 90-day calendar can return dozens). */}
        <div className="max-h-[420px] overflow-y-auto px-5 py-3">
          {loading && <p className="widget-data-label animate-pulse py-6 text-center">Loading recent calls…</p>}
          {!loading && !calendarConnected && (
            <p className="py-6 text-center text-sm text-[var(--text-4)]">
              Connect Google Calendar (sign out and back in) to browse your recent Meet calls.
            </p>
          )}
          {!loading && calendarConnected && filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-[var(--text-4)]">
              {q ? `No calls matching "${q}".` : "No recent calls to grab — they may already be captured."}
            </p>
          )}
          {filtered.length > 0 && (
            <ul className="divide-y divide-[rgba(0,0,0,0.06)] overflow-hidden rounded-[8px] border border-[var(--border-1)]">
              {filtered.map((c) => {
                const busy = busyId === c.calendarEventId;
                return (
                  <li key={c.calendarEventId} className="flex items-center justify-between gap-3 bg-white px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-1)]">{c.title}</p>
                      <p className="widget-timestamp mt-0.5">{formatDate(c.start)}</p>
                    </div>
                    <button
                      type="button"
                      disabled={busy || !c.meetingCode}
                      onClick={() => onGrab(c)}
                      title={c.meetingCode ? "Pull this call's notes into this client" : "No Meet link on this event"}
                      className="inline-flex shrink-0 items-center gap-1 rounded-[6px] bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {busy ? (
                        <><span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />Grabbing</>
                      ) : (
                        <><PlusIcon className="h-3 w-3" />{c.meetingCode ? "Grab" : "No link"}</>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}


function MeetingNotesModal({
  slug,
  meeting,
  onClose,
  onRefetch,
  isRefetching,
  onAddTask,
  onRemoveTask,
  onAddAll,
  addingTaskId,
  addedTaskIds,
  isAddingAll,
  isCreatingManualTask,
  onCreateManualTask,
  isUpdatingDecision,
  onAddDecision,
  onRemoveDecision,
}: {
  slug: string;
  meeting: ScribeMeeting;
  onClose: () => void;
  onRefetch?: () => void;
  isRefetching?: boolean;
  onAddTask: (clientId: string, item: ScribeActionItem) => void;
  onRemoveTask?: (item: ScribeActionItem) => void;
  onAddAll?: () => void;
  addingTaskId: string | null;
  addedTaskIds: Record<string, boolean>;
  isAddingAll?: boolean;
  isCreatingManualTask?: boolean;
  onCreateManualTask?: (title: string, description: string) => Promise<void>;
  isUpdatingDecision?: boolean;
  onAddDecision?: (decisionText: string) => Promise<void>;
  onRemoveDecision?: (index: number) => Promise<void>;
}) {
  const [newDecision, setNewDecision] = useState("");
  const [manualTaskTitle, setManualTaskTitle] = useState("");
  const [manualTaskDescription, setManualTaskDescription] = useState("");
  const [manualTaskError, setManualTaskError] = useState<string | null>(null);
  const { data: sourceTasks = [], isPending: sourceTasksLoading } = useTasks({
    clientId: meeting.clientId ?? undefined,
    sourceMeetingId: meeting.id,
  });
  const decisions = Array.isArray(meeting.decisions) ? meeting.decisions : [];
  const hasActionItems = meeting.actionItems.length > 0;
  const hasRightRail = hasActionItems || Boolean(meeting.clientId) || sourceTasks.length > 0;
  const pendingCount = meeting.actionItems.filter((a) => !addedTaskIds[a.id]).length;
  const when = [formatDate(meeting.startedAt ?? meeting.createdAt), formatTimeRange(meeting.startedAt, meeting.endedAt)]
    .filter(Boolean)
    .join(" · ");
  const sourceFileUrl = scribeSourceFileUrl(meeting);

  async function handleAddDecision() {
    const value = newDecision.trim();
    if (!value || !onAddDecision) return;
    await onAddDecision(value);
    setNewDecision("");
  }

  async function handleManualTaskCreate() {
    const title = manualTaskTitle.trim();
    if (!title || !onCreateManualTask) return;
    setManualTaskError(null);
    try {
      await onCreateManualTask(title, manualTaskDescription.trim());
      setManualTaskTitle("");
      setManualTaskDescription("");
    } catch (error) {
      setManualTaskError(error instanceof Error ? error.message : "Couldn't create task.");
    }
  }

  return (
    <div
      className="app-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={cn(
          "app-dialog-panel flex max-h-[85vh] w-full flex-col overflow-hidden",
          hasRightRail ? "max-w-[980px]" : "max-w-[680px]",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — Scribe eyebrow (mono), editorial serif title, mono time, attendee chips */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-1)] px-6 py-4">
          <div className="min-w-0">
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-700)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              <VideoCameraIcon className="h-3 w-3" />
              Scribe
            </span>
            <h3
              className="mt-1.5 truncate text-xl leading-tight text-[var(--text-1)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {meeting.title}
            </h3>
            {when && (
              <p className="mt-1 text-xs text-[var(--text-3)]" style={{ fontFamily: "var(--font-mono)" }}>
                {when}
              </p>
            )}
            {sourceFileUrl && (
              <a
                href={sourceFileUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--brand-700)] transition hover:underline"
              >
                Source file
                <ArrowTopRightOnSquareIcon className="h-3 w-3" />
              </a>
            )}
            {meeting.attendees.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {meeting.attendees.map((a) => (
                  <span
                    key={a}
                    className="rounded-[4px] border border-[var(--border-1)] bg-[var(--surface-1)] px-2 py-0.5 text-[10px] text-[var(--text-3)]"
                  >
                    {a}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onRefetch && (
              <button type="button" onClick={onRefetch} disabled={isRefetching}
                className="inline-flex items-center gap-1 rounded-[6px] border border-[rgba(0,0,0,0.12)] px-2.5 py-1 text-xs font-medium text-[var(--text-3)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                title="Re-fetch notes">
                <ArrowPathIcon className="h-3 w-3" />
                {isRefetching ? "Fetching…" : "Refetch"}
              </button>
            )}
            <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-[4px] p-1 text-[var(--text-4)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
            title="Close"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
          </div>
        </div>

        {/* Body — 2-col: notes + decisions (left), action items/tasks (right, only when useful) */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className={cn("grid gap-x-8 gap-y-6", hasRightRail && "md:grid-cols-[1fr_340px]")}>
            {/* LEFT — notes + decisions */}
            <div className="min-w-0 space-y-6">
              <section>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]" style={{ fontFamily: "var(--font-mono)" }}>Notes</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-1)]">
                  {meeting.summary || "No summary captured."}
                </p>
              </section>

              <section>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]" style={{ fontFamily: "var(--font-mono)" }}>
                  Decisions · {decisions.length}
                </p>
                {decisions.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-[var(--text-2)]">
                    {decisions.map((d, i) => (
                      <li key={`${d}-${i}`} className="group pr-8">
                        <span>{d}</span>
                        {onRemoveDecision && (
                          <button
                            type="button"
                            onClick={() => void onRemoveDecision(i)}
                            disabled={isUpdatingDecision}
                            className="ml-2 inline-flex rounded-[4px] p-0.5 text-[var(--text-4)] opacity-0 transition group-hover:opacity-100 hover:bg-[var(--surface-1)] hover:text-rose-600 disabled:opacity-40"
                            title="Remove decision"
                          >
                            <XMarkIcon className="h-3 w-3" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {onAddDecision && (
                  <div className="mt-3 flex items-start gap-2">
                    <textarea
                      value={newDecision}
                      onChange={(event) => setNewDecision(event.target.value)}
                      placeholder="Add a decision bullet..."
                      className="min-h-[42px] flex-1 resize-none rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--accent)]"
                    />
                    <button
                      type="button"
                      onClick={() => void handleAddDecision()}
                      disabled={isUpdatingDecision || !newDecision.trim()}
                      className="inline-flex shrink-0 items-center gap-1 rounded-[6px] bg-[var(--accent)] px-2.5 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      <PlusIcon className="h-3 w-3" />
                      Add
                    </button>
                  </div>
                )}
              </section>
            </div>

            {/* RIGHT — action items, generated tasks, manual note-task creation */}
            {hasRightRail && (
              <MeetingNotesTaskRail
                slug={slug}
                meeting={meeting}
                actionItems={meeting.actionItems}
                sourceTasks={sourceTasks}
                sourceTasksLoading={sourceTasksLoading}
                pendingCount={pendingCount}
                addedTaskIds={addedTaskIds}
                addingTaskId={addingTaskId}
                isAddingAll={isAddingAll}
                onAddAll={onAddAll}
                onAddTask={onAddTask}
                onRemoveTask={onRemoveTask}
                manualTaskTitle={manualTaskTitle}
                manualTaskDescription={manualTaskDescription}
                manualTaskError={manualTaskError}
                isCreatingManualTask={isCreatingManualTask}
                onManualTaskTitleChange={setManualTaskTitle}
                onManualTaskDescriptionChange={setManualTaskDescription}
                onCreateManualTask={handleManualTaskCreate}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MeetingNotesTaskRail({
  slug,
  meeting,
  actionItems,
  sourceTasks,
  sourceTasksLoading,
  pendingCount,
  addedTaskIds,
  addingTaskId,
  isAddingAll,
  onAddAll,
  onAddTask,
  onRemoveTask,
  manualTaskTitle,
  manualTaskDescription,
  manualTaskError,
  isCreatingManualTask,
  onManualTaskTitleChange,
  onManualTaskDescriptionChange,
  onCreateManualTask,
}: {
  slug: string;
  meeting: ScribeMeeting;
  actionItems: ScribeActionItem[];
  sourceTasks: TaskDTO[];
  sourceTasksLoading: boolean;
  pendingCount: number;
  addedTaskIds: Record<string, boolean>;
  addingTaskId: string | null;
  isAddingAll?: boolean;
  onAddAll?: () => void;
  onAddTask: (clientId: string, item: ScribeActionItem) => void;
  onRemoveTask?: (item: ScribeActionItem) => void;
  manualTaskTitle: string;
  manualTaskDescription: string;
  manualTaskError: string | null;
  isCreatingManualTask?: boolean;
  onManualTaskTitleChange: (value: string) => void;
  onManualTaskDescriptionChange: (value: string) => void;
  onCreateManualTask: () => void;
}) {
  const hasActionItems = actionItems.length > 0;

  return (
    <aside className="min-w-0 space-y-5 md:border-l md:border-[var(--border-1)] md:pl-8">
      {hasActionItems ? (
        <section>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]" style={{ fontFamily: "var(--font-mono)" }}>
              Action items · {actionItems.length}
            </p>
            {meeting.clientId && onAddAll && pendingCount > 0 ? (
              <button
                type="button"
                onClick={onAddAll}
                disabled={isAddingAll}
                className="inline-flex items-center gap-1 rounded-[6px] bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <PlusIcon className="h-3 w-3" />
                {isAddingAll ? "Adding..." : `Add all ${pendingCount}`}
              </button>
            ) : null}
          </div>
          <ul className="mt-3 space-y-1.5">
            {actionItems.map((item) => {
              const added = Boolean(addedTaskIds[item.id]);
              const adding = addingTaskId === item.id;
              return (
                <li key={item.id} className="rounded-[6px] border border-[var(--border-1)] px-2.5 py-2">
                  <p className="text-[13px] font-semibold leading-snug text-[var(--text-1)]">{item.title || item.text}</p>
                  {item.title && item.text && item.text !== item.title ? (
                    <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-3)]">{item.text}</p>
                  ) : null}
                  {meeting.clientId ? (
                    <button
                      type="button"
                      disabled={adding}
                      onClick={() => (added ? onRemoveTask?.(item) : onAddTask(meeting.clientId!, item))}
                      className={cn(
                        "group mt-1.5 inline-flex w-full items-center justify-center gap-1 rounded-[6px] border px-2.5 py-0.5 text-[11px] font-medium transition-colors disabled:cursor-default disabled:opacity-60",
                        added
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                          : "border-[var(--border-2)] text-[var(--text-2)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
                      )}
                      title={added ? "Click to remove from the task board" : "Add to this client's task board"}
                    >
                      {adding ? (
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : added ? (
                        <>
                          <CheckCircleIcon className="h-3 w-3 group-hover:hidden" />
                          <XMarkIcon className="hidden h-3 w-3 group-hover:inline" />
                          <span className="group-hover:hidden">Added</span>
                          <span className="hidden group-hover:inline">Remove</span>
                        </>
                      ) : (
                        <>
                          <PlusIcon className="h-3 w-3" />
                          Add task
                        </>
                      )}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className={cn(hasActionItems && "border-t border-[var(--border-1)] pt-5")}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]" style={{ fontFamily: "var(--font-mono)" }}>
            Tasks from this note · {sourceTasks.length}
          </p>
          <Link
            href={`/app/portal/${slug}/tasks?sourceMeeting=${meeting.id}`}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--brand-700)] transition hover:underline"
          >
            View board
            <ArrowTopRightOnSquareIcon className="h-3 w-3" />
          </Link>
        </div>
        {sourceTasksLoading ? (
          <p className="widget-data-label animate-pulse py-4 text-center">Loading tasks...</p>
        ) : sourceTasks.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {sourceTasks.slice(0, 5).map((task) => (
              <li key={task.id} className="rounded-[6px] border border-[var(--border-1)] bg-white px-2.5 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-[13px] font-semibold leading-snug text-[var(--text-1)]">{task.title}</p>
                  <span className="shrink-0 rounded-[4px] bg-[var(--surface-1)] px-1.5 py-0.5 text-[10px] text-[var(--text-3)]">
                    {TASK_STATUS_LABELS[task.status]}
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
                  {taskRef(task.id)}
                  {task.createdBy ? ` · ${task.createdBy.name}` : ""}
                </p>
              </li>
            ))}
            {sourceTasks.length > 5 ? (
              <li className="text-[11px] text-[var(--text-4)]">{sourceTasks.length - 5} more on the board</li>
            ) : null}
          </ul>
        ) : (
          <p className="mt-3 rounded-[6px] border border-dashed border-[var(--border-2)] px-3 py-3 text-xs leading-5 text-[var(--text-4)]">
            No board tasks are linked to this note yet.
          </p>
        )}
      </section>

      {meeting.clientId ? (
        <section className="border-t border-[var(--border-1)] pt-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]" style={{ fontFamily: "var(--font-mono)" }}>
            Add task
          </p>
          <div className="mt-3 space-y-2">
            <input
              value={manualTaskTitle}
              onChange={(event) => onManualTaskTitleChange(event.target.value)}
              placeholder="Task title"
              className="w-full rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--accent)]"
            />
            <textarea
              value={manualTaskDescription}
              onChange={(event) => onManualTaskDescriptionChange(event.target.value)}
              placeholder="Optional context from the notes"
              className="min-h-[72px] w-full resize-none rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--accent)]"
            />
            {manualTaskError ? <p className="text-xs text-rose-600">{manualTaskError}</p> : null}
            <button
              type="button"
              onClick={onCreateManualTask}
              disabled={isCreatingManualTask || !manualTaskTitle.trim()}
              className="inline-flex w-full items-center justify-center gap-1 rounded-[6px] bg-[var(--accent)] px-2.5 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isCreatingManualTask ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <PlusIcon className="h-3 w-3" />
              )}
              {isCreatingManualTask ? "Creating..." : "Create task"}
            </button>
          </div>
        </section>
      ) : null}
    </aside>
  );
}

// ClientDevelopersSection — compact name roster, Portal read-only view
// ---------------------------------------------------------------------------
function ClientDevelopersSection({
  placements,
}: {
  clientId: string;
  clientName: string;
  placements: import("@/types/client").ClientPlacementRecord[];
}) {
  if (placements.length === 0) {
    return (
      <div className="p-5">
        <p className="text-sm text-[var(--text-4)]">
          No developers assigned yet. Open a developer in{" "}
          <Link href="/app/codeclear/candidates" className="text-[var(--brand-700)] hover:underline">
            Code
          </Link>{" "}
          and assign them here.
        </p>
      </div>
    );
  }

  const active = placements.filter((p) => !p.endDate);

  function Avatar({ name }: { name: string }) {
    const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    const colors = ["#1D4ED8","#0F766E","#7C3AED","#B45309","#DC2626","#16A34A"];
    return (
      <div
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
        style={{ background: colors[Math.abs(h) % colors.length], fontFamily: "var(--font-mono)" }}
      >
        {initials}
      </div>
    );
  }

  return (
    <div className="p-5">
      {active.length === 0 ? (
        <p className="text-sm text-[var(--text-4)]">
          No active developers.{" "}
          <Link href="/app/codeclear/candidates" className="text-[var(--brand-700)] hover:underline">
            Assign in Code →
          </Link>
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {active.map((p) => (
            <Link
              key={p.id}
              href={`/app/codeclear/candidates/${p.candidateId}`}
              className="flex items-center gap-1.5 rounded-[6px] border border-[rgba(0,0,0,0.08)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--text-1)] hover:border-[var(--brand-700)] hover:text-[var(--brand-700)] transition-colors"
            >
              <Avatar name={p.candidateName} />
              {p.candidateName}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  number,
  label,
  value,
  action,
}: {
  number: string;
  label: string;
  value: number;
  /** Optional small control pinned bottom-right (e.g. a jump link). */
  action?: React.ReactNode;
}) {
  return (
    <article className="widget-card relative">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{number}</span>
          {` // ${label}`}
        </span>
      </div>
      <div className="widget-body--compact">
        <p
          className="text-5xl leading-none tracking-tight text-[var(--text-1)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {value}
        </p>
        <p className="widget-data-label mt-2">{label}</p>
      </div>
      {action ? <div className="absolute bottom-3 right-3">{action}</div> : null}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Slack helpers
// ---------------------------------------------------------------------------

/** Clean raw Slack message text into something readable. */
function formatSlackText(text: string): string {
  return (
    text
      // Slack links: <URL|display> → display text
      .replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, "$2")
      // Bare Slack links: <https://...> → just the domain
      .replace(/<(https?:\/\/([^/>]+)[^>]*)>/g, "$2")
      // User mentions: <@UXXX> → @name (we don't have names here, keep @user)
      .replace(/<@([A-Z0-9]+)>/g, "@user")
      // Channel mentions: <!channel> <!here> <!everyone>
      .replace(/<!channel>/g, "@channel")
      .replace(/<!here>/g, "@here")
      .replace(/<!everyone>/g, "@everyone")
      // HTML entities
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      // Slack bold *text* → keep readable as-is (strip asterisks)
      .replace(/\*([^*\n]+)\*/g, "$1")
      // Slack italic _text_
      .replace(/_([^_\n]+)_/g, "$1")
      // Slack strikethrough ~text~
      .replace(/~([^~\n]+)~/g, "$1")
      // Slack code `text`
      .replace(/`([^`]+)`/g, "$1")
      // Collapse excess whitespace
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

// ---------------------------------------------------------------------------
// SlackActivityBody — content panel for the 07 // SLACK ACTIVITY widget
// ---------------------------------------------------------------------------
function SlackActivityBody({
  data,
  isLoading,
  onConfigureClick,
}: {
  data: {
    configured: boolean;
    channelName: string | null;
    summary: string | null;
    generatedAt: string | null;
    reason: string;
    messages: Array<{ id: string; author: string; text: string; ts: string }>;
  } | undefined;
  isLoading: boolean;
  onConfigureClick: () => void;
}) {
  if (isLoading) {
    return (
      <div className="p-5">
        <p className="widget-data-label animate-pulse">Loading activity…</p>
      </div>
    );
  }

  if (!data || !data.configured) {
    const reason = data?.reason;
    return (
      <div className="p-5">
        {reason === "no_token" ? (
          <p className="text-sm text-[var(--text-4)]">
            No Slack bot token configured.{" "}
            <Link href="/app/settings" className="text-[var(--brand-700)] hover:underline">
              Add one in Settings →
            </Link>
          </p>
        ) : (
          <p className="text-sm text-[var(--text-4)]">
            No Slack channel linked.{" "}
            <button
              type="button"
              onClick={onConfigureClick}
              className="text-[var(--brand-700)] hover:underline"
            >
              Set one in Edit →
            </button>
          </p>
        )}
      </div>
    );
  }

  if (data.reason === "not_in_channel") {
    return (
      <div className="p-5">
        <p className="text-sm text-[var(--text-4)]">
          The Foundry bot hasn&apos;t been invited to{" "}
          <span className="font-medium text-[var(--text-2)]">{data.channelName}</span>.
          Invite it in Slack then refresh.
        </p>
      </div>
    );
  }

  if (data.messages.length === 0) {
    return (
      <div className="p-5">
        <p className="text-sm text-[var(--text-4)]">No recent messages in {data.channelName}.</p>
      </div>
    );
  }

  const summaryLines = data.summary
    ? data.summary.split("\n").map((l) => l.trim()).filter(Boolean)
    : [];

  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentMessages = data.messages
    .filter((msg) => new Date(msg.ts).getTime() > oneDayAgo)
    .reverse();
  // Fall back to last 5 if nothing in 24 h
  const displayMessages = recentMessages.length > 0
    ? recentMessages
    : data.messages.slice(-5).reverse();
  const is24hView = recentMessages.length > 0;

  return (
    <div className="grid h-[360px] grid-cols-[2fr_3fr] divide-x divide-[rgba(0,0,0,0.06)] overflow-hidden">

      {/* ── Left: AI summary — min-h-0 lets the grid item shrink + scroll ── */}
      <div className="relative min-h-0">
        <div className="h-full overflow-y-auto p-5 pb-10">
        <p className="widget-data-label mb-3">AI digest</p>
        {summaryLines.length > 0 ? (
          <ul className="space-y-2">
            {summaryLines.map((line, i) => {
              const clean = line.replace(/^\•\s*/, "").replace(/\*\*([^*]+)\*\*/g, "$1");
              const colonIdx = clean.indexOf(":");
              const label = colonIdx > 0 && colonIdx < 30 ? clean.slice(0, colonIdx) : null;
              const body = label ? clean.slice(colonIdx + 1).trim() : clean;
              return (
                <li key={i} className="flex gap-2 text-sm leading-5 text-[var(--text-2)]">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-600)]" />
                  <span>
                    {label && (
                      <span className="font-semibold text-[var(--text-1)]">{label}: </span>
                    )}
                    {body}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          /* Only show "no digest" if the channel has literally never had messages.
             When the channel is just quiet (reason = "empty"), hide the placeholder
             so the cached summary from a previous session would show if present. */
          data.reason !== "empty" && (
            <p className="text-sm text-[var(--text-4)]">
              Digest will appear after the first messages are posted.
            </p>
          )
        )}
        {data.generatedAt && (
          <p className="widget-timestamp mt-4 opacity-50">
            {formatDate(data.generatedAt)}
          </p>
        )}
        </div>
        {/* Fade gradient — no hard crop */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-10"
          style={{ background: "linear-gradient(to bottom, transparent, var(--surface-0))" }}
        />
      </div>

      {/* ── Right: Messages ── */}
      <div className="min-h-0 overflow-y-auto divide-y divide-[rgba(0,0,0,0.05)]">
        {!is24hView && (
          <div className="px-4 py-2 bg-[var(--surface-1)]">
            <p className="widget-data-label">No messages in last 24 h — showing recent</p>
          </div>
        )}
        {displayMessages.map((msg) => {
          const initials = msg.author
            .split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
          let h = 0;
          for (let i = 0; i < msg.author.length; i++) h = msg.author.charCodeAt(i) + ((h << 5) - h);
          const avatarColors = ["#1D4ED8", "#0F766E", "#7C3AED", "#B45309", "#DC2626", "#16A34A"];
          const avatarBg = avatarColors[Math.abs(h) % avatarColors.length];

          return (
            <div key={msg.id} className="flex gap-2.5 px-4 py-3">
              <div
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                style={{ background: avatarBg, fontFamily: "var(--font-mono)" }}
              >
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-semibold text-[var(--text-1)]">{msg.author}</span>
                  <span className="widget-timestamp text-[10px] opacity-50">
                    {formatDate(msg.ts)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs leading-[1.55] text-[var(--text-3)] line-clamp-2">
                  {formatSlackText(msg.text)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

// ---------------------------------------------------------------------------
// PlatformCard — compact icon-anchored card
// ---------------------------------------------------------------------------
function PlatformCard({
  platform,
  slug,
  deletingId,
  setDeletingId,
}: {
  platform: ClientPlatformRecord;
  slug: string;
  deletingId: string | null;
  setDeletingId: (id: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updateMutation = useUpdateClientPlatform(slug, platform.id);
  const deleteMutation = useDeleteClientPlatform(slug);

  async function handleSave(input: {
    name: string;
    platformType?: string;
    url?: string;
    stagingUrl?: string;
    repoUrl?: string;
    username?: string;
    password?: string;
    notes?: string;
    previewImageUrl?: string;
  }) {
    setError(null);
    try {
      await updateMutation.mutateAsync(input);
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDelete() {
    setDeletingId(platform.id);
    try {
      await deleteMutation.mutateAsync(platform.id);
    } finally {
      setDeletingId(null);
    }
  }

  const primaryUrl = platform.url || platform.stagingUrl;
  const { icon, color, bg } = detectPlatformIcon(primaryUrl, platform.platformType);

  return (
    <>
      <article
        className="group relative flex flex-row items-center gap-3 rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-3 cursor-pointer hover:border-[var(--brand-400)] hover:shadow-sm transition-all"
        onClick={() => setEditing(true)}
      >
        {/* Icon badge */}
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px]"
          style={{ background: bg, color }}
        >
          {icon}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-[var(--text-1)]">{platform.name}</p>
          {primaryUrl && (
            <p className="truncate text-[11px] text-[var(--text-4)] leading-tight mt-0.5">
              {primaryUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </p>
          )}
          {(platform.platformType || platform.stagingUrl || platform.repoUrl) && (
            <div className="mt-1 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {platform.platformType && (
                <span
                  className="rounded-[3px] bg-[var(--surface-1)] px-1.5 py-px text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--text-4)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {platform.platformType}
                </span>
              )}
              {platform.stagingUrl && (
                <a
                  href={platform.stagingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-0.5 text-[10px] text-[var(--text-4)] hover:text-[var(--brand-700)] transition"
                  title="Staging"
                >
                  <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                  <span>Stage</span>
                </a>
              )}
              {platform.repoUrl && (
                <a
                  href={platform.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-0.5 text-[10px] text-[var(--text-4)] hover:text-[var(--brand-700)] transition"
                  title="Repository"
                >
                  <CodeBracketIcon className="h-3 w-3" />
                  <span>Repo</span>
                </a>
              )}
            </div>
          )}
        </div>

        {/* Edit / delete — appear on hover */}
        <div
          className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-[6px] p-1.5 text-[var(--text-4)] hover:bg-[var(--surface-1)] hover:text-[var(--text-2)] transition"
            title="Edit"
          >
            <PencilIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deletingId === platform.id}
            className="rounded-[6px] p-1.5 text-[var(--text-4)] hover:bg-red-50 hover:text-red-600 transition"
            title="Delete"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </article>

      {editing && (
        <ClientPlatformFormModal
          platform={platform}
          slug={slug}
          onSave={(input) => void handleSave(input)}
          onClose={() => { setEditing(false); setError(null); }}
          isSaving={updateMutation.isPending}
          error={error}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// DesignCard — compact icon-anchored card
// ---------------------------------------------------------------------------
function DesignCard({
  design,
  slug,
  deletingId,
  setDeletingId,
}: {
  design: ClientDesignRecord;
  slug: string;
  deletingId: string | null;
  setDeletingId: (id: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updateMutation = useUpdateClientDesign(slug, design.id);
  const deleteMutation = useDeleteClientDesign(slug);

  async function handleSave(input: { name: string; url?: string; notes?: string; previewImageUrl?: string }) {
    setError(null);
    try {
      await updateMutation.mutateAsync(input);
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDelete() {
    setDeletingId(design.id);
    try {
      await deleteMutation.mutateAsync(design.id);
    } finally {
      setDeletingId(null);
    }
  }

  const { icon, color, bg } = detectPlatformIcon(design.url, null);

  return (
    <>
      <article
        className="group relative flex flex-row items-center gap-3 rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-3 cursor-pointer hover:border-[var(--brand-400)] hover:shadow-sm transition-all"
        onClick={() => setEditing(true)}
      >
        {/* Icon badge */}
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px]"
          style={{ background: bg, color }}
        >
          {icon}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-[var(--text-1)]">{design.name}</p>
          {design.url && (
            <p className="truncate text-[11px] text-[var(--text-4)] leading-tight mt-0.5">
              {design.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </p>
          )}
          {design.notes && (
            <p className="mt-0.5 truncate text-[11px] text-[var(--text-3)]">{design.notes}</p>
          )}
        </div>

        {/* Open link */}
        {design.url && (
          <div onClick={(e) => e.stopPropagation()}>
            <a
              href={design.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--text-4)] hover:bg-[var(--surface-1)] hover:text-[var(--text-2)] transition"
              title="Open design file"
            >
              <ArrowTopRightOnSquareIcon className="h-3 w-3" />
            </a>
          </div>
        )}

        {/* Edit / delete — appear on hover */}
        <div
          className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-[6px] p-1.5 text-[var(--text-4)] hover:bg-[var(--surface-1)] hover:text-[var(--text-2)] transition"
            title="Edit"
          >
            <PencilIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deletingId === design.id}
            className="rounded-[6px] p-1.5 text-[var(--text-4)] hover:bg-red-50 hover:text-red-600 transition"
            title="Delete"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </article>

      {editing && (
        <ClientDesignFormModal
          design={design}
          onSave={(input) => void handleSave(input)}
          onClose={() => { setEditing(false); setError(null); }}
          isSaving={updateMutation.isPending}
          error={error}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// ClientEditModal — edit client fields
// ---------------------------------------------------------------------------
/**
 * "Provision Slack channels" retry banner — only renders when the previous
 * channel provisioning attempt left an error on the client record, or when no
 * Slack channels are linked yet. Hits POST /api/clients/[slug]/provision-slack-channels.
 */
function SlackProvisionRetry({
  slug,
  initialError,
}: {
  slug: string;
  initialError: string | null;
}) {
  const [running, setRunning] = useState(false);
  const [internal, setInternal] = useState(true);
  const [external, setExternal] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [success, setSuccess] = useState<string | null>(null);

  if (!initialError && !error) {
    // Collapsed by default — operator can still open via the Edit modal save flow.
    return null;
  }

  async function run() {
    if (external && !email.trim()) {
      setError("Slack Connect requires an invitee email.");
      return;
    }
    setError(null);
    setSuccess(null);
    setRunning(true);
    try {
      const { provisionClientSlackChannels } = await import("@/lib/api");
      const result = await provisionClientSlackChannels(slug, {
        createInternal: internal || undefined,
        createExternal: external || undefined,
        externalInviteeEmail: external ? email.trim() || undefined : undefined,
      });
      const parts: string[] = [];
      if (result.internal) parts.push(`Internal: #${result.internal.name}`);
      if (result.external) parts.push(`External: #${result.external.name}`);
      setSuccess(parts.join(" · ") || "Done.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-[8px] border border-amber-300 bg-amber-50 px-3 py-2.5">
      <p className="text-xs font-medium text-amber-900">
        Slack channel provisioning needed
      </p>
      {error && (
        <p className="mt-1 text-[11px] text-amber-900/80">
          Previous attempt failed: <code>{error}</code>
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-amber-900">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
          Internal
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={external} onChange={(e) => setExternal(e.target.checked)} />
          Slack Connect
        </label>
        {external && (
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="client@theirdomain.com"
            className="app-input flex-1 min-w-[200px] text-[11px]"
          />
        )}
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="app-button app-button-secondary px-3 py-1 text-[11px] disabled:opacity-40"
        >
          {running ? "Provisioning…" : "Retry"}
        </button>
      </div>
      {success && <p className="mt-1.5 text-[11px] text-emerald-700">{success}</p>}
    </div>
  );
}

function ClientEditModal({
  form,
  onChange,
  onSave,
  onClose,
  isSaving,
  error,
  slug,
  slackProvisionError,
}: {
  form: EditFormState;
  onChange: (form: EditFormState) => void;
  onSave: () => void;
  onClose: () => void;
  isSaving: boolean;
  error: string | null;
  slug: string;
  slackProvisionError: string | null;
}) {
  const [channels, setChannels] = useState<SlackAvailableChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);

  useEffect(() => {
    setLoadingChannels(true);
    fetchSlackChannels()
      .then(setChannels)
      .catch(() => setChannels([]))
      .finally(() => setLoadingChannels(false));
  }, []);

  function set(field: keyof EditFormState, value: string) {
    onChange({ ...form, [field]: value });
  }

  // Retainer is off for most clients — gate the day fields behind a toggle, on only when set.
  const [retainerOn, setRetainerOn] = useState(
    () => Boolean(form.retainerDays && form.retainerDays.trim() !== ""),
  );
  function toggleRetainer(on: boolean) {
    setRetainerOn(on);
    // Turning it off clears both day fields in one update (so they persist as null).
    if (!on) onChange({ ...form, retainerDays: "", retainerDaysUsed: "" });
  }

  return (
    <div className="fixed inset-0 z-30">
      <button
        type="button"
        aria-label="Close"
        className="app-dialog-backdrop absolute inset-0"
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="app-dialog-panel flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden">
          {/* Modal widget header */}
          <div className="widget-header shrink-0">
            <span className="widget-header__label">EDIT CLIENT</span>
          </div>

          <div className="flex-1 min-h-0 space-y-5 overflow-y-auto p-6">
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
              Edit client
            </h2>
              <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                {/* LEFT — identity, brand & integrations (avatar leads) */}
                <div className="space-y-4">
                  <div>
                    <span className="app-field-label mb-2 block">Logo</span>
                    <LogoImagePicker
                      value={form.logoUrl}
                      onChange={(value) => set("logoUrl", value)}
                    />
                  </div>
                  <label className="block">
                    <span className="app-field-label">Client name</span>
                    <input
                      value={form.name}
                      onChange={(e) => set("name", e.target.value)}
                      className="app-input"
                    />
                  </label>
                  <label className="block">
                    <span className="app-field-label">Website</span>
                    <WebsiteInput value={form.website} onChange={(v) => set("website", v)} />
                  </label>
                  <label className="block">
                    <span className="app-field-label">Google Drive folder URL</span>
                    <input
                      value={form.googleDriveFolderUrl}
                      onChange={(e) => set("googleDriveFolderUrl", e.target.value)}
                      className="app-input"
                      placeholder="https://drive.google.com/drive/folders/…"
                      type="url"
                    />
                  </label>
                  <label className="block">
                    <span className="app-field-label">ClickUp folder URL</span>
                    <input
                      value={form.clickupUrl}
                      onChange={(e) => set("clickupUrl", e.target.value)}
                      className="app-input"
                      placeholder="https://app.clickup.com/…"
                      type="url"
                    />
                  </label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="app-field-label flex items-center gap-1.5">
                        <SlackGlyph className="h-3.5 w-3.5 shrink-0" />
                        Internal
                        {loadingChannels && (
                          <span className="text-[var(--text-4)]">Loading…</span>
                        )}
                      </span>
                      <select
                        value={form.slackInternalChannelId || form.slackChannelId}
                        onChange={(e) => set("slackInternalChannelId", e.target.value)}
                        className="app-select w-full"
                      >
                        <option value="">— None —</option>
                        {channels.map((ch) => (
                          <option key={ch.id} value={ch.id}>
                            {ch.isPrivate ? "🔒 " : "#"}{ch.name}
                            {ch.isMember ? "" : " (invite bot)"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="app-field-label flex items-center gap-1.5">
                        <SlackGlyph className="h-3.5 w-3.5 shrink-0" />
                        External
                      </span>
                      <select
                        value={form.slackExternalChannelId}
                        onChange={(e) => set("slackExternalChannelId", e.target.value)}
                        className="app-select w-full"
                      >
                        <option value="">— None —</option>
                        {channels.map((ch) => (
                          <option key={ch.id} value={ch.id}>
                            {ch.isPrivate ? "🔒 " : "#"}{ch.name}
                            {ch.isMember ? "" : " (invite bot)"}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {channels.length === 0 && !loadingChannels && (
                    <p className="text-xs text-[var(--text-4)]">
                      Add a Slack bot token in Settings → Integrations to enable Slack pickers.
                    </p>
                  )}
                  <SlackProvisionRetry slug={slug} initialError={slackProvisionError} />

                  {/* Retainer — off for most clients; toggle reveals the day fields. */}
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="app-field-label !mb-0">Retainer</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={retainerOn}
                        aria-label="Toggle retainer"
                        onClick={() => toggleRetainer(!retainerOn)}
                        className={cn(
                          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                          retainerOn ? "bg-[var(--brand-700)]" : "bg-[var(--border-3)]",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                            retainerOn ? "translate-x-[18px]" : "translate-x-0.5",
                          )}
                        />
                      </button>
                    </div>
                    {retainerOn && (
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <label className="block">
                          <span className="app-field-label">Days / month</span>
                          <input
                            value={form.retainerDays}
                            onChange={(e) => set("retainerDays", e.target.value)}
                            className="app-input"
                            type="number"
                            min={0}
                            max={31}
                            placeholder="e.g. 28"
                          />
                        </label>
                        <label className="block">
                          <span className="app-field-label">Used this month</span>
                          <input
                            value={form.retainerDaysUsed}
                            onChange={(e) => set("retainerDaysUsed", e.target.value)}
                            className="app-input"
                            type="number"
                            min={0}
                            max={31}
                            placeholder="e.g. 12"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                {/* RIGHT — primary contact & address */}
                <div className="space-y-5">
                  <div>
                    <p className="mb-3 text-sm font-medium text-[var(--text-2)]">Primary contact</p>
                    <div className="space-y-4">
                      <label className="block">
                        <span className="app-field-label">Name</span>
                        <input
                          value={form.primaryContactName}
                          onChange={(e) => set("primaryContactName", e.target.value)}
                          className="app-input"
                          placeholder="Jane Smith"
                        />
                      </label>
                      <label className="block">
                        <span className="app-field-label">Email</span>
                        <input
                          value={form.primaryContactEmail}
                          onChange={(e) => set("primaryContactEmail", e.target.value)}
                          className="app-input"
                          placeholder="jane@client.com"
                          type="email"
                        />
                      </label>
                      <label className="block">
                        <span className="app-field-label">Phone</span>
                        <PhoneInput
                          value={form.primaryContactPhone}
                          onChange={(v) => set("primaryContactPhone", v)}
                        />
                      </label>
                    </div>
                  </div>
                  <div>
                    <p className="mb-3 text-sm font-medium text-[var(--text-2)]">Address</p>
                    <div className="space-y-4">
                      <label className="block">
                        <span className="app-field-label">Address line 1</span>
                        <input
                          value={form.addressLine1}
                          onChange={(e) => set("addressLine1", e.target.value)}
                          className="app-input"
                          placeholder="123 High Street"
                        />
                      </label>
                      <label className="block">
                        <span className="app-field-label">Address line 2</span>
                        <input
                          value={form.addressLine2}
                          onChange={(e) => set("addressLine2", e.target.value)}
                          className="app-input"
                          placeholder="Floor 2"
                        />
                      </label>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block">
                          <span className="app-field-label">City</span>
                          <input
                            value={form.city}
                            onChange={(e) => set("city", e.target.value)}
                            className="app-input"
                            placeholder="London"
                          />
                        </label>
                        <label className="block">
                          <span className="app-field-label">Postcode</span>
                          <input
                            value={form.postcode}
                            onChange={(e) => set("postcode", e.target.value)}
                            className="app-input"
                            placeholder="SW1A 1AA"
                          />
                        </label>
                      </div>
                      <label className="block">
                        <span className="app-field-label">Country</span>
                        <CountrySelect value={form.country} onChange={(v) => set("country", v)} />
                      </label>
                    </div>
                  </div>
                </div>

                {/* Notes — full width */}
                <div className="border-t border-[rgba(0,0,0,0.08)] pt-4 sm:col-span-2">
                  <label className="block">
                    <span className="app-field-label">Notes</span>
                    <textarea
                      value={form.notes}
                      onChange={(e) => set("notes", e.target.value)}
                      className="app-textarea min-h-[80px]"
                      placeholder="General notes about this client…"
                    />
                  </label>
                </div>

                {error && <p className="text-sm text-rose-700 sm:col-span-2">{error}</p>}
              </div>
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-[rgba(0,0,0,0.08)] px-6 py-4">
            <Button type="button" variant="secondary" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              loading={isSaving}
              onClick={onSave}
            >
              Save changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Pending review banner ──────────────────────────────────────────────────

type ActivationChecklistItem = {
  id: string;
  label: string;
  detail: string;
  complete: boolean;
  required: boolean;
};

type ActivationChecklist = {
  items: ActivationChecklistItem[];
  readyCount: number;
  requiredMissing: number;
  totalCount: number;
};

const LEGAL_DOCUMENT_TYPES = new Set(["SOW", "MSA", "NDA", "DSA"]);

function documentSummary(document: ClientDetailRecord["proposals"][number] | undefined): string {
  if (!document) return "";
  const type = document.documentType === "PROPOSAL" ? "Proposal" : document.documentType;
  return `${type}: ${document.title}`;
}

function buildActivationChecklist({
  client,
  proposals,
  platforms,
  designs,
}: Pick<ClientDetailRecord, "client" | "proposals" | "platforms" | "designs">): ActivationChecklist {
  const acceptedProposal = proposals.find(
    (document) => document.documentType === "PROPOSAL" && document.status === "ACCEPTED",
  );
  const acceptedLegalDocument = proposals.find(
    (document) => LEGAL_DOCUMENT_TYPES.has(document.documentType) && document.status === "ACCEPTED",
  );
  const sentCommercialDocument = proposals.find((document) =>
    ["SENT", "ACCEPTED"].includes(document.status),
  );
  const contactReady = Boolean(client.primaryContactName && client.primaryContactEmail);
  const deliveryReady = Boolean(
    client.googleDriveFolderUrl ||
      client.clickupUrl ||
      client.slackInternalChannelId ||
      client.slackChannelId ||
      platforms.length > 0 ||
      designs.length > 0,
  );

  const items: ActivationChecklistItem[] = [
    {
      id: "onboarding",
      label: "Onboarding submitted",
      complete: Boolean(client.onboardingId),
      required: true,
      detail: client.onboardingId ? "Linked onboarding record found." : "No onboarding record linked yet.",
    },
    {
      id: "commercial",
      label: "Commercial sign-off",
      complete: Boolean(acceptedProposal || acceptedLegalDocument),
      required: true,
      detail:
        documentSummary(acceptedLegalDocument ?? acceptedProposal) ||
        (sentCommercialDocument
          ? `${documentSummary(sentCommercialDocument)} is still awaiting acceptance.`
          : "No accepted proposal or legal document yet."),
    },
    {
      id: "contract",
      label: "Contract pack",
      complete: Boolean(acceptedLegalDocument),
      required: false,
      detail: acceptedLegalDocument
        ? documentSummary(acceptedLegalDocument)
        : acceptedProposal
          ? "Accepted proposal present; legal pack can be added separately."
          : "Add an SOW, MSA, NDA, or DSA where the engagement needs it.",
    },
    {
      id: "contact",
      label: "Primary contact",
      complete: contactReady,
      required: true,
      detail: contactReady
        ? `${client.primaryContactName} / ${client.primaryContactEmail}`
        : "Primary name and email are not both filled.",
    },
    {
      id: "delivery",
      label: "Delivery setup",
      complete: deliveryReady,
      required: false,
      detail: deliveryReady
        ? "At least one workspace, channel, platform, or design link exists."
        : "No delivery workspace, channel, platform, or design link yet.",
    },
    {
      id: "bank",
      label: "Bank details",
      complete: Boolean(client.bank?.onFile),
      required: false,
      detail: client.bank?.onFile
        ? `Bank details on file${client.bank.accountNumberLast4 ? ` ending ${client.bank.accountNumberLast4}` : ""}.`
        : "Not on file.",
    },
  ];

  return {
    items,
    readyCount: items.filter((item) => item.complete).length,
    requiredMissing: items.filter((item) => item.required && !item.complete).length,
    totalCount: items.length,
  };
}

function PendingReviewBanner({
  slug,
  companyName,
  checklist,
}: {
  slug: string;
  companyName: string;
  checklist: ActivationChecklist;
}) {
  const setStatus = useSetClientStatus(slug);
  const [error, setError] = useState<string | null>(null);

  const handleMove = async () => {
    setError(null);
    try {
      // The client already exists (materialised on submit) — moving to workflow
      // just flips PENDING_REVIEW → ACTIVE, which enables Pulse + full access.
      await setStatus.mutateAsync({ status: "ACTIVE" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Move failed");
    }
  };

  return (
    <section className="rounded-[10px] border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-800/50 dark:bg-amber-950/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Pending activation review
          </p>
          <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300/90">
            {companyName} has {checklist.readyCount}/{checklist.totalCount} checks ready.
            {checklist.requiredMissing > 0
              ? ` ${checklist.requiredMissing} required check${checklist.requiredMissing === 1 ? "" : "s"} still need attention.`
              : " Required checks are clear."}
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          loading={setStatus.isPending}
          onClick={() => void handleMove()}
          data-slug={slug}
        >
          <CheckCircleIcon className="h-4 w-4" />
          {checklist.requiredMissing > 0 ? "Move anyway" : "Move to workflow"}
        </Button>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {checklist.items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "flex min-w-0 items-start gap-2 rounded-[8px] border bg-white px-3 py-2",
              item.complete
                ? "border-emerald-200 dark:border-emerald-800/50"
                : item.required
                  ? "border-amber-300 dark:border-amber-700"
                  : "border-[var(--border-2)]",
            )}
          >
            {item.complete ? (
              <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : item.required ? (
              <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            ) : (
              <XMarkIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-4)]" />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="text-xs font-semibold text-[var(--text-1)]">{item.label}</p>
                {item.required ? (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                    Required
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-[var(--text-3)]">
                {item.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
      {error && (
        <p className="mt-2 text-xs text-rose-700 dark:text-rose-400">{error}</p>
      )}
    </section>
  );
}

// ─── Bank details section (Reveal-on-demand) ───────────────────────────────

function BankDetailsModal({
  open,
  onClose,
  slug,
  bank,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  bank: ClientBankSummary;
}) {
  const [revealed, setRevealed] = useState<ClientBankReveal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const revealMutation = useRevealClientBank();

  // Re-mask whenever the modal closes so decrypted values never linger in
  // component state after the operator is done looking.
  useEffect(() => {
    if (!open) {
      setRevealed(null);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const handleReveal = async () => {
    setError(null);
    if (revealed) {
      setRevealed(null);
      return;
    }
    try {
      const result = await revealMutation.mutateAsync(slug);
      setRevealed(result.bank);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reveal failed");
    }
  };

  return (
    <div
      className="app-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="app-dialog-panel w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="widget-header">
          <span className="widget-header__label">
            <BanknotesIcon className="mr-1 inline h-3.5 w-3.5 text-[var(--brand-700)]" />
            BANK DETAILS
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[4px] p-1 text-[var(--text-4)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)] transition-colors"
            title="Close"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6">
          <div className="mb-4 flex items-center gap-2 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2 text-xs text-[var(--text-3)]">
            <BanknotesIcon className="h-4 w-4 shrink-0 text-[var(--brand-700)]" />
            Encrypted at rest. Reveal is server-side only and not cached.
          </div>
          {/* Fixed-height area so the modal doesn't change size on reveal/hide. */}
          <div className="min-h-[210px]">
          {!revealed ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <BankField label="Account" value={bank.accountNumberLast4 ? `•••• ${bank.accountNumberLast4}` : "On file"} />
              <BankField label="Currency" value={bank.currency ?? "—"} />
              <BankField label="Status" value="Encrypted" />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <BankField label="Account holder" value={revealed.accountHolder ?? "—"} mono />
              <BankField label="Bank name" value={revealed.bankName ?? "—"} />
              <BankField label="Sort code" value={revealed.sortCode ?? "—"} mono />
              <BankField label="Account number" value={revealed.accountNumber ?? "—"} mono />
              {revealed.iban && <BankField label="IBAN" value={revealed.iban} mono />}
              {revealed.swiftBic && <BankField label="SWIFT / BIC" value={revealed.swiftBic} mono />}
              <BankField label="Currency" value={revealed.currency ?? "—"} />
            </div>
          )}
          </div>
          {error && <p className="mt-3 text-xs text-rose-700">{error}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void handleReveal()}
              disabled={revealMutation.isPending}
            >
              {revealed ? (
                <>
                  <EyeSlashIcon className="h-4 w-4" />
                  Hide
                </>
              ) : (
                <>
                  <EyeIcon className="h-4 w-4" />
                  {revealMutation.isPending ? "Revealing…" : "Reveal"}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BankField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p className="widget-data-label">{label}</p>
      <p
        className={cn(
          "text-sm text-[var(--text-1)]",
          mono && "font-mono",
        )}
      >
        {value}
      </p>
    </div>
  );
}
