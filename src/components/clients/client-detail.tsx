"use client";

import { SparklesIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { buttonStyles } from "@/components/ui/button-styles";
import { StatusBadge } from "@/components/status-badge";
import { useClientDetail } from "@/hooks/use-proposals";
import { formatDate } from "@/lib/format";

export function ClientDetail({ slug }: { slug: string }) {
  const { data, isPending, error } = useClientDetail(slug);

  if (isPending) {
    return <p className="text-sm text-[var(--text-3)]">Loading client...</p>;
  }

  if (error || !data) {
    return <p className="text-sm text-rose-700">{(error as Error)?.message ?? "Client unavailable"}</p>;
  }

  const { client, proposals, proofDocuments } = data;
  const isSuggested = client.source === "SUGGESTED";

  return (
    <div className="space-y-5">
      <section className="app-card p-6">
        <p className="app-eyebrow">Client</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border-1)] bg-[var(--surface-1)]">
              {client.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={client.logoUrl} alt={`${client.name} logo`} className="h-full w-full object-contain p-2" />
              ) : (
                <span className="text-2xl font-semibold text-[var(--text-2)]">
                  {client.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            <div>
              <h2 className="text-4xl font-semibold tracking-[-0.04em] text-[var(--text-1)]">
                {client.name}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-sm text-[var(--text-3)]">
                  {client.proposalCount} proposal{client.proposalCount === 1 ? "" : "s"} currently linked
                </p>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)]">
                  {isSuggested ? <SparklesIcon className="h-3.5 w-3.5 text-[var(--brand-700)]" /> : null}
                  {isSuggested ? "Suggested client" : "Manual client"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/app/proposals?client=${encodeURIComponent(client.name)}`}
              className={buttonStyles({ variant: "secondary", size: "md" })}
            >
              Open proposals
            </Link>
            <Link
              href={`/app/proposals?new=1&client=${encodeURIComponent(client.name)}`}
              className={buttonStyles({ variant: "primary", size: "md" })}
            >
              New proposal
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="Proposals" value={String(proposals.length)} />
        <SummaryCard label="Proof drafts" value={String(proofDocuments.length)} />
        <SummaryCard label="Last updated" value={formatDate(proposals[0]?.updatedAt ?? client.updatedAt)} />
      </section>

      <section className="app-table-shell">
        <div className="border-b border-[var(--border-3)] px-5 py-4">
          <h3 className="text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">Proposals</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="app-table min-w-full">
            <thead>
              <tr>
                <th className="text-left">Proposal</th>
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
                    <td className="text-[var(--text-3)]">{formatDate(proposal.updatedAt)}</td>
                    <td>
                      <Link
                        href={`/app/proposals/${proposal.id}`}
                        className={buttonStyles({ variant: "secondary", size: "xs" })}
                      >
                        Open proposal
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="text-sm text-[var(--text-4)]" colSpan={4}>
                    No proposals linked to this client yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="app-table-shell">
        <div className="border-b border-[var(--border-3)] px-5 py-4">
          <h3 className="text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">Documents</h3>
          <p className="mt-1 text-sm text-[var(--text-3)]">Proof drafts linked through this client’s proposals.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="app-table min-w-full">
            <thead>
              <tr>
                <th className="text-left">Document</th>
                <th className="text-left">Source proposal</th>
                <th className="text-left">Updated</th>
                <th className="text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {proofDocuments.length ? (
                proofDocuments.map((document) => (
                  <tr key={document.id}>
                    <td className="font-medium text-[var(--text-1)]">{document.title}</td>
                    <td>{document.proposalTitle || "-"}</td>
                    <td className="text-[var(--text-3)]">{formatDate(document.updatedAt)}</td>
                    <td>
                      <a
                        href={document.shareUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonStyles({ variant: "secondary", size: "xs" })}
                      >
                        Open document
                      </a>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="text-sm text-[var(--text-4)]" colSpan={4}>
                    No linked documents yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="app-card p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-4)]">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">{value}</p>
    </article>
  );
}
