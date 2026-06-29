/**
 * Document relationships panel (P5.18). Lives inside the editor's right-rail tabs as the
 * "Linked" tab. Shows:
 *   - The parent doc (if set) with a link and an unlink affordance
 *   - The direct children (docs that point at this one) with quick-jump links
 *   - A picker to set or change the parent — defaults to the same client's docs to narrow
 *     down the natural use case (SOWs / change orders under an MSA for one client)
 *
 * Relationships are one-level on this UI; the schema is self-referencing but in practice the
 * chains are shallow (MSA → SOW → CO). We don't render a full tree.
 */

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowTopRightOnSquareIcon, LinkIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { useProposalList, useUpdateProposal } from "@/hooks/use-proposals";
import { useDocumentRelations, useInvalidateDocumentRelations, type RelationDocument } from "@/hooks/use-document-relations";
import { StatusBadge } from "@/components/status-badge";

interface DocumentRelationsPanelProps {
  documentId: string;
  /** Used to filter the parent picker to same-client docs first. */
  clientName: string | null;
}

const DOC_TYPE_BADGE: Record<RelationDocument["documentType"], string> = {
  PROPOSAL: "PROPOSAL",
  SLA: "SLA",
  SOW: "SOW",
  MSA: "MSA",
  NDA: "NDA",
  CO: "CO",
  DSA: "DSA",
  HANDOVER: "HAND",
  REPORT: "RPT",
  BRIEF: "BRIEF",
  OTHER: "DOC",
};

export function DocumentRelationsPanel({ documentId, clientName }: DocumentRelationsPanelProps) {
  const { data, isPending } = useDocumentRelations(documentId);
  const updateMutation = useUpdateProposal(documentId);
  const invalidateRelations = useInvalidateDocumentRelations();
  const [pickerOpen, setPickerOpen] = useState(false);

  async function handleSetParent(parentId: string | null) {
    await updateMutation.mutateAsync({ parentId });
    invalidateRelations(documentId);
    setPickerOpen(false);
  }

  return (
    <section className="widget-card overflow-hidden">
      <div className="widget-header">
        <span className="widget-header-label">LINKED DOCUMENTS</span>
        <span className="widget-header-right">
          {data?.children.length ?? 0} CHILD{(data?.children.length ?? 0) === 1 ? "" : "REN"} ·{" "}
          {data?.parent ? "1 PARENT" : "NO PARENT"}
        </span>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        {/* Parent */}
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
            Parent document
          </p>
          {isPending ? (
            <p className="mt-2 text-sm text-[var(--text-4)]">Loading…</p>
          ) : data?.parent ? (
            <div className="mt-2 flex items-center justify-between gap-3 rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-3">
              <Link
                href={`/app/docs/${data.parent.id}`}
                className="min-w-0 flex-1"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded-[4px] bg-[var(--brand-200)] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-700)]">
                    {DOC_TYPE_BADGE[data.parent.documentType]}
                  </span>
                  <span className="truncate text-sm font-medium text-[var(--text-1)] transition group-hover:text-[var(--brand-700)]">
                    {data.parent.title}
                  </span>
                </div>
                {data.parent.documentNumber ? (
                  <p className="mt-1 font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-[var(--text-4)]">
                    {data.parent.documentNumber}
                  </p>
                ) : null}
              </Link>
              <div className="flex items-center gap-1">
                <Link
                  href={`/app/docs/${data.parent.id}`}
                  aria-label="Open parent"
                  className="rounded p-1 text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                >
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => handleSetParent(null)}
                  disabled={updateMutation.isPending}
                  aria-label="Unlink parent"
                  className="rounded p-1 text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="text-sm text-[var(--text-3)]">
                Not linked under another document yet.
              </p>
              {pickerOpen ? null : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPickerOpen(true)}
                  leadingIcon={<LinkIcon className="h-3.5 w-3.5" />}
                >
                  Link to a parent
                </Button>
              )}
            </div>
          )}

          {pickerOpen ? (
            <ParentPicker
              currentDocumentId={documentId}
              clientName={clientName}
              onCancel={() => setPickerOpen(false)}
              onPick={(parentId) => void handleSetParent(parentId)}
              busy={updateMutation.isPending}
            />
          ) : null}
        </div>

        {/* Children */}
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
            Documents linked under this one
          </p>
          {isPending ? (
            <p className="mt-2 text-sm text-[var(--text-4)]">Loading…</p>
          ) : (data?.children.length ?? 0) === 0 ? (
            <p className="mt-2 text-sm text-[var(--text-3)]">
              Nothing linked yet. Open another document and set this one as its parent &mdash; SOWs
              under an MSA, change orders under a SOW, that kind of thing.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {data!.children.map((child) => (
                <li
                  key={child.id}
                  className="flex items-center gap-2 rounded-[6px] border border-[var(--border-3)] bg-white px-3 py-2"
                >
                  <span className="rounded-[4px] bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-3)]">
                    {DOC_TYPE_BADGE[child.documentType]}
                  </span>
                  <Link
                    href={`/app/docs/${child.id}`}
                    className="flex-1 truncate text-sm font-medium text-[var(--text-1)] transition hover:text-[var(--brand-700)]"
                  >
                    {child.title}
                  </Link>
                  <StatusBadge status={child.status as never} />
                  <Link
                    href={`/app/docs/${child.id}`}
                    aria-label="Open"
                    className="text-[var(--text-4)] transition hover:text-[var(--text-1)]"
                  >
                    <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Lightweight picker: lists every workspace doc, filters by search, excludes the current doc
 * (and any doc already linked to prevent the obvious cycle). Same-client docs float to the top
 * so the natural "MSA + its SOWs" group sticks together.
 */
function ParentPicker({
  currentDocumentId,
  clientName,
  onCancel,
  onPick,
  busy,
}: {
  currentDocumentId: string;
  clientName: string | null;
  onCancel: () => void;
  onPick: (parentId: string) => void;
  busy: boolean;
}) {
  const [search, setSearch] = useState("");
  const { data, isPending } = useProposalList({ status: "ALL", sort: "updatedAt:desc" });

  const candidates = useMemo(() => {
    const all = data?.proposals ?? [];
    const filtered = all.filter((p) => p.id !== currentDocumentId);
    const q = search.trim().toLowerCase();
    const matched = q
      ? filtered.filter(
          (p) =>
            p.title.toLowerCase().includes(q) || (p.clientName ?? "").toLowerCase().includes(q),
        )
      : filtered;
    // Pin same-client docs first
    const target = clientName?.trim().toLowerCase() ?? "";
    return matched.slice().sort((a, b) => {
      const aSame = (a.clientName ?? "").toLowerCase() === target ? 1 : 0;
      const bSame = (b.clientName ?? "").toLowerCase() === target ? 1 : 0;
      return bSame - aSame;
    });
  }, [data?.proposals, currentDocumentId, search, clientName]);

  return (
    <div className="mt-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
          Pick a parent
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-[var(--text-4)] hover:text-[var(--text-2)]"
        >
          Cancel
        </button>
      </div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by title or client…"
        className="app-input text-sm"
      />
      <div className="mt-2 max-h-[280px] space-y-1 overflow-y-auto pr-1">
        {isPending ? (
          <p className="text-sm text-[var(--text-4)]">Loading documents…</p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-[var(--text-4)]">No other documents to link to.</p>
        ) : (
          candidates.slice(0, 50).map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={busy}
              onClick={() => onPick(p.id)}
              className="flex w-full items-center gap-2 rounded-[6px] border border-transparent bg-white px-2.5 py-2 text-left text-sm transition hover:border-[var(--border-2)] disabled:opacity-50"
            >
              <span className="rounded-[4px] bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                {DOC_TYPE_BADGE[p.documentType as RelationDocument["documentType"]] ?? "DOC"}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-[var(--text-1)]">{p.title}</span>
              {p.clientName ? (
                <span className="truncate text-[11px] text-[var(--text-4)]">{p.clientName}</span>
              ) : null}
              <PlusIcon className="h-3.5 w-3.5 text-[var(--brand-700)]" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
