"use client";

import {
  ArchiveBoxIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentDuplicateIcon,
  DocumentPlusIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusIcon,
  SparklesIcon,
  Squares2X2Icon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { buttonStyles } from "@/components/ui/button-styles";
import { cn, formatDate, statusLabel } from "@/lib/format";
import {
  useArchiveProposal,
  useClientList,
  useCreateProposal,
  useDeleteProposal,
  useDuplicateProposal,
  useProposalList,
} from "@/hooks/use-proposals";
import { usePermissions } from "@/hooks/use-permissions";
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
  OTHER: "Acme — Briefing Note",
};

export function ProposalList() {
  const router = useRouter();
  const { canManageDocs } = usePermissions();
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

  const { data, isPending, error } = useProposalList({
    search,
    status,
    sort,
  });
  const clientsQuery = useClientList();
  const createMutation = useCreateProposal();
  const duplicateMutation = useDuplicateProposal();
  const archiveMutation = useArchiveProposal();
  const deleteMutation = useDeleteProposal();

  const proposals = useMemo(() => data?.proposals ?? [], [data?.proposals]);

  // Doc-type filter chip row. Affects the table only — stat tiles always reflect the full
  // workspace so the operator sees the big picture even while scoped into a single type.
  const [docTypeFilter, setDocTypeFilter] = useState<DocumentType | "ALL">("ALL");
  const docTypeFilteredProposals = useMemo(
    () =>
      docTypeFilter === "ALL"
        ? proposals
        : proposals.filter((p) => (p.documentType as DocumentType) === docTypeFilter),
    [proposals, docTypeFilter],
  );

  const totalPages = Math.max(1, Math.ceil(docTypeFilteredProposals.length / rowsPerPage));
  const currentPage = Math.min(page, totalPages);
  const pagedProposals = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return docTypeFilteredProposals.slice(start, start + rowsPerPage);
  }, [currentPage, docTypeFilteredProposals, rowsPerPage]);

  const allOnPageSelected =
    pagedProposals.length > 0 && pagedProposals.every((proposal) => selectedIds.includes(proposal.id));

  const [bulkBusy, setBulkBusy] = useState<null | "archive" | "unarchive" | "revoke-share" | "delete">(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "grouped">("table");

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
      // Optimistic — clear selection + invalidate list via the hook's query key.
      setSelectedIds([]);
      // The useProposalList hook re-fetches when the query invalidates; force a reload.
      window.location.reload();
    } catch (err) {
      setBulkError((err as Error).message);
    } finally {
      setBulkBusy(null);
    }
  }

  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
  }, [search, status, sort, rowsPerPage, docTypeFilter]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  async function handleCreate() {
    const created = await createMutation.mutateAsync({
      title: form.title || DEFAULT_TITLE_BY_TYPE[form.documentType],
      clientName: form.clientName || undefined,
      clientId: form.clientId,
      documentType: form.documentType,
      templateId: form.templateId ?? undefined,
    });

    setShowCreate(false);
    setForm({ title: "", clientName: "", clientId: undefined, documentType: "PROPOSAL", templateId: null });

    router.push(`/app/proposals/${created.proposal.id}`);
  }

  const totalCount = proposals.length;
  const activeCount = proposals.filter(
    (entry) =>
      entry.status !== "ARCHIVED" &&
      entry.status !== "APPROVED" &&
      entry.status !== "SENT",
  ).length;
  const sentCount = proposals.filter((entry) => entry.status === "SENT").length;
  const approvedCount = proposals.filter((entry) => entry.status === "APPROVED").length;

  // Doc-type breakdown for the filter row count chips. Always over the full workspace so the
  // chips don't lie when a filter is already applied.
  const docTypeCounts = proposals.reduce<Record<string, number>>((acc, p) => {
    const type = p.documentType ?? "OTHER";
    acc[type] = (acc[type] ?? 0) + 1;
    return acc;
  }, {});

  const isWorkspaceEmpty = !isPending && totalCount === 0 && search === "" && status === "ALL";
  const showOnboarding = isWorkspaceEmpty && !onboardingDismissed;

  return (
    <div className="space-y-8">
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="DOCUMENTS"
          value={String(totalCount).padStart(2, "0")}
          hint="ALL TYPES"
          widgetNumber="01"
        />
        <StatTile
          label="IN FLIGHT"
          value={String(activeCount).padStart(2, "0")}
          hint="DRAFT · REVIEW"
          widgetNumber="02"
        />
        <StatTile
          label="OUT FOR SIG"
          value={String(sentCount).padStart(2, "0")}
          hint="AWAITING SIGNERS"
          widgetNumber="03"
        />
        <StatTile
          label="SIGNED"
          value={String(approvedCount).padStart(2, "0")}
          hint="COMPLETE"
          widgetNumber="04"
          tone="success"
        />
      </section>

      <section className="widget-card overflow-hidden">
        <div className="widget-header">
          <span className="widget-header-label">05 // DOCUMENT LIBRARY</span>
          <span className="widget-header-right">{totalCount} TOTAL · {activeCount} ACTIVE</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-2)] px-4 py-4 sm:px-6">
          <div>
            <p className="text-sm leading-6 text-[var(--text-3)]">
              Every proposal, SLA, SOW, MSA, NDA, change order, and data sharing agreement &mdash;
              search, filter by type, and ship in one place.
            </p>
          </div>

          {canManageDocs ? (
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => setShowCreate(true)}
              leadingIcon={<PlusIcon className="h-4 w-4" />}
            >
              New document
            </Button>
          ) : null}
        </div>

        {/* Doc-type filter chip row. Scoped to the table only — stat tiles stay over the
            whole workspace so the operator can see both views without losing context. */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border-2)] px-4 py-3 sm:px-6">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
            FILTER BY TYPE
          </span>
          {(["ALL", "PROPOSAL", "SLA", "SOW", "MSA", "NDA", "CO", "DSA", "OTHER"] as const).map((type) => {
            const count = type === "ALL" ? totalCount : docTypeCounts[type] ?? 0;
            if (type !== "ALL" && count === 0) return null;
            const active = docTypeFilter === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setDocTypeFilter(type as DocumentType | "ALL")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[6px] border px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] transition",
                  active
                    ? "border-[var(--brand-600)] bg-[var(--brand-200)] text-[var(--brand-700)]"
                    : "border-[var(--border-2)] bg-white text-[var(--text-4)] hover:border-[var(--border-1)] hover:text-[var(--text-2)]",
                )}
              >
                {type === "ALL" ? "All" : type === "CO" ? "Change Order" : type}
                <span
                  className={cn(
                    "rounded-[3px] px-1 text-[9px]",
                    active ? "bg-[var(--brand-700)] text-white" : "bg-[var(--surface-1)] text-[var(--text-3)]",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-2)] px-4 py-4 sm:px-6">
          <label className="relative w-full max-w-[420px]">
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
                className:
                  "list-none gap-2 [&::-webkit-details-marker]:hidden",
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
                  >
                    {statusOptions.map((option) => (
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
                      router.push("/app/proposals");
                    }}
                  >
                    Clear client filter
                  </Button>
                ) : null}
              </div>
            </div>
          </details>

          <div className="ml-auto inline-flex items-center rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-0.5">
            {(["table", "grouped"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={cn(
                  "h-7 rounded-[6px] px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] transition",
                  viewMode === mode
                    ? "bg-white text-[var(--text-1)] shadow-[var(--shadow-xs)]"
                    : "text-[var(--text-4)] hover:text-[var(--text-2)]",
                )}
              >
                {mode === "table" ? "Table" : "By client"}
              </button>
            ))}
          </div>
        </div>

        {viewMode === "grouped" ? (
          <GroupedList
            proposals={pagedProposals}
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
                            href={`/app/proposals/${proposal.id}`}
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
                            href={`/app/proposals/${proposal.id}`}
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
                          No documents yet &mdash; click <strong>New document</strong> above to spin
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
      </section>

      {/* Proof drafts widget removed — the surface lived here while Proof was a separate
          product, but it cluttered the docs dashboard once the agency template library landed.
          Proof drafts still exist server-side; reachable from /app/proof if/when it returns. */}

      {showCreate ? (
        <div className="fixed inset-0 z-30">
          <button
            type="button"
            aria-label="Close create document modal"
            className="app-dialog-backdrop absolute inset-0"
            onClick={() => { setShowCreate(false); setForm({ title: "", clientName: "", clientId: undefined, documentType: "PROPOSAL", templateId: null }); }}
          />

          <div className="absolute inset-0 flex items-center justify-center p-4">
            {/* Fixed dimensions so the modal doesn't grow / shrink between renders. Width pinned
                at max-w-4xl, height pinned at h-[640px] (capped by viewport on small screens).
                Both columns scroll internally so changing template count doesn't resize the
                container. */}
            <div className="app-dialog-panel flex h-[640px] max-h-[calc(100vh-32px)] w-full max-w-4xl flex-col p-6">
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
                <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
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
                    {clientsQuery.data?.clients &&
                    clientsQuery.data.clients.filter((c) => c.source === "MANUAL").length > 0 ? (
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
                          <option value="">— Select a Portal client —</option>
                          {clientsQuery.data.clients
                            .filter((c) => c.source === "MANUAL")
                            .map((client) => (
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
                            placeholder="Or type a custom client name"
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
                      {form.templateId ? LABEL_BY_TYPE[form.documentType] : "Pick a template →"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--text-3)]">
                      {form.templateId
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
                      onPick={({ id, documentType }) =>
                        setForm((previous) => ({ ...previous, templateId: id, documentType }))
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Footer — actions pinned at the bottom of the panel, independent of either
                  column's scroll. */}
              <div className="mt-5 flex justify-end gap-2 border-t border-[var(--border-2)] pt-4">
                <Button
                  type="button"
                  onClick={() => {
                    setShowCreate(false);
                    setForm({
                      title: "",
                      clientName: "",
                      clientId: undefined,
                      documentType: "PROPOSAL",
                      templateId: null,
                    });
                  }}
                  variant="secondary"
                  size="md"
                >
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
            </div>
          </div>
        </div>
      ) : null}

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
              {docs.map((doc) => {
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
                      href={`/app/proposals/${doc.id}`}
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
          </div>
        );
      })}
    </div>
  );
}

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

function StatTile({
  widgetNumber,
  label,
  value,
  hint,
  tone = "default",
}: {
  widgetNumber: string;
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "success";
}) {
  const valueColor = tone === "success" ? "text-[var(--success-500)]" : "text-[var(--text-1)]";
  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="widget-header-label">{widgetNumber} {"// "}{label}</span>
      </div>
      <div className="widget-body">
        <p className={cn("widget-stat-sm", valueColor)}>{value}</p>
        <p className="widget-data-label mt-2">{hint}</p>
      </div>
    </div>
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
