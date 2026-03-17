"use client";

import { MagnifyingGlassIcon, PlusIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
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
    <div className="space-y-4">
      <section className="rounded-xl border border-[rgba(16,24,40,0.08)] bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-[220px] flex-1">
            <MagnifyingGlassIcon className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-[var(--text-3)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search proposals"
              className="h-10 w-full rounded-md border border-[var(--border-1)] bg-white pl-9 pr-3 text-sm outline-none transition focus:border-[var(--brand-500)]"
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
              className="proposal-field-compact app-select-compact min-w-[150px]"
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "ALL" ? "All statuses" : option.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>

          <label>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as (typeof sortOptions)[number]["value"])}
              className="proposal-field-compact app-select-compact min-w-[160px]"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => setShowCreate(true)}
            className="ml-auto"
            leadingIcon={<PlusIcon className="h-4 w-4" />}
          >
            New proposal
          </Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[rgba(16,24,40,0.08)] bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[rgba(16,24,40,0.08)] text-sm">
            <thead className="bg-white">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-[var(--text-3)]">Proposal</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--text-3)]">Status</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--text-3)]">Last updated</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--text-3)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(16,24,40,0.08)]">
              {isPending ? (
                <tr>
                  <td className="px-4 py-6 text-[var(--text-3)]" colSpan={4}>
                    Loading proposals...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className="px-4 py-6 text-red-600" colSpan={4}>
                    {(error as Error).message}
                  </td>
                </tr>
              ) : data?.proposals.length ? (
                data.proposals.map((proposal) => (
                  <tr key={proposal.id} className="hover:bg-[var(--surface-0)]">
                    <td className="px-4 py-3">
                      <Link href={`/app/proposals/${proposal.id}`} className="font-medium text-[var(--text-1)] hover:text-[var(--brand-700)]">
                        {proposal.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-[var(--text-3)]">{proposal.clientName || "No client"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={proposal.status} />
                    </td>
                    <td className="px-4 py-3 text-[var(--text-2)]">{formatDate(proposal.updatedAt)}</td>
                    <td className="px-4 py-3">
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
                  <td className="px-4 py-6 text-[var(--text-3)]" colSpan={4}>
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
            className="absolute inset-0 bg-zinc-900/40"
            onClick={() => setShowCreate(false)}
          />

          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-xl border border-[var(--border-1)] bg-white p-5 shadow-lg">
              <h2 className="text-lg font-semibold">Create proposal</h2>
              <p className="mt-1 text-sm text-[var(--text-3)]">
                Start with a title and optional client. The proposal will open blank in the builder.
              </p>

              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-3)]">
                    Proposal title
                  </span>
                  <input
                    value={form.title}
                    onChange={(event) => setForm((previous) => ({ ...previous, title: event.target.value }))}
                    className="h-10 w-full rounded-md border border-[var(--border-1)] px-3 text-sm outline-none focus:border-[var(--brand-500)]"
                    placeholder="Project proposal"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-3)]">
                    Client
                  </span>
                  <input
                    value={form.clientName}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, clientName: event.target.value }))
                    }
                    className="h-10 w-full rounded-md border border-[var(--border-1)] px-3 text-sm outline-none focus:border-[var(--brand-500)]"
                    placeholder="Dan's Garden"
                  />
                </label>
              </div>

              <div className="mt-5 flex justify-end gap-2">
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
