"use client";

import {
  ChatBubbleLeftRightIcon,
  ClipboardDocumentIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  useClientList,
  useCreateClient,
  useCreateOnboardingLink,
  useDeleteClient,
  useDeleteOnboardingLink,
  useOnboardingLinks,
} from "@/hooks/use-proposals";
import { useOnboardingForms } from "@/hooks/use-onboarding-forms";
import { usePermissions } from "@/hooks/use-permissions";
import { cn, formatDate } from "@/lib/format";
import type { ClientListItem } from "@/types/client";
import type { OnboardingLinkRecord } from "@/lib/api";

type Tab = "active" | "pending" | "onboarding";

/** Format a whole-currency amount, e.g. 6200 USD → "$6,200". Falls back to "6200 USD". */
/** Live preview of the channel name as the operator types — matches the slug
 *  rules in slack/provisioning.ts (lowercase, dashes only). */
function slugifyForPreview(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

// ---------------------------------------------------------------------------
// DeleteButton — floating popover, matches platform-wide pattern
// ---------------------------------------------------------------------------
function DeleteButton({ clientSlug }: { clientSlug: string }) {
  const [open, setOpen] = useState(false);
  const { mutateAsync, isPending } = useDeleteClient();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, right: 0 });

  const close = useCallback(() => setOpen(false), []);

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({ top: rect.top, right: window.innerWidth - rect.right });
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        popoverRef.current && !popoverRef.current.contains(target) &&
        triggerRef.current && !triggerRef.current.contains(target)
      ) close();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    await mutateAsync(clientSlug);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className={cn(
          "rounded-[6px] p-1.5 transition-all",
          open
            ? "bg-red-100 text-red-600"
            // Visible on touch devices; hover-reveal on desktop (sm+).
            : "text-[var(--text-4)] hover:bg-red-50 hover:text-red-500 opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
        )}
        title="Delete client"
      >
        <TrashIcon className="h-3.5 w-3.5" />
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: "fixed",
            top: coords.top,
            right: coords.right,
            transform: "translateY(calc(-100% - 8px))",
          }}
          className="z-[9999] w-44 rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white p-3 shadow-xl"
        >
          <div className="absolute -bottom-1.5 right-3 h-3 w-3 rotate-45 border-b border-r border-[rgba(0,0,0,0.08)] bg-white" />
          <p className="mb-2.5 text-xs font-medium text-[var(--text-1)]">Delete this client?</p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="flex-1 rounded-[6px] bg-red-600 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition"
            >
              {isPending ? "Deleting…" : "Delete"}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); close(); }}
              className="flex-1 rounded-[6px] border border-[rgba(0,0,0,0.14)] py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-1)] transition"
            >
              Cancel
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// GitHub helpers
// ---------------------------------------------------------------------------

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function parseRepoName(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}/${parts[1].replace(/\.git$/, "")}`;
    return parts[0] ?? url;
  } catch {
    return url;
  }
}

function GitHubRepoButton({ repoUrls }: { repoUrls: string[] }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, right: 0 });
  const close = useCallback(() => setOpen(false), []);

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({ top: rect.top, right: window.innerWidth - rect.right });
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (
        popoverRef.current && !popoverRef.current.contains(t) &&
        triggerRef.current && !triggerRef.current.contains(t)
      ) close();
    }
    function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") close(); }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        title={`${repoUrls.length} GitHub repositories`}
        className={cn(
          "opacity-40 hover:opacity-70 transition-opacity",
          open && "opacity-90",
        )}
      >
        <GitHubIcon className="h-3.5 w-3.5 text-[var(--text-3)]" />
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: "fixed",
            top: coords.top,
            right: coords.right,
            transform: "translateY(calc(-100% - 8px))",
          }}
          className="z-[9999] w-64 overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white shadow-xl"
        >
          {/* Arrow */}
          <div className="absolute -bottom-1.5 right-3 h-3 w-3 rotate-45 border-b border-r border-[rgba(0,0,0,0.08)] bg-white" />
          {/* Header */}
          <div className="border-b border-[rgba(0,0,0,0.06)] px-4 py-2.5">
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {repoUrls.length} Repositories
            </p>
          </div>
          {/* Repo list */}
          <div className="divide-y divide-[rgba(0,0,0,0.05)]">
            {repoUrls.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-1)] transition-colors"
              >
                <GitHubIcon className="h-4 w-4 shrink-0 text-[var(--text-3)]" />
                <span className="flex-1 truncate text-sm text-[var(--text-1)]">
                  {parseRepoName(url)}
                </span>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-3.5 w-3.5 shrink-0 text-[var(--text-4)]"
                >
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6m0 0v6m0-6L10 14" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// ClientCard — card-based representation of a single client
// ---------------------------------------------------------------------------
function ClientCard({ client }: { client: ClientListItem }) {
  const router = useRouter();
  const { canViewClientFinancials } = usePermissions();
  const devCount = client.devCount ?? 0;

  return (
    <article
      className="widget-card group cursor-pointer transition-shadow hover:shadow-[rgba(0,0,0,0.04)_0px_2px_8px]"
      onClick={() => router.push(`/app/portal/${client.slug}`)}
    >
      {/* Widget header */}
      <div className="widget-header">
        <span className="widget-header__label">
          {client.source === "SUGGESTED" ? (
            <span className="flex items-center gap-1">
              <SparklesIcon className="h-3 w-3 text-[var(--brand-700)]" />
              SUGGESTED
            </span>
          ) : (
            "CLIENT"
          )}
        </span>
        {/* Drive + ClickUp quick-links — right-aligned, no trash here */}
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {client.googleDriveFolderUrl && (
            <a
              href={client.googleDriveFolderUrl}
              target="_blank"
              rel="noreferrer"
              title="Google Drive"
              className="opacity-40 hover:opacity-70 transition-opacity"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://www.google.com/s2/favicons?domain=drive.google.com&sz=16"
                alt="Google Drive"
                className="h-3.5 w-3.5 grayscale"
              />
            </a>
          )}
          {client.clickupUrl && (
            <a
              href={client.clickupUrl}
              target="_blank"
              rel="noreferrer"
              title="ClickUp"
              className="opacity-40 hover:opacity-70 transition-opacity"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://www.google.com/s2/favicons?domain=app.clickup.com&sz=16"
                alt="ClickUp"
                className="h-3.5 w-3.5 grayscale"
              />
            </a>
          )}
          {client.hasCareClient && (
            <Link
              href="/app/care"
              title="Connected to Care"
              className="opacity-40 hover:opacity-70 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <ChatBubbleLeftRightIcon className="h-3.5 w-3.5 text-[var(--text-3)]" />
            </Link>
          )}
          {client.repoUrls?.length === 1 && (
            <a
              href={client.repoUrls[0]}
              target="_blank"
              rel="noreferrer"
              title="GitHub repository"
              className="opacity-40 hover:opacity-70 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <GitHubIcon className="h-3.5 w-3.5 text-[var(--text-3)]" />
            </a>
          )}
          {(client.repoUrls?.length ?? 0) > 1 && (
            <GitHubRepoButton repoUrls={client.repoUrls} />
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-4 p-4">
        {/* Avatar + name + trash (appears on hover) */}
        <div className="flex items-center gap-3">
          {client.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={client.logoUrl}
              alt={`${client.name} logo`}
              className="h-10 w-10 shrink-0 rounded-[6px] border border-[rgba(0,0,0,0.08)] object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] border border-[rgba(0,0,0,0.08)] bg-[var(--surface-1)]">
              <span className="text-sm font-semibold text-[var(--text-2)]">
                {client.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <p className="flex-1 truncate font-semibold leading-snug text-[var(--text-1)]">
            {client.name}
          </p>
          <div onClick={(e) => e.stopPropagation()}>
            <DeleteButton clientSlug={client.slug} />
          </div>
        </div>

        {/* Stat + timestamp */}
        <div className="flex items-end justify-between border-t border-[rgba(0,0,0,0.06)] pt-3">
          {client.proposalCount > 0 ? (
            <div>
              <p
                className="text-3xl leading-none tracking-tight text-[var(--text-1)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {client.proposalCount}
              </p>
              <p className="widget-data-label mt-1">
                {client.proposalCount === 1 ? "doc" : "docs"}
              </p>
            </div>
          ) : (
            <div>
              <p
                className="text-3xl leading-none tracking-tight text-[var(--text-4)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                —
              </p>
              <p className="widget-data-label mt-1 opacity-50">no docs yet</p>
            </div>
          )}
          <p className="widget-timestamp text-right">
            {formatDate(client.createdAt)}
          </p>
        </div>

        {/* Metrics strip — fixed slots so each metric keeps its place: Devs (left) ·
            cost/rates (centre) · days (right). The centre auto-sizes between two equal
            flex columns; a missing metric leaves its slot empty rather than shifting the
            others. Mono-caps per DESIGN.md — counts/units never render as plain sans. */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2">
          {/* Left — dev count (always shown) */}
          <span className="widget-data-label justify-self-start whitespace-nowrap text-[var(--text-2)]">
            {devCount} {devCount === 1 ? "Dev" : "Devs"}
          </span>

          {/* Centre — monthly cost, else "rates n/a" (gated). Empty span still holds the column. */}
          <span className="widget-data-label justify-self-center whitespace-nowrap">
            {canViewClientFinancials && client.monthlyCost && client.monthlyCost.pricedDevs > 0 ? (
              <span className="text-[var(--text-2)]">
                {formatMoney(client.monthlyCost.amount, client.monthlyCost.currency)}/mo
              </span>
            ) : canViewClientFinancials &&
              client.monthlyCost &&
              client.monthlyCost.unpricedDevs > 0 ? (
              "rates n/a"
            ) : null}
          </span>

          {/* Right — retainer "used / allowance", else Gantt working days (gated). */}
          <span className="widget-data-label justify-self-end whitespace-nowrap text-[var(--text-2)]">
            {canViewClientFinancials && typeof client.retainerDays === "number" && client.retainerDays > 0
              ? `${client.retainerDaysUsed ?? 0} / ${client.retainerDays} days`
              : canViewClientFinancials &&
                  typeof client.workingDays === "number" &&
                  client.workingDays > 0
                ? `${client.workingDays} ${client.workingDays === 1 ? "day" : "days"}`
                : null}
          </span>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// TabButton — small pill at the top of the management page
// ---------------------------------------------------------------------------
function TabButton({
  label,
  count,
  active,
  highlight,
  onClick,
}: {
  label: string;
  count: number | null;
  active: boolean;
  highlight?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-xs font-semibold transition",
        active
          ? "bg-[var(--brand-700)] text-white"
          : "text-[var(--text-3)] hover:bg-[var(--surface-1)]",
      )}
    >
      <span>{label}</span>
      {count !== null && (
        <span
          className={cn(
            "min-w-[18px] rounded-full px-1.5 py-0.5 text-[10px] font-bold",
            active
              ? "bg-white/20 text-white"
              : highlight
                ? "bg-[var(--brand-700)] text-white"
                : "bg-[var(--surface-1)] text-[var(--text-4)]",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// OnboardingLinksList — shows IN_PROGRESS / SUBMITTED sessions
// ---------------------------------------------------------------------------
function OnboardingLinksList({ links }: { links: OnboardingLinkRecord[] }) {
  if (!links.length) {
    return (
      <div className="widget-card">
        <div className="widget-body py-20 text-center">
          <p className="text-sm font-medium text-[var(--text-2)]">
            No active onboarding links
          </p>
          <p className="mt-1 text-sm text-[var(--text-4)]">
            Click &ldquo;New onboarding link&rdquo; above to mint one for a new prospect.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      {links.map((link) => (
        <OnboardingLinkRow key={link.id} link={link} />
      ))}
    </div>
  );
}

function OnboardingLinkRow({ link }: { link: OnboardingLinkRecord }) {
  const [copied, setCopied] = useState(false);
  const deleteMutation = useDeleteOnboardingLink();
  const fullUrl = useMemo(() => {
    if (typeof window === "undefined") return `/onboarding/${link.accessToken}`;
    return `${window.location.origin}/onboarding/${link.accessToken}`;
  }, [link.accessToken]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard write blocked — fall back to selecting the input.
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Revoke this onboarding link? The URL will stop working.")) return;
    await deleteMutation.mutateAsync(link.id);
  };

  const company = link.fields.companyName?.trim() || link.label?.trim() || "Unnamed prospect";
  const contactName = [link.fields.contactFirstName, link.fields.contactLastName]
    .filter(Boolean)
    .join(" ");
  const contact = [contactName, link.fields.contactEmail].filter(Boolean).join(" · ");

  return (
    <article className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label">
          {link.status === "SUBMITTED"
            ? "SUBMITTED · AWAITING REVIEW"
            : link.status === "LINKED"
              ? "LINKED"
              : "IN PROGRESS"}
        </span>
        <span className="widget-header__status">
          Step {link.currentStep} · {formatDate(link.updatedAt)}
        </span>
      </div>
      <div className="widget-body--compact space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--text-1)]">
              {company}
            </p>
            {contact && (
              <p className="truncate text-xs text-[var(--text-4)]">{contact}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="rounded-[6px] p-1.5 text-[var(--text-4)] transition hover:bg-red-50 hover:text-red-500"
            title="Revoke link"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2">
          <code className="flex-1 truncate font-mono text-[11px] text-[var(--text-3)]">
            {fullUrl}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="app-button app-button-utility app-button-xs"
            title="Copy URL"
          >
            <ClipboardDocumentIcon className="h-3.5 w-3.5" />
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// ClientManagement — Portal overview
// ---------------------------------------------------------------------------
export function ClientManagement() {
  const router = useRouter();
  const { canManageClients } = usePermissions();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("active");
  const [showCreate, setShowCreate] = useState(false);
  const [showNewLink, setShowNewLink] = useState(false);
  const [clientName, setClientName] = useState("");
  const [createInternalChannel, setCreateInternalChannel] = useState(true);
  const [createExternalChannel, setCreateExternalChannel] = useState(false);
  const [externalInviteeEmail, setExternalInviteeEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const activeQuery = useClientList({ search, status: "ACTIVE" });
  const pendingQuery = useClientList({ search, status: "PENDING_REVIEW" });
  const onboardingQuery = useOnboardingLinks();
  const createClientMutation = useCreateClient();

  // Drive the right list off the active tab.
  const isPending =
    tab === "active"
      ? activeQuery.isPending
      : tab === "pending"
        ? pendingQuery.isPending
        : onboardingQuery.isPending;
  const error =
    tab === "active"
      ? activeQuery.error
      : tab === "pending"
        ? pendingQuery.error
        : onboardingQuery.error;
  const data = tab === "active" ? activeQuery.data : pendingQuery.data;

  const clients = data?.clients ?? [];
  const onboardingLinks = useMemo(
    () => onboardingQuery.data?.links ?? [],
    [onboardingQuery.data?.links],
  );
  const suggestedCount = clients.filter((c) => c.source === "SUGGESTED").length;
  const pendingClients = pendingQuery.data?.clients ?? [];
  const pendingCount = pendingClients.length;
  const openOnboardingCount = useMemo(
    () => onboardingLinks.filter((l) => l.status !== "LINKED").length,
    [onboardingLinks],
  );

  async function handleCreateClient() {
    const trimmed = clientName.trim();
    if (!trimmed) { setFormError("Client name is required."); return; }
    if (createExternalChannel && !externalInviteeEmail.trim()) {
      setFormError("Slack Connect requires the external invitee's email.");
      return;
    }
    setFormError(null);
    try {
      const result = await createClientMutation.mutateAsync({
        name: trimmed,
        createInternalChannel: createInternalChannel || undefined,
        createExternalChannel: createExternalChannel || undefined,
        externalInviteeEmail: createExternalChannel
          ? externalInviteeEmail.trim() || undefined
          : undefined,
      });
      setClientName("");
      setCreateInternalChannel(true);
      setCreateExternalChannel(false);
      setExternalInviteeEmail("");
      setShowCreate(false);
      router.push(`/app/portal/${result.client.slug}`);
    } catch (mutationError) {
      setFormError((mutationError as Error).message);
    }
  }

  return (
    <>
      <div className="space-y-5">

        {/* ── 01 // PORTAL — search + stats ── */}
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">01</span>
              {" // PORTAL"}
            </span>
            {canManageClients ? (
              <Button
                type="button"
                variant="primary"
                size="xs"
                onClick={() => setShowCreate(true)}
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Add client
              </Button>
            ) : null}
          </div>

          <div className="widget-body--compact">
            <div className="flex flex-wrap items-center gap-4">
              {/* Search — fixed width so it doesn't shift when the stats
                  block (active-tab only) appears/disappears between tabs. */}
              <label className="relative w-full sm:w-80">
                <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search clients"
                  className="app-input pl-9"
                  disabled={tab === "onboarding"}
                />
              </label>

              {/* Stats */}
              {!isPending && !error && tab === "active" && (
                <div className="flex items-center gap-5 ml-auto">
                  <div className="text-center">
                    <p
                      className="text-2xl leading-none tracking-tight text-[var(--text-1)]"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {clients.length}
                    </p>
                    <p className="widget-data-label mt-1">total</p>
                  </div>
                  <div className="h-8 w-px bg-[rgba(0,0,0,0.08)]" />
                  <div className="text-center">
                    <p
                      className="text-2xl leading-none tracking-tight text-[var(--text-1)]"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {suggestedCount}
                    </p>
                    <p className="widget-data-label mt-1">suggested</p>
                  </div>
                </div>
              )}
            </div>

            {/* Tab strip */}
            <div className="mt-4 flex items-center gap-1 border-t border-[var(--border-3)] pt-3">
              <TabButton
                active={tab === "active"}
                onClick={() => setTab("active")}
                label="Active"
                count={tab === "active" ? clients.length : null}
              />
              <TabButton
                active={tab === "pending"}
                onClick={() => setTab("pending")}
                label="Pending review"
                count={pendingCount}
                highlight={pendingCount > 0}
              />
              <TabButton
                active={tab === "onboarding"}
                onClick={() => setTab("onboarding")}
                label="Onboarding links"
                count={openOnboardingCount}
              />
              <Button
                type="button"
                variant="secondary"
                size="xs"
                className="ml-auto"
                onClick={() => setShowNewLink(true)}
              >
                <LinkIcon className="h-3.5 w-3.5" />
                Onboarding
              </Button>
            </div>
          </div>
        </section>

        {/* ── Content per tab ── */}
        {isPending ? (
          <div className="widget-card">
            <div className="widget-body py-16 text-center">
              <p className="widget-data-label animate-pulse">Loading…</p>
            </div>
          </div>
        ) : error ? (
          <div className="widget-card">
            <div className="widget-body py-16 text-center">
              <p className="text-sm text-rose-700">{(error as Error).message}</p>
            </div>
          </div>
        ) : tab === "onboarding" ? (
          <OnboardingLinksList links={onboardingLinks} />
        ) : clients.length ? (
          <section className="space-y-3">
            {tab === "active" && (
              <div className="flex items-center gap-2">
                <span className="widget-data-label">Active</span>
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--surface-2)] px-1.5 text-[11px] font-semibold text-[var(--text-3)]">
                  {clients.length}
                </span>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {clients.map((client) => (
                <ClientCard key={client.id} client={client} />
              ))}
            </div>
          </section>
        ) : (
          <div className="widget-card">
            <div className="widget-body py-20 text-center">
              <p className="text-sm font-medium text-[var(--text-2)]">
                {tab === "pending" ? "Nothing waiting for review" : "No clients yet"}
              </p>
              <p className="mt-1 text-sm text-[var(--text-4)]">
                {tab === "pending"
                  ? "Submitted onboardings will show up here for you and Harry to approve."
                  : "Click “Add client” above, or send an onboarding link to a new prospect."}
              </p>
            </div>
          </div>
        )}

        {/* ── Pending review — shown at the bottom of the Active view whenever
            there are submitted onboardings awaiting a move to workflow. ── */}
        {tab === "active" && pendingClients.length > 0 && (
          <section className="space-y-3 pt-1">
            <div className="flex items-center gap-2">
              <span className="widget-data-label">Pending review</span>
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800">
                {pendingClients.length}
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {pendingClients.map((client) => (
                <ClientCard key={client.id} client={client} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ── New onboarding link modal ── */}
      {showNewLink ? (
        <NewOnboardingLinkModal onClose={() => setShowNewLink(false)} />
      ) : null}

      {/* ── Create client modal ── */}
      {showCreate ? (
        <div className="fixed inset-0 z-30">
          <button
            type="button"
            aria-label="Close"
            className="app-dialog-backdrop absolute inset-0"
            onClick={() => { setShowCreate(false); setFormError(null); }}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="app-dialog-panel w-full max-w-md overflow-hidden">
              {/* Modal widget header */}
              <div className="widget-header">
                <span className="widget-header__label">NEW CLIENT</span>
              </div>
              <div className="p-6">
                <h2 className="text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                  Add client
                </h2>
                <div className="mt-5 space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
                      Client name
                    </span>
                    <input
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void handleCreateClient(); }}
                      className="app-input"
                      placeholder="Acme Health"
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                    />
                  </label>
                  {/* Slack channel provisioning — best-effort; Slack failures don't block creation. */}
                  <fieldset className="rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2.5">
                    <legend className="px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
                      Slack channels (optional)
                    </legend>
                    <label className="flex items-start gap-2 py-1 text-sm text-[var(--text-1)]">
                      <input
                        type="checkbox"
                        checked={createInternalChannel}
                        onChange={(e) => setCreateInternalChannel(e.target.checked)}
                        className="mt-0.5 h-4 w-4"
                      />
                      <span>
                        Create internal channel{" "}
                        <code className="rounded bg-white px-1 text-[11px] text-[var(--text-3)]">
                          #client-{clientName.trim() ? slugifyForPreview(clientName) : "{slug}"}-internal
                        </code>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 py-1 text-sm text-[var(--text-1)]">
                      <input
                        type="checkbox"
                        checked={createExternalChannel}
                        onChange={(e) => setCreateExternalChannel(e.target.checked)}
                        className="mt-0.5 h-4 w-4"
                      />
                      <span>
                        Create Slack Connect channel{" "}
                        <code className="rounded bg-white px-1 text-[11px] text-[var(--text-3)]">
                          #client-{clientName.trim() ? slugifyForPreview(clientName) : "{slug}"}
                        </code>
                      </span>
                    </label>
                    {createExternalChannel ? (
                      <input
                        value={externalInviteeEmail}
                        onChange={(e) => setExternalInviteeEmail(e.target.value)}
                        className="app-input mt-2 text-sm"
                        placeholder="client-contact@theirdomain.com"
                        type="email"
                      />
                    ) : null}
                    <p className="mt-1.5 text-[11px] leading-snug text-[var(--text-4)]">
                      If Slack fails, the client is still created — retry from the Edit modal.
                    </p>
                  </fieldset>
                  {formError ? (
                    <p className="text-sm text-rose-700">{formError}</p>
                  ) : null}
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={() => { setShowCreate(false); setFormError(null); }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    loading={createClientMutation.isPending}
                    onClick={() => void handleCreateClient()}
                  >
                    Save client
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// NewOnboardingLinkModal — mint a link + copy the URL
// ---------------------------------------------------------------------------
function NewOnboardingLinkModal({ onClose }: { onClose: () => void }) {
  const [label, setLabel] = useState("");
  const [formId, setFormId] = useState("");
  const [link, setLink] = useState<OnboardingLinkRecord | null>(null);
  const [copied, setCopied] = useState(false);
  const createMutation = useCreateOnboardingLink();
  const formsQuery = useOnboardingForms();
  const forms = formsQuery.data?.forms ?? [];
  const defaultFormName = forms.find((f) => f.isDefault)?.name ?? "Standard onboarding";

  const fullUrl = useMemo(() => {
    if (!link) return "";
    if (typeof window === "undefined") return `/onboarding/${link.accessToken}`;
    return `${window.location.origin}/onboarding/${link.accessToken}`;
  }, [link]);

  const handleCreate = async () => {
    const result = await createMutation.mutateAsync({
      label: label.trim() || undefined,
      formId: formId || undefined,
    });
    setLink(result.link);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard write blocked — user can select the input manually.
    }
  };

  return (
    <div className="fixed inset-0 z-30">
      <button
        type="button"
        aria-label="Close"
        className="app-dialog-backdrop absolute inset-0"
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="app-dialog-panel w-full max-w-md overflow-hidden">
          <div className="widget-header">
            <span className="widget-header__label">NEW ONBOARDING LINK</span>
          </div>
          <div className="p-6">
            {!link ? (
              <>
                <h2 className="text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                  Mint an onboarding link
                </h2>
                <p className="mt-1 text-sm text-[var(--text-3)]">
                  We&apos;ll generate a private URL you can send to the client. Their answers
                  will appear here under <em>Pending review</em> when they submit.
                </p>
                <div className="mt-5 space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
                      Onboarding form
                    </span>
                    <select
                      value={formId}
                      onChange={(e) => setFormId(e.target.value)}
                      className="app-input"
                    >
                      <option value="">{defaultFormName} (default)</option>
                      {forms
                        .filter((f) => !f.isDefault)
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                    </select>
                    <span className="app-field-hint mt-1">
                      Edit forms in Settings → Onboarding.
                    </span>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
                      Label <span className="text-[var(--text-4)]">(optional)</span>
                    </span>
                    <input
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
                      className="app-input"
                      placeholder="Acme — Tuesday call"
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                    />
                    <span className="app-field-hint mt-1">
                      Only you see this. Helps you remember which link you sent where.
                    </span>
                  </label>
                  {createMutation.error ? (
                    <p className="text-sm text-rose-700">
                      {(createMutation.error as Error).message}
                    </p>
                  ) : null}
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <Button type="button" variant="secondary" size="md" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    loading={createMutation.isPending}
                    onClick={() => void handleCreate()}
                  >
                    Create link
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                  Link ready
                </h2>
                <p className="mt-1 text-sm text-[var(--text-3)]">
                  Send this to the client. They can come back to it any time before you
                  move them to workflow.
                </p>

                {link.label ? (
                  <div className="mt-5">
                    <span className="widget-data-label">Label</span>
                    <p className="mt-1 text-sm font-medium text-[var(--text-1)]">
                      {link.label}
                    </p>
                  </div>
                ) : null}

                <div className="mt-4">
                  <span className="widget-data-label">Onboarding link</span>
                  <div className="mt-1 flex items-center gap-2 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2">
                    <code className="flex-1 truncate font-mono text-[12px] text-[var(--text-2)]">
                      {fullUrl}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="app-button app-button-utility app-button-xs"
                    >
                      <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between gap-2">
                  <a
                    href={fullUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="app-button app-button-tertiary app-button-sm"
                  >
                    <LinkIcon className="h-4 w-4" />
                    Preview
                  </a>
                  <Button type="button" variant="primary" size="md" onClick={onClose}>
                    Done
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
