"use client";

import { ArrowTopRightOnSquareIcon, LinkIcon, PlusIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useMemo, useState } from "react";
import { useCreateProofDocument, useProofDocuments, useUpdateProofDocument } from "@/hooks/use-proof";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { ProofDocumentRecord } from "@/lib/proof";

function openProofWindow(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function ProposalProofPanel({
  proposalId,
  proposalTitle,
}: {
  proposalId: string;
  proposalTitle: string;
}) {
  const linkedQuery = useProofDocuments({ proposalId });
  const allQuery = useProofDocuments();
  const createMutation = useCreateProofDocument();
  const updateMutation = useUpdateProofDocument();
  const [draftTitle, setDraftTitle] = useState(`${proposalTitle} Working Draft`);
  const [selectedExistingId, setSelectedExistingId] = useState("");

  const linkedDocuments = linkedQuery.data?.documents ?? [];
  const latestDocument = linkedDocuments[0] ?? null;
  const attachCandidates = useMemo(() => {
    const allDocuments = allQuery.data?.documents ?? [];
    return allDocuments.filter((document) => !document.proposalId);
  }, [allQuery.data?.documents]);

  async function handleCreateProofDraft() {
    const title = draftTitle.trim() || `${proposalTitle} Working Draft`;
    const response = await createMutation.mutateAsync({
      title,
      proposalId,
    });

    openProofWindow(response.document.tokenUrl);
  }

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
    <section className="rounded-2xl border border-[var(--border-1)] bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-3)]">Proof workspace</p>
          <h4 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--text-1)]">Linked working drafts</h4>
          <p className="mt-1 text-sm leading-6 text-[var(--text-3)]">
            Launch collaborative Proof drafts directly from this proposal and keep active writing attached to the deal.
          </p>
        </div>
        <span className="rounded-full border border-[var(--border-1)] px-2.5 py-1 text-xs font-medium text-[var(--text-3)]">
          {linkedDocuments.length} linked
        </span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.9fr)]">
        <div className="rounded-2xl border border-[var(--border-1)] bg-[var(--surface-1)] p-4">
          <p className="text-sm font-semibold text-[var(--text-1)]">Create a new Proof draft</p>
          <p className="mt-1 text-sm text-[var(--text-3)]">Start a fresh collaborative writing space for this proposal.</p>
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            className="mt-3 h-11 w-full rounded-xl border border-[var(--border-1)] bg-white px-3 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-500)]"
            placeholder="Draft title"
          />
          <Button
            type="button"
            variant="primary"
            size="md"
            className="mt-3 w-full justify-center"
            leadingIcon={<PlusIcon className="h-4 w-4" />}
            loading={createMutation.isPending}
            onClick={() => {
              void handleCreateProofDraft();
            }}
          >
            Create Proof draft
          </Button>
        </div>

        <div className="rounded-2xl border border-[var(--border-1)] bg-white p-4">
          <p className="text-sm font-semibold text-[var(--text-1)]">Attach an existing draft</p>
          <p className="mt-1 text-sm text-[var(--text-3)]">Reuse an unlinked Proof document and connect it to this proposal.</p>
          <select
            value={selectedExistingId}
            onChange={(event) => setSelectedExistingId(event.target.value)}
            className="mt-3 h-11 w-full rounded-xl border border-[var(--border-1)] bg-white px-3 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-500)]"
          >
            <option value="">Select a Proof draft</option>
            {attachCandidates.map((document) => (
              <option key={document.id} value={document.id}>
                {document.title}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="mt-3 w-full justify-center"
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
        <div className="rounded-2xl border border-[var(--border-1)] bg-white p-4">
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
                <div key={document.id} className="rounded-2xl border border-[var(--border-1)] bg-[var(--surface-1)] px-4 py-3">
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
              <div className="rounded-2xl border border-dashed border-[var(--border-1)] bg-[var(--surface-1)] px-4 py-8 text-center text-sm text-[var(--text-3)]">
                No Proof drafts are linked to this proposal yet.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border-1)] bg-[var(--surface-1)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-3)]">Snapshot</p>
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
