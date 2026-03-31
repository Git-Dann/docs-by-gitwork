"use client";

import { MagnifyingGlassIcon, PlusIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import { formatDate, statusLabel } from "@/lib/format";
import {
  useArchiveProposal,
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

export function ProposalList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientFilter = searchParams.get("client")?.trim() ?? "";
  const openCreate = searchParams.get("new") === "1";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("ALL");
  const [sort, setSort] = useState<(typeof sortOptions)[number]["value"]>("updatedAt:desc");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: "",
    clientName: "",
  });

  useEffect(() => {
    setSearch(clientFilter);
    setForm((previous) => ({
      ...previous,
      clientName: clientFilter,
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
  const createMutation = useCreateProposal();
  const duplicateMutation = useDuplicateProposal();
  const archiveMutation = useArchiveProposal();
  const deleteMutation = useDeleteProposal();

  async function handleCreate() {
    const created = await createMutation.mutateAsync({
      title: form.title || "Untitled Proposal",
      clientName: form.clientName,
    });

    setShowCreate(false);
    setForm({
      title: "",
      clientName: "",
    });

    router.push(`/app/proposals/${created.proposal.id}`);
  }

  return (
    <div className="space-y-5">
      <section className="app-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="app-eyebrow">Library</p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
              Proposal documents
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
              Search, sort, duplicate, archive, and reopen delivery documents from one table.
            </p>
          </div>

          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => setShowCreate(true)}
            leadingIcon={<PlusIcon className="h-4 w-4" />}
          >
            New proposal
          </Button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className="relative min-w-[220px] flex-1">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-4)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search proposals"
              className="app-input pl-9"
            />
          </label>

          {clientFilter ? (
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => {
                setSearch("");
                router.push("/app/proposals");
              }}
            >
              Clear client filter
            </Button>
          ) : null}

          <label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as (typeof statusOptions)[number])}
              className="app-select-compact min-w-[170px]"
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "ALL" ? "All statuses" : statusLabel(option)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as (typeof sortOptions)[number]["value"])}
              className="app-select-compact min-w-[180px]"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <span className="app-chip ml-auto">
            {data?.proposals.length ?? 0} result{(data?.proposals.length ?? 0) === 1 ? "" : "s"}
          </span>
        </div>
      </section>

      <section className="app-table-shell">
        <div className="overflow-x-auto">
          <table className="app-table min-w-full">
            <thead>
              <tr>
                <th className="text-left">Proposal</th>
                <th className="text-left">Status</th>
                <th className="text-left">Last updated</th>
                <th className="text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isPending ? (
                <tr>
                  <td className="text-sm text-[var(--text-4)]" colSpan={4}>
                    Loading proposals...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className="text-sm text-rose-700" colSpan={4}>
                    {(error as Error).message}
                  </td>
                </tr>
              ) : data?.proposals.length ? (
                data.proposals.map((proposal) => (
                  <tr key={proposal.id}>
                    <td>
                      <Link
                        href={`/app/proposals/${proposal.id}`}
                        className="font-medium text-[var(--text-1)] transition hover:text-[var(--brand-700)]"
                      >
                        {proposal.title}
                      </Link>
                      <p className="mt-1 text-sm text-[var(--text-3)]">
                        {proposal.clientName || "No client assigned"}
                      </p>
                    </td>
                    <td>
                      <StatusBadge status={proposal.status} />
                    </td>
                    <td className="text-[var(--text-3)]">{formatDate(proposal.updatedAt)}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/app/proposals/${proposal.id}`}
                          className={buttonStyles({ variant: "secondary", size: "xs" })}
                        >
                          Edit
                        </Link>
                        <Button
                          type="button"
                          onClick={() => duplicateMutation.mutate(proposal.id)}
                          variant="secondary"
                          size="xs"
                        >
                          Duplicate
                        </Button>
                        <Button
                          type="button"
                          onClick={() => archiveMutation.mutate(proposal.id)}
                          variant="secondary"
                          size="xs"
                        >
                          Archive
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            if (window.confirm("Delete this proposal permanently?")) {
                              deleteMutation.mutate(proposal.id);
                            }
                          }}
                          variant="danger"
                          size="xs"
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="text-sm text-[var(--text-4)]" colSpan={4}>
                    No proposals found.
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
            aria-label="Close create proposal modal"
            className="app-dialog-backdrop absolute inset-0"
            onClick={() => setShowCreate(false)}
          />

          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="app-dialog-panel w-full max-w-lg p-6">
              <p className="app-eyebrow">Create</p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                Create proposal
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
                Start with a title and optional client. Any client name you add here will show up as a suggested client across Docs and iOS once the draft is saved.
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
                    placeholder="Project proposal"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
                    Client
                  </span>
                  <input
                    value={form.clientName}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, clientName: event.target.value }))
                    }
                    className="app-input"
                    placeholder="Dan's Garden"
                  />
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <Button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  variant="secondary"
                  size="md"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleCreate}
                  loading={createMutation.isPending}
                  variant="primary"
                  size="md"
                >
                  {createMutation.isPending ? "Creating..." : "Create proposal"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
