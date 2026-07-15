"use client";

import { useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  DocumentTextIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  useCreateClientDocumentLink,
  useUpdateClientDocumentLink,
  useDeleteClientDocumentLink,
} from "@/hooks/use-proposals";
import type { ClientDocumentLinkRecord } from "@/types/client";

type LinkInput = { name: string; url: string; notes: string };

function faviconFor(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=32`;
  } catch {
    return null;
  }
}

/**
 * Team-added external document links for the Portal "14 // DOCUMENTS" card —
 * Google Drive/Docs or any URL. Sits alongside the auto-linked Foundry docs
 * (proposals/SOWs), which stay read-only. Self-contained: owns its own add
 * button, per-row edit/delete, and the form modal.
 */
export function ClientDocumentLinks({
  slug,
  links,
  canManage,
}: {
  slug: string;
  links: ClientDocumentLinkRecord[];
  canManage: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const createMutation = useCreateClientDocumentLink(slug);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(input: LinkInput) {
    setError(null);
    try {
      await createMutation.mutateAsync({
        name: input.name,
        url: input.url,
        notes: input.notes || undefined,
      });
      setCreating(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!canManage && links.length === 0) return null;

  return (
    <div className="border-t border-[rgba(0,0,0,0.06)] px-5 py-4">
      <p className="mb-2 widget-data-label text-[var(--text-4)]">Your links</p>

      {links.length > 0 && (
        <div className="flex flex-col gap-2">
          {links.map((link) => (
            <DocumentLinkRow
              key={link.id}
              slug={slug}
              link={link}
              canManage={canManage}
              deletingId={deletingId}
              setDeletingId={setDeletingId}
            />
          ))}
        </div>
      )}

      {canManage && (
        <button
          type="button"
          onClick={() => { setError(null); setCreating(true); }}
          className="mt-2 inline-flex items-center gap-1.5 text-sm text-[var(--brand-700)] hover:underline"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add a document link
        </button>
      )}

      {creating && (
        <DocumentLinkFormModal
          onSave={(input) => void handleCreate(input)}
          onClose={() => { setCreating(false); setError(null); }}
          isSaving={createMutation.isPending}
          error={error}
        />
      )}
    </div>
  );
}

function DocumentLinkRow({
  slug,
  link,
  canManage,
  deletingId,
  setDeletingId,
}: {
  slug: string;
  link: ClientDocumentLinkRecord;
  canManage: boolean;
  deletingId: string | null;
  setDeletingId: (id: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updateMutation = useUpdateClientDocumentLink(slug, link.id);
  const deleteMutation = useDeleteClientDocumentLink(slug);
  const favicon = faviconFor(link.url);

  async function handleSave(input: LinkInput) {
    setError(null);
    try {
      await updateMutation.mutateAsync({
        name: input.name,
        url: input.url,
        notes: input.notes || undefined,
      });
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDelete() {
    setDeletingId(link.id);
    try {
      await deleteMutation.mutateAsync(link.id);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <article
        className="group relative flex flex-row items-center gap-3 rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2.5 cursor-pointer transition-all hover:border-[var(--brand-400)] hover:shadow-sm"
        onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[var(--surface-1)]">
          {favicon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={favicon} alt="" className="h-4 w-4" />
          ) : (
            <DocumentTextIcon className="h-4 w-4 text-[var(--text-3)]" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-[var(--text-1)]">{link.name}</p>
          <p className="truncate text-[11px] leading-tight text-[var(--text-4)] mt-0.5">
            {link.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </p>
          {link.notes && (
            <p className="mt-0.5 truncate text-[11px] text-[var(--text-3)]">{link.notes}</p>
          )}
        </div>

        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-4)]" />

        {canManage && (
          <div
            className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-[6px] p-1.5 text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-2)]"
              title="Edit"
            >
              <PencilIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deletingId === link.id}
              className="rounded-[6px] p-1.5 text-[var(--text-4)] transition hover:bg-red-50 hover:text-red-600"
              title="Delete"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </article>

      {editing && (
        <DocumentLinkFormModal
          link={link}
          onSave={(input) => void handleSave(input)}
          onClose={() => { setEditing(false); setError(null); }}
          isSaving={updateMutation.isPending}
          error={error}
        />
      )}
    </>
  );
}

function DocumentLinkFormModal({
  link,
  onSave,
  onClose,
  isSaving,
  error,
}: {
  link?: ClientDocumentLinkRecord | null;
  onSave: (input: LinkInput) => void;
  onClose: () => void;
  isSaving: boolean;
  error?: string | null;
}) {
  const [form, setForm] = useState<LinkInput>({
    name: link?.name ?? "",
    url: link?.url ?? "",
    notes: link?.notes ?? "",
  });

  function set(field: keyof LinkInput, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit() {
    if (!form.name.trim() || !form.url.trim()) return;
    onSave(form);
  }

  return (
    <div className="fixed inset-0 z-30">
      <button
        type="button"
        aria-label="Close"
        className="app-dialog-backdrop absolute inset-0"
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="app-dialog-panel w-full max-w-lg overflow-hidden">
          <div className="widget-header">
            <span className="widget-header__label">{link ? "EDIT LINK" : "NEW DOCUMENT LINK"}</span>
          </div>

          <div className="space-y-4 p-6">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
                Name <span className="text-rose-600">*</span>
              </span>
              <input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className="app-input"
                placeholder="Project brief"
                autoFocus
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
                URL <span className="text-rose-600">*</span>
              </span>
              <input
                value={form.url}
                onChange={(e) => set("url", e.target.value)}
                className="app-input"
                placeholder="https://drive.google.com/…"
                type="url"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Notes</span>
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                className="app-input min-h-[80px] resize-y"
                placeholder="Access notes, what this is…"
              />
            </label>

            {error ? <p className="text-sm text-rose-700">{error}</p> : null}

            <div className="flex justify-end gap-2 border-t border-[rgba(0,0,0,0.06)] pt-4">
              <Button type="button" variant="secondary" size="md" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                loading={isSaving}
                onClick={handleSubmit}
                disabled={!form.name.trim() || !form.url.trim()}
              >
                {link ? "Save changes" : "Add link"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
