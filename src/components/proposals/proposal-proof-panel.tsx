"use client";

import { ArrowTopRightOnSquareIcon, LinkIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useMemo, useState } from "react";
import { useProofDocuments, useUpdateProofDocument } from "@/hooks/use-proof";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { ProofDocumentRecord } from "@/lib/proof";

function openProofWindow(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function ProposalProofPanel({
  proposalId,
}: {
  proposalId: string;
}) {
  const linkedQuery = useProofDocuments({ proposalId });
  const allQuery = useProofDocuments();
  const updateMutation = useUpdateProofDocument();
  const [selectedExistingId, setSelectedExistingId] = useState("");

  const linkedDocuments = linkedQuery.data?.documents ?? [];
  const latestDocument = linkedDocuments[0] ?? null;
  const attachCandidates = useMemo(() => {
    const allDocuments = allQuery.data?.documents ?? [];
    return allDocuments.filter((document) => !document.proposalId);
  }, [allQuery.data?.documents]);

  async function handleOpenDocument(document: ProofDocumentRecord) {
    await updateMutation.mutateAsync({
      id: document.id,
      input: { touch: true },
    });

    openProofWindow(document.tokenUrl);
  }

  async function handleAttachExisting() {
    if (!selectedExistingId) {
      return;
    }

    await updateMutation.mutateAsync({
      id: selectedExistingId,
      input: { proposalId },
    });

    setSelectedExistingId("");
  }

  async function handleDetach(document: ProofDocumentRecord) {
    await updateMutation.mutateAsync({
      id: document.id,
      input: { proposalId: null },
    });
  }

  return (
    <section className="app-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="app-eyebrow">Proof Workspace</p>
          <h4 className="mt-3 text-[28px] font-semibold tracking-[-0.03em] text-[var(--text-1)]">
            Linked working drafts
          </h4>
          <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
            Pull an existing Proof draft onto this proposal and keep the working document attached to the deal.
          </p>
        </div>
        <span className="app-chip">
          {linkedDocuments.length} linked
        </span>
      </div>

      <div className="mt-5 app-subtle-panel p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[260px] flex-1 space-y-1.5">
            <span className="text-sm font-semibold text-[var(--text-1)]">Attach a Proof draft</span>
            <select
              value={selectedExistingId}
              onChange={(event) => setSelectedExistingId(event.target.value)}
              className="app-select"
            >
              <option value="">Select a Proof draft</option>
              {attachCandidates.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.title}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="secondary"
            size="md"
            leadingIcon={<LinkIcon className="h-4 w-4" />}
            disabled={!selectedExistingId}
            loading={updateMutation.isPending}
            onClick={() => {
              void handleAttachExisting();
            }}
          >
            Attach draft
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="app-subtle-panel p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--text-1)]">Active Proof drafts</p>
              <p className="mt-1 text-sm text-[var(--text-3)]">Open the latest working space or detach drafts that no longer belong to this proposal.</p>
            </div>
            {latestDocument ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                leadingIcon={<ArrowTopRightOnSquareIcon className="h-4 w-4" />}
                onClick={() => {
                  void handleOpenDocument(latestDocument);
                }}
              >
                Open latest
              </Button>
            ) : null}
          </div>

          <div className="mt-4 space-y-2">
            {linkedDocuments.length ? (
              linkedDocuments.map((document) => (
                <div
                  key={document.id}
                  className="rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-4 shadow-[var(--shadow-xs)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-1)]">{document.title}</p>
                      <p className="mt-1 text-xs text-[var(--text-3)]">Opened {formatDate(document.lastOpenedAt)}</p>
                    </div>
                    <SparklesIcon className="h-5 w-5 text-[var(--brand-700)]" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      leadingIcon={<ArrowTopRightOnSquareIcon className="h-4 w-4" />}
                      onClick={() => {
                        void handleOpenDocument(document);
                      }}
                    >
                      Open
                    </Button>
                    <Button
                      type="button"
                      variant="tertiary"
                      size="sm"
                      onClick={() => {
                        void handleDetach(document);
                      }}
                    >
                      Detach
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[10px] border border-dashed border-[var(--border-2)] bg-white px-4 py-8 text-center text-sm text-[var(--text-3)]">
                No Proof drafts are linked to this proposal yet.
              </div>
            )}
          </div>
        </div>

        <div className="app-subtle-panel p-4">
          <p className="app-eyebrow">Snapshot</p>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--text-3)]">Linked drafts</span>
              <span className="font-semibold text-[var(--text-1)]">{linkedDocuments.length}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--text-3)]">Latest draft</span>
              <span className="text-right font-semibold text-[var(--text-1)]">{latestDocument?.title || "-"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--text-3)]">Last opened</span>
              <span className="font-semibold text-[var(--text-1)]">{latestDocument ? formatDate(latestDocument.lastOpenedAt) : "-"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--text-3)]">Attachable drafts</span>
              <span className="font-semibold text-[var(--text-1)]">{attachCandidates.length}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
