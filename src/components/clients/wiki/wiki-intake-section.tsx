"use client";

import { useRef, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  ChatBubbleLeftIcon,
  CheckCircleIcon,
  PaperClipIcon,
  PhotoIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import type { WikiIntakeItemRecord } from "@/lib/api";
import {
  DEFAULT_INTAKE_CATEGORIES,
  displayCategory,
  type IntakeCategory,
} from "@/lib/wiki-intake-categories";
import {
  useCreatePublicWikiIntakeItem,
  useCreateWikiIntakeItem,
  useDeleteWikiIntakeItem,
  usePromoteWikiIntakeItem,
  useUpdateWikiIntakeItem,
  useUploadWikiIntakeItemImage,
  useUploadPublicWikiIntakeItemImage,
  useUpdatePublicWikiIntakeItem,
  useDeletePublicWikiIntakeItem,
  useAddWikiIntakeComment,
  useAddPublicWikiIntakeComment,
} from "@/hooks/use-wiki";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

type Priority = "LOW" | "MEDIUM" | "HIGH";

const STATUS_LABEL: Record<string, string> = {
  NEW: "New",
  TRIAGED: "Triaged",
  PROMOTED: "Task created",
  CLOSED: "Closed",
};

/** The dev-facing label taxonomy, mirrored from TASK_LABELS/TASK_LABEL_LABELS
 *  (`src/types/tasks.ts`) so a request lands on the board already categorised
 *  the way devs filter. Kept as a literal list rather than imported so this
 *  client component doesn't pull the whole task types module into the public
 *  wiki bundle — the reconcile test below keeps the two in step. */
type DevLabel = "BACKEND" | "FRONTEND" | "UI_UX" | "RESEARCH" | "DESIGN" | "SUPPORT";
const DEV_LABELS: DevLabel[] = ["BACKEND", "FRONTEND", "UI_UX", "RESEARCH", "DESIGN", "SUPPORT"];
/**
 * Statuses a client may still edit or withdraw themselves. Mirrors
 * CLIENT_MUTABLE_STATUSES in src/server/wiki.ts — the server is the gate, this
 * only decides whether to offer the button.
 */
const CLIENT_EDITABLE = ["NEW", "TRIAGED"];
const DEV_LABEL_LABEL: Record<DevLabel, string> = {
  BACKEND: "Backend",
  FRONTEND: "Frontend",
  UI_UX: "UI/UX Done",
  RESEARCH: "Research",
  DESIGN: "Design",
  SUPPORT: "Support",
};

const PAGE_SIZE = 10;

/**
 * Requests still needing attention.
 *
 * "Mark dealt with" sets status CLOSED, and until now a dealt-with request stayed
 * in the list forever — so the page grew monotonically and the things actually
 * outstanding got harder to find with every one you resolved. Dealt-with items
 * are hidden by default and revealed by the toggle beside the category tabs;
 * nothing is deleted, and the count is always shown so it never looks like work
 * went missing.
 */
export function visibleIntakeItems<T extends { status: string }>(
  items: readonly T[],
  showDealtWith: boolean,
): T[] {
  return showDealtWith ? [...items] : items.filter((i) => i.status !== "CLOSED");
}

export function WikiIntakeSection({
  slug,
  token,
  items,
  mode,
  categories = DEFAULT_INTAKE_CATEGORIES,
}: {
  slug: string;
  token?: string;
  items: WikiIntakeItemRecord[];
  mode: "internal" | "public";
  /** The client's own categories — defaults to the built-in four. */
  categories?: IntakeCategory[];
}) {
  const isInternal = mode === "internal";
  const createInternal = useCreateWikiIntakeItem(slug);
  const createPublic = useCreatePublicWikiIntakeItem(token ?? "");
  const updateItem = useUpdateWikiIntakeItem(slug);
  const deleteItem = useDeleteWikiIntakeItem(slug);
  const promoteItem = usePromoteWikiIntakeItem(slug);
  const uploadImageInternal = useUploadWikiIntakeItemImage(slug);
  const uploadImagePublic = useUploadPublicWikiIntakeItemImage(token ?? "");
  const updatePublic = useUpdatePublicWikiIntakeItem(token ?? "");
  const deletePublic = useDeletePublicWikiIntakeItem(token ?? "");
  const addCommentInternal = useAddWikiIntakeComment(slug);
  const addCommentPublic = useAddPublicWikiIntakeComment(token ?? "");

  const [localItems, setLocalItems] = useState(items);
  /** Which items' reply threads are open — collapsed by default so a long
   *  list stays scannable; a request with replies already shown expanded. */
  const [openComments, setOpenComments] = useState<Set<string>>(new Set());
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [commentError, setCommentError] = useState<{ id: string; message: string } | null>(null);
  const [postingCommentId, setPostingCommentId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id ?? "FEEDBACK");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [label, setLabel] = useState<DevLabel | "">("");
  const [device, setDevice] = useState("");
  const [osVersion, setOsVersion] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewingImageId, setViewingImageId] = useState<string | null>(null);
  /** Which row's delete is armed — see the two-step delete in the actions below. */
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  /** Which of their own requests the client is editing, and the draft values. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ title: string; description: string; priority: Priority }>(
    { title: "", description: "", priority: "MEDIUM" },
  );
  /** Keyed by item id: a failed Withdraw happens with no edit panel open, so a
   *  bare string would have nowhere to render and the failure would be silent. */
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState<string>("ALL");
  /** Off by default: the list should show what still needs doing. */
  const [showDealtWith, setShowDealtWith] = useState(false);
  const [page, setPage] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function selectTab(tab: string) {
    setActiveTab(tab);
    setPage(1);
  }

  /** A request belongs to a tab by its categoryId. Requests raised BEFORE this
   *  client had categories carry none, so they fall back to the first category
   *  that behaves as their underlying type — otherwise switching a client onto
   *  custom categories would drop every existing request out of every tab.
   *  First-match keeps each item in exactly one tab, so the counts still sum;
   *  an item whose type no category covers stays visible under "All". */
  function inCategory(item: WikiIntakeItemRecord, id: string): boolean {
    if (item.categoryId) return item.categoryId === id;
    return categories.find((c) => c.mapsTo === item.type)?.id === id;
  }

  const allItems = isInternal ? items : localItems;
  const dealtWithCount = allItems.filter((item) => item.status === "CLOSED").length;
  /** What the tabs count and the list shows — the dealt-with filter applies to both,
   *  or a tab would read "5" above three rows. */
  const scopedItems = visibleIntakeItems(allItems, showDealtWith);
  const filteredItems =
    activeTab === "ALL" ? scopedItems : scopedItems.filter((item) => inCategory(item, activeTab));
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
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
    // Only the categoryId is sent — the server derives the underlying type from
    // it, so the client's wording and the board's behaviour can't drift apart.
    const payload = {
      categoryId,
      priority,
      title: title.trim(),
      description: description.trim() || null,
      label: label || null,
      device: device.trim() || null,
      osVersion: osVersion.trim() || null,
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
      setPriority("MEDIUM");
      setCategoryId(categories[0]?.id ?? "FEEDBACK");
      setLabel("");
      setDevice("");
      setOsVersion("");
      setImage(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit this item.");
    }
  }

  function toggleComments(itemId: string) {
    setOpenComments((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  async function postComment(itemId: string) {
    const body = (commentDraft[itemId] ?? "").trim();
    if (!body) return;
    setCommentError(null);
    setPostingCommentId(itemId);
    try {
      const comment = isInternal
        ? await addCommentInternal.mutateAsync({ itemId, body })
        : await addCommentPublic.mutateAsync({ itemId, body });
      if (!isInternal) {
        setLocalItems((prev) =>
          prev.map((i) => (i.id === itemId ? { ...i, comments: [...i.comments, comment] } : i)),
        );
      }
      setCommentDraft((prev) => ({ ...prev, [itemId]: "" }));
      setOpenComments((prev) => new Set(prev).add(itemId));
    } catch (err) {
      setCommentError({
        id: itemId,
        message: err instanceof Error ? err.message : "Could not post that reply.",
      });
    } finally {
      setPostingCommentId(null);
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
          {/* Category — a dropdown rather than segmented pills: a client's own
              list can run to a dozen entries with long labels ("Quick Design
              fix (V1)"), which as pills wrapped to three-plus rows and pushed
              the actual form off the fold. One control, one line, any length. */}
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-label="Category"
            className="app-select"
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.label}
              </option>
            ))}
          </select>

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
          {/* Priority + label pair up: two short pickers, one row.
              There is deliberately no "Requested by" field. Every route into this
              form is authenticated — a client user signed into their wiki, or a
              Gitwork user internally — so the submitter is stamped server-side
              from that identity (see resolveRequestedBy). Asking someone to type
              their own name collected something we already knew and could not
              trust anyway. */}
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
            {/* Dev label — the same taxonomy the task board uses, so a promoted
                request arrives already categorised for whoever picks it up. */}
            <select
              value={label}
              onChange={(e) => setLabel(e.target.value as DevLabel | "")}
              aria-label="Label"
              className="app-select"
            >
              <option value="">No label (optional)</option>
              {DEV_LABELS.map((value) => (
                <option key={value} value={value}>
                  {DEV_LABEL_LABEL[value]}
                </option>
              ))}
            </select>
          </div>

          {/* Device/OS — optional context for bug reports; free text since we
              can't know every client's device fleet ahead of time. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={device}
              onChange={(e) => setDevice(e.target.value)}
              placeholder="Device (optional, e.g. iPhone 14 Pro)"
              className="app-input"
            />
            <input
              value={osVersion}
              onChange={(e) => setOsVersion(e.target.value)}
              placeholder="OS version (optional, e.g. iOS 17.4)"
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
          {filteredItems.length > 0 && (
            <span className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
              {filteredItems.length} ITEM{filteredItems.length === 1 ? "" : "S"}
            </span>
          )}
        </div>
        {/* Category tabs — filters the list below; doesn't affect what a client
            can submit on the left. Keeps Design items out of a dev's way without
            splitting them into a separate page. */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-1)] px-5 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
          {[{ id: "ALL", label: "All" }, ...categories].map((tab) => {
            const count =
              tab.id === "ALL"
                ? scopedItems.length
                : scopedItems.filter((item) => inCategory(item, tab.id)).length;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectTab(tab.id)}
                title={tab.label}
                className={[
                  "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] transition",
                  active
                    ? "bg-[var(--brand-600)] text-white"
                    : "text-[var(--text-3)] ring-1 ring-[var(--border-1)] hover:bg-[var(--surface-1)]",
                ].join(" ")}
                style={{ fontFamily: MONO }}
              >
                {tab.label} <span className={active ? "text-white/70" : "text-[var(--text-4)]"}>{count}</span>
              </button>
            );
          })}
          </div>
          {/* Dealt-with toggle — far right of the tabs. Rendered only when there is
              something to reveal, or while it's on so it can be switched back off.
              Nothing is deleted: the count states exactly how much is hidden. */}
          {dealtWithCount > 0 || showDealtWith ? (
            <button
              type="button"
              aria-pressed={showDealtWith}
              onClick={() => {
                setShowDealtWith((v) => !v);
                setPage(1);
              }}
              title={
                showDealtWith
                  ? "Hide requests already dealt with"
                  : "Show requests already dealt with"
              }
              className={[
                "shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] transition",
                showDealtWith
                  ? "bg-[var(--text-2)] text-white"
                  : "text-[var(--text-4)] ring-1 ring-[var(--border-1)] hover:bg-[var(--surface-1)]",
              ].join(" ")}
              style={{ fontFamily: MONO }}
            >
              Dealt with{" "}
              <span className={showDealtWith ? "text-white/70" : "text-[var(--text-4)]"}>
                {dealtWithCount}
              </span>
            </button>
          ) : null}
        </div>
        <div className="divide-y divide-[var(--border-1)]">
          {filteredItems.length === 0 ? (
            <p className="p-8 text-center text-sm text-[var(--text-4)]">
              {!showDealtWith && dealtWithCount > 0 && allItems.length === dealtWithCount
                ? `Nothing outstanding — ${dealtWithCount} request${dealtWithCount === 1 ? "" : "s"} dealt with.`
                : activeTab === "ALL"
                ? "No bugs, feedback, or requests yet."
                : `No ${(categories.find((c) => c.id === activeTab)?.label ?? activeTab).toLowerCase()} items yet.`}
            </p>
          ) : (
            pagedItems.map((item) => {
              // Guard rather than trust `comments` is present — same principle
              // as the server-side Json-column guards.
              const itemComments = item.comments ?? [];
              return (
              <article key={item.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      <span
                        className="rounded-full bg-[var(--surface-brand)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-700)]"
                        style={{ fontFamily: MONO }}
                      >
                        {displayCategory(categories, item)}
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
                      {item.label ? (
                        <span
                          title="Dev label — carried onto the task when this is promoted"
                          className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]"
                          style={{ fontFamily: MONO }}
                        >
                          {DEV_LABEL_LABEL[item.label as DevLabel] ?? item.label}
                        </span>
                      ) : null}
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
                    {/* Links sent by the intake API. Storing the source link and
                        then never showing it would defeat the point — the whole
                        reason a client sends it is so the team can open the item
                        in their tracker. Attachments are the client's URLs, so
                        they open in a new tab and carry noreferrer. */}
                    {(item.externalUrl || item.attachmentUrls.length > 0) && (
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {item.externalUrl ? (
                          <a
                            href={item.externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--brand-700)] transition hover:text-[var(--brand-800)]"
                          >
                            <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                            {item.externalRef ? `Open ${item.externalRef}` : "Open in their tracker"}
                          </a>
                        ) : null}
                        {item.attachmentUrls.map((url, i) => (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[12px] text-[var(--text-3)] underline decoration-dotted underline-offset-2 transition hover:text-[var(--text-1)]"
                          >
                            <PaperClipIcon className="h-3.5 w-3.5" />
                            Attachment {i + 1}
                          </a>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 text-[12px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                      {item.requestedBy ? `${item.requestedBy} · ` : ""}
                      {new Date(item.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                      {item.device ? ` · ${item.device}` : ""}
                      {item.osVersion ? ` · ${item.osVersion}` : ""}
                    </p>
                  </div>
                  {/* The client's own controls: fix or withdraw a request they raised.
                      Only while it is still theirs to change — once PROMOTED a dev
                      owns the task it became, and CLOSED is a record. The server
                      enforces this; hiding the buttons just avoids offering an
                      action that would be refused. */}
                  {!isInternal && CLIENT_EDITABLE.includes(item.status) && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRowError(null);
                          setEditingId(item.id);
                          setEditDraft({
                            title: item.title,
                            description: item.description ?? "",
                            priority: item.priority as Priority,
                          });
                        }}
                        className="rounded-[7px] border border-[var(--border-2)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                      >
                        Edit
                      </button>
                      {/* Two-step, same as internally: a single-click delete sitting
                          next to Edit is one slip from losing what they wrote. */}
                      {confirmDeleteId === item.id ? (
                        <span className="inline-flex items-center gap-1.5 rounded-[7px] border border-rose-300 bg-rose-50 px-2 py-1.5">
                          <span className="text-[12px] font-medium text-rose-700">Withdraw it?</span>
                          <button
                            type="button"
                            disabled={deletePublic.isPending}
                            onClick={async () => {
                              try {
                                await deletePublic.mutateAsync(item.id);
                                setLocalItems((prev) => prev.filter((i) => i.id !== item.id));
                              } catch (err) {
                                setRowError({
                                  id: item.id,
                                  message:
                                    err instanceof Error ? err.message : "Could not withdraw that.",
                                });
                              }
                              setConfirmDeleteId(null);
                            }}
                            className="rounded-[6px] bg-rose-600 px-2 py-0.5 text-[12px] font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
                          >
                            Withdraw
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-1 text-[12px] text-[var(--text-4)] transition hover:text-[var(--text-1)]"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(item.id)}
                          className="rounded-[7px] border border-[var(--border-2)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-4)] transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                        >
                          Withdraw
                        </button>
                      )}
                    </div>
                  )}
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
                      {/* "Close" alone read as though it might close the task too.
                          It doesn't — it only files the request as dealt with. */}
                      <button
                        type="button"
                        title={
                          item.status === "CLOSED"
                            ? "Put this request back on the open list."
                            : "Files the request as dealt with. Any task already created from it is not affected."
                        }
                        onClick={() =>
                          void updateItem.mutateAsync({
                            id: item.id,
                            data: { status: item.status === "CLOSED" ? "NEW" : "CLOSED" },
                          })
                        }
                        className="rounded-[7px] border border-[var(--border-2)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                      >
                        {item.status === "CLOSED" ? "Reopen request" : "Mark dealt with"}
                      </button>
                      {/* Delete is two-step. It used to fire on a single click next
                          to the everyday buttons, which is one slip away from
                          destroying something a client submitted — and unlike
                          closing, it can't be undone. */}
                      {confirmDeleteId === item.id ? (
                        <span className="inline-flex items-center gap-1.5 rounded-[7px] border border-rose-300 bg-rose-50 px-2 py-1.5">
                          <span className="text-[12px] font-medium text-rose-700">
                            Delete permanently?
                          </span>
                          <button
                            type="button"
                            disabled={deleteItem.isPending}
                            onClick={async () => {
                              await deleteItem.mutateAsync(item.id);
                              setConfirmDeleteId(null);
                            }}
                            className="rounded-[6px] bg-rose-600 px-2 py-0.5 text-[12px] font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-1 text-[12px] text-[var(--text-4)] transition hover:text-[var(--text-1)]"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(item.id)}
                          aria-label="Delete request"
                          title="Delete this request permanently. Prefer 'Mark dealt with' — deleting can't be undone."
                          className="inline-flex items-center rounded-[7px] border border-[var(--border-2)] px-2 py-1.5 text-[var(--text-4)] transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Inline edit — the client fixing what they wrote. Only the fields
                    they filled in: status, promotion and the dev label are ours. */}
                {editingId === item.id && (
                  <div className="mt-3 space-y-2.5 border-t border-[var(--border-2)] pt-3">
                    <input
                      value={editDraft.title}
                      onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                      placeholder="Short title"
                      className="app-input"
                    />
                    <textarea
                      value={editDraft.description}
                      onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                      rows={3}
                      placeholder="What happened, what should change, or any helpful context…"
                      className="app-input resize-y py-2.5 leading-relaxed"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={editDraft.priority}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, priority: e.target.value as Priority }))
                        }
                        className="app-select-compact"
                      >
                        <option value="LOW">Low priority</option>
                        <option value="MEDIUM">Medium priority</option>
                        <option value="HIGH">High priority</option>
                      </select>
                      <button
                        type="button"
                        disabled={updatePublic.isPending || !editDraft.title.trim()}
                        onClick={async () => {
                          setRowError(null);
                          try {
                            const saved = await updatePublic.mutateAsync({
                              id: item.id,
                              patch: {
                                title: editDraft.title.trim(),
                                description: editDraft.description.trim() || null,
                                priority: editDraft.priority,
                              },
                            });
                            setLocalItems((prev) => prev.map((i) => (i.id === saved.id ? saved : i)));
                            setEditingId(null);
                          } catch (err) {
                            setRowError({
                              id: item.id,
                              message:
                                err instanceof Error ? err.message : "Could not save that change.",
                            });
                          }
                        }}
                        className="rounded-[7px] bg-[var(--brand-600)] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[var(--brand-700)] disabled:opacity-60"
                      >
                        {updatePublic.isPending ? "Saving…" : "Save changes"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setRowError(null);
                        }}
                        className="px-1 text-[12px] text-[var(--text-4)] transition hover:text-[var(--text-1)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Whatever went wrong on this row — save OR withdraw. */}
                {rowError?.id === item.id && (
                  <p className="mt-2 text-[12px] text-rose-600">{rowError.message}</p>
                )}

                {/* Reply thread — either side can add to it, so the client sees
                    when a fix is in place without being told outside the wiki. */}
                <div className="mt-3 border-t border-[var(--border-2)] pt-3">
                  <button
                    type="button"
                    onClick={() => toggleComments(item.id)}
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-3)] transition hover:text-[var(--text-1)]"
                  >
                    <ChatBubbleLeftIcon className="h-3.5 w-3.5" />
                    {itemComments.length > 0
                      ? `${itemComments.length} repl${itemComments.length === 1 ? "y" : "ies"}`
                      : "Reply"}
                  </button>
                  {openComments.has(item.id) && (
                    <div className="mt-2.5 space-y-2.5">
                      {itemComments.map((c) => (
                        <div key={c.id} className="rounded-[8px] bg-[var(--surface-1)] px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[12px] font-semibold text-[var(--text-1)]">
                              {c.authorName}
                            </span>
                            <span
                              className={[
                                "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em]",
                                c.authorKind === "TEAM"
                                  ? "bg-[var(--surface-brand)] text-[var(--brand-700)]"
                                  : "bg-[var(--surface-2)] text-[var(--text-3)]",
                              ].join(" ")}
                              style={{ fontFamily: MONO }}
                            >
                              {c.authorKind === "TEAM" ? "Gitwork" : "Client"}
                            </span>
                            <span className="text-[11px] text-[var(--text-4)]">
                              {new Date(c.createdAt).toLocaleDateString(undefined, {
                                day: "numeric",
                                month: "short",
                              })}
                            </span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-2)]">
                            {c.body}
                          </p>
                        </div>
                      ))}
                      <div className="flex items-start gap-2">
                        <textarea
                          value={commentDraft[item.id] ?? ""}
                          onChange={(e) =>
                            setCommentDraft((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          placeholder="Write a reply…"
                          rows={2}
                          className="app-input resize-y py-2 text-[13px] leading-relaxed"
                        />
                        <button
                          type="button"
                          disabled={postingCommentId === item.id || !(commentDraft[item.id] ?? "").trim()}
                          onClick={() => void postComment(item.id)}
                          className="shrink-0 rounded-[7px] bg-[var(--brand-600)] px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-[var(--brand-700)] disabled:opacity-60"
                        >
                          {postingCommentId === item.id ? "Posting…" : "Reply"}
                        </button>
                      </div>
                      {commentError?.id === item.id && (
                        <p className="text-[12px] text-rose-600">{commentError.message}</p>
                      )}
                    </div>
                  )}
                </div>
              </article>
              );
            })
          )}
        </div>
        {filteredItems.length > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 border-t border-[var(--border-1)] px-5 py-3">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
              className="rounded-[7px] border border-[var(--border-2)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
              PAGE {currentPage} OF {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
              className="rounded-[7px] border border-[var(--border-2)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
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
