"use client";

import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  CommandLineIcon,
  DocumentPlusIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  useCreateProofDocument,
  useProofDocuments,
  useProofHealth,
  useUpdateProofDocument,
} from "@/hooks/use-proof";
import {
  DEFAULT_PROOF_SERVER_URL,
  DEFAULT_PROOF_START_COMMAND,
  type ProofDocumentRecord,
} from "@/lib/proof";
import { cn, formatDate } from "@/lib/format";

export function ProofWorkspace() {
  const healthQuery = useProofHealth();
  const documentsQuery = useProofDocuments();
  const createMutation = useCreateProofDocument();
  const updateMutation = useUpdateProofDocument();

  const [draftTitle, setDraftTitle] = useState("Gitwork Proof Draft");
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [frameLoaded, setFrameLoaded] = useState(false);

  const recentDocuments = documentsQuery.data?.documents ?? [];

  const activeDocument = useMemo(() => {
    if (!recentDocuments.length) {
      return null;
    }

    if (!activeSlug) {
      return recentDocuments[0] ?? null;
    }

    return recentDocuments.find((item) => item.slug === activeSlug) ?? recentDocuments[0] ?? null;
  }, [activeSlug, recentDocuments]);

  useEffect(() => {
    if (!recentDocuments.length) {
      setActiveSlug(null);
      return;
    }

    setActiveSlug((current) => {
      if (!current) {
        return recentDocuments[0]?.slug ?? null;
      }

      return recentDocuments.some((item) => item.slug === current)
        ? current
        : recentDocuments[0]?.slug ?? null;
    });
  }, [recentDocuments]);

  useEffect(() => {
    setFrameLoaded(false);
  }, [activeDocument?.tokenUrl]);

  async function handleCreateDocument() {
    const title = draftTitle.trim() || "Gitwork Proof Draft";
    const response = await createMutation.mutateAsync({ title });
    setActiveSlug(response.document.slug);
    setDraftTitle(`${title} Copy`);
    window.open(response.document.tokenUrl, "_blank", "noopener,noreferrer");
  }

  async function handleOpenDocument(record: ProofDocumentRecord) {
    setActiveSlug(record.slug);
    await updateMutation.mutateAsync({
      id: record.id,
      input: { touch: true },
    });
  }

  async function handleArchiveDocument(record: ProofDocumentRecord) {
    await updateMutation.mutateAsync({
      id: record.id,
      input: { archived: true },
    });
  }

  const serviceBaseUrl = healthQuery.data?.baseUrl || DEFAULT_PROOF_SERVER_URL;
  const serviceReady = healthQuery.isSuccess;
  const createErrorMessage = createMutation.error instanceof Error ? createMutation.error.message : null;
  const loadingDocuments = documentsQuery.isLoading && !documentsQuery.data;

  return (
    <div className="grid min-h-0 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="space-y-6">
        <section className="rounded-[24px] border border-[var(--border-1)] bg-white p-5 shadow-[0_1px_0_rgba(15,23,34,0.02)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]">Proof</p>
              <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-[var(--text-1)]">Collaborative writing</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
                Proof is now baked into the Gitwork workspace for drafting, comments, provenance, and review.
              </p>
            </div>
            <div
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
                serviceReady
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-800",
              )}
            >
              {serviceReady ? <CheckCircleIcon className="h-4 w-4" /> : <ExclamationTriangleIcon className="h-4 w-4" />}
              {serviceReady ? "Connected" : "Service needed"}
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-[var(--border-1)] bg-[var(--surface-1)] p-4">
            <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]" htmlFor="proof-title">
              New Proof document
            </label>
            <input
              id="proof-title"
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              className="mt-3 h-11 w-full rounded-xl border border-[var(--border-1)] bg-white px-3 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-500)]"
              placeholder="Proof draft title"
            />
            <Button
              type="button"
              variant="primary"
              size="md"
              className="mt-3 w-full justify-center"
              loading={createMutation.isPending}
              leadingIcon={<DocumentPlusIcon className="h-4 w-4" />}
              onClick={() => {
                void handleCreateDocument();
              }}
              disabled={!serviceReady || !draftTitle.trim()}
            >
              Create Proof document
            </Button>
            {createErrorMessage ? <p className="mt-3 text-sm text-rose-700">{createErrorMessage}</p> : null}
          </div>

          {serviceReady ? (
            <div className="mt-4 flex items-center justify-between rounded-2xl border border-[var(--border-1)] bg-white px-4 py-3 text-sm text-[var(--text-3)]">
              <span className="truncate">{serviceBaseUrl}</span>
              <a href={serviceBaseUrl} target="_blank" rel="noreferrer" className="text-[var(--brand-700)] hover:underline">
                Open service
              </a>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-[var(--border-1)] bg-[var(--surface-1)] p-4">
              <div className="flex items-start gap-3">
                <CommandLineIcon className="mt-0.5 h-5 w-5 text-[var(--text-3)]" />
                <div>
                  <p className="text-sm font-medium text-[var(--text-1)]">Start the local Proof service</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-3)]">
                    We’ll talk to Proof through <span className="font-medium text-[var(--text-2)]">{serviceBaseUrl}</span>. Run the command below once, then refresh this page.
                  </p>
                </div>
              </div>
              <code className="mt-3 block rounded-xl border border-[var(--border-1)] bg-white px-3 py-2 text-xs text-[var(--text-2)]">
                {DEFAULT_PROOF_START_COMMAND}
              </code>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3"
                leadingIcon={<ArrowPathIcon className="h-4 w-4" />}
                onClick={() => {
                  void healthQuery.refetch();
                }}
              >
                Check again
              </Button>
            </div>
          )}
        </section>

        <section className="rounded-[24px] border border-[var(--border-1)] bg-white p-5 shadow-[0_1px_0_rgba(15,23,34,0.02)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">Recent Proof sessions</h3>
              <p className="mt-1 text-sm text-[var(--text-3)]">Persistent drafts available across the Gitwork workspace.</p>
            </div>
            <span className="rounded-full border border-[var(--border-1)] px-2.5 py-1 text-xs font-medium text-[var(--text-3)]">
              {recentDocuments.length}
            </span>
          </div>

          <div className="mt-4 space-y-2">
            {loadingDocuments ? (
              <div className="rounded-2xl border border-[var(--border-1)] bg-[var(--surface-1)] px-4 py-8 text-center text-sm text-[var(--text-3)]">
                Loading Proof sessions...
              </div>
            ) : recentDocuments.length ? (
              recentDocuments.map((record) => {
                const active = record.slug === activeDocument?.slug;

                return (
                  <div
                    key={record.id}
                    className={cn(
                      "rounded-2xl border px-4 py-3 transition",
                      active
                        ? "border-[var(--brand-500)] bg-[var(--surface-brand)]"
                        : "border-[var(--border-1)] bg-white hover:border-[var(--brand-500)]/40",
                    )}
                  >
                    <button type="button" className="w-full text-left" onClick={() => void handleOpenDocument(record)}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--text-1)]">{record.title}</p>
                          <p className="mt-1 text-xs text-[var(--text-3)]">Slug: {record.slug}</p>
                          {record.proposalTitle ? (
                            <span className="mt-2 inline-flex rounded-full border border-[var(--border-1)] bg-white px-2 py-1 text-[11px] font-medium text-[var(--text-2)]">
                              Linked to {record.proposalTitle}
                            </span>
                          ) : null}
                        </div>
                        <SparklesIcon className={cn("h-5 w-5 shrink-0", active ? "text-[var(--brand-700)]" : "text-[var(--text-3)]")} />
                      </div>
                    </button>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--text-3)]">
                      <span>Opened {formatDate(record.lastOpenedAt)}</span>
                      <button type="button" onClick={() => void handleArchiveDocument(record)} className="text-rose-600 hover:underline">
                        Archive
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--border-1)] bg-[var(--surface-1)] px-4 py-8 text-center text-sm text-[var(--text-3)]">
                Create your first Proof document and we’ll keep it here for quick re-entry.
              </div>
            )}
          </div>
        </section>
      </aside>

      <section className="flex min-h-[760px] flex-col rounded-[24px] border border-[var(--border-1)] bg-white p-5 shadow-[0_1px_0_rgba(15,23,34,0.02)]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-1)] pb-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]">Proof workspace</p>
            <h3 className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-[var(--text-1)]">
              {activeDocument?.title || "Open a Proof document"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
              {activeDocument
                ? "Proof is running inside the Gitwork application chrome so the collaboration flow stays in one place."
                : "Create or reopen a Proof document from the left rail to start editing here."}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              size="md"
              leadingIcon={<ArrowPathIcon className="h-4 w-4" />}
              onClick={() => {
                void Promise.all([healthQuery.refetch(), documentsQuery.refetch()]);
              }}
            >
              Refresh status
            </Button>
            {activeDocument ? (
              <Button
                type="button"
                variant="primary"
                size="md"
                leadingIcon={<ArrowTopRightOnSquareIcon className="h-4 w-4" />}
                onClick={() => {
                  window.open(activeDocument.tokenUrl, "_blank", "noopener,noreferrer");
                }}
              >
                Open Proof
              </Button>
            ) : null}
          </div>
        </div>

        {serviceReady && activeDocument ? (
          <div className="relative mt-5 min-h-0 flex-1 overflow-hidden rounded-[20px] border border-[var(--border-1)] bg-[var(--surface-1)]">
            {!frameLoaded ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--surface-1)]/95 text-sm text-[var(--text-3)]">
                Loading Proof session...
              </div>
            ) : null}
            <iframe
              key={activeDocument.tokenUrl}
              src={activeDocument.tokenUrl}
              title={activeDocument.title}
              className="h-full min-h-[720px] w-full border-0 bg-white"
              onLoad={() => setFrameLoaded(true)}
              sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
            />
          </div>
        ) : (
          <div className="mt-5 flex min-h-[720px] items-center justify-center rounded-[20px] border border-dashed border-[var(--border-1)] bg-[var(--surface-1)] p-8">
            <div className="max-w-lg text-center">
              <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border-1)] bg-white">
                <DocumentPlusIcon className="h-7 w-7 text-[var(--brand-700)]" />
              </div>
              <h4 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                {serviceReady ? "Create a Proof document to begin" : "Proof is not running yet"}
              </h4>
              <p className="mt-3 text-sm leading-6 text-[var(--text-3)]">
                {serviceReady
                  ? "We’ll embed the full Proof editor here, including comments, provenance tracking, and collaborative review."
                  : "Run the Proof service locally, then come back here. The Gitwork wrapper is ready and will connect as soon as the backend responds."}
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
