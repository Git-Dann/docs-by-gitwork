"use client";

import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  BanknotesIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  DocumentTextIcon,
  FlagIcon,
  SignalIcon,
  Squares2X2Icon,
  SwatchIcon,
  UserGroupIcon,
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  LifebuoyIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardDocumentListIcon,
  CodeBracketIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowRightCircleIcon,
  ArrowUpRightIcon,
  EllipsisHorizontalIcon,
  GlobeAltIcon,
  MagnifyingGlassIcon,
  PauseCircleIcon,
  PencilIcon,
  PlayCircleIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
  VideoCameraIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/motion/spinner";
import { StatusDot } from "@/components/ui/motion/status-dot";
import { Skeleton, SkeletonWidget } from "@/components/ui/motion/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { useCountUp } from "@/components/ui/motion/use-count-up";
import { buttonStyles } from "@/components/ui/button-styles";
import { LogoImagePicker } from "@/components/ui/logo-image-picker";
import { CountrySelect, PhoneInput, WebsiteInput } from "@/components/ui/contact-fields";
import { ClientDesignFormModal } from "@/components/clients/client-design-form";
import { ClientDocumentLinks } from "@/components/clients/client-document-links";
import { ClientDocActionsModal } from "@/components/clients/client-doc-actions-modal";
import { ConvertLeadModal, LeadCrm } from "@/components/clients/lead-crm";
import { ClientDriveArchiveButton } from "@/components/clients/client-drive-archive-button";
import { ClientPlatformFormModal } from "@/components/clients/client-platform-form";
import { StatusBadge } from "@/components/status-badge";
import {
  useClientDetail,
  useClientMeetings,
  useClientSlackActivity,
  useRetryClientSlackDigest,
  useIngestClientMeeting,
  useLinkMeetingActionItemTask,
  useUpdateMeetingDecision,
  useCreateClientDesign,
  useCreateClientPlatform,
  useDeleteClientDesign,
  useDeleteClientPlatform,
  useRevealClientBank,
  useSetClientStatus,
  useUpdateClient,
  useUpdateClientDesign,
  useUpdateClientPlatform,
  useTeamMembers,
  useUpdateClientProductTeam,
  type ClientSlackActivity,
} from "@/hooks/use-proposals";
import { useCreateTask, useDeleteTask, useTasks } from "@/hooks/use-tasks";
import { usePermissions } from "@/hooks/use-permissions";
import { cn, formatDate, taskRef } from "@/lib/format";
import { PlatformMark } from "@/lib/platform-icons";
import { daysUntil, endDateState } from "@/lib/client-end-date";
import { RENEWAL_OVERDUE_DAYS, renewalTone } from "@/lib/wiki-platforms";
import { ClientDriveFiles } from "@/components/clients/client-drive-files";
import { driveFolderIdFromUrl } from "@/lib/client-drive";
import { portalSectionNumbers } from "@/lib/client-portal-layout";
import { meetingStatusChip } from "@/lib/meeting-status";
import { ClientDevelopersCard } from "@/components/clients/client-developers-card";
import { ClientLifecycleCard } from "@/components/clients/client-lifecycle";
import { ClientPulseCard, ClientStudiesCard } from "@/components/clients/client-portal-cards";
import { fetchSlackChannels, type SlackAvailableChannel, type ScribeMeeting, type ScribeCandidate, type ScribeActionItem } from "@/lib/api";
import { TASK_STATUS_LABELS, type TaskDTO } from "@/types/tasks";
import type {
  ClientBankReveal,
  ClientBankSummary,
  ClientDetailRecord,
  ClientDesignRecord,
  ClientPlatformRecord,
  ClientEngagementType,
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
  slackChannelId: string;
  slackInternalChannelId: string;
  slackExternalChannelId: string;
  retainerDays: string;
  retainerDaysUsed: string;
  /** Engagement structure ("" = unset). */
  engagementType: ClientEngagementType | "";
  /** Project end date as YYYY-MM-DD ("" = ongoing/unset). */
  endDate: string;
  /** Gitwork product/account leads shown on the wiki header (User ids, in order). */
  productTeamUserIds: string[];
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
/**
 * Slack isn't carried by Simple Icons (Slack asked for its removal), and Dan's rule is never to
 * redraw a logo, so a Slack channel gets the generic outline chat icon.
 */
function SlackGlyph({ className }: { className?: string }) {
  return <ChatBubbleLeftRightIcon className={cn(className, "text-[var(--text-3)]")} aria-hidden />;
}

const ENGAGEMENT_LABEL: Record<ClientEngagementType, string> = {
  FIXED_SCOPE: "Fixed scope",
  PHASED: "Phased",
  ROLLING: "Rolling",
  RETAINER: "Retainer",
};

const heroLink =
  "inline-flex max-w-full items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2 py-1 text-[12px] font-medium text-[var(--text-2)] transition-colors hover:border-[var(--brand-400)] hover:text-[var(--brand-700)] [&>*:last-child]:truncate";

/** The client's status as a dot and a word. Active is quiet; paused and pending ask for a look. */
function ClientStatusChip({ status }: { status: ClientDetailRecord["client"]["status"] }) {
  const map: Record<string, { label: string; tone: "success" | "warning" | "info" | "neutral" | "brand"; text: string }> = {
    ACTIVE: { label: "Active", tone: "success", text: "text-emerald-700" },
    INACTIVE: { label: "Paused", tone: "warning", text: "text-amber-700" },
    PENDING_REVIEW: { label: "Pending review", tone: "info", text: "text-blue-700" },
    LEAD: { label: "Lead", tone: "brand", text: "text-[var(--brand-700)]" },
  };
  const m = map[status] ?? { label: status.toLowerCase().replace(/_/g, " "), tone: "neutral" as const, text: "text-[var(--text-3)]" };
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-0)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", m.text)}
      style={{ fontFamily: "var(--font-mono)" }}
    >
      <StatusDot tone={m.tone} size="xs" />
      {m.label}
    </span>
  );
}

/** Up to this many designs sit one per row; more go two across. */
const DESIGN_TILES_MAX = 3;

const heroFact = "inline-flex items-center gap-1";
const heroFactIcon = "h-3.5 w-3.5 shrink-0 text-[var(--text-4)]";

/**
 * The engagement's end date, coloured only when it means something: amber inside 30 days, red
 * once it has passed (and worded as "Ended"). Otherwise it reads like the other facts.
 */
function EndDateFact({ endDate }: { endDate: string }) {
  const { days, state } = endDateState(endDate);
  const tone = state === "past" ? "text-red-700" : state === "soon" ? "text-amber-700" : undefined;
  return (
    <span className={cn(heroFact, tone)} title={state === "past" ? "This engagement's end date has passed" : state === "soon" ? `Ends in ${days} day${days === 1 ? "" : "s"}` : undefined}>
      <FlagIcon aria-hidden className={cn(heroFactIcon, tone && "text-current")} />
      {state === "past" ? "Ended" : "Ends"} {formatDate(endDate)}
    </span>
  );
}

/**
 * A platform's renewal line: amber inside a fortnight, red once passed (the wiki's rule,
 * src/lib/wiki-platforms.ts). A date more than RENEWAL_OVERDUE_DAYS gone reads neutral, because
 * nobody updates it after renewing and a permanent red line teaches everyone to ignore it.
 */
function renewalTextTone(renewsOn: string): string {
  const days = daysUntil(renewsOn);
  if (!Number.isFinite(days) || days < -RENEWAL_OVERDUE_DAYS) return "text-[var(--text-3)]";
  const tone = renewalTone(days);
  return tone === "overdue" ? "text-red-700" : tone === "soon" ? "text-amber-700" : "text-[var(--text-3)]";
}

const actionMenuPanel =
  "z-50 mt-1.5 w-56 rounded-[10px] border border-[rgba(0,0,0,0.10)] bg-white p-1.5 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)] focus:outline-none";
const actionMenuItem =
  "flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[13px] font-medium text-[var(--text-2)] transition data-[focus]:bg-[var(--surface-1)] data-[focus]:text-[var(--text-1)] disabled:opacity-50";

export function ClientDetail({ slug }: { slug: string }) {
  const router = useRouter();
  const { data, isPending, error } = useClientDetail(slug);
  const [editing, setEditing] = useState(false);
  // 14 // DOCUMENTS shows Foundry docs + links, or the client's Google Drive folder. Null
  // until someone picks a tab: the card then opens on whichever has something in it.
  const [docsTab, setDocsTab] = useState<"docs" | "drive" | null>(null);
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

  // Which doc's actions popup is open (by id, so it reflects live inWiki/share state on refetch).
  const [docActionsId, setDocActionsId] = useState<string | null>(null);

  const updateClientMutation = useUpdateClient(slug);
  const productTeamMutation = useUpdateClientProductTeam(slug);
  const createPlatformMutation = useCreateClientPlatform(slug);
  const createDesignMutation = useCreateClientDesign(slug);
  const slackActivity = useClientSlackActivity(slug);
  const retrySlackDigest = useRetryClientSlackDigest(slug);
  const setStatus = useSetClientStatus(slug);
  const { canViewPulse, canManageClients } = usePermissions();
  // Pause (→ INACTIVE) modal state.
  const [pausing, setPausing] = useState(false);
  const [resumeAtInput, setResumeAtInput] = useState("");
  const [pauseNoteInput, setPauseNoteInput] = useState("");
  const [statusError, setStatusError] = useState<string | null>(null);
  // Lead → client conversion dialog.
  const [converting, setConverting] = useState(false);

  if (isPending) {
    // The page's own shape, so nothing jumps when it arrives (docs/motion.md: a skeleton should
    // look like what replaces it).
    return (
      <div className="space-y-5" role="status" aria-label="Loading client">
        <SkeletonWidget className="h-[176px] rounded-[10px]" />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonWidget key={i} className="h-[118px] rounded-[10px]" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonWidget className="h-[220px] rounded-[10px]" />
          <SkeletonWidget className="h-[220px] rounded-[10px]" />
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

  const { client, lifecycle, proposals, proofDocuments, platforms, designs, documentLinks, pulseScans, supportClient, placements, studies, touchpoints } = data;
  // Nothing linked but a Drive folder is: open on Drive, or the card reads as empty when it isn't.
  const docsView =
    docsTab ??
    (proposals.length + documentLinks.length === 0 && driveFolderIdFromUrl(client.googleDriveFolderUrl) ? "drive" : "docs");
  const isSuggested = client.source === "SUGGESTED";
  // Leads show only the lead workspace + contact/notes — project/delivery info is hidden
  // until they become a client (status flips to ACTIVE via "Convert to client").
  const isLead = client.status === "LEAD";
  const activeDevCount = new Set((placements ?? []).filter((p) => !p.endDate).map((p) => p.candidateId)).size;

  // Which optional cards show, so the numbers run in sequence with no gaps.
  const showBilling = Boolean(
    client.legalCompanyName || client.vatNumber || client.companyNumber || client.invoiceEmail || client.billingAddressLine1,
  );
  const showStudies = !isSuggested;
  const sideCards = (canViewPulse ? 1 : 0) + (showStudies ? 1 : 0) + (client.notes ? 1 : 0);
  const num = portalSectionNumbers((section) => {
    switch (section) {
      case "statPulse":
      case "pulse":
        return canViewPulse;
      case "billing":
        return showBilling;
      case "studies":
        return showStudies;
      case "notes":
        return Boolean(client.notes);
      case "proof":
        return proofDocuments.length > 0;
      case "lifecycle":
        return lifecycle.length > 0;
      default:
        return true;
    }
  });
  // Cards rise in one after another, in page order (docs/motion.md: motion-rise).
  let riseIndex = 0;
  const rise = () => ({ animationDelay: `${Math.min(riseIndex++, 10) * 40}ms` });

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
      slackChannelId: client.slackChannelId ?? "",
      slackInternalChannelId: client.slackInternalChannelId ?? "",
      slackExternalChannelId: client.slackExternalChannelId ?? "",
      retainerDays: client.retainerDays != null ? String(client.retainerDays) : "",
      retainerDaysUsed: client.retainerDaysUsed != null ? String(client.retainerDaysUsed) : "",
      engagementType: client.engagementType ?? "",
      endDate: client.endDate ? client.endDate.slice(0, 10) : "",
      productTeamUserIds: client.productTeamUserIds ?? [],
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
        slackChannelId: editForm.slackChannelId || undefined,
        slackInternalChannelId: editForm.slackInternalChannelId || undefined,
        slackExternalChannelId: editForm.slackExternalChannelId || undefined,
        retainerDays: editForm.retainerDays.trim() === "" ? null : Number(editForm.retainerDays),
        retainerDaysUsed: editForm.retainerDaysUsed.trim() === "" ? null : Number(editForm.retainerDaysUsed),
        engagementType: editForm.engagementType === "" ? null : editForm.engagementType,
        endDate: editForm.endDate.trim() === "" ? null : editForm.endDate,
      });
      // Product team saves via its own endpoint (String[] doesn't fit the contact
      // update path). Only write when it actually changed.
      const prevTeam = client.productTeamUserIds ?? [];
      const nextTeam = editForm.productTeamUserIds;
      const teamChanged =
        prevTeam.length !== nextTeam.length || prevTeam.some((id, i) => id !== nextTeam[i]);
      if (teamChanged) {
        await productTeamMutation.mutateAsync(nextTeam);
      }
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
                <LifebuoyIcon className="h-3 w-3" />
                Care
              </Link>
            )}
            {canManageClients && !isSuggested && client.status === "LEAD" && (
              <Button type="button" variant="primary" size="xs" onClick={() => setConverting(true)}>
                <ArrowRightCircleIcon className="h-3 w-3" />
                Convert to client
              </Button>
            )}
            {canManageClients && (
              <Menu as="div" className="relative">
                <MenuButton
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-[var(--border-2)] bg-white text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                  aria-label="Client actions"
                  title="Client actions"
                >
                  <EllipsisHorizontalIcon className="h-4 w-4" />
                </MenuButton>
                <MenuItems anchor="bottom end" className={actionMenuPanel}>
                  <MenuItem>
                    <button type="button" className={actionMenuItem} onClick={openEdit}>
                      <PencilIcon className="h-4 w-4 text-[var(--text-4)]" />
                      Edit client
                    </button>
                  </MenuItem>
                  {client.status === "ACTIVE" && (
                    <MenuItem>
                      <button
                        type="button"
                        className={actionMenuItem}
                        onClick={() => setPausing(true)}
                      >
                        <PauseCircleIcon className="h-4 w-4 text-[var(--text-4)]" />
                        Pause client
                      </button>
                    </MenuItem>
                  )}
                  {client.status === "INACTIVE" && (
                    <MenuItem>
                      <button
                        type="button"
                        className={actionMenuItem}
                        onClick={() => changeStatus("ACTIVE")}
                        disabled={setStatus.isPending}
                      >
                        <PlayCircleIcon className="h-4 w-4 text-[var(--text-4)]" />
                        Reactivate client
                      </button>
                    </MenuItem>
                  )}
                  {!isSuggested && !isLead && (
                    <MenuItem>
                      <ClientDriveArchiveButton slug={slug} presentation="menuItem" />
                    </MenuItem>
                  )}
                </MenuItems>
              </Menu>
            )}
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

        <div className="relative overflow-hidden">
          {/* A quiet brand wash behind the identity, so the record reads as the page's hero. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,var(--surface-brand-soft)_0%,transparent_55%)]"
          />
          <div className="relative flex flex-wrap items-start gap-5 p-6">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[12px] sm:h-[72px] sm:w-[72px] border border-[var(--border-2)] bg-[var(--surface-0)] shadow-[var(--shadow-xs)]">
              {client.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={client.logoUrl} alt={`${client.name} logo`} className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl font-semibold text-[var(--brand-700)]" style={{ fontFamily: "var(--font-display)" }}>
                  {client.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1 basis-[240px]">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <h2
                  className="min-w-0 text-[32px] leading-none tracking-[-0.03em] text-[var(--text-1)] [overflow-wrap:anywhere]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {client.name}
                </h2>
                <ClientStatusChip status={client.status} />
              </div>

              {/* Key facts, in the readout voice. */}
              <p
                className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                <span className={heroFact}>
                  <CalendarDaysIcon aria-hidden className={heroFactIcon} />
                  Client since {new Date(client.createdAt).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                </span>
                {client.engagementType ? (
                  <>
                    <span aria-hidden className="text-[var(--text-4)]">·</span>
                    <span className={heroFact}>
                      <BriefcaseIcon aria-hidden className={heroFactIcon} />
                      {ENGAGEMENT_LABEL[client.engagementType]}
                    </span>
                  </>
                ) : null}
                {client.endDate ? (
                  <>
                    <span aria-hidden className="text-[var(--text-4)]">·</span>
                    <EndDateFact endDate={client.endDate} />
                  </>
                ) : null}
                {!isLead && activeDevCount > 0 ? (
                  <>
                    <span aria-hidden className="text-[var(--text-4)]">·</span>
                    <span className={heroFact}>
                      <UserGroupIcon aria-hidden className={heroFactIcon} />
                      {activeDevCount} dev{activeDevCount === 1 ? "" : "s"} on it
                    </span>
                  </>
                ) : null}
              </p>

              {/* Where the client lives elsewhere. */}
              {(client.website || client.googleDriveFolderUrl || client.slackInternalChannelName) && (
                <div className="mt-3.5 flex flex-wrap items-center gap-2">
                  {client.website && (
                    <a
                      href={client.website.startsWith("http") ? client.website : `https://${client.website}`}
                      target="_blank"
                      rel="noreferrer"
                      className={heroLink}
                    >
                      <GlobeAltIcon className="h-3.5 w-3.5 text-[var(--brand-700)]" />
                      {client.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    </a>
                  )}
                  {client.googleDriveFolderUrl && (
                    <a href={client.googleDriveFolderUrl} target="_blank" rel="noreferrer" className={heroLink}>
                      <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 text-[var(--text-4)]" />
                      Google Drive
                    </a>
                  )}
                  {client.slackInternalChannelName && (client.slackInternalChannelId ?? client.slackChannelId) && (
                    <a
                      href={`https://slack.com/app_redirect?channel=${client.slackInternalChannelId ?? client.slackChannelId}`}
                      target="_blank"
                      rel="noreferrer"
                      className={heroLink}
                    >
                      <SlackGlyph className="h-3.5 w-3.5" />#{client.slackInternalChannelName}
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Quick actions. */}
            <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:justify-end sm:self-end">
              {client.bank?.onFile && (
                <Button type="button" variant="secondary" size="sm" onClick={() => setBankOpen(true)}>
                  <BanknotesIcon className="h-4 w-4 text-[var(--brand-700)]" />
                  Bank details
                </Button>
              )}
              {!isLead && (
                <Link href={`/app/portal/${slug}/tasks`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                  <ClipboardDocumentListIcon className="h-4 w-4 text-[var(--text-3)]" />
                  Tasks
                </Link>
              )}
              {!isLead && (
                <Link href={`/app/portal/${slug}/wiki`} title="Open knowledge wiki" className={buttonStyles({ variant: "primary", size: "sm" })}>
                  <BookOpenIcon className="h-4 w-4" />
                  Open wiki
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Lead CRM (LEAD only) — 02 pipeline · 03 next steps · 04 automation · 05 activity. */}
      {isLead && (
        <LeadCrm slug={slug} client={client} touchpoints={touchpoints} canManage={canManageClients} />
      )}

      {/* ── 06 // CONTACT — lead standalone (clients show Contact beside Slack above) ── */}
      {isLead && (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">{isLead ? "06" : "08"}</span>
              {" // CONTACT"}
            </span>
            {canManageClients && (
              <Button type="button" variant="secondary" size="xs" onClick={openEdit}>
                <PencilIcon className="h-3 w-3" />
                Edit
              </Button>
            )}
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

      {/* Lead-only 07 // MEETING NOTES + 08 // NOTES, side by side, equal height. */}
      {isLead && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="widget-card">
            <MeetingNotesSection slug={slug} number="07" />
          </section>
          <section className="widget-card">
            <div className="widget-header">
              <span className="widget-header__label">
                <span className="widget-header__label--number">08</span>
                {" // NOTES"}
              </span>
              {canManageClients && (
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
        </div>
      )}

      {!isLead && (
        <>
      {/* ── STATS ── */}
      <div className={cn("grid grid-cols-2 gap-3 sm:gap-4", canViewPulse ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
        <StatCard number={num.statDocs} label="DOCS" value={proposals.length} icon={DocumentTextIcon} style={rise()} />
        <StatCard number={num.statPlatforms} label="PLATFORMS" value={platforms.length} icon={Squares2X2Icon} style={rise()} />
        <StatCard number={num.statDesigns} label="DESIGNS" value={designs.length} icon={SwatchIcon} style={rise()} />
        {canViewPulse ? <StatCard number={num.statPulse} label="PULSE SCANS" value={pulseScans.length} icon={SignalIcon} style={rise()} /> : null}
        <StatCard
          number={num.statDevs}
          label="DEVS"
          value={activeDevCount}
          icon={UserGroupIcon}
          href={`/app/portal/${slug}/tasks`}
          action={<span className="text-[11px] font-medium text-[var(--brand-700)]">Tasks →</span>}
          style={rise()}
        />
      </div>

      {/* ── SLACK ACTIVITY + CONTACT ── Contact sets the row's height; Slack (lg:h-0 + min-h-full)
          takes that height and scrolls its digest inside, so neither card is left with a hole. */}
      <div className="grid items-stretch gap-4 lg:min-h-[220px] lg:grid-cols-2">
      <section className="widget-card motion-rise flex flex-col lg:h-0 lg:min-h-full" style={rise()}>
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">{num.slack}</span>
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
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SlackActivityBody
            data={slackActivity.data}
            isLoading={slackActivity.isPending}
            onConfigureClick={canManageClients ? openEdit : undefined}
            onRetry={() => retrySlackDigest.mutate()}
            retrying={retrySlackDigest.isPending}
            summaryOnly
          />
        </div>
      </section>
      <ContactCard client={client} number={num.contact} onEdit={canManageClients ? openEdit : undefined} style={rise()} />
      </div>

      {/* ── 09 // BILLING ── */}
      {(client.legalCompanyName ||
        client.vatNumber ||
        client.companyNumber ||
        client.invoiceEmail ||
        client.billingAddressLine1) && (
        <section className="widget-card motion-rise" style={rise()}>
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">{num.billing}</span>
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
      <section className="widget-card motion-rise" style={rise()}>
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">{num.platforms}</span>
            {" // PLATFORMS"}
          </span>
          {!isSuggested && canManageClients && (
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
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


      {/* ── DEVELOPERS — full width, a card per person ── */}
      <div className="motion-rise" style={rise()}>
        <ClientDevelopersCard number={num.developers} clientId={client.id} placements={placements ?? []} />
      </div>

      {/* ── MEETING NOTES + DESIGNS ── both stretch to the taller one, so neither leaves a hole. */}
      <div className="grid grid-cols-1 items-stretch gap-4 lg:min-h-[320px] lg:grid-cols-2" data-pair-row>
      <section className="widget-card motion-rise flex h-full flex-col" style={rise()} data-pair-card>
        <MeetingNotesSection slug={slug} number={num.meetings} />
      </section>
      {/* DESIGNS takes the row height Meeting notes sets (lg:h-0 + min-h-full keeps it from
          driving the row), then fills it: a few designs become tiles that share the height, many
          scroll inside the card. Either way the pair ends level with no hole (§129.1). */}
      <section className="widget-card motion-rise flex flex-col lg:h-0 lg:min-h-full" style={rise()} data-pair-card>
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">{num.designs}</span>
            {" // DESIGNS"}
          </span>
          <div className="flex items-center gap-1">
            {!isSuggested && canManageClients && (
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

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5" data-pair-body>
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
            // Tiles in a grid whose rows share the card's height (minmax(88px, 1fr)): a few designs
            // grow to fill it, many scroll inside it. With two columns an odd last tile spans both.
            <div
              className={cn(
                "grid flex-1 auto-rows-[minmax(88px,1fr)] gap-2",
                designs.length > DESIGN_TILES_MAX && "sm:grid-cols-2 sm:[&>*:last-child:nth-child(odd)]:col-span-2",
              )}
              data-design-grid
            >
              {designs.map((design) => (
                <DesignCard
                  key={design.id}
                  design={design}
                  slug={slug}
                  deletingId={deletingDesignId}
                  setDeletingId={setDeletingDesignId}
                  variant="tile"
                  largeMark={designs.length === 1}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      </div>

      {/* ── DOCUMENTS, then PULSE · STUDIES · NOTES ── Documents runs full width, and the small
          cards follow full width at their natural height. Pairing them used to stretch an empty
          Studies card to Documents' height (§129.1: no large gaps, by construction). */}
      <div className="flex flex-col gap-4">
        {/* 14 // DOCUMENTS */}
        <section className="widget-card motion-rise flex h-full flex-col" style={rise()}>
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">{num.documents}</span>
              {" // DOCUMENTS"}
            </span>
            <DocsTabs value={docsView} onChange={setDocsTab} linkedCount={proposals.length + documentLinks.length} />
          </div>
          {docsView === "drive" ? (
            // The client's Google Drive folder, read with YOUR Google sign-in.
            <ClientDriveFiles
              target={{ mode: "internal", slug }}
              pageSize={8}
              onLinkFolder={canManageClients ? openEdit : undefined}
            />
          ) : (
          <>
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
                        <button
                          type="button"
                          onClick={() => setDocActionsId(proposal.id)}
                          className="flex items-center gap-1.5 text-left font-medium text-[var(--text-1)] transition hover:text-[var(--brand-700)]"
                        >
                          {proposal.title}
                          {proposal.inWiki ? (
                            <span
                              title="On the client's wiki"
                              className="inline-flex items-center rounded-[5px] bg-[var(--surface-brand)] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-700)]"
                            >
                              Wiki
                            </span>
                          ) : null}
                        </button>
                      </td>
                      <td>
                        <StatusBadge status={proposal.status} />
                      </td>
                      <td>
                        <span className="widget-timestamp whitespace-nowrap">{formatDate(proposal.updatedAt)}</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => setDocActionsId(proposal.id)}
                          className={buttonStyles({ variant: "secondary", size: "xs" })}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="text-sm text-[var(--text-4)]" colSpan={4}>
                      No Foundry documents linked yet. Add this client&rsquo;s name to any document draft
                      to link it here, or add your own links below.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <ClientDocumentLinks slug={slug} links={documentLinks} canManage={canManageClients} />
          </>
          )}
        </section>




        {sideCards > 0 ? (
        <div className="flex min-w-0 flex-col gap-4" data-side-cards>
          {canViewPulse ? (
            <ClientPulseCard
              number={num.pulse}
              scans={pulseScans}
              pendingReview={client.status === "PENDING_REVIEW"}
              style={rise()}
            />
          ) : null}
          {showStudies ? (
            <ClientStudiesCard number={num.studies} clientId={client.id} studies={studies} style={rise()} />
          ) : null}
          {client.notes ? (
            <section className="widget-card motion-rise flex flex-col" style={rise()}>
              <div className="widget-header">
                <span className="widget-header__label">
                  <span className="widget-header__label--number">{num.notes}</span>
                  {" // NOTES"}
                </span>
                {canManageClients ? (
                  <Button type="button" variant="secondary" size="xs" onClick={openEdit}>
                    <PencilIcon className="h-3 w-3" />
                    Edit
                  </Button>
                ) : null}
              </div>
              <p className="whitespace-pre-wrap p-5 text-sm leading-6 text-[var(--text-2)]">{client.notes}</p>
            </section>
          ) : null}
        </div>
        ) : null}
      </div>

        <ClientDocActionsModal
          slug={slug}
          proposal={proposals.find((p) => p.id === docActionsId) ?? null}
          canManage={canManageClients}
          onClose={() => setDocActionsId(null)}
        />

      {/* Full-width optionals */}
        {/* 18 // PROOF DOCUMENTS */}
        {proofDocuments.length > 0 && (
          <section className="widget-card motion-rise" style={rise()}>
            <div className="widget-header">
              <span className="widget-header__label">
                <span className="widget-header__label--number">{num.proof}</span>
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


      {lifecycle.length > 0 ? (
        <div className="motion-rise" style={rise()}>
          <ClientLifecycleCard
            number={num.lifecycle}
            // Pulse scans only for people who can see Pulse, as everywhere else on the page.
            source={{ lifecycle, placements: placements ?? [], pulseScans: canViewPulse ? pulseScans : [], studies, platforms, designs, documentLinks, touchpoints }}
          />
        </div>
      ) : null}
        </>
      )}

      {/* ── Lead → client conversion ──
          Kept mounted while open, NOT just while the record is a lead: converting flips the status
          to ACTIVE and the refetch would otherwise unmount the dialog mid-flow, losing step 2
          (the delivery plan) the moment step 1 succeeds. */}
      {(isLead || converting) && canManageClients ? (
        <ConvertLeadModal
          open={converting}
          slug={slug}
          clientId={client.id}
          clientName={client.name}
          onClose={() => setConverting(false)}
        />
      ) : null}

      {/* ── Edit client modal ── */}
      {pausing && (
        <div className="fixed inset-0 z-50">
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
                    <DatePicker value={resumeAtInput} onChange={setResumeAtInput} />
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

function MeetingNotesSection({ slug, number = "12" }: { slug: string; number?: string }) {
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

  // Hide calls where Scribe found no notes doc (NO_TRANSCRIPT) — they're noise (e.g. internal
  // standups with no Gemini notes). Summarised / in-progress / errored stay; the manual
  // "Grab note" picker can still re-pull any recent call.
  const meetings = (data?.meetings ?? []).filter((m) => m.status !== "NO_TRANSCRIPT");
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
          <span className="widget-header__label--number">{number}</span>
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

      <div className="flex flex-1 flex-col gap-3 p-4" data-pair-body>
        {Boolean(data) && rows.length > 0 && (
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-4)]" />
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search calls…"
              className="w-full rounded-[6px] border border-[var(--border-2)] bg-white py-1.5 pl-8 pr-3 text-sm text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:border-[var(--accent)] focus:outline-none" />
          </div>
        )}
        {isLoading && <p className="widget-data-label animate-pulse py-4 text-center">Loading…</p>}
        {!isLoading && rows.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-[6px] border border-dashed border-[rgba(0,0,0,0.12)] px-4 py-8 text-center">
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
                      <p className="truncate text-sm font-medium text-[var(--text-1)]" title={c.title}>{c.title}</p>
                      <p className="widget-timestamp mt-0.5">{formatDate(c.start)}</p>
                    </div>
                    <button type="button" disabled={busy || !c.meetingCode} onClick={() => void fetchNotes(c)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-[6px] bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50">
                      {busy ? (<><Spinner tone="inverse" />Fetching</>) : (<><SparklesIcon className="h-3 w-3" />Fetch notes</>)}
                    </button>
                  </div>
                );
              }
              const m = row.m;
              const chip = meetingStatusChip(m.status, m.summaryError);
              const ready = m.status === "SUMMARISED";
              const retryable = m.status === "NO_TRANSCRIPT" || m.status === "ERROR";
              const busy = busyId === m.calendarEventId;
              return (
                <div key={m.calendarEventId ?? m.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-white">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--text-1)]" title={m.title}>{m.title}</p>
                    <p className="widget-timestamp mt-0.5">{formatDate(m.startedAt ?? m.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span
                      title={chip.title}
                      className={cn("inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]", chip.cls)}
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {chip.working ? <StatusDot tone="warning" motion="pulse" size="xs" /> : null}
                      {chip.label}
                    </span>
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
          <div className="mt-auto flex items-center justify-between pt-1">
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
        className="app-dialog-panel app-dialog-fixed flex w-full max-w-[560px] flex-col overflow-hidden"
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
                      <p className="truncate text-sm font-medium text-[var(--text-1)]" title={c.title}>{c.title}</p>
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
                        <><Spinner tone="inverse" />Grabbing</>
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
          "app-dialog-panel app-dialog-fixed flex w-full flex-col overflow-hidden",
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
                        <Spinner />
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
                <Spinner tone="inverse" />
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
/** Contact widget-card — used in the client's Slack+Contact 2-col row. Self-contained. */
function ContactCard({
  client,
  number,
  onEdit,
  style,
}: {
  client: ClientDetailRecord["client"];
  number: string;
  onEdit?: () => void;
  style?: React.CSSProperties;
}) {
  const addressLines = [client.addressLine1, client.addressLine2].filter(Boolean);
  const cityLine = [client.city, client.postcode].filter(Boolean).join(", ");
  const hasAddress = addressLines.length > 0 || Boolean(cityLine) || Boolean(client.country);
  const hasPrimary = Boolean(client.primaryContactName || client.primaryContactEmail || client.primaryContactPhone);
  const anyInfo = hasPrimary || Boolean(client.website) || hasAddress;
  return (
    <section className="widget-card motion-rise flex h-full flex-col" style={style}>
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{number}</span>
          {" // CONTACT"}
        </span>
        {onEdit && (
          <Button type="button" variant="secondary" size="xs" onClick={onEdit}>
            <PencilIcon className="h-3 w-3" />
            Edit
          </Button>
        )}
      </div>
      <div className="flex-1 p-6">
        {anyInfo ? (
          <div className="grid gap-6 sm:grid-cols-2">
            {hasPrimary && (
              <div className="space-y-1.5">
                <p className="widget-data-label mb-2">Primary contact</p>
                {client.primaryContactName && (
                  <p className="text-sm font-medium text-[var(--text-1)]">{client.primaryContactName}</p>
                )}
                {client.primaryContactEmail && (
                  <a href={`mailto:${client.primaryContactEmail}`} className="block text-sm text-[var(--brand-700)] hover:underline">
                    {client.primaryContactEmail}
                  </a>
                )}
                {client.primaryContactPhone && (
                  <a href={`tel:${client.primaryContactPhone}`} className="block text-sm text-[var(--text-2)]">
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
            {hasAddress && (
              <div className="space-y-1.5">
                <p className="widget-data-label mb-2">Address</p>
                {addressLines.map((line, i) => (
                  <p key={i} className="text-sm text-[var(--text-2)]">{line}</p>
                ))}
                {cityLine && <p className="text-sm text-[var(--text-2)]">{cityLine}</p>}
                {client.country && <p className="text-sm text-[var(--text-2)]">{client.country}</p>}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-4)]">No contact details yet — add via Edit.</p>
        )}
      </div>
    </section>
  );
}

function StatCard({
  number,
  label,
  value,
  icon: Icon,
  action,
  href,
  style,
}: {
  number: string;
  label: string;
  value: number;
  /** A small neutral outline icon beside the figure: what the number counts, at a glance. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Optional small control pinned bottom-right (e.g. a jump link). */
  action?: React.ReactNode;
  /** When provided, the whole metric card becomes a navigation target. */
  href?: string;
  /** The entrance stagger (motion-rise). */
  style?: React.CSSProperties;
}) {
  // Counts up when the page arrives (docs/motion.md); reduced motion shows the value at once.
  const shown = useCountUp(value);
  const card = (
    <article
      className={cn(
        "widget-card motion-rise relative h-full",
        href && "transition hover:border-[var(--brand-400)] hover:bg-[var(--surface-1)]",
      )}
      style={style}
      aria-label={`${label}: ${value}`}
    >
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{number}</span>
          {` // ${label}`}
        </span>
      </div>
      <div className="widget-body--compact relative">
        {Icon ? <Icon aria-hidden className="absolute right-4 top-4 h-5 w-5 text-[var(--text-4)]" /> : null}
        <p
          className="text-4xl leading-none tracking-tight text-[var(--text-1)] sm:text-5xl"
          style={{ fontFamily: "var(--font-display)" }}
          aria-hidden
        >
          {shown}
        </p>
        <p className="widget-data-label mt-2" aria-hidden>
          {label}
        </p>
      </div>
      {action ? <div className="absolute bottom-3 right-3">{action}</div> : null}
    </article>
  );

  if (!href) return card;
  return (
    <Link
      href={href}
      className="block h-full rounded-[10px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-500)] focus-visible:ring-offset-2"
    >
      {card}
    </Link>
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
// SlackActivityBody — the body of the SLACK ACTIVITY card: the AI digest, or, when there isn't
// one, why not in plain words plus the latest messages, so the card is never a dead sentence
// over a channel full of messages (src/server/slack-activity-digest.ts).
// ---------------------------------------------------------------------------
function slackNoDigestReason(data: ClientSlackActivity): string {
  switch (data.reason) {
    case "ai_failed":
      return data.aiError ?? "The Slack digest couldn't be written this time.";
    case "no_ai_key":
      return "No AI provider is set up, so there's no digest. Add one in Settings → Integrations.";
    case "stale":
      return "No digest yet. It's written when someone who can use AI opens this page.";
    default:
      return "No digest yet.";
  }
}

function SlackActivityBody({
  data,
  isLoading,
  onConfigureClick,
  onRetry,
  retrying = false,
}: {
  data: ClientSlackActivity | undefined;
  isLoading: boolean;
  onConfigureClick?: () => void;
  /** "Try again" on a failed digest. Shown only when the viewer may use AI. */
  onRetry?: () => void;
  retrying?: boolean;
  /** Kept for the call site; the card only ever shows the compact view. */
  summaryOnly?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2.5 p-5" aria-hidden>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-5/6" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
    );
  }

  if (!data || !data.configured) {
    const reason = data?.reason;
    return (
      <div className="flex flex-1 items-center gap-3 p-5">
        <ChatBubbleLeftRightIcon className="h-5 w-5 shrink-0 text-[var(--text-4)]" />
        {reason === "no_token" ? (
          <p className="text-sm text-[var(--text-3)]">
            No Slack bot token is set up.{" "}
            <Link href="/app/settings" className="text-[var(--brand-700)] hover:underline">
              Add one in Settings
            </Link>
          </p>
        ) : (
          <p className="text-sm text-[var(--text-3)]">
            No Slack channel is linked.
            {onConfigureClick ? (
              <>
                {" "}
                <button type="button" onClick={onConfigureClick} className="text-[var(--brand-700)] hover:underline">
                  Link one
                </button>
              </>
            ) : null}
          </p>
        )}
      </div>
    );
  }

  if (data.reason === "not_in_channel") {
    return (
      <div className="p-5">
        <p className="text-sm text-[var(--text-3)]">
          The Foundry bot hasn&apos;t been invited to{" "}
          <span className="font-medium text-[var(--text-2)]">{data.channelName}</span>. Invite it in Slack, then refresh.
        </p>
      </div>
    );
  }

  if (data.reason === "empty" || data.messages.length === 0) {
    return (
      <div className="p-5">
        <p className="text-sm text-[var(--text-3)]">No messages in {data.channelName ?? "the channel"} yet.</p>
      </div>
    );
  }

  const summaryLines = data.summary
    ? data.summary.split("\n").map((l) => l.trim()).filter(Boolean)
    : [];

  if (summaryLines.length > 0) {
    return (
      <div className="max-h-[360px] overflow-y-auto p-5">
        <p className="widget-data-label mb-3 flex items-center gap-1.5">
          <SparklesIcon className="h-3 w-3 text-[var(--brand-700)]" />
          AI digest
        </p>
        <ul className="space-y-2">
          {summaryLines.map((line, i) => {
            const clean = line.replace(/^\•\s*/, "").replace(/\*\*([^*]+)\*\*/g, "$1");
            const colonIdx = clean.indexOf(":");
            const label = colonIdx > 0 && colonIdx < 30 ? clean.slice(0, colonIdx) : null;
            const body = label ? clean.slice(colonIdx + 1).trim() : clean;
            return (
              <li key={i} className="flex gap-2 text-sm leading-5 text-[var(--text-2)]">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-600)]" />
                <span>
                  {label && <span className="font-semibold text-[var(--text-1)]">{label}: </span>}
                  {body}
                </span>
              </li>
            );
          })}
        </ul>
        {data.generatedAt ? <p className="widget-timestamp mt-4 opacity-60">Written {formatDate(data.generatedAt)}</p> : null}
      </div>
    );
  }

  // No digest: say why, then show what was actually said.
  const recent = [...data.messages].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 4);
  const canRetry = Boolean(onRetry && data.canRefresh && data.reason === "ai_failed");
  return (
    <div className="flex max-h-[360px] flex-col overflow-y-auto">
      <div className="flex items-start gap-2.5 border-b border-[var(--border-3)] bg-[var(--surface-1)] px-5 py-3">
        {data.reason === "ai_failed" ? (
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        ) : (
          <SparklesIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-4)]" />
        )}
        <p className="min-w-0 flex-1 text-[13px] leading-5 text-[var(--text-2)]">{slackNoDigestReason(data)}</p>
        {canRetry ? (
          <Button type="button" variant="secondary" size="xs" onClick={onRetry} loading={retrying}>
            Try again
          </Button>
        ) : null}
      </div>
      <p className="widget-data-label px-5 pb-1 pt-3">Latest messages</p>
      <ul className="divide-y divide-[var(--border-3)]">
        {recent.map((msg) => (
          <li key={msg.id} className="flex gap-2.5 px-5 py-2.5">
            <Avatar name={msg.author} size={24} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="truncate text-xs font-semibold text-[var(--text-1)]">{msg.author}</span>
                <span className="widget-timestamp shrink-0 text-[10px] opacity-60">{formatDate(msg.ts)}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-xs leading-[1.55] text-[var(--text-3)]">{formatSlackText(msg.text)}</p>
            </div>
          </li>
        ))}
      </ul>
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

  return (
    <>
      <article
        className="group relative flex flex-row items-center gap-3 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-3 cursor-pointer hover:border-[var(--brand-400)] hover:shadow-sm transition-all"
        onClick={() => setEditing(true)}
      >
        {/* The platform's official mark, or a generic icon (src/lib/platform-icons.tsx). */}
        <PlatformMark url={primaryUrl} platformType={platform.platformType} />

        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-[var(--text-1)]" title={platform.name}>{platform.name}</p>
          {primaryUrl && (
            <p className="truncate text-[11px] text-[var(--text-4)] leading-tight mt-0.5" title={primaryUrl}>
              {primaryUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </p>
          )}
          {platform.renewsOn && (
            <p
              className={cn("mt-0.5 truncate text-[10px] uppercase tracking-[0.08em]", renewalTextTone(platform.renewsOn))}
              style={{ fontFamily: "var(--font-mono), 'JetBrains Mono', monospace" }}
              title={`${platform.renewalNote ?? "Renews"} · ${platform.renewsOn}`}
            >
              {platform.renewalNote ?? "Renews"} ·{" "}
              {new Date(`${platform.renewsOn}T00:00:00Z`).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: "UTC",
              })}
            </p>
          )}
          {(platform.platformType ||
            platform.stagingUrl ||
            platform.repoUrl ||
            (platform.links?.length ?? 0) > 0) && (
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
              {/* Client-provided extras (ClickUp board, Figma file …). Already
                  scheme-checked server-side by normalisePlatformLinks, so these
                  can be rendered as anchors. */}
              {(platform.links ?? []).map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex max-w-[140px] items-center gap-0.5 text-[10px] text-[var(--text-4)] transition hover:text-[var(--brand-700)]"
                  title={`${link.label} — ${link.url}`}
                >
                  <ArrowTopRightOnSquareIcon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{link.label}</span>
                </a>
              ))}
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
  variant = "row",
  largeMark = false,
}: {
  /** row: a compact line in a long list. tile: a large card that fills its share of the column. */
  variant?: "row" | "tile";
  /** A lone design's tile is tall enough for the big mark; smaller tiles keep the 36px one. */
  largeMark?: boolean;
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


  return (
    <>
      <article
        className={cn(
          "group relative cursor-pointer rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] transition-all hover:border-[var(--brand-400)] hover:shadow-sm",
          variant === "tile" ? "flex min-h-[88px] flex-col overflow-hidden" : "flex flex-row items-center gap-3 px-3 py-3",
        )}
        onClick={() =>
          design.url
            ? window.open(design.url, "_blank", "noopener,noreferrer")
            : setEditing(true)
        }
      >
        {variant === "tile" ? (
          // The preview fills the tile; without one, the tool's official mark sits in the middle.
          <div className="relative flex min-h-[24px] flex-1 items-center justify-center overflow-hidden border-b border-[var(--border-3)] bg-[var(--surface-1)]">
            {design.previewImageUrl && /^https:\/\//i.test(design.previewImageUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={design.previewImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
            ) : (
              <PlatformMark url={design.url} size={largeMark ? "lg" : "md"} />
            )}
          </div>
        ) : (
          /* The design tool's official mark (Figma, Miro …), or a generic icon. */
          <PlatformMark url={design.url} />
        )}

        <div className={cn("flex min-w-0 flex-1 items-center gap-3", variant === "tile" && "flex-none px-3 py-2.5")}>
        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-[var(--text-1)]" title={design.name}>{design.name}</p>
          {design.url && (
            <p className="truncate text-[11px] text-[var(--text-4)] leading-tight mt-0.5" title={design.url}>
              {design.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </p>
          )}
          {design.notes && (
            <p className="mt-0.5 truncate text-[11px] text-[var(--text-3)]" title={design.notes}>{design.notes}</p>
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
            disabled={deletingId === design.id}
            className="rounded-[6px] p-1.5 text-[var(--text-4)] hover:bg-red-50 hover:text-red-600 transition"
            title="Delete"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </div>
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

/**
 * Product-team multi-select for the Edit-client modal. Shows the chosen Gitwork
 * leads as removable chips + a searchable "+ Add" dropdown (not a wall of every
 * member). Selection order is preserved. These surface as the "Product" avatars
 * on the client wiki header.
 */
function ProductTeamField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const membersQuery = useTeamMembers();
  const members = membersQuery.data?.members ?? [];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const byId = new Map(members.map((m) => [m.userId, m] as const));
  const label = (id: string) => {
    const m = byId.get(id);
    return m ? m.name?.trim() || m.email : id;
  };
  const q = query.trim().toLowerCase();
  const available = members.filter(
    (m) => !value.includes(m.userId) && (!q || (m.name ?? m.email).toLowerCase().includes(q)),
  );

  return (
    <div>
      <span className="app-field-label">Product team (wiki)</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-50)] py-1 pl-2.5 pr-1.5 text-[12px] font-medium text-[var(--brand-700)]"
          >
            {label(id)}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== id))}
              aria-label={`Remove ${label(id)}`}
              className="leading-none text-[var(--brand-700)]/60 transition hover:text-[var(--brand-700)]"
            >
              <XMarkIcon className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <div ref={ref} className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--border-2)] px-2.5 py-1 text-[12px] text-[var(--text-3)] transition hover:border-[var(--brand-500)] hover:text-[var(--text-1)]"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add
          </button>
          {open && (
            <div className="absolute left-0 top-full z-50 mt-1.5 w-60 overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.1)] bg-white shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)]">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search members…"
                className="w-full border-b border-[var(--border-1)] px-3 py-2 text-[13px] outline-none"
              />
              <div className="max-h-56 overflow-y-auto py-1">
                {membersQuery.isLoading ? (
                  <p className="px-3 py-2 text-[12px] text-[var(--text-4)]">Loading…</p>
                ) : available.length === 0 ? (
                  <p className="px-3 py-2 text-[12px] text-[var(--text-4)]">
                    {q ? "No matches." : "Everyone's added."}
                  </p>
                ) : (
                  available.map((m) => (
                    <button
                      key={m.userId}
                      type="button"
                      onClick={() => {
                        onChange([...value, m.userId]);
                        setQuery("");
                      }}
                      className="block w-full px-3 py-2 text-left text-[13px] text-[var(--text-2)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                    >
                      {m.name?.trim() || m.email}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-[var(--text-4)]">
        Shown as the &ldquo;Product&rdquo; avatars on this client&apos;s wiki header. Order preserved.
      </p>
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
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close"
        className="app-dialog-backdrop absolute inset-0"
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="app-dialog-panel app-dialog-fixed flex w-full max-w-3xl flex-col overflow-hidden">
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

                  {/* Engagement structure + project end date. */}
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="app-field-label">Engagement type</span>
                      <select
                        value={form.engagementType}
                        onChange={(e) =>
                          onChange({
                            ...form,
                            engagementType: e.target.value as ClientEngagementType | "",
                          })
                        }
                        className="app-select w-full"
                      >
                        <option value="">— Unset —</option>
                        <option value="FIXED_SCOPE">Fixed scope</option>
                        <option value="PHASED">Phased</option>
                        <option value="ROLLING">Rolling</option>
                        <option value="RETAINER">Retainer</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="app-field-label">End date</span>
                      <DatePicker value={form.endDate} onChange={(next) => set("endDate", next)} />
                    </label>
                  </div>

                  {/* Product team — Gitwork leads shown on the client wiki header. */}
                  <ProductTeamField
                    value={form.productTeamUserIds}
                    onChange={(ids) => onChange({ ...form, productTeamUserIds: ids })}
                  />
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

/**
 * The Documents card's two tabs, in the header band: Foundry documents and links, or the
 * client's Google Drive folder. Mono caps, like the band they sit in; the linked count rides
 * on its own tab so the band stays one 36px line.
 */
function DocsTabs({
  value,
  onChange,
  linkedCount,
}: {
  value: "docs" | "drive";
  onChange: (v: "docs" | "drive") => void;
  linkedCount: number;
}) {
  const tab = (v: "docs" | "drive", label: string) => {
    const on = value === v;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={on}
        onClick={() => onChange(v)}
        className={`rounded-[4px] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors ${
          on ? "bg-[var(--surface-brand)] text-[var(--brand-700)]" : "text-[var(--text-3)] hover:text-[var(--text-1)]"
        }`}
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {label}
      </button>
    );
  };
  return (
    <div role="tablist" aria-label="Documents or Drive" className="flex shrink-0 items-center gap-0.5" data-docs-tabs>
      {tab("docs", `Linked ${linkedCount}`)}
      {tab("drive", "Drive")}
    </div>
  );
}
