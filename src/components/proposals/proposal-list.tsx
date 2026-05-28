"use client";

import {
  ArchiveBoxIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentDuplicateIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { buttonStyles } from "@/components/ui/button-styles";
import { cn, formatDate, statusLabel } from "@/lib/format";
import { useProofDocuments } from "@/hooks/use-proof";
import {
  useArchiveProposal,
  useClientList,
  useCreateProposal,
  useDeleteProposal,
  useDuplicateProposal,
  useProposalList,
} from "@/hooks/use-proposals";
import { StatusBadge } from "@/components/status-badge";

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

export function ProposalList() {
  const router = useRouter();
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
  const proofDocumentsQuery = useProofDocuments();

  const proposals = useMemo(() => data?.proposals ?? [], [data?.proposals]);
  const proofDocuments = useMemo(
    () => (proofDocumentsQuery.data?.documents ?? []).filter((document) => !document.archivedAt),
    [proofDocumentsQuery.data?.documents],
  );
  const totalPages = Math.max(1, Math.ceil(proposals.length / rowsPerPage));
  const currentPage = Math.min(page, totalPages);
  const pagedProposals = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return proposals.slice(start, start + rowsPerPage);
  }, [currentPage, proposals, rowsPerPage]);

  const allOnPageSelected =
    pagedProposals.length > 0 && pagedProposals.every((proposal) => selectedIds.includes(proposal.id));

  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
  }, [search, status, sort, rowsPerPage]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  async function handleCreate() {
    const created = await createMutation.mutateAsync({
      title: form.title || "Untitled Proposal",
      clientName: form.clientName || undefined,
      clientId: form.clientId,
    });

    setShowCreate(false);
    setForm({ title: "", clientName: "", clientId: undefined });

    router.push(`/app/proposals/${created.proposal.id}`);
  }

  const totalCount = proposals.length;
  const activeCount = proposals.filter(
    (entry) => entry.status !== "ARCHIVED" && entry.status !== "APPROVED",
  ).length;
  const approvedCount = proposals.filter((entry) => entry.status === "APPROVED").length;

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="DOCUMENTS" value={String(totalCount).padStart(2, "0")} hint="IN VIEW" widgetNumber="01" />
        <StatTile label="IN FLIGHT" value={String(activeCount).padStart(2, "0")} hint="DRAFT · REVIEW" widgetNumber="02" />
        <StatTile label="APPROVED" value={String(approvedCount).padStart(2, "0")} hint="SHIPPED" widgetNumber="03" tone="success" />
        <StatTile label="PROOF DRAFTS" value={String(proofDocuments.length).padStart(2, "0")} hint="SAVED" widgetNumber="04" />
      </section>

      <section className="widget-card mt-4 overflow-hidden">
        <div className="widget-header">
          <span className="widget-header-label">05 // PROPOSALS</span>
          <span className="widget-header-right">{totalCount} TOTAL · {activeCount} ACTIVE</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-2)] px-4 py-4 sm:px-6">
          <div>
            <p className="text-sm leading-6 text-[var(--text-3)]">
              Proposal workstreams, review state, and delivery ownership managed inside Docs.
            </p>
          </div>

          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => setShowCreate(true)}
            leadingIcon={<PlusIcon className="h-4 w-4" />}
          >
            New document
          </Button>
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
        </div>

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
                        <Link
                          href={`/app/proposals/${proposal.id}`}
                          className="font-medium text-[var(--text-1)] transition hover:text-[var(--brand-700)]"
                        >
                          {proposal.title}
                        </Link>
                        <p className="mt-0.5 text-sm text-[var(--text-3)]">
                          {proposal.clientName || "No client assigned"}
                        </p>
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
                  <td colSpan={6} className="text-sm text-[var(--text-4)]">
                    No documents found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

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

      <section className="widget-card mt-4 overflow-hidden">
        <div className="widget-header">
          <span className="widget-header-label">06 // PROOF DRAFTS</span>
          <span className="widget-header-right">{proofDocuments.length} SAVED</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-2)] px-4 py-4 sm:px-6">
          <div>
            <p className="text-sm leading-6 text-[var(--text-3)]">
              Working drafts saved from Proof now sit inside Docs so they can be attached to proposals later.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="app-table proposals-table min-w-full">
            <thead>
              <tr>
                <th className="text-left">DRAFT</th>
                <th className="text-left">LINKED PROPOSAL</th>
                <th className="text-left">UPDATED</th>
                <th className="text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {proofDocumentsQuery.isPending ? (
                <tr>
                  <td colSpan={4} className="text-sm text-[var(--text-4)]">
                    Loading Proof drafts...
                  </td>
                </tr>
              ) : proofDocuments.length ? (
                proofDocuments.slice(0, 8).map((document) => (
                  <tr key={document.id}>
                    <td>
                      <p className="font-medium text-[var(--text-1)]">{document.title}</p>
                      <p className="mt-0.5 text-sm text-[var(--text-3)]">
                        {document.markdown ? "Saved content available" : "Draft shell only"}
                      </p>
                    </td>
                    <td className="text-sm text-[var(--text-3)]">
                      {document.proposalTitle ?? "Not linked yet"}
                    </td>
                    <td className="text-sm text-[var(--text-3)]">{formatUpdatedAt(document.updatedAt)}</td>
                    <td>
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={document.tokenUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={buttonStyles({ variant: "secondary", size: "sm" })}
                        >
                          Open Proof
                        </a>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="text-sm text-[var(--text-4)]">
                    No Proof drafts saved into Docs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showCreate ? (
        <div className="fixed inset-0 z-30">
          <button
            type="button"
            aria-label="Close create document modal"
            className="app-dialog-backdrop absolute inset-0"
            onClick={() => { setShowCreate(false); setForm({ title: "", clientName: "", clientId: undefined }); }}
          />

          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="app-dialog-panel w-full max-w-lg p-6">
              <p className="widget-header-label widget-data-label-bright">07 // NEW DOCUMENT</p>
              <h2 className="mt-3 font-[family-name:var(--font-display)] text-[32px] font-normal leading-[1.1] tracking-[-0.5px] text-[var(--text-1)]">
                Create document
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
                Start with a title and optional client.
              </p>

              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
                    Proposal title
                  </span>
                  <input
                    value={form.title}
                    onChange={(event) => setForm((previous) => ({ ...previous, title: event.target.value }))}
                    className="app-input"
                    placeholder="Q2 Renewal Proposal"
                  />
                </label>

                <div className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
                    Client
                  </span>
                  {clientsQuery.data?.clients && clientsQuery.data.clients.filter(c => c.source === "MANUAL").length > 0 ? (
                    <div className="space-y-2">
                      <select
                        value={form.clientId ?? ""}
                        onChange={(event) => {
                          const selected = clientsQuery.data?.clients.find(c => c.id === event.target.value);
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
                          .filter(c => c.source === "MANUAL")
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
                            setForm((previous) => ({ ...previous, clientName: event.target.value }))
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
                        setForm((previous) => ({ ...previous, clientName: event.target.value }))
                      }
                      className="app-input"
                      placeholder="Acme Health"
                    />
                  )}
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <Button type="button" onClick={() => { setShowCreate(false); setForm({ title: "", clientName: "", clientId: undefined }); }} variant="secondary" size="md">
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
    </>
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
        <span className="widget-header-label">{widgetNumber} // {label}</span>
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
