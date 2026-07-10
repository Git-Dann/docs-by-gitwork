"use client";

import { useRef, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  PhotoIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import type { WikiIntakeItemRecord } from "@/lib/api";
import {
  useCreatePublicWikiIntakeItem,
  useCreateWikiIntakeItem,
  useDeleteWikiIntakeItem,
  usePromoteWikiIntakeItem,
  useUpdateWikiIntakeItem,
  useUploadWikiIntakeItemImage,
  useUploadPublicWikiIntakeItemImage,
} from "@/hooks/use-wiki";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

type ItemType = "BUG" | "FEEDBACK" | "TASK";
type Priority = "LOW" | "MEDIUM" | "HIGH";

const TYPE_LABEL: Record<ItemType, string> = {
  BUG: "Bug",
  FEEDBACK: "Feedback",
  TASK: "Request",
};

const STATUS_LABEL: Record<string, string> = {
  NEW: "New",
  TRIAGED: "Triaged",
  PROMOTED: "Task created",
  CLOSED: "Closed",
};

export function WikiIntakeSection({
  slug,
  token,
  items,
  mode,
}: {
  slug: string;
  token?: string;
  items: WikiIntakeItemRecord[];
  mode: "internal" | "public";
}) {
  const isInternal = mode === "internal";
  const createInternal = useCreateWikiIntakeItem(slug);
  const createPublic = useCreatePublicWikiIntakeItem(token ?? "");
  const updateItem = useUpdateWikiIntakeItem(slug);
  const deleteItem = useDeleteWikiIntakeItem(slug);
  const promoteItem = usePromoteWikiIntakeItem(slug);
  const uploadImageInternal = useUploadWikiIntakeItemImage(slug);
  const uploadImagePublic = useUploadPublicWikiIntakeItemImage(token ?? "");

  const [localItems, setLocalItems] = useState(items);
  const [type, setType] = useState<ItemType>("FEEDBACK");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewingImageId, setViewingImageId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const visibleItems = isInternal ? items : localItems;
  const busy = createInternal.isPending || createPublic.isPending;
  const uploadingImage = uploadImageInternal.isPending || uploadImagePublic.isPending;

  function imageSrc(itemId: string, opts: { thumb?: boolean } = {}) {
    const qs = opts.thumb ? "?thumb=1" : "";
    return isInternal
      ? `/api/clients/${slug}/wiki/intake-items/${itemId}/image${qs}`
      : `/api/wiki/${token}/intake-items/${itemId}/image${qs}`;
  }

  async function submit() {
    setError(null);
    const payload = {
      type,
      priority,
      title: title.trim(),
      description: description.trim() || null,
      requestedBy: requestedBy.trim() || null,
    };
    if (!payload.title) {
      setError("Add a short title first.");
      return;
    }
    try {
      const created = isInternal
        ? await createInternal.mutateAsync(payload)
        : await createPublic.mutateAsync(payload);
      if (image) {
        const withImage = isInternal
          ? await uploadImageInternal.mutateAsync({ id: created.id, file: image })
          : await uploadImagePublic.mutateAsync({ id: created.id, file: image });
        if (!isInternal) setLocalItems((prev) => [withImage, ...prev]);
      } else if (!isInternal) {
        setLocalItems((prev) => [created, ...prev]);
      }
      setTitle("");
      setDescription("");
      setRequestedBy("");
      setPriority("MEDIUM");
      setType("FEEDBACK");
      setImage(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit this item.");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      {/* ── 01 // ADD REQUEST ── */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label" style={{ fontFamily: MONO }}>
            <span className="widget-header__label--number">01</span>
            {" // ADD REQUEST"}
          </span>
        </div>
        <div className="space-y-4 p-6">
          {/* Type — segmented pills */}
          <div className="grid gap-2 sm:grid-cols-3">
            {(["BUG", "FEEDBACK", "TASK"] as ItemType[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                className={[
                  "rounded-[8px] border px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.06em] transition",
                  type === value
                    ? "border-[var(--brand-500)] bg-[var(--surface-brand)] text-[var(--brand-800)]"
                    : "border-[var(--border-2)] bg-[var(--surface-0)] text-[var(--text-3)] hover:bg-[var(--surface-1)]",
                ].join(" ")}
                style={{ fontFamily: MONO }}
              >
                {TYPE_LABEL[value]}
              </button>
            ))}
          </div>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short title"
            className="app-input"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What happened, what should change, or any helpful context…"
            rows={4}
            className="app-input resize-y py-2.5 leading-relaxed"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="app-select"
            >
              <option value="LOW">Low priority</option>
              <option value="MEDIUM">Medium priority</option>
              <option value="HIGH">High priority</option>
            </select>
            <input
              value={requestedBy}
              onChange={(e) => setRequestedBy(e.target.value)}
              placeholder="Requested by (optional)"
              className="app-input"
            />
          </div>

          {/* Screenshot — optional, attached after the item is created. */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setImage(e.target.files?.[0] ?? null)}
            />
            {image ? (
              <div className="flex items-center gap-2 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2">
                <PhotoIcon className="h-4 w-4 shrink-0 text-[var(--text-3)]" />
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-2)]">{image.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setImage(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  aria-label="Remove image"
                  className="shrink-0 text-[var(--text-4)] transition hover:text-[var(--text-2)]"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-3)] transition hover:text-[var(--text-1)]"
              >
                <PhotoIcon className="h-4 w-4" />
                Attach a screenshot (optional)
              </button>
            )}
          </div>

          {error && <p className="text-sm text-[var(--danger-600,#dc2626)]">{error}</p>}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || uploadingImage}
              className="inline-flex items-center gap-2 rounded-[8px] bg-[var(--brand-600)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-700)] disabled:opacity-60"
            >
              <PlusIcon className="h-4 w-4" />
              {uploadingImage ? "Uploading image…" : busy ? "Adding…" : "Add request"}
            </button>
          </div>
        </div>
      </section>

      {/* ── 02 // INTAKE LIST ── */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label" style={{ fontFamily: MONO }}>
            <span className="widget-header__label--number">02</span>
            {" // INTAKE LIST"}
          </span>
          {visibleItems.length > 0 && (
            <span className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
              {visibleItems.length} ITEM{visibleItems.length === 1 ? "" : "S"}
            </span>
          )}
        </div>
        <div className="divide-y divide-[var(--border-1)]">
          {visibleItems.length === 0 ? (
            <p className="p-8 text-center text-sm text-[var(--text-4)]">No bugs, feedback, or requests yet.</p>
          ) : (
            visibleItems.map((item) => (
              <article key={item.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      <span
                        className="rounded-full bg-[var(--surface-brand)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-700)]"
                        style={{ fontFamily: MONO }}
                      >
                        {TYPE_LABEL[item.type as ItemType]}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)] ring-1 ring-[var(--border-1)]"
                        style={{ fontFamily: MONO }}
                      >
                        {item.priority}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)] ring-1 ring-[var(--border-1)]"
                        style={{ fontFamily: MONO }}
                      >
                        {STATUS_LABEL[item.status] ?? item.status}
                      </span>
                    </div>
                    <h3 className="text-[15px] font-semibold text-[var(--text-1)]">{item.title}</h3>
                    {item.description && (
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--text-3)]">{item.description}</p>
                    )}
                    {item.hasImage ? (
                      <button
                        type="button"
                        onClick={() => setViewingImageId(item.id)}
                        className="mt-2 block overflow-hidden rounded-[6px] border border-[var(--border-2)]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageSrc(item.id, { thumb: true })}
                          alt={item.imageFilename ?? "Attached screenshot"}
                          className="h-16 w-16 object-cover transition hover:opacity-90"
                        />
                      </button>
                    ) : null}
                    <p className="mt-2 text-[12px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                      {item.requestedBy ? `${item.requestedBy} · ` : ""}
                      {new Date(item.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  {isInternal && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {item.status !== "PROMOTED" ? (
                        <button
                          type="button"
                          disabled={promoteItem.isPending}
                          onClick={() => void promoteItem.mutateAsync({ id: item.id })}
                          className="inline-flex items-center gap-1.5 rounded-[7px] bg-[var(--brand-600)] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[var(--brand-700)] disabled:opacity-60"
                        >
                          <CheckCircleIcon className="h-4 w-4" /> Create task
                        </button>
                      ) : item.taskId ? (
                        <a
                          href={`/app/portal/${slug}/tasks`}
                          className="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--border-2)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                        >
                          View tasks <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          void updateItem.mutateAsync({
                            id: item.id,
                            data: { status: item.status === "CLOSED" ? "NEW" : "CLOSED" },
                          })
                        }
                        className="rounded-[7px] border border-[var(--border-2)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                      >
                        {item.status === "CLOSED" ? "Reopen" : "Close"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteItem.mutateAsync(item.id)}
                        aria-label="Delete item"
                        className="inline-flex items-center rounded-[7px] border border-[var(--border-2)] px-2 py-1.5 text-[var(--text-4)] transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      {viewingImageId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setViewingImageId(null)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-2xl overflow-auto rounded-[10px] bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border-2)] px-4 py-2.5">
              <span className="text-xs text-[var(--text-3)]" style={{ fontFamily: MONO }}>
                Attached screenshot
              </span>
              <button
                type="button"
                onClick={() => setViewingImageId(null)}
                aria-label="Close"
                className="rounded-[6px] p-1.5 text-[var(--text-3)] transition hover:bg-[var(--surface-1)]"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="bg-[var(--surface-1)] p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageSrc(viewingImageId)}
                alt="Attached screenshot"
                className="mx-auto max-h-[70vh] w-auto rounded-[6px] border border-[var(--border-2)] bg-white"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
