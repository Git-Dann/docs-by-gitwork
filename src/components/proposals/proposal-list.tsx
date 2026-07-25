"use client";

import {
  ArchiveBoxIcon,
  ArrowUturnLeftIcon,
  ChartBarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentDuplicateIcon,
  DocumentPlusIcon,
  DocumentTextIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusIcon,
  PresentationChartLineIcon,
  RectangleStackIcon,
  SparklesIcon,
  Squares2X2Icon,
  StarIcon,
  TableCellsIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { buttonStyles } from "@/components/ui/button-styles";
import { Modal } from "@/components/ui/modal";
import { cn, formatDate, statusLabel } from "@/lib/format";
import {
  useArchiveProposal,
  useClientList,
  useCreateProposal,
  useDeleteProposal,
  useDuplicateProposal,
  useProposalList,
  useToggleProposalFavorite,
} from "@/hooks/use-proposals";
import type { ProposalListItem } from "@/types/proposal";
import { usePermissions } from "@/hooks/use-permissions";
import { allowedDocTypes } from "@/lib/templates";
import { deckHref, deckTemplateBySlug } from "@/lib/deck-templates";

/**
 * Where a document opens. Everything goes to the Docs editor except a DECK,
 * which has no sections to render there — it opens in the Deck window, which is
 * the thing that can actually edit slides. `target="_blank"` is applied at each
 * call site via `docLinkTarget`.
 */
function docHref(doc: { id: string; documentType?: string | null }): string {
  return doc.documentType === "DECK" ? deckHref(doc.id) : `/app/docs/${doc.id}`;
}
/** Decks open in their own window; everything else navigates in place. */
function docLinkTarget(doc: { documentType?: string | null }) {
  return doc.documentType === "DECK"
    ? { target: "_blank" as const, rel: "noopener" }
    : {};
}
import { StatusBadge } from "@/components/status-badge";
import { TemplateGallery } from "@/components/proposals/template-gallery";
import type { DocumentType } from "@/types/proposal";

const statusOptions = [
  "ALL",
  "DRAFT",
  "PRODUCT_SIGN_OFF",
  "TECH_SIGN_OFF",
  "IN_REVIEW",
  "APPROVED",
  "ARCHIVED",
] as const;

const sortOptions = [
  { label: "Last updated", value: "updatedAt:desc" },
  { label: "Oldest updated", value: "updatedAt:asc" },
  { label: "Title A-Z", value: "title:asc" },
  { label: "Title Z-A", value: "title:desc" },
] as const;

const rowsPerPageOptions = [10, 20, 50] as const;

// Per-type labels used in the create modal — keeps the type picker and form copy in sync.
const LABEL_BY_TYPE: Record<DocumentType, string> = {
  PROPOSAL: "Proposal",
  SLA: "Service Level Agreement",
  SOW: "Statement of Work",
  MSA: "Master Service Agreement",
  NDA: "Non-Disclosure Agreement",
  CO: "Change Order",
  DSA: "Data Sharing Agreement",
  HANDOVER: "Handover",
  REPORT: "Status Report",
  BRIEF: "Brief",
  DECK: "Deck",
  OTHER: "Document",
};
const DEFAULT_TITLE_BY_TYPE: Record<DocumentType, string> = {
  PROPOSAL: "Untitled Proposal",
  SLA: "Untitled SLA",
  SOW: "Untitled SOW",
  MSA: "Untitled MSA",
  NDA: "Untitled NDA",
  CO: "Untitled Change Order",
  DSA: "Untitled Data Sharing Agreement",
  HANDOVER: "Project Handover",
  REPORT: "Status Report",
  BRIEF: "Untitled Brief",
  DECK: "Untitled Deck",
  OTHER: "Untitled Document",
};
const PLACEHOLDER_BY_TYPE: Record<DocumentType, string> = {
  PROPOSAL: "Q2 Renewal Proposal",
  SLA: "Acme — Production Hosting SLA",
  SOW: "Acme — Phase 2 Discovery SOW",
  MSA: "Acme — Master Service Agreement",
  NDA: "Acme — Mutual NDA",
  CO: "Acme — Change Order #1",
  DSA: "Acme — Data Sharing Agreement",
  HANDOVER: "Acme — Project Handover",
  REPORT: "Acme — June Status Report",
  BRIEF: "Acme — Kickoff Brief",
  DECK: "Acme — Pitch Deck",
  OTHER: "Acme — Briefing Note",
};

export function ProposalList() {
  const router = useRouter();
  const { canManageDocs, canViewAdminDocTypes } = usePermissions();
  const allowedTypeSet = useMemo(
    () => new Set<string>(allowedDocTypes(canViewAdminDocTypes)),
    [canViewAdminDocTypes],
  );
  const searchParams = useSearchParams();
  const clientFilter = searchParams.get("client")?.trim() ?? "";
  const openCreate = searchParams.get("new") === "1";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("ALL");
  const [sort, setSort] = useState<(typeof sortOptions)[number]["value"]>("updatedAt:desc");
  const [rowsPerPage, setRowsPerPage] = useState<(typeof rowsPerPageOptions)[number]>(10);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: "",
    clientName: "",
    clientId: undefined as string | undefined,
    documentType: "PROPOSAL" as DocumentType,
    templateId: null as string | null,
    // DECK only — the starting deck to materialise, by slug. Stored on the new
    // document's metadata; Deck builds the slides on first open.
    deckTemplate: null as string | null,
  });

  useEffect(() => {
    setSearch(clientFilter);
    setForm((previous) => ({
      ...previous,
      clientName: clientFilter,
      clientId: undefined,
    }));
  }, [clientFilter]);

  useEffect(() => {
    if (openCreate) {
      setShowCreate(true);
    }
  }, [openCreate]);

  const queryClient = useQueryClient();
  const { data, isPending, error } = useProposalList({
    search,
    sort,
    // Fetch every type the viewer is allowed to see (server scopes by role). Status/scope/type
    // are filtered client-side so the collections rail can show live counts without refetching,
    // and so archived/favourite scopes stay in sync with the visible set. This is also what
    // surfaces the lightweight docs (handover/report/…), which the old PROPOSAL-only default hid.
    documentType: "ALL",
  });
  const clientsQuery = useClientList();
  const createMutation = useCreateProposal();
  const duplicateMutation = useDuplicateProposal();
  const archiveMutation = useArchiveProposal();
  const deleteMutation = useDeleteProposal();
  const favoriteMutation = useToggleProposalFavorite();

  const proposals = useMemo(() => data?.proposals ?? [], [data?.proposals]);

  // Collections rail scope — the primary left-rail selector. `all`/`favorites` exclude archived;
  // `archived` shows only archived. Drives the card grid, table, and grouped views alike.
  const [scope, setScope] = useState<"all" | "favorites" | "archived">("all");
  // Doc-type filter (rail's TYPE list). Scopes the visible set to one document type.
  const [docTypeFilter, setDocTypeFilter] = useState<DocumentType | "ALL">("ALL");

  // Partition the full fetched set once: archived vs live, and favourites within live. The rail
  // counts read straight off these so they never lie when a filter is applied.
  const liveDocs = useMemo(() => proposals.filter((p) => p.status !== "ARCHIVED"), [proposals]);
  const archivedDocs = useMemo(
    () => proposals.filter((p) => p.status === "ARCHIVED"),
    [proposals],
  );
  const favoriteDocs = useMemo(() => liveDocs.filter((p) => p.isFavorite), [liveDocs]);

  const scopeDocs =
    scope === "archived" ? archivedDocs : scope === "favorites" ? favoriteDocs : liveDocs;

  // Per-type counts for the rail's TYPE list — over the current scope's non-archived universe so
  // the chips reflect what selecting them would show.
  const docTypeCounts = useMemo(() => {
    const base = scope === "archived" ? archivedDocs : liveDocs;
    return base.reduce<Record<string, number>>((acc, p) => {
      const type = p.documentType ?? "OTHER";
      acc[type] = (acc[type] ?? 0) + 1;
      return acc;
    }, {});
  }, [scope, archivedDocs, liveDocs]);

  // scope → type → status refine (the Filters dropdown, optional; ARCHIVED owned by scope).
  const filteredProposals = useMemo(() => {
    let list = scopeDocs;
    if (docTypeFilter !== "ALL") {
      list = list.filter((p) => (p.documentType as DocumentType) === docTypeFilter);
    }
    if (status !== "ALL" && scope !== "archived") {
      list = list.filter((p) => p.status === status);
    }
    return list;
  }, [scopeDocs, docTypeFilter, status, scope]);

  const totalPages = Math.max(1, Math.ceil(filteredProposals.length / rowsPerPage));
  const currentPage = Math.min(page, totalPages);
  const pagedProposals = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredProposals.slice(start, start + rowsPerPage);
  }, [currentPage, filteredProposals, rowsPerPage]);

  const allOnPageSelected =
    pagedProposals.length > 0 && pagedProposals.every((proposal) => selectedIds.includes(proposal.id));

  const [bulkBusy, setBulkBusy] = useState<null | "archive" | "unarchive" | "revoke-share" | "delete">(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "table" | "grouped">("cards");

  // Onboarding hero — shown only when the workspace has zero docs ever AND the user hasn't
  // dismissed it. Lives in localStorage so it doesn't repeat across sessions.
  const [onboardingDismissed, setOnboardingDismissed] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setOnboardingDismissed(window.localStorage.getItem("gitwork.docs.onboarding-seen") === "1");
  }, []);
  function dismissOnboarding() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("gitwork.docs.onboarding-seen", "1");
    }
    setOnboardingDismissed(true);
  }

  async function runBulkAction(action: "archive" | "unarchive" | "revoke-share" | "delete") {
    if (selectedIds.length === 0 || bulkBusy) return;
    if (action === "delete" && !confirm(`Permanently delete ${selectedIds.length} documents? This cannot be undone.`)) {
      return;
    }
    setBulkBusy(action);
    setBulkError(null);
    try {
      const res = await fetch("/api/proposals/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Bulk action failed");
      // Clear selection + invalidate the list query so it re-fetches in place — no full-page
      // reload (which dropped scroll position and felt jarring).
      setSelectedIds([]);
      await queryClient.invalidateQueries({ queryKey: ["proposals"] });
    } catch (err) {
      setBulkError((err as Error).message);
    } finally {
      setBulkBusy(null);
    }
  }

  // Restore a single archived doc — reuses the bulk endpoint's "unarchive" action for one id.
  async function restoreOne(id: string) {
    try {
      const res = await fetch("/api/proposals/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id], action: "unarchive" }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Restore failed");
      await queryClient.invalidateQueries({ queryKey: ["proposals"] });
    } catch (err) {
      setBulkError((err as Error).message);
    }
  }

  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
  }, [search, status, sort, rowsPerPage, docTypeFilter, scope]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  async function handleCreate() {
    const isDeck = form.documentType === "DECK";
    const created = await createMutation.mutateAsync({
      title: form.title || DEFAULT_TITLE_BY_TYPE[form.documentType],
      clientName: form.clientName || undefined,
      clientId: form.clientId,
      documentType: form.documentType,
      templateId: form.templateId ?? undefined,
      // The chosen deck rides along as metadata; the Deck app materialises it.
      deckTemplate: isDeck ? form.deckTemplate ?? undefined : undefined,
    });

    setShowCreate(false);
    setForm({
      title: "",
      clientName: "",
      clientId: undefined,
      documentType: "PROPOSAL",
      templateId: null,
      deckTemplate: null,
    });

    // A deck is edited in the Deck window, not the Docs editor — open it there
    // and leave the library where it was, so closing the tab lands you back on
    // the list rather than on an editor that cannot render slides.
    if (isDeck) {
      window.open(deckHref(created.proposal.id), "_blank", "noopener");
      return;
    }
    router.push(`/app/docs/${created.proposal.id}`);
  }

  function closeCreate() {
    setShowCreate(false);
    setForm({
      title: "",
      clientName: "",
      clientId: undefined,
      documentType: "PROPOSAL",
      templateId: null,
      deckTemplate: null,
    });
  }

  const totalCount = proposals.length;
  const liveCount = liveDocs.length;
  const favoriteCount = favoriteDocs.length;
  const archivedCount = archivedDocs.length;

  const isWorkspaceEmpty = !isPending && totalCount === 0 && search === "" && scope === "all";
  const showOnboarding = isWorkspaceEmpty && !onboardingDismissed;

  return (
    <div className="flex h-full min-h-0 flex-col gap-8">
      {showOnboarding ? (
        <section className="widget-card overflow-hidden">
          <div className="widget-header">
            <span className="widget-header-label">WELCOME TO DOCS</span>
            <button
              type="button"
              onClick={dismissOnboarding}
              aria-label="Dismiss onboarding"
              className="text-[var(--text-4)] transition hover:text-[var(--text-1)]"
            >
              <XMarkIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="p-6 sm:p-8">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-[var(--brand-700)]">
              FIRST TIME HERE?
            </p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-[32px] font-normal leading-[1.1] tracking-[-0.5px] text-[var(--text-1)]">
              Your agency document library, ready to ship.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--text-3)]">
              Seven Gitwork-grade stock templates ship with the workspace &mdash; proposals, SLAs,
              SOWs, MSAs, NDAs, change orders, and data sharing agreements. Pick one, drop the
              client name, and you&rsquo;ve got a doc ready to share or send for signature.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <OnboardingStep
                num="01"
                icon={<Squares2X2Icon className="h-4 w-4" />}
                title="Pick a template"
                body="Every doc type ships with a starter — proposals, SLAs, SOWs, and more. Duplicate any to make a workspace-owned variant in Settings → Templates."
              />
              <OnboardingStep
                num="02"
                icon={<SparklesIcon className="h-4 w-4" />}
                title="Talk to the AI"
                body="Ask for a full draft or rewrite individual sections. Every change shows as a diff &mdash; accept what you want, reject the rest."
              />
              <OnboardingStep
                num="03"
                icon={<DocumentPlusIcon className="h-4 w-4" />}
                title="Share and sign"
                body="Token-gated share links, e-signature with audit trail, branded PDF export. No DocuSign required."
              />
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {canManageDocs ? (
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={() => setShowCreate(true)}
                  leadingIcon={<PlusIcon className="h-4 w-4" />}
                >
                  Create your first document
                </Button>
              ) : null}
              <button
                type="button"
                onClick={dismissOnboarding}
                className="text-sm font-medium text-[var(--text-4)] hover:text-[var(--text-2)]"
              >
                I&rsquo;ll explore on my own
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="widget-card flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="widget-header">
          <span className="widget-header-label">01 // DOCUMENT LIBRARY</span>
          <span className="widget-header-right">
            {liveCount} DOCS · {favoriteCount} FAV · {archivedCount} ARCHIVED
          </span>
        </div>

        {/* Toolbar — search · filters · view toggle · actions. The collections rail below owns
            scope + type; this row stays for search, sort/status refine, view mode, and create. */}
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border-2)] px-4 py-4 sm:px-6">
          <label className="relative min-w-[200px] flex-1">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-4)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search documents"
              className="app-input pl-9"
            />
          </label>

          <details className="group relative">
            <summary
              className={buttonStyles({
                variant: "secondary",
                size: "md",
                className: "list-none gap-2 [&::-webkit-details-marker]:hidden",
              })}
            >
              <FunnelIcon className="h-4 w-4" />
              Filters
              <ChevronDownIcon className="h-4 w-4 transition group-open:rotate-180" />
            </summary>

            <div className="absolute right-0 z-20 mt-2 w-[280px] rounded-[10px] border border-[var(--border-2)] bg-white p-4 shadow-[var(--shadow-lg)]">
              <div className="space-y-3">
                <label className="block space-y-1.5">
                  <span className="app-field-label">Status</span>
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value as (typeof statusOptions)[number])}
                    className="app-select-compact"
                    disabled={scope === "archived"}
                  >
                    {/* ARCHIVED is owned by the Archived collection (rail), not this refine. */}
                    {statusOptions
                      .filter((option) => option !== "ARCHIVED")
                      .map((option) => (
                        <option key={option} value={option}>
                          {option === "ALL" ? "All statuses" : statusLabel(option)}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="app-field-label">Sort</span>
                  <select
                    value={sort}
                    onChange={(event) =>
                      setSort(event.target.value as (typeof sortOptions)[number]["value"])
                    }
                    className="app-select-compact"
                  >
                    {sortOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                {clientFilter ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full justify-center"
                    onClick={() => {
                      setSearch("");
                      router.push("/app/docs");
                    }}
                  >
                    Clear client filter
                  </Button>
                ) : null}
              </div>
            </div>
          </details>

          {/* View toggle — Cards (default) · Table · By client. */}
          <div className="inline-flex items-center rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-0.5">
            {([
              ["cards", "Cards", Squares2X2Icon],
              ["table", "Table", TableCellsIcon],
              ["grouped", "By client", RectangleStackIcon],
            ] as const).map(([mode, label, Icon]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                aria-label={label}
                title={label}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] transition",
                  viewMode === mode
                    ? "bg-white text-[var(--text-1)] shadow-[var(--shadow-xs)]"
                    : "text-[var(--text-4)] hover:text-[var(--text-2)]",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {/* Deck — the slide editor (vendor/bento, served at /deck). Its own
                window, not a Docs route: it's a standalone single-file editor
                that takes over the page and saves to a file, not the database. */}
            <a
              href="/deck"
              target="_blank"
              rel="noopener noreferrer"
              title="Deck — build a slide deck in a new window (beta)"
              className={buttonStyles({ variant: "secondary", size: "md" })}
            >
              <PresentationChartLineIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Deck</span>
            </a>
            {/* Cross-doc analytics is proposal/win-rate insight — admin-level, hidden from devs. */}
            {canViewAdminDocTypes ? (
              <Link
                href="/app/docs/analytics"
                className={buttonStyles({ variant: "secondary", size: "md" })}
              >
                <ChartBarIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Analytics</span>
              </Link>
            ) : null}
            {canManageDocs ? (
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => setShowCreate(true)}
                leadingIcon={<PlusIcon className="h-4 w-4" />}
              >
                New
              </Button>
            ) : null}
          </div>
        </div>

        {/* Collections rail + the active view. Rail stacks above the content below lg. */}
        <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[212px_minmax(0,1fr)]">
          <CollectionsRail
            scope={scope}
            onScope={setScope}
            counts={{ all: liveCount, favorites: favoriteCount, archived: archivedCount }}
            docTypeFilter={docTypeFilter}
            onDocType={setDocTypeFilter}
            docTypeCounts={docTypeCounts}
            allowedTypeSet={allowedTypeSet}
          />

          <div className="flex min-h-0 flex-1 flex-col min-w-0 border-t border-[var(--border-2)] lg:border-l lg:border-t-0">
            <div className="min-h-0 flex-1 overflow-auto">
        {viewMode === "cards" ? (
          <DocCardGrid
            proposals={pagedProposals}
            isPending={isPending}
            error={error as Error | null}
            isWorkspaceEmpty={isWorkspaceEmpty}
            canManageDocs={canManageDocs}
            scope={scope}
            onCreate={() => setShowCreate(true)}
            onToggleFavorite={(id, next) => favoriteMutation.mutate({ id, isFavorite: next })}
            onDuplicate={(id) => duplicateMutation.mutate(id)}
            onArchive={(id) => archiveMutation.mutate(id)}
            onRestore={(id) => void restoreOne(id)}
            onDelete={(id) => {
              if (window.confirm("Delete this document permanently?")) deleteMutation.mutate(id);
            }}
            onClearFilters={() => {
              setSearch("");
              setStatus("ALL");
              setDocTypeFilter("ALL");
              setScope("all");
            }}
          />
        ) : viewMode === "grouped" ? (
          <GroupedList
            proposals={filteredProposals}
            selectedIds={selectedIds}
            onToggleSelect={(id) =>
              setSelectedIds((current) =>
                current.includes(id)
                  ? current.filter((entry) => entry !== id)
                  : [...current, id],
              )
            }
          />
        ) : (
        <div className="overflow-x-auto">
          <table className="app-table proposals-table min-w-full">
            <thead>
              <tr>
                <th className="w-[44px]">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setSelectedIds((current) => [
                          ...new Set([...current, ...pagedProposals.map((proposal) => proposal.id)]),
                        ]);
                        return;
                      }

                      setSelectedIds((current) =>
                        current.filter((id) => !pagedProposals.some((proposal) => proposal.id === id)),
                      );
                    }}
                    className="app-checkbox"
                    aria-label="Select all documents on page"
                  />
                </th>
                <th className="text-left">DOCUMENT</th>
                <th className="text-left">STATUS</th>
                <th className="text-left">OWNER</th>
                <th className="text-left">UPDATED</th>
                <th className="text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {isPending ? (
                <tr>
                  <td colSpan={6} className="text-sm text-[var(--text-4)]">
                    Loading documents...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="text-sm text-rose-700">
                    {(error as Error).message}
                  </td>
                </tr>
              ) : pagedProposals.length ? (
                pagedProposals.map((proposal) => {
                  const selected = selectedIds.includes(proposal.id);

                  return (
                    <tr key={proposal.id} className={selected ? "bg-[var(--surface-1)]" : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) => {
                            setSelectedIds((current) =>
                              event.target.checked
                                ? [...current, proposal.id]
                                : current.filter((id) => id !== proposal.id),
                            );
                          }}
                          className="app-checkbox"
                          aria-label={`Select ${proposal.title}`}
                        />
                      </td>
                      <td>
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          {/* Doc-type pill — visible at a glance, distinct colour from labels. */}
                          {proposal.documentType ? (
                            <span className="inline-flex items-center rounded-[4px] bg-[var(--brand-200)] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-700)]">
                              {proposal.documentType === "CO" ? "CO" : proposal.documentType}
                            </span>
                          ) : null}
                          <Link
                            href={docHref(proposal)} {...docLinkTarget(proposal)}
                            className="font-medium text-[var(--text-1)] transition hover:text-[var(--brand-700)]"
                          >
                            {proposal.title}
                          </Link>
                          {proposal.documentNumber ? (
                            <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)]">
                              {proposal.documentNumber}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <p className="text-sm text-[var(--text-3)]">
                            {proposal.clientName || "No client assigned"}
                          </p>
                          {(proposal.labels ?? []).slice(0, 4).map((label) => (
                            <span
                              key={label}
                              className="rounded-[4px] bg-[var(--brand-200)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--brand-700)]"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={proposal.status} />
                      </td>
                      <td className="text-sm text-[var(--text-3)]">{proposal.ownerName || "Unassigned"}</td>
                      <td className="text-sm text-[var(--text-3)]">{formatUpdatedAt(proposal.updatedAt)}</td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={docHref(proposal)} {...docLinkTarget(proposal)}
                            className={buttonStyles({
                              variant: "utility",
                              size: "icon-md",
                              className: "text-[var(--text-3)]",
                            })}
                            aria-label={`Edit ${proposal.title}`}
                            title="Edit"
                          >
                            <PencilSquareIcon className="h-4 w-4" />
                          </Link>
                          {canManageDocs ? (
                            <>
                              <Button
                                type="button"
                                onClick={() => duplicateMutation.mutate(proposal.id)}
                                variant="utility"
                                size="icon-md"
                                aria-label={`Duplicate ${proposal.title}`}
                                title="Duplicate"
                              >
                                <DocumentDuplicateIcon className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                onClick={() => archiveMutation.mutate(proposal.id)}
                                variant="utility"
                                size="icon-md"
                                aria-label={`Archive ${proposal.title}`}
                                title="Archive"
                              >
                                <ArchiveBoxIcon className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                onClick={() => {
                                  if (window.confirm("Delete this proposal permanently?")) {
                                    deleteMutation.mutate(proposal.id);
                                  }
                                }}
                                variant="utility"
                                size="icon-md"
                                className="text-rose-600 hover:text-rose-700"
                                aria-label={`Delete ${proposal.title}`}
                                title="Delete"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-[var(--text-4)]">
                    {isWorkspaceEmpty ? (
                      <div className="mx-auto max-w-md space-y-3">
                        <DocumentPlusIcon className="mx-auto h-8 w-8 text-[var(--text-4)]" />
                        <p className="text-[var(--text-2)]">
                          No documents yet &mdash; click <strong>New</strong> above to spin
                          one up from a template.
                        </p>
                      </div>
                    ) : (
                      <span>
                        No documents match this filter.
                        {search || status !== "ALL" ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSearch("");
                              setStatus("ALL");
                            }}
                            className="ml-2 font-medium text-[var(--brand-700)] hover:underline"
                          >
                            Clear filter
                          </button>
                        ) : null}
                      </span>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}
            </div>

        {viewMode !== "grouped" ? (
        <div className="flex flex-col gap-3 border-t border-[var(--border-2)] px-4 py-3 text-sm text-[var(--text-3)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <span className="text-[var(--border-1)]">|</span>
            <label
              className={cn(
                "flex min-w-[190px] items-center gap-2 whitespace-nowrap",
                proposals.length <= rowsPerPageOptions[0] && "opacity-40",
              )}
            >
              <span className="shrink-0">Rows per page</span>
              <select
                value={rowsPerPage}
                onChange={(event) =>
                  setRowsPerPage(Number(event.target.value) as (typeof rowsPerPageOptions)[number])
                }
                disabled={proposals.length <= rowsPerPageOptions[0]}
                className="app-select-compact min-w-[96px]"
              >
                {rowsPerPageOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={currentPage === 1}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-[6px] border border-[var(--border-2)] bg-white text-[var(--text-3)] shadow-[var(--shadow-xs)] transition",
                currentPage === 1 ? "cursor-not-allowed opacity-40" : "hover:bg-[var(--surface-1)]",
              )}
              aria-label="Previous page"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>

            {buildPageItems(totalPages, currentPage).map((item, index) =>
              item === "ellipsis" ? (
                <span key={`${item}-${index}`} className="px-1 text-[var(--text-4)]">
                  ...
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPage(item)}
                  className={cn(
                    "inline-flex h-9 min-w-9 items-center justify-center rounded-[6px] px-2 text-sm transition",
                    item === currentPage
                      ? "border border-[var(--border-2)] bg-[var(--surface-1)] font-medium text-[var(--text-1)]"
                      : "text-[var(--text-3)] hover:bg-[var(--surface-1)]",
                  )}
                >
                  {item}
                </button>
              ),
            )}

            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={currentPage === totalPages}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-[6px] border border-[var(--border-2)] bg-white text-[var(--text-3)] shadow-[var(--shadow-xs)] transition",
                currentPage === totalPages ? "cursor-not-allowed opacity-40" : "hover:bg-[var(--surface-1)]",
              )}
              aria-label="Next page"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
        ) : null}
          </div>
        </div>
      </section>

      {/* Proof drafts widget removed — the surface lived here while Proof was a separate
          product, but it cluttered the docs dashboard once the agency template library landed.
          Proof drafts still exist server-side; reachable from /app/proof if/when it returns. */}

      <Modal
        open={showCreate}
        onClose={closeCreate}
        panelClassName="flex h-[640px] max-h-[calc(100vh-32px)] w-full max-w-4xl flex-col p-6"
      >
              {/* Compact header — eyebrow + title only, subtitle dropped so the form has room. */}
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="widget-header-label widget-data-label-bright">07 // NEW DOCUMENT</p>
                  <h2 className="mt-2 font-[family-name:var(--font-display)] text-[26px] font-normal leading-[1.15] tracking-[-0.5px] text-[var(--text-1)]">
                    Create document
                  </h2>
                </div>
              </div>

              {/* 2-column body. Left = form fields (always visible), right = template gallery
                  with its own internal scroll so the picker stays focused on the chosen tab. */}
              <div className="mt-5 grid flex-1 gap-5 overflow-hidden md:grid-cols-[300px_minmax(0,1fr)]">
                {/* Left — form */}
                {/* px-1 (not just pr-1): overflow-y-auto forces overflow-x to `auto`, which would
                    clip an input's focus ring at the left/right edge. The side padding gives it room. */}
                <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-1 py-0.5">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
                      {LABEL_BY_TYPE[form.documentType]} title
                    </span>
                    <input
                      value={form.title}
                      onChange={(event) =>
                        setForm((previous) => ({ ...previous, title: event.target.value }))
                      }
                      className="app-input"
                      placeholder={PLACEHOLDER_BY_TYPE[form.documentType]}
                    />
                  </label>

                  <div className="block">
                    <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
                      Client
                    </span>
                    {clientsQuery.data?.clients && clientsQuery.data.clients.length > 0 ? (
                      <div className="space-y-2">
                        <select
                          value={form.clientId ?? ""}
                          onChange={(event) => {
                            const selected = clientsQuery.data?.clients.find(
                              (c) => c.id === event.target.value,
                            );
                            setForm((previous) => ({
                              ...previous,
                              clientId: event.target.value || undefined,
                              clientName: selected?.name ?? previous.clientName,
                            }));
                          }}
                          className="app-select"
                        >
                          <option value="">— Select a client —</option>
                          {clientsQuery.data.clients.map((client) => (
                            <option key={client.id} value={client.id}>
                              {client.name}
                            </option>
                          ))}
                        </select>
                        {!form.clientId && (
                          <input
                            value={form.clientName}
                            onChange={(event) =>
                              setForm((previous) => ({
                                ...previous,
                                clientName: event.target.value,
                              }))
                            }
                            className="app-input"
                            placeholder="Or type a name for a prospect"
                          />
                        )}
                      </div>
                    ) : (
                      <input
                        value={form.clientName}
                        onChange={(event) =>
                          setForm((previous) => ({
                            ...previous,
                            clientName: event.target.value,
                          }))
                        }
                        className="app-input"
                        placeholder="Acme Health"
                      />
                    )}
                  </div>

                  {/* Selected template confirmation — small chip-style summary so the operator
                      doesn't lose track of which template they picked once they scroll the
                      right-hand gallery away from the active row. */}
                  <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                      Template
                    </p>
                    <p className="mt-1 text-sm font-medium text-[var(--text-1)]">
                      {form.documentType === "DECK"
                        ? deckTemplateBySlug(form.deckTemplate)?.name ?? "Pick a deck →"
                        : form.templateId
                          ? LABEL_BY_TYPE[form.documentType]
                          : "Pick a template →"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--text-3)]">
                      {form.documentType === "DECK"
                        ? form.deckTemplate
                          ? "Opens in Deck — slides are created on first open."
                          : "Choose one of the ten decks on the right."
                        : form.templateId
                          ? "Selected — Gitwork defaults pre-filled."
                          : "Browse the gallery on the right."}
                    </p>
                  </div>
                </div>

                {/* Right — gallery. No padding on the scroll container; the gallery handles its
                    own padding so the sticky chip row can flush against the scroll viewport's
                    top edge instead of leaving a 12px gap. */}
                <div className="flex min-h-0 flex-col overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-canvas)]">
                  <div className="border-b border-[var(--border-2)] bg-white px-3 py-2">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                      Template library
                    </p>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <TemplateGallery
                      selectedTemplateId={form.templateId}
                      selectedDeckTemplate={form.deckTemplate}
                      onPick={({ id, documentType, deckTemplate }) =>
                        setForm((previous) => ({
                          ...previous,
                          templateId: id,
                          documentType,
                          // Keep the slug only while DECK is the chosen type, so
                          // switching to a normal doc can't smuggle one through.
                          deckTemplate:
                            documentType === "DECK"
                              ? deckTemplate ?? previous.deckTemplate
                              : null,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Footer — actions pinned at the bottom of the panel, independent of either
                  column's scroll. */}
              <div className="mt-5 flex justify-end gap-2 border-t border-[var(--border-2)] pt-4">
                <Button type="button" onClick={closeCreate} variant="secondary" size="md">
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleCreate()}
                  loading={createMutation.isPending}
                  variant="primary"
                  size="md"
                >
                  Create
                </Button>
              </div>
        </Modal>

      {selectedIds.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-6">
          <div className="widget-card flex w-full max-w-[640px] items-center gap-3 px-4 py-3 shadow-[var(--shadow-lg)]">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-700)]">
              {selectedIds.length} SELECTED
            </span>
            <span className="text-sm text-[var(--text-3)]">·</span>
            <button
              type="button"
              onClick={() => runBulkAction("archive")}
              disabled={bulkBusy !== null}
              className="text-sm font-medium text-[var(--text-2)] hover:text-[var(--text-1)] disabled:opacity-40"
            >
              {bulkBusy === "archive" ? "Archiving…" : "Archive"}
            </button>
            <span className="text-[var(--border-1)]">|</span>
            <button
              type="button"
              onClick={() => runBulkAction("revoke-share")}
              disabled={bulkBusy !== null}
              className="text-sm font-medium text-[var(--text-2)] hover:text-[var(--text-1)] disabled:opacity-40"
            >
              {bulkBusy === "revoke-share" ? "Revoking…" : "Revoke share"}
            </button>
            <span className="text-[var(--border-1)]">|</span>
            <button
              type="button"
              onClick={() => runBulkAction("delete")}
              disabled={bulkBusy !== null}
              className="text-sm font-medium text-rose-600 hover:text-rose-700 disabled:opacity-40"
            >
              {bulkBusy === "delete" ? "Deleting…" : "Delete"}
            </button>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-xs text-[var(--text-4)] hover:text-[var(--text-2)]"
            >
              Clear
            </button>
          </div>
          {bulkError ? (
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 rounded-[6px] bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700">
              {bulkError}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function GroupedList({
  proposals,
  selectedIds,
  onToggleSelect,
}: {
  proposals: Array<{ id: string; title: string; clientName?: string | null; status: string; updatedAt: string; documentNumber?: string | null; documentType?: string }>;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
}) {
  // Per-client folders are capped so a heavy client never renders a wall of rows; the rest are
  // revealed per-folder on demand.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  function toggleGroup(key: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Group docs by clientName; "Unassigned" bucket at the end.
  const groups = new Map<string, typeof proposals>();
  for (const p of proposals) {
    const key = p.clientName?.trim() || "Unassigned";
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }
  // Sort: named clients alphabetical, Unassigned last
  const orderedKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === "Unassigned") return 1;
    if (b === "Unassigned") return -1;
    return a.localeCompare(b);
  });

  if (proposals.length === 0) {
    return (
      <div className="px-6 py-8 text-sm text-[var(--text-4)]">No documents found.</div>
    );
  }

  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      {orderedKeys.map((key) => {
        const docs = groups.get(key)!;
        const expanded = expandedGroups.has(key);
        // Cap each client folder so a heavy client can't render a super-long list — show the
        // first GROUP_CAP, then a "Show all N" expander.
        const visibleDocs = expanded ? docs : docs.slice(0, GROUP_CAP);
        return (
          <div key={key} className="rounded-[10px] border border-[var(--border-2)] bg-white">
            <div className="flex items-baseline justify-between border-b border-[var(--border-3)] px-4 py-3">
              <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-3)]">
                {key}
              </h3>
              <span className="text-xs text-[var(--text-4)]">
                {docs.length} document{docs.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="divide-y divide-[var(--border-3)]">
              {visibleDocs.map((doc) => {
                const checked = selectedIds.includes(doc.id);
                return (
                  <li
                    key={doc.id}
                    className={cn("flex items-center gap-3 px-4 py-3 text-sm", checked && "bg-[var(--surface-1)]")}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleSelect(doc.id)}
                      className="app-checkbox"
                      aria-label={`Select ${doc.title}`}
                    />
                    <Link
                      href={docHref(doc)} {...docLinkTarget(doc)}
                      className="flex-1 truncate font-medium text-[var(--text-1)] transition hover:text-[var(--brand-700)]"
                    >
                      {doc.title}
                    </Link>
                    {doc.documentNumber ? (
                      <span className="hidden font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)] sm:inline">
                        {doc.documentNumber}
                      </span>
                    ) : null}
                    <StatusBadge status={doc.status as never} />
                    <span className="hidden text-xs text-[var(--text-4)] sm:inline">
                      {new Date(doc.updatedAt).toLocaleDateString()}
                    </span>
                  </li>
                );
              })}
            </ul>
            {docs.length > GROUP_CAP ? (
              <div className="border-t border-[var(--border-3)] px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(key)}
                  className="text-xs font-medium text-[var(--brand-700)] transition hover:underline"
                >
                  {expanded ? "Show less" : `Show all ${docs.length}`}
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// Max rows shown per client folder in the By-client view before the "Show all N" expander.
const GROUP_CAP = 6;

function OnboardingStep({
  num,
  icon,
  title,
  body,
}: {
  num: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[10px] border border-[var(--border-2)] bg-white p-4">
      <div className="flex items-center gap-2 text-[var(--brand-700)]">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]">{num}</span>
        {icon}
      </div>
      <p className="mt-2 text-sm font-medium text-[var(--text-1)]">{title}</p>
      <p className="mt-1 text-[12px] leading-6 text-[var(--text-3)]">{body}</p>
    </div>
  );
}

// Doc types listed in the rail's TYPE section, in display order. Role-gated per viewer.
const RAIL_TYPE_ORDER: DocumentType[] = [
  "PROPOSAL",
  "HANDOVER",
  "REPORT",
  "BRIEF",
  "OTHER",
  "SLA",
  "SOW",
  "MSA",
  "NDA",
  "CO",
  "DSA",
];

const RAIL_TYPE_LABEL: Record<DocumentType, string> = {
  PROPOSAL: "Proposals",
  SLA: "SLAs",
  SOW: "SOWs",
  MSA: "MSAs",
  NDA: "NDAs",
  CO: "Change Orders",
  DSA: "Data Sharing",
  HANDOVER: "Handovers",
  REPORT: "Status Reports",
  BRIEF: "Briefs",
  DECK: "Decks",
  OTHER: "Blank Docs",
};

/** Left collections rail — scope (All/Favorites/Archived) over the doc-type filter list. */
function CollectionsRail({
  scope,
  onScope,
  counts,
  docTypeFilter,
  onDocType,
  docTypeCounts,
  allowedTypeSet,
}: {
  scope: "all" | "favorites" | "archived";
  onScope: (next: "all" | "favorites" | "archived") => void;
  counts: { all: number; favorites: number; archived: number };
  docTypeFilter: DocumentType | "ALL";
  onDocType: (next: DocumentType | "ALL") => void;
  docTypeCounts: Record<string, number>;
  allowedTypeSet: Set<string>;
}) {
  const typesWithDocs = RAIL_TYPE_ORDER.filter(
    (type) => allowedTypeSet.has(type) && (docTypeCounts[type] ?? 0) > 0,
  );
  return (
    <aside className="space-y-5 p-3 sm:p-4">
      <nav className="space-y-1">
        <RailItem
          icon={DocumentTextIcon}
          label="All Docs"
          count={counts.all}
          active={scope === "all"}
          onClick={() => onScope("all")}
        />
        <RailItem
          icon={StarIcon}
          label="Favorites"
          count={counts.favorites}
          active={scope === "favorites"}
          onClick={() => onScope("favorites")}
        />
        <RailItem
          icon={ArchiveBoxIcon}
          label="Archived"
          count={counts.archived}
          active={scope === "archived"}
          onClick={() => onScope("archived")}
        />
      </nav>

      <div className="space-y-1">
        <p className="px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
          Type
        </p>
        <RailItem
          label="All types"
          active={docTypeFilter === "ALL"}
          onClick={() => onDocType("ALL")}
          dense
        />
        {typesWithDocs.map((type) => (
          <RailItem
            key={type}
            label={RAIL_TYPE_LABEL[type]}
            count={docTypeCounts[type] ?? 0}
            active={docTypeFilter === type}
            onClick={() => onDocType(type)}
            dense
          />
        ))}
      </div>
    </aside>
  );
}

function RailItem({
  icon: Icon,
  label,
  count,
  active,
  onClick,
  dense = false,
}: {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  dense?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-center gap-2 rounded-[6px] px-2.5 text-left transition",
        dense ? "py-1.5" : "py-2",
        active
          ? "border border-[var(--brand-300)] bg-[var(--surface-brand)] text-[var(--brand-800)]"
          : "border border-transparent text-[var(--text-2)] hover:bg-[var(--surface-1)]",
      )}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0" /> : <span className="w-4 shrink-0" />}
      <span className={cn("min-w-0 flex-1 truncate", dense ? "text-[13px]" : "text-sm font-medium")}>
        {label}
      </span>
      {typeof count === "number" ? (
        <span
          className={cn(
            "shrink-0 font-mono text-[10px] font-semibold tabular-nums",
            active ? "text-[var(--brand-700)]" : "text-[var(--text-4)]",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

/** Card grid — the default Docs view. One widget-grammar card per document. */
function DocCardGrid({
  proposals,
  isPending,
  error,
  isWorkspaceEmpty,
  canManageDocs,
  scope,
  onCreate,
  onToggleFavorite,
  onDuplicate,
  onArchive,
  onRestore,
  onDelete,
  onClearFilters,
}: {
  proposals: ProposalListItem[];
  isPending: boolean;
  error: Error | null;
  isWorkspaceEmpty: boolean;
  canManageDocs: boolean;
  scope: "all" | "favorites" | "archived";
  onCreate: () => void;
  onToggleFavorite: (id: string, next: boolean) => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onClearFilters: () => void;
}) {
  if (isPending) {
    return <p className="px-5 py-12 text-sm text-[var(--text-4)]">Loading documents…</p>;
  }
  if (error) {
    return <p className="px-5 py-12 text-sm text-rose-700">{error.message}</p>;
  }
  if (proposals.length === 0) {
    return (
      <div className="px-5 py-16 text-center">
        {isWorkspaceEmpty ? (
          <div className="mx-auto max-w-md space-y-3">
            <DocumentPlusIcon className="mx-auto h-8 w-8 text-[var(--text-4)]" />
            <p className="text-sm text-[var(--text-2)]">
              No documents yet — spin one up from a template.
            </p>
            {canManageDocs ? (
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={onCreate}
                leadingIcon={<PlusIcon className="h-4 w-4" />}
              >
                New
              </Button>
            ) : null}
          </div>
        ) : scope === "favorites" ? (
          <div className="mx-auto max-w-md space-y-2">
            <StarIcon className="mx-auto h-8 w-8 text-[var(--text-4)]" />
            <p className="text-sm text-[var(--text-2)]">No favourites yet.</p>
            <p className="text-[13px] text-[var(--text-4)]">
              Star a document from any card to pin it here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-[var(--text-2)]">No documents match this filter.</p>
            <button
              type="button"
              onClick={onClearFilters}
              className="text-sm font-medium text-[var(--brand-700)] hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
      {proposals.map((proposal) => (
        <DocCard
          key={proposal.id}
          proposal={proposal}
          canManageDocs={canManageDocs}
          scope={scope}
          onToggleFavorite={onToggleFavorite}
          onDuplicate={onDuplicate}
          onArchive={onArchive}
          onRestore={onRestore}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

// Generated editorial cover for a doc card. Deterministic (hashed on client+title) so a doc keeps
// the same look across renders. Reuses the documented Gantt/feature-block palette
// (blue/violet/emerald/amber/rose/slate) as soft tints — no off-system hues, no image storage:
// the gradient + serif title + client read like a little document cover.
const DOC_COVER_PALETTE = [
  { from: "#EFF6FF", to: "#DBEAFE", ink: "#1E3A8A" }, // blue
  { from: "#F5F3FF", to: "#EDE9FE", ink: "#5B21B6" }, // violet
  { from: "#ECFDF5", to: "#D1FAE5", ink: "#065F46" }, // emerald
  { from: "#FFFBEB", to: "#FEF3C7", ink: "#92400E" }, // amber
  { from: "#FFF1F2", to: "#FFE4E6", ink: "#9F1239" }, // rose
  { from: "#F8FAFC", to: "#F1F5F9", ink: "#334155" }, // slate
] as const;

function docCoverPalette(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return DOC_COVER_PALETTE[Math.abs(hash) % DOC_COVER_PALETTE.length];
}

function DocCard({
  proposal,
  canManageDocs,
  scope,
  onToggleFavorite,
  onDuplicate,
  onArchive,
  onRestore,
  onDelete,
}: {
  proposal: ProposalListItem;
  canManageDocs: boolean;
  scope: "all" | "favorites" | "archived";
  onToggleFavorite: (id: string, next: boolean) => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const fav = proposal.isFavorite ?? false;
  const blocks = proposal.sectionCount ?? 0;
  const palette = docCoverPalette(`${proposal.clientName ?? ""}|${proposal.title}`);
  const typeLabel = proposal.documentType === "CO" ? "CO" : proposal.documentType;
  return (
    <article className="group/card flex flex-col overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-white transition hover:border-[var(--border-1)] hover:shadow-[var(--shadow-sm)]">
      {/* Generated cover — type eyebrow + serif title + client, clickable to open the editor. */}
      <div className="relative">
        <Link href={docHref(proposal)} {...docLinkTarget(proposal)} className="block">
          <div
            className="flex min-h-[136px] flex-col justify-between p-4"
            style={{ backgroundImage: `linear-gradient(135deg, ${palette.from}, ${palette.to})` }}
          >
            <span
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: palette.ink, opacity: 0.7 }}
            >
              {typeLabel}
              {proposal.documentNumber ? ` · ${proposal.documentNumber}` : ""}
            </span>
            <div className="mt-3">
              <h3
                className="line-clamp-3 font-[family-name:var(--font-display)] text-[20px] font-normal leading-[1.18] tracking-[-0.3px]"
                style={{ color: palette.ink }}
              >
                {proposal.title}
              </h3>
              <p
                className="mt-1.5 truncate font-mono text-[10px] font-medium uppercase tracking-[0.12em]"
                style={{ color: palette.ink, opacity: 0.65 }}
              >
                {proposal.clientName || "No client"}
              </p>
            </div>
          </div>
        </Link>
        <button
          type="button"
          onClick={() => onToggleFavorite(proposal.id, !fav)}
          aria-label={fav ? "Unfavourite" : "Favourite"}
          aria-pressed={fav}
          title={fav ? "Unfavourite" : "Favourite"}
          className={cn(
            "absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-[6px] backdrop-blur-sm transition",
            fav
              ? "bg-white/70 text-[var(--brand-600)]"
              : "bg-white/40 text-[var(--text-3)] hover:bg-white/85 hover:text-[var(--text-1)]",
          )}
        >
          {fav ? <StarIconSolid className="h-4 w-4" /> : <StarIcon className="h-4 w-4" />}
        </button>
      </div>

      {/* Body — meta readout, status + row actions. */}
      <div className="flex flex-1 flex-col justify-between gap-2 px-3.5 py-2.5">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--text-4)]">
          {blocks} {blocks === 1 ? "block" : "blocks"} · {formatUpdatedAt(proposal.updatedAt)}
        </p>
        <div className="flex items-center justify-between gap-2">
        <StatusBadge status={proposal.status} />
        <div className="flex items-center gap-0.5 opacity-0 transition group-hover/card:opacity-100 focus-within:opacity-100">
          <Link
            href={docHref(proposal)} {...docLinkTarget(proposal)}
            className={buttonStyles({ variant: "utility", size: "icon-sm", className: "text-[var(--text-3)]" })}
            aria-label="Edit"
            title="Edit"
          >
            <PencilSquareIcon className="h-4 w-4" />
          </Link>
          {canManageDocs ? (
            scope === "archived" ? (
              <>
                <Button
                  type="button"
                  onClick={() => onRestore(proposal.id)}
                  variant="utility"
                  size="icon-sm"
                  aria-label="Restore"
                  title="Restore"
                >
                  <ArrowUturnLeftIcon className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  onClick={() => onDelete(proposal.id)}
                  variant="utility"
                  size="icon-sm"
                  className="text-rose-600 hover:text-rose-700"
                  aria-label="Delete"
                  title="Delete"
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  onClick={() => onDuplicate(proposal.id)}
                  variant="utility"
                  size="icon-sm"
                  aria-label="Duplicate"
                  title="Duplicate"
                >
                  <DocumentDuplicateIcon className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  onClick={() => onArchive(proposal.id)}
                  variant="utility"
                  size="icon-sm"
                  aria-label="Archive"
                  title="Archive"
                >
                  <ArchiveBoxIcon className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  onClick={() => onDelete(proposal.id)}
                  variant="utility"
                  size="icon-sm"
                  className="text-rose-600 hover:text-rose-700"
                  aria-label="Delete"
                  title="Delete"
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </>
            )
          ) : null}
        </div>
        </div>
      </div>
    </article>
  );
}

function buildPageItems(totalPages: number, currentPage: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items = new Set<number>([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const sorted = [...items].filter((item) => item >= 1 && item <= totalPages).sort((a, b) => a - b);
  const result: Array<number | "ellipsis"> = [];

  sorted.forEach((item, index) => {
    const previous = sorted[index - 1];
    if (previous && item - previous > 1) {
      result.push("ellipsis");
    }
    result.push(item);
  });

  return result;
}

function formatUpdatedAt(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const today = new Date();
  const sameDay =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  if (!sameDay) {
    return formatDate(value);
  }

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
