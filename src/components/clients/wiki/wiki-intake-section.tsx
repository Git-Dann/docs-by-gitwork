"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  ArrowUpTrayIcon,
  ChatBubbleLeftIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
  MagnifyingGlassIcon,
  PaperClipIcon,
  PhotoIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import type { WikiIntakeItemRecord } from "@/lib/api";
import { RequestImportModal } from "@/components/clients/wiki/request-import-modal";
import { fuzzySearch, normalise } from "@/lib/fuzzy-search";
import {
  STAGE_HINT,
  STAGE_LABEL,
  STAGE_ORDER,
  STAGE_STYLE,
  type RequestStage,
} from "@/lib/wiki-request-stage";
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
  useImportWikiIntakeItems,
} from "@/hooks/use-wiki";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

type Priority = "LOW" | "MEDIUM" | "HIGH";

const PRIORITY_STYLE: Record<Priority, string> = {
  HIGH: "bg-red-50 text-red-700",
  MEDIUM: "bg-[var(--surface-1)] text-[var(--text-3)]",
  LOW: "bg-[var(--surface-1)] text-[var(--text-4)]",
};

/** The dev-facing label taxonomy, mirrored from TASK_LABELS/TASK_LABEL_LABELS
 *  (`src/types/tasks.ts`) so a request lands on the board already categorised
 *  the way devs filter. Kept as a literal list rather than imported so this
 *  client component doesn't pull the whole task types module into the public
 *  wiki bundle — `dev-label-parity.test.ts` keeps the two in step. */
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

/** 25, not the old 10. This is a tracker now — a page that fits on one screen of a
 *  laptop is worth more than a shorter one you have to click through. */
const PAGE_SIZE = 25;

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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Tab-separated, one row per request — what pastes straight into Google Sheets or
 * Excel as real columns.
 *
 * The reason this exists: clients keep parallel spreadsheets because ours was not
 * one. Rather than pretend nobody will ever want the data elsewhere, the export is
 * one click and lands in the shape they already work in.
 */
export function requestsAsTsv(
  rows: readonly WikiIntakeItemRecord[],
  categories: readonly IntakeCategory[],
): string {
  const head = ["Request", "Category", "Priority", "Stage", "Requested by", "Logged", "Updated"];
  const body = rows.map((item) =>
    [
      item.title,
      displayCategory(categories as IntakeCategory[], item),
      item.priority,
      STAGE_LABEL[item.stage],
      item.requestedBy ?? "",
      item.createdAt.slice(0, 10),
      item.updatedAt.slice(0, 10),
    ]
      // A tab or newline inside a title would split one row into several columns or
      // several rows — silently, and only for the request that happened to contain one.
      .map((cell) => String(cell).replace(/[\t\r\n]+/g, " "))
      .join("\t"),
  );
  return [head.join("\t"), ...body].join("\n");
}

/** The stage chip. Carries its own explanation, because "Reviewing" means two
 *  different-looking things (not triaged yet / task has gone) and a client reading
 *  the column deserves to know which. */
function StageChip({ stage, title }: { stage: RequestStage; title?: string }) {
  // `stage` is server-derived and required by the type, so this should be unreachable —
  // except for one real case: a React Query cache populated by the deploy BEFORE this
  // field existed. Without the guard those rows rendered a chip with no text and a
  // literal `undefined` in its class list, which reads as a broken column rather than as
  // stale data. An em-dash says what is true: we do not know yet.
  if (!STAGE_LABEL[stage]) {
    return <span className="text-[11px] text-[var(--text-4)]">—</span>;
  }
  return (
    <span
      title={title ?? STAGE_HINT[stage]}
      className={`inline-block max-w-full truncate rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${STAGE_STYLE[stage]}`}
      style={{ fontFamily: MONO }}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
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
  const importItems = useImportWikiIntakeItems(slug);

  const [localItems, setLocalItems] = useState(items);
  /** Which rows are expanded. A grid row is a summary; everything the old card
   *  showed (description, screenshot, links, device/OS, replies) lives here. */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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
  const [showMoreFields, setShowMoreFields] = useState(false);
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
  const [stageFilter, setStageFilter] = useState<RequestStage | "ALL">("ALL");
  const [search, setSearch] = useState("");
  /** Off by default: the list should show what still needs doing. */
  const [showDealtWith, setShowDealtWith] = useState(false);
  const [page, setPage] = useState(1);
  /** Bulk selection — internal only. */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
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

  /**
   * Search spans EVERY category and EVERY stage, and overrides the tabs while it has
   * a value — the same rule as the course-request search, for the same reason: the
   * question is "did we already log this?", and an answer of "not under Bugs" is
   * useless for something filed as Feedback and since shipped. Each row shows its own
   * category and stage, so a hit reads correctly whichever bucket it came from.
   */
  const searching = normalise(search).length > 0;
  const searchResults = useMemo(
    () =>
      fuzzySearch(allItems, search, (item) => [
        item.title,
        item.description,
        item.requestedBy,
        item.externalRef,
      ]),
    [allItems, search],
  );

  const afterTab = searching
    ? searchResults
    : activeTab === "ALL"
      ? scopedItems
      : scopedItems.filter((item) => inCategory(item, activeTab));
  const filteredItems =
    stageFilter === "ALL" ? afterTab : afterTab.filter((item) => item.stage === stageFilter);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const busy = createInternal.isPending || createPublic.isPending;
  const uploadingImage = uploadImageInternal.isPending || uploadImagePublic.isPending;

  /** Stages actually present, so the filter never offers an empty bucket. */
  const stagesPresent = STAGE_ORDER.filter((stage) => allItems.some((i) => i.stage === stage));
  const selectedRows = allItems.filter((item) => selected.has(item.id));
  const allVisibleSelected =
    pagedItems.length > 0 && pagedItems.every((item) => selected.has(item.id));

  function imageSrc(itemId: string, opts: { thumb?: boolean } = {}) {
    const qs = opts.thumb ? "?thumb=1" : "";
    return isInternal
      ? `/api/clients/${slug}/wiki/intake-items/${itemId}/image${qs}`
      : `/api/wiki/${token}/intake-items/${itemId}/image${qs}`;
  }

  function toggleRow(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
    } catch (err) {
      setCommentError({
        id: itemId,
        message: err instanceof Error ? err.message : "Could not post that reply.",
      });
    } finally {
      setPostingCommentId(null);
    }
  }

  async function copySelected() {
    const text = requestsAsTsv(selectedRows.length ? selectedRows : filteredItems, categories);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* Clipboard denied (insecure context, or the user said no) — the button
         simply doesn't confirm. Nothing was lost and nothing needs undoing. */
    }
  }

  async function batchSetStatus(status: "CLOSED" | "NEW") {
    setBatchBusy(true);
    try {
      for (const item of selectedRows) {
        if (item.status === status) continue;
        await updateItem.mutateAsync({ id: item.id, data: { status } });
      }
      setSelected(new Set());
    } finally {
      setBatchBusy(false);
    }
  }

  async function batchPromote() {
    setBatchBusy(true);
    try {
      for (const item of selectedRows) {
        // Already on the board — promoting again is a no-op server-side, but skipping
        // it here keeps the progress honest and saves a round trip per row.
        if (item.taskId) continue;
        await promoteItem.mutateAsync({ id: item.id });
      }
      setSelected(new Set());
    } finally {
      setBatchBusy(false);
    }
  }

  async function batchDelete() {
    setBatchBusy(true);
    try {
      for (const item of selectedRows) await deleteItem.mutateAsync(item.id);
      setSelected(new Set());
      setConfirmBatchDelete(false);
    } finally {
      setBatchBusy(false);
    }
  }

  /**
   * Column layout.
   *
   * Below `md` the table collapses to TWO columns — the request and its stage — and the
   * rest of each row's data moves onto a mono sub-line under the title. That is why there
   * is no `min-w` until `md`: on a phone nothing overflows, so there is nothing to scroll
   * sideways to reach. From `md` up, the full grid needs ~700px of fixed columns before
   * the title gets a pixel, so it scrolls rather than reflows (docs/mobile-playbook.md).
   *
   * ⚠️ This section renders inside `.widget-card`, which is `overflow: hidden`. A child
   * wider than the card with no scroller of its own is not merely off-screen, it is
   * UNREACHABLE — and a page-overflow check reports clean while it happens (CLAUDE.md
   * §45.2). The header row and the rows share ONE scroller so their columns stay in step.
   */
  const gridCls = isInternal
    ? "grid grid-cols-[1fr_112px] md:grid-cols-[20px_1fr_104px_74px_112px_104px_78px_96px] items-center gap-x-3 px-3"
    : "grid grid-cols-[1fr_112px] md:grid-cols-[1fr_104px_74px_112px_104px_78px] items-center gap-x-3 px-3";
  // 940px, not the ~700px the columns strictly need: at the tighter figure the 1fr title
  // is squeezed to ~120px and every request ellipses, which defeats the point of scrolling.
  const scrollInner = "md:min-w-[940px]";
  const headCell =
    "hidden md:block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]";

  return (
    <div className="space-y-4">
      {/* ── 01 // LOG A REQUEST ─────────────────────────────────────────────
          One line, Enter to file. The brief was "an easy way for clients to log
          requests, super snappy" — a nine-field form in a column beside the list
          is neither, and it cost the table half the page. Everything optional is
          behind "More fields", which stays open once opened. */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label" style={{ fontFamily: MONO }}>
            <span className="widget-header__label--number">01</span>
            {" // LOG A REQUEST"}
          </span>
        </div>
        <div className="space-y-3 p-4">
          {/* Wraps rather than switching at a breakpoint. A `sm:flex-row` here looked
              right in a full-width page and was measured at 38px of title input inside
              the wiki's own 405px content column — because the breakpoint asks about the
              VIEWPORT and the constraint is the CONTAINER. `flex-wrap` plus a real
              minimum on the field asks the right question: if the title cannot have
              220px, the selects drop to their own line instead of crushing it. */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy && !uploadingImage) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="What do you need? One line is enough."
              aria-label="Request title"
              className="app-input min-w-[220px] flex-1"
            />
            <div className="flex flex-1 gap-2 sm:flex-initial">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                aria-label="Category"
                className="app-select-compact w-full sm:w-[150px]"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                aria-label="Priority"
                className="app-select-compact w-full sm:w-[112px]"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || uploadingImage}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[8px] bg-[var(--brand-600)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-700)] disabled:opacity-60"
            >
              <PlusIcon className="h-4 w-4" />
              {uploadingImage ? "Uploading…" : busy ? "Adding…" : "Add"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowMoreFields((v) => !v)}
            aria-expanded={showMoreFields}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--text-3)] transition hover:text-[var(--text-1)]"
          >
            <ChevronRightIcon
              className={`h-3.5 w-3.5 transition-transform ${showMoreFields ? "rotate-90" : ""}`}
            />
            {showMoreFields ? "Fewer fields" : "More fields — detail, device, screenshot"}
          </button>

          {showMoreFields && (
            <div className="space-y-3 border-t border-[var(--border-2)] pt-3">
              {/* There is deliberately no "Requested by" field. Every route into this
                  form is authenticated — a client user signed into their wiki, or a
                  Gitwork user internally — so the submitter is stamped server-side from
                  that identity (see resolveRequestedBy). Asking someone to type their
                  own name collected something we already knew and could not trust. */}
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What happened, what should change, or any helpful context…"
                rows={3}
                className="app-input resize-y py-2.5 leading-relaxed"
              />
              <div className="grid gap-3 sm:grid-cols-3">
                {/* Dev label — the same taxonomy the task board uses, so a promoted
                    request arrives already categorised for whoever picks it up. */}
                <select
                  value={label}
                  onChange={(e) => setLabel(e.target.value as DevLabel | "")}
                  aria-label="Label"
                  className="app-select-compact"
                >
                  <option value="">No label (optional)</option>
                  {DEV_LABELS.map((value) => (
                    <option key={value} value={value}>
                      {DEV_LABEL_LABEL[value]}
                    </option>
                  ))}
                </select>
                {/* Device/OS — optional context for bug reports; free text since we
                    can't know every client's device fleet ahead of time. */}
                <input
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                  placeholder="Device (e.g. iPhone 14 Pro)"
                  className="app-input-compact"
                />
                <input
                  value={osVersion}
                  onChange={(e) => setOsVersion(e.target.value)}
                  placeholder="OS version (e.g. iOS 17.4)"
                  className="app-input-compact"
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
                    <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-2)]">
                      {image.name}
                    </span>
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
            </div>
          )}

          {error && <p className="text-sm text-[var(--danger-600,#dc2626)]">{error}</p>}
        </div>
      </section>

      {/* ── 02 // REQUESTS ─────────────────────────────────────────────────── */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label" style={{ fontFamily: MONO }}>
            <span className="widget-header__label--number">02</span>
            {" // REQUESTS"}
          </span>
          {filteredItems.length > 0 && (
            <span className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
              {filteredItems.length} ITEM{filteredItems.length === 1 ? "" : "S"}
            </span>
          )}
        </div>

        {/* Filters — category tabs, stage, search, dealt-with. */}
        <div className="space-y-2.5 border-b border-[var(--border-1)] px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {[{ id: "ALL", label: "All" }, ...categories].map((tab) => {
              const count =
                tab.id === "ALL"
                  ? scopedItems.length
                  : scopedItems.filter((item) => inCategory(item, tab.id)).length;
              const active = !searching && activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => selectTab(tab.id)}
                  title={tab.label}
                  className={[
                    "rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition",
                    active
                      ? "bg-[var(--text-1)] text-[var(--surface-0)]"
                      : "border border-[var(--border-2)] text-[var(--text-3)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]",
                  ].join(" ")}
                >
                  {tab.label}{" "}
                  <span className={active ? "opacity-70" : "text-[var(--text-4)]"}>{count}</span>
                </button>
              );
            })}
            {/* Dealt-with toggle. Rendered only when there is something to reveal, or
                while it's on so it can be switched back off. Nothing is deleted: the
                count states exactly how much is hidden. */}
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
                  "rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition",
                  showDealtWith
                    ? "bg-[var(--text-2)] text-[var(--surface-0)]"
                    : "border border-[var(--border-2)] text-[var(--text-4)] hover:bg-[var(--surface-1)]",
                ].join(" ")}
              >
                Dealt with{" "}
                <span className={showDealtWith ? "opacity-70" : "text-[var(--text-4)]"}>
                  {dealtWithCount}
                </span>
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Stage filter — the new axis, and the one a client actually scans for
                ("what's being worked on?"). Only offers stages that exist. */}
            {stagesPresent.length > 1 && (
              <select
                value={stageFilter}
                onChange={(e) => {
                  setStageFilter(e.target.value as RequestStage | "ALL");
                  setPage(1);
                }}
                aria-label="Filter by stage"
                className="app-select-compact w-full sm:w-[168px]"
              >
                <option value="ALL">Any stage</option>
                {stagesPresent.map((stage) => (
                  <option key={stage} value={stage}>
                    {STAGE_LABEL[stage]}
                  </option>
                ))}
              </select>
            )}
            <div className="relative min-w-0 flex-1 sm:max-w-[240px]">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-4)]" />
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Find any request…"
                aria-label="Search every request"
                className="app-input-compact w-full pl-8 pr-7"
              />
              {searching && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[4px] p-0.5 text-[var(--text-4)] transition hover:text-[var(--text-1)]"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {/* Import — internal only. A client pasting a sheet into their own wiki is
                not a thing anyone asked for, and it would bypass the per-client quota
                the public intake path is metered by. */}
            {isInternal && (
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                title="Import requests from a spreadsheet — paste, or a .csv/.tsv file"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
              >
                <ArrowUpTrayIcon className="h-3.5 w-3.5" />
                Import
              </button>
            )}
            <button
              type="button"
              onClick={() => void copySelected()}
              disabled={filteredItems.length === 0}
              title="Copy as tab-separated rows — pastes into Sheets or Excel as real columns"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)] disabled:opacity-40"
            >
              <ClipboardDocumentIcon className="h-3.5 w-3.5" />
              {copied ? "Copied" : selected.size > 0 ? `Copy ${selected.size}` : "Copy"}
            </button>
          </div>

          {searching && (
            <p
              className="text-[11px] uppercase tracking-[0.06em] text-[var(--text-4)]"
              style={{ fontFamily: MONO }}
            >
              {filteredItems.length} match{filteredItems.length === 1 ? "" : "es"} across all{" "}
              {allItems.length} requests
            </p>
          )}
        </div>

        {filteredItems.length === 0 ? (
          <p className="p-8 text-center text-sm text-[var(--text-4)]">
            {searching
              ? `No request matches “${search.trim()}” — searched all ${allItems.length}.`
              : !showDealtWith && dealtWithCount > 0 && allItems.length === dealtWithCount
                ? `Nothing outstanding — ${dealtWithCount} request${dealtWithCount === 1 ? "" : "s"} dealt with.`
                : stageFilter !== "ALL"
                  ? `Nothing at “${STAGE_LABEL[stageFilter]}” right now.`
                  : activeTab === "ALL"
                    ? "No bugs, feedback, or requests yet."
                    : `No ${(categories.find((c) => c.id === activeTab)?.label ?? activeTab).toLowerCase()} items yet.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className={scrollInner}>
              {/* Column header — inside the SAME scroller as the rows, or the two
                  desync the moment anyone scrolls sideways. */}
              <div
                className={`${gridCls} border-b border-[var(--border-1)] py-2`}
                style={{ fontFamily: MONO }}
              >
                {isInternal && (
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={() =>
                      setSelected(
                        allVisibleSelected ? new Set() : new Set(pagedItems.map((i) => i.id)),
                      )
                    }
                    aria-label={allVisibleSelected ? "Deselect all" : "Select all on this page"}
                    className="hidden h-3.5 w-3.5 rounded-[3px] border-[var(--border-2)] accent-[var(--brand-700)] md:block"
                  />
                )}
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
                  Request
                </span>
                <span className={headCell}>Category</span>
                <span className={headCell}>Priority</span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
                  Stage
                </span>
                <span className={headCell}>From</span>
                <span className={headCell}>Updated</span>
                {isInternal && <span className={headCell} />}
              </div>

              <div className="divide-y divide-[var(--border-1)]">
                {pagedItems.map((item) => {
                  // Guard rather than trust `comments` is present — same principle as
                  // the server-side Json-column guards.
                  const itemComments = item.comments ?? [];
                  const isOpen = expanded.has(item.id);
                  const isSelected = selected.has(item.id);
                  // A promoted request whose task can no longer be found. The stage
                  // already reads conservatively; internally it is worth saying why.
                  const taskMissing = item.status === "PROMOTED" && !item.taskStatus;
                  return (
                    <div
                      key={item.id}
                      // A stable hook for the render tests: the rows used to be <article>
                      // elements and a test counting those silently counted zero once they
                      // became grid rows. Naming the seam means it can't drift again.
                      data-request-row={item.id}
                      className={isSelected ? "bg-[var(--surface-brand)]" : ""}
                    >
                      <div className={`${gridCls} py-2.5 transition hover:bg-[var(--surface-1)]`}>
                        {isInternal && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(item.id)}
                            aria-label={`Select ${item.title}`}
                            className="hidden h-3.5 w-3.5 rounded-[3px] border-[var(--border-2)] accent-[var(--brand-700)] md:block"
                          />
                        )}

                        {/* Request — the whole cell is the expand control. */}
                        <button
                          type="button"
                          onClick={() => toggleRow(item.id)}
                          aria-expanded={isOpen}
                          className="flex min-w-0 items-start gap-1.5 text-left"
                        >
                          <ChevronRightIcon
                            className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-4)] transition-transform ${isOpen ? "rotate-90" : ""}`}
                          />
                          <span className="min-w-0">
                            {/* Both of these truncate, so both carry a `title`. Truncated
                                text with no title and no scroller is a TRUNCATED defect
                                under audit:clipping — and here it is not pedantry: at
                                375px the sub-line really does cut off mid-name, measured. */}
                            <span
                              title={item.title}
                              className="block truncate text-[13px] font-semibold text-[var(--text-1)]"
                            >
                              {item.title}
                            </span>
                            {/* Below md there are no Category/Priority/From/Updated
                                columns, so their values ride here instead. */}
                            <span
                              title={`${displayCategory(categories, item)} · ${item.priority}${
                                item.requestedBy ? ` · ${item.requestedBy}` : ""
                              } · updated ${fmtDate(item.updatedAt)}`}
                              className="mt-0.5 block truncate text-[11px] text-[var(--text-4)] md:hidden"
                              style={{ fontFamily: MONO }}
                            >
                              {displayCategory(categories, item)} · {item.priority}
                              {item.requestedBy ? ` · ${item.requestedBy}` : ""} ·{" "}
                              {fmtDate(item.updatedAt)}
                            </span>
                            {itemComments.length > 0 && (
                              <span className="mt-0.5 hidden items-center gap-1 text-[11px] text-[var(--text-4)] md:inline-flex">
                                <ChatBubbleLeftIcon className="h-3 w-3" />
                                {itemComments.length}
                              </span>
                            )}
                          </span>
                        </button>

                        <div className="hidden md:block" style={{ fontFamily: MONO }}>
                          {/* A client's own category can run to "Quick Design fix (V1)",
                              which does not fit 104px — truncated, so it needs a title. */}
                          <span
                            title={displayCategory(categories, item)}
                            className="inline-block max-w-full truncate rounded-[4px] bg-[var(--surface-brand)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--brand-700)]"
                          >
                            {displayCategory(categories, item)}
                          </span>
                        </div>

                        <div className="hidden md:block" style={{ fontFamily: MONO }}>
                          <span
                            className={`inline-block rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${PRIORITY_STYLE[item.priority as Priority]}`}
                          >
                            {item.priority}
                          </span>
                        </div>

                        {/* Stage — the column this whole rework exists for. It follows
                            the linked task's board column, so a client sees a request
                            move from Scheduled to In progress to Done without anybody
                            telling them. */}
                        <div className="min-w-0">
                          <StageChip
                            stage={item.stage}
                            title={
                              taskMissing && isInternal
                                ? "This request was promoted, but its task can no longer be found — it was probably deleted from the board."
                                : undefined
                            }
                          />
                        </div>

                        <span
                          className="hidden truncate text-[12px] text-[var(--text-3)] md:block"
                          style={{ fontFamily: MONO }}
                          title={item.requestedBy ?? undefined}
                        >
                          {item.requestedBy ?? "—"}
                        </span>

                        <span
                          className="hidden text-[12px] text-[var(--text-3)] md:block"
                          style={{ fontFamily: MONO }}
                          title={`Logged ${fmtDate(item.createdAt)}`}
                        >
                          {fmtDate(item.updatedAt)}
                        </span>

                        {isInternal && (
                          <div className="hidden justify-end gap-1 md:flex">
                            {!item.taskId ? (
                              <button
                                type="button"
                                disabled={promoteItem.isPending}
                                onClick={() => void promoteItem.mutateAsync({ id: item.id })}
                                title="Create a task on the delivery board from this request"
                                aria-label={`Create a task from ${item.title}`}
                                className="rounded-[6px] border border-[var(--border-2)] p-1.5 text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--brand-700)] disabled:opacity-60"
                              >
                                <CheckCircleIcon className="h-4 w-4" />
                              </button>
                            ) : (
                              <a
                                href={`/app/portal/${slug}/tasks`}
                                title="Open the delivery board"
                                aria-label={`Open the board for ${item.title}`}
                                className="rounded-[6px] border border-[var(--border-2)] p-1.5 text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                              >
                                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                              </a>
                            )}
                            {/* "Close" alone read as though it might close the task too.
                                It doesn't — it only files the request as dealt with. */}
                            <button
                              type="button"
                              title={
                                item.status === "CLOSED"
                                  ? "Put this request back on the open list."
                                  : "Files the request as dealt with. Any task already created from it is not affected."
                              }
                              aria-label={
                                item.status === "CLOSED"
                                  ? `Reopen ${item.title}`
                                  : `Mark ${item.title} dealt with`
                              }
                              onClick={() =>
                                void updateItem.mutateAsync({
                                  id: item.id,
                                  data: { status: item.status === "CLOSED" ? "NEW" : "CLOSED" },
                                })
                              }
                              className="rounded-[6px] border border-[var(--border-2)] p-1.5 text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                            >
                              {item.status === "CLOSED" ? (
                                <PlusIcon className="h-4 w-4 rotate-45" />
                              ) : (
                                <CheckCircleIcon className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* ── Expanded detail — everything the old card carried ───── */}
                      {isOpen && (
                        <div className="space-y-3 border-t border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3 md:px-6">
                          {item.description && (
                            <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--text-2)]">
                              {item.description}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            {item.label ? (
                              <span
                                title="Dev label — carried onto the task when this is promoted"
                                className="rounded-[4px] bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]"
                                style={{ fontFamily: MONO }}
                              >
                                {DEV_LABEL_LABEL[item.label as DevLabel] ?? item.label}
                              </span>
                            ) : null}
                            {/* Links sent by the intake API. Storing the source link and
                                then never showing it would defeat the point — the whole
                                reason a client sends it is so the team can open the item
                                in their tracker. Attachments are the client's URLs, so
                                they open in a new tab and carry noreferrer. */}
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

                          {item.hasImage ? (
                            <button
                              type="button"
                              onClick={() => setViewingImageId(item.id)}
                              className="block overflow-hidden rounded-[6px] border border-[var(--border-2)]"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={imageSrc(item.id, { thumb: true })}
                                alt={item.imageFilename ?? "Attached screenshot"}
                                className="h-16 w-16 object-cover transition hover:opacity-90"
                              />
                            </button>
                          ) : null}

                          <p className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                            Logged{" "}
                            {new Date(item.createdAt).toLocaleDateString(undefined, {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                            {item.requestedBy ? ` by ${item.requestedBy}` : ""}
                            {item.device ? ` · ${item.device}` : ""}
                            {item.osVersion ? ` · ${item.osVersion}` : ""}
                            {taskMissing && isInternal ? " · task not found on the board" : ""}
                          </p>

                          {/* The client's own controls: fix or withdraw a request they
                              raised. Only while it is still theirs to change — once
                              PROMOTED a dev owns the task it became, and CLOSED is a
                              record. The server enforces this; hiding the buttons just
                              avoids offering an action that would be refused. */}
                          {!isInternal && CLIENT_EDITABLE.includes(item.status) && (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setRowError(null);
                                  setEditingId(editingId === item.id ? null : item.id);
                                  setEditDraft({
                                    title: item.title,
                                    description: item.description ?? "",
                                    priority: item.priority as Priority,
                                  });
                                }}
                                className="rounded-[7px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                              >
                                Edit
                              </button>
                              {/* Two-step, same as internally: a single-click delete
                                  sitting next to Edit is one slip from losing what
                                  they wrote. */}
                              {confirmDeleteId === item.id ? (
                                <span className="inline-flex items-center gap-1.5 rounded-[7px] border border-rose-300 bg-rose-50 px-2 py-1.5">
                                  <span className="text-[12px] font-medium text-rose-700">
                                    Withdraw it?
                                  </span>
                                  <button
                                    type="button"
                                    disabled={deletePublic.isPending}
                                    onClick={async () => {
                                      try {
                                        await deletePublic.mutateAsync(item.id);
                                        setLocalItems((prev) =>
                                          prev.filter((i) => i.id !== item.id),
                                        );
                                      } catch (err) {
                                        setRowError({
                                          id: item.id,
                                          message:
                                            err instanceof Error
                                              ? err.message
                                              : "Could not withdraw that.",
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
                                  className="rounded-[7px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-4)] transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                                >
                                  Withdraw
                                </button>
                              )}
                            </div>
                          )}

                          {/* Internal row actions that don't fit the icon strip, plus
                              the ones a phone never sees because that strip is md+. */}
                          {isInternal && (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="rounded-[7px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-2)] transition hover:bg-[var(--surface-1)] md:hidden"
                                onClick={() =>
                                  void updateItem.mutateAsync({
                                    id: item.id,
                                    data: { status: item.status === "CLOSED" ? "NEW" : "CLOSED" },
                                  })
                                }
                              >
                                {item.status === "CLOSED" ? "Reopen request" : "Mark dealt with"}
                              </button>
                              {!item.taskId && (
                                <button
                                  type="button"
                                  disabled={promoteItem.isPending}
                                  onClick={() => void promoteItem.mutateAsync({ id: item.id })}
                                  className="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-2)] transition hover:bg-[var(--surface-1)] md:hidden"
                                >
                                  <CheckCircleIcon className="h-4 w-4" /> Create task
                                </button>
                              )}
                              {/* Delete is two-step. It used to fire on a single click
                                  next to the everyday buttons, which is one slip away
                                  from destroying something a client submitted — and
                                  unlike closing, it can't be undone. */}
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
                                  className="inline-flex items-center rounded-[7px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2 py-1.5 text-[var(--text-4)] transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                                >
                                  <TrashIcon className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          )}

                          {/* Inline edit — the client fixing what they wrote. Only the
                              fields they filled in: status, promotion and the dev label
                              are ours. */}
                          {editingId === item.id && (
                            <div className="space-y-2.5 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] p-3">
                              <input
                                value={editDraft.title}
                                onChange={(e) =>
                                  setEditDraft((d) => ({ ...d, title: e.target.value }))
                                }
                                placeholder="Short title"
                                className="app-input"
                              />
                              <textarea
                                value={editDraft.description}
                                onChange={(e) =>
                                  setEditDraft((d) => ({ ...d, description: e.target.value }))
                                }
                                rows={3}
                                placeholder="What happened, what should change, or any helpful context…"
                                className="app-input resize-y py-2.5 leading-relaxed"
                              />
                              <div className="flex flex-wrap items-center gap-2">
                                <select
                                  value={editDraft.priority}
                                  onChange={(e) =>
                                    setEditDraft((d) => ({
                                      ...d,
                                      priority: e.target.value as Priority,
                                    }))
                                  }
                                  className="app-select-compact w-auto"
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
                                      setLocalItems((prev) =>
                                        prev.map((i) => (i.id === saved.id ? saved : i)),
                                      );
                                      setEditingId(null);
                                    } catch (err) {
                                      setRowError({
                                        id: item.id,
                                        message:
                                          err instanceof Error
                                            ? err.message
                                            : "Could not save that change.",
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
                            <p className="text-[12px] text-rose-600">{rowError.message}</p>
                          )}

                          {/* Reply thread — either side can add to it, so the client
                              sees when a fix is in place without being told outside
                              the wiki. */}
                          <div className="space-y-2.5 border-t border-[var(--border-2)] pt-3">
                            {itemComments.map((c) => (
                              <div
                                key={c.id}
                                className="rounded-[8px] bg-[var(--surface-0)] px-3 py-2"
                              >
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[12px] font-semibold text-[var(--text-1)]">
                                    {c.authorName}
                                  </span>
                                  <span
                                    className={[
                                      "rounded-[4px] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em]",
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
                                  setCommentDraft((prev) => ({
                                    ...prev,
                                    [item.id]: e.target.value,
                                  }))
                                }
                                placeholder="Write a reply…"
                                aria-label={`Reply to ${item.title}`}
                                rows={2}
                                className="app-input resize-y py-2 text-[13px] leading-relaxed"
                              />
                              <button
                                type="button"
                                disabled={
                                  postingCommentId === item.id ||
                                  !(commentDraft[item.id] ?? "").trim()
                                }
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
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

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

      {/* ── Batch bar — internal only, and only with a selection ──────────────
          The "make it easier for devs to take the tasks into their pipeline" half
          of the brief: promoting thirty requests one row at a time is why nobody
          did it. Fixed to the bottom, above the On Your Desk dock (z-40). */}
      {isInternal && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)]">
            <span
              className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]"
              style={{ fontFamily: MONO }}
            >
              {selected.size} selected
            </span>
            <button
              type="button"
              disabled={batchBusy}
              onClick={() => void batchPromote()}
              className="inline-flex items-center gap-1.5 rounded-[6px] bg-[var(--brand-600)] px-2.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[var(--brand-700)] disabled:opacity-60"
            >
              <CheckCircleIcon className="h-3.5 w-3.5" />
              Create tasks
            </button>
            <button
              type="button"
              disabled={batchBusy}
              onClick={() => void batchSetStatus("CLOSED")}
              className="rounded-[6px] border border-[var(--border-2)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-60"
            >
              Mark dealt with
            </button>
            <button
              type="button"
              disabled={batchBusy}
              onClick={() => void batchSetStatus("NEW")}
              className="rounded-[6px] border border-[var(--border-2)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-60"
            >
              Reopen
            </button>
            {confirmBatchDelete ? (
              <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-rose-300 bg-rose-50 px-2 py-1">
                <span className="text-[12px] font-medium text-rose-700">
                  Delete {selected.size}?
                </span>
                <button
                  type="button"
                  disabled={batchBusy}
                  onClick={() => void batchDelete()}
                  className="rounded-[5px] bg-rose-600 px-2 py-0.5 text-[12px] font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmBatchDelete(false)}
                  className="px-1 text-[12px] text-[var(--text-4)] transition hover:text-[var(--text-1)]"
                >
                  No
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmBatchDelete(true)}
                aria-label={`Delete ${selected.size} requests`}
                className="rounded-[6px] border border-[var(--border-2)] p-1.5 text-[var(--text-4)] transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              aria-label="Clear selection"
              className="rounded-[6px] p-1.5 text-[var(--text-4)] transition hover:text-[var(--text-1)]"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {isInternal && (
        <RequestImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          categories={categories}
          // Only OPEN titles, matching the server's own dedupe rule — a request that has
          // been dealt with is allowed to come back, and flagging it as a duplicate would
          // quietly refuse to re-log something that has genuinely recurred.
          existingTitles={allItems
            .filter((i) => i.status !== "CLOSED")
            .map((i) => i.title)}
          importing={importItems.isPending}
          onImport={async (rows) => {
            const res = await importItems.mutateAsync({ items: rows });
            return { created: res.created, skipped: res.skipped };
          }}
        />
      )}

      {viewingImageId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setViewingImageId(null)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-2xl overflow-auto rounded-[10px] bg-[var(--surface-0)] shadow-lg"
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
                className="mx-auto max-h-[70vh] w-auto rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)]"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
