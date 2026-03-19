"use client";

import {
  ArrowTopRightOnSquareIcon,
  ChartBarSquareIcon,
  DocumentPlusIcon,
  DocumentTextIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { useProofDocuments } from "@/hooks/use-proof";
import { useClientList, useProposalList } from "@/hooks/use-proposals";
import { buttonStyles } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/format";

const statusOrder = [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "ARCHIVED",
] as const;

export function AppOverview() {
  const proposalsQuery = useProposalList({
    status: "ALL",
    sort: "updatedAt:desc",
  });
  const clientsQuery = useClientList();
  const proofQuery = useProofDocuments();

  const proposals = proposalsQuery.data?.proposals ?? [];
  const clients = clientsQuery.data?.clients ?? [];
  const proofDocuments = proofQuery.data?.documents ?? [];

  const proposalCount = proposals.length;
  const clientCount = clients.length;
  const proofCount = proofDocuments.length;
  const reviewCount = proposals.filter((proposal) => proposal.status === "IN_REVIEW").length;
  const latestActivity = proposals[0]?.updatedAt ?? proofDocuments[0]?.updatedAt ?? null;
  const topClients = [...clients]
    .sort((left, right) => right.proposalCount - left.proposalCount)
    .slice(0, 4);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.95fr)]">
      <div className="space-y-6">
        <section className="app-card overflow-hidden p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="app-eyebrow">Overview</p>
              <h2 className="mt-3 text-[28px] font-semibold tracking-[-0.04em] text-[var(--text-1)]">
                A cleaner document workspace built around one shared UI system
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--text-3)]">
                Proposal drafting, client management, and Proof collaboration now sit inside the same
                surface language: restrained cards, tighter controls, clearer hierarchy, and faster
                access to live work.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/app/proposals?new=1"
                className={buttonStyles({ variant: "primary", size: "md" })}
              >
                New proposal
              </Link>
              <Link
                href="/app/proof"
                className={buttonStyles({ variant: "secondary", size: "md" })}
              >
                Open Proof
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Proposals"
              value={proposalCount}
              detail={
                latestActivity
                  ? `Latest activity ${formatDate(latestActivity)}`
                  : "No document activity yet"
              }
            />
            <MetricCard
              label="In review"
              value={reviewCount}
              detail="Documents waiting on sign-off"
            />
            <MetricCard
              label="Clients"
              value={clientCount}
              detail="Active accounts linked to proposals"
            />
            <MetricCard
              label="Proof drafts"
              value={proofCount}
              detail="Persistent collaborative sessions"
            />
          </div>
        </section>

        <section className="app-table-shell">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-3)] px-5 py-4">
            <div>
              <p className="app-eyebrow">Recent work</p>
              <h3 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
                Proposal activity
              </h3>
            </div>
            <Link
              href="/app/proposals"
              className={buttonStyles({ variant: "secondary", size: "sm" })}
            >
              View all proposals
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="app-table min-w-full">
              <thead>
                <tr>
                  <th className="text-left">Proposal</th>
                  <th className="text-left">Client</th>
                  <th className="text-left">Status</th>
                  <th className="text-left">Updated</th>
                </tr>
              </thead>
              <tbody>
                {proposalsQuery.isPending ? (
                  <tr>
                    <td className="text-sm text-[var(--text-4)]" colSpan={4}>
                      Loading recent proposals...
                    </td>
                  </tr>
                ) : proposals.length ? (
                  proposals.slice(0, 6).map((proposal) => (
                    <tr key={proposal.id}>
                      <td>
                        <Link
                          href={`/app/proposals/${proposal.id}`}
                          className="font-medium text-[var(--text-1)] transition hover:text-[var(--brand-700)]"
                        >
                          {proposal.title}
                        </Link>
                      </td>
                      <td className="text-[var(--text-3)]">
                        {proposal.clientName || "No client assigned"}
                      </td>
                      <td>
                        <StatusBadge status={proposal.status} />
                      </td>
                      <td className="text-[var(--text-3)]">{formatDate(proposal.updatedAt)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="text-sm text-[var(--text-4)]" colSpan={4}>
                      No proposals yet. Start the first one from the actions above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="space-y-6">
        <section className="app-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="app-eyebrow">Quick starts</p>
              <h3 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
                Jump into the next task
              </h3>
            </div>
            <Squares2X2Icon className="h-5 w-5 text-[var(--text-4)]" />
          </div>

          <div className="mt-4 space-y-3">
            <ActionTile
              href="/app/proposals?new=1"
              title="Start a proposal"
              description="Create a new document shell with costing, timeline, and engagement sections."
              icon={<DocumentPlusIcon className="h-5 w-5" />}
            />
            <ActionTile
              href="/app/proof"
              title="Continue in Proof"
              description="Open the collaborative drafting workspace without leaving the platform."
              icon={<DocumentTextIcon className="h-5 w-5" />}
            />
            <ActionTile
              href="/app/clients"
              title="Manage clients"
              description="Keep logos, names, and proposal relationships consistent across the workspace."
              icon={<ChartBarSquareIcon className="h-5 w-5" />}
            />
          </div>
        </section>

        <section className="app-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="app-eyebrow">Health</p>
              <h3 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
                Status overview
              </h3>
            </div>
            <span className="app-chip">{proposalCount} total</span>
          </div>

          <div className="mt-4 space-y-3">
            {statusOrder.map((status) => {
              const count = proposals.filter((proposal) => proposal.status === status).length;
              const percent = proposalCount ? Math.max((count / proposalCount) * 100, count ? 8 : 0) : 0;

              return (
                <div key={status} className="space-y-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <StatusBadge status={status} />
                    <span className="font-medium text-[var(--text-3)]">{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--surface-1)]">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        status === "APPROVED"
                          ? "bg-emerald-500"
                          : status === "IN_REVIEW"
                            ? "bg-amber-500"
                            : status === "ARCHIVED"
                              ? "bg-zinc-400"
                              : "bg-[var(--brand-600)]",
                      )}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="app-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="app-eyebrow">Proof</p>
              <h3 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
                Recent sessions
              </h3>
            </div>
            <Link
              href="/app/proof"
              className={buttonStyles({ variant: "tertiary", size: "sm" })}
            >
              Open workspace
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {proofQuery.isPending ? (
              <p className="text-sm text-[var(--text-4)]">Loading Proof sessions...</p>
            ) : proofDocuments.length ? (
              proofDocuments.slice(0, 4).map((document) => (
                <Link
                  key={document.id}
                  href="/app/proof"
                  className="flex items-start gap-3 rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3 transition hover:border-[var(--border-1)] hover:bg-white"
                >
                  <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-white text-[var(--brand-700)] shadow-[var(--shadow-xs)]">
                    <DocumentTextIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--text-1)]">
                      {document.title}
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-3)]">
                      {document.proposalTitle || "Standalone Proof draft"}
                    </p>
                    <p className="mt-2 text-xs font-medium text-[var(--text-4)]">
                      Updated {formatDate(document.updatedAt)}
                    </p>
                  </div>
                </Link>
              ))
            ) : (
              <p className="rounded-[14px] border border-dashed border-[var(--border-2)] px-4 py-4 text-sm text-[var(--text-4)]">
                No Proof sessions yet. Create the first collaborative draft from the Proof workspace.
              </p>
            )}
          </div>
        </section>

        <section className="app-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="app-eyebrow">Clients</p>
              <h3 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
                Most active accounts
              </h3>
            </div>
            <Link
              href="/app/clients"
              className={buttonStyles({ variant: "tertiary", size: "sm" })}
            >
              View clients
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {clientsQuery.isPending ? (
              <p className="text-sm text-[var(--text-4)]">Loading clients...</p>
            ) : topClients.length ? (
              topClients.map((client) => (
                <Link
                  key={client.id}
                  href={`/app/clients/${client.slug}`}
                  className="flex items-center gap-3 rounded-[14px] border border-[var(--border-2)] px-4 py-3 transition hover:bg-[var(--surface-1)]"
                >
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-brand)] text-sm font-semibold text-[var(--brand-700)]">
                    {client.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--text-1)]">{client.name}</p>
                    <p className="text-sm text-[var(--text-3)]">
                      {client.proposalCount} linked proposal{client.proposalCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <ArrowTopRightOnSquareIcon className="h-4 w-4 text-[var(--text-4)]" />
                </Link>
              ))
            ) : (
              <p className="rounded-[14px] border border-dashed border-[var(--border-2)] px-4 py-4 text-sm text-[var(--text-4)]">
                No clients added yet. Create one before starting the next proposal workflow.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <article className="rounded-[18px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-4">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-4)]">{label}</p>
      <p className="mt-3 text-[30px] font-semibold tracking-[-0.04em] text-[var(--text-1)]">{value}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">{detail}</p>
    </article>
  );
}

function ActionTile({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-4 rounded-[18px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-4 transition hover:border-[var(--border-1)] hover:bg-white"
    >
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[var(--brand-700)] shadow-[var(--shadow-xs)]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--text-1)]">{title}</p>
        <p className="mt-1 text-sm leading-6 text-[var(--text-3)]">{description}</p>
      </div>
      <ArrowTopRightOnSquareIcon className="h-4 w-4 text-[var(--text-4)] transition group-hover:text-[var(--text-2)]" />
    </Link>
  );
}
