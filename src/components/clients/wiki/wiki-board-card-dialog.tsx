"use client";

/**
 * The Board's card dialog: the ONE place a card is added, read and edited, from every view (Board,
 * Table, Timeline, Schedule), on the team's wiki and the client's link (§126). It replaced a long
 * single-column add form and a separate read-then-"Edit" detail dialog.
 *
 * The house fixed-height two-column popup (DESIGN.md): the card itself on the left (title,
 * description, screenshots, links, sub-items, then its activity with the composer pinned under it),
 * and a properties rail on the right whose values read like the Table's cells and change in place.
 * An open card saves each change as it's made, through the same routes as the Table, so the server's
 * rules apply field by field: the client never sets who works on a card, and a team dev task's
 * fields are edited on the task board, not here. Below `md` it is one column, with the properties
 * folded under the title, as a full-height sheet.
 */

import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import {
  ArrowTopRightOnSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LinkIcon,
  PhotoIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { fuzzySearch } from "@/lib/fuzzy-search";
import { Markdown } from "@/lib/markdown";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { CardProgressChip, ItemTypeChip, PreviousValues, SignOffChip, TierChip } from "@/components/tasks/product-card-parts";
import { InlineText, PickCell, PRIORITY_TONE } from "@/components/clients/wiki/board-pick";
import { BOARD_LIST_MAX, ITEM_TYPE_LABELS, TIERS, TIER_LABELS } from "@/lib/tasks/product-cards";
import { splitCardDescription, uploadBatches } from "@/lib/wiki-board-edit";
import { boardLists } from "@/lib/wiki-board-table";
import {
  BOARD_EDIT_TYPES,
  BOARD_LIMITS,
  CLIENT_CARD_TYPES,
  clientMayActOn,
  feedbackRefusal,
  type FeedbackKind,
} from "@/lib/wiki-board";
import {
  CARD_IMAGE_TYPES,
  addCardLink,
  cardActivity,
  cardEditing,
  linkLabel,
  pickCardImages,
  showsPeople,
} from "@/lib/wiki-board-card-dialog";
import {
  addBoardCardApi,
  boardImageUrl,
  deleteBoardCardApi,
  updateBoardCardApi,
  uploadBoardImagesApi,
  useBoardFeedback,
  useSendBoardFeedback,
  type BoardCardForm,
  type BoardTarget,
} from "@/hooks/use-wiki-board";
import { TASK_PRIORITY_LABELS, type TaskPriority } from "@/types/tasks";
import type { WikiBoardCard, WikiBoardLane, WikiBoardSection } from "@/types/wiki-board";

const MONO = { fontFamily: "var(--font-mono)" } as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

export const EMPTY_CARD_FORM: BoardCardForm = {
  title: "",
  itemType: "feature",
  laneKey: "",
  parentId: null,
  releaseId: null,
  tier: null,
  area: null,
  list: null,
  priority: "MEDIUM",
  estimateHours: null,
  dueDate: null,
  description: "",
  links: [],
  dependsOn: [],
};

/** A card's current fields, as the properties read them. Links come back out of the description. */
function formFromCard(card: WikiBoardCard): BoardCardForm {
  const { body, links } = splitCardDescription(card.description);
  return {
    title: card.title,
    itemType: card.itemType === "bug" || card.itemType === "feedback" ? card.itemType : "feature",
    laneKey: card.laneKey,
    parentId: null,
    releaseId: card.release?.id ?? null,
    tier: card.tier,
    area: card.area,
    list: card.list,
    priority: card.priority,
    estimateHours: card.estimateHours,
    dueDate: card.dueDate ? card.dueDate.slice(0, 10) : null,
    description: body,
    links,
    dependsOn: card.dependsOn.map((d) => d.id),
  };
}

function formatDay(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : iso;
}

type FieldKey = Exclude<keyof BoardCardForm, "laneKey" | "parentId">;

interface Props {
  mode: "add" | "card";
  /** The open card (mode "card"). */
  card?: WikiBoardCard;
  /** Where a new card starts (mode "add"). */
  initialLaneKey?: string;
  cards: WikiBoardCard[];
  section: WikiBoardSection;
  target: BoardTarget;
  audience: "client" | "team";
  /** The team is looking at exactly what the client sees: read-only. */
  previewing: boolean;
  /** The columns a card may be added to. */
  addLanes: WikiBoardLane[];
  canDelete: boolean;
  onMove: (card: WikiBoardCard, lane: WikiBoardLane) => void;
  onOpenCard: (id: string) => void;
  onSaved: (card: WikiBoardCard) => void;
  onAdded: (card: WikiBoardCard) => void;
  onDeleted: (card: WikiBoardCard) => void;
  onClose: () => void;
}

export function WikiBoardCardDialog(props: Props) {
  const { mode, card, section, target, audience, previewing, addLanes, cards, onClose } = props;
  const toast = useToast();
  const titleId = useId();
  const isAdd = mode === "add" || !card;

  // ---- The card's values: a draft while adding, the saved card (changed in place) when open. ----
  const [form, setForm] = useState<BoardCardForm>(() => ({
    ...EMPTY_CARD_FORM,
    laneKey: props.initialLaneKey || addLanes[0]?.key || "",
  }));
  const [local, setLocal] = useState<WikiBoardCard | null>(card ?? null);
  // A refetch, or a write elsewhere (the Table, a move), brings the server's copy back.
  useEffect(() => {
    if (card) setLocal(card);
  }, [card]);
  const values: BoardCardForm = isAdd || !local ? form : formFromCard(local);
  const editing = isAdd ? { fields: true, move: true } : cardEditing(local!, audience, previewing);

  const [files, setFiles] = useState<File[]>([]);
  const [saveState, setSaveState] = useState<{ pending: number; error: string | null; saved: boolean }>({ pending: 0, error: null, saved: false });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // Adding starts in the title. The Modal focuses its first control on open; this runs after it.
  useEffect(() => {
    if (!isAdd) return;
    const t = window.setTimeout(() => titleRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [isAdd]);

  /** Save one change to an open card: shown at once, put back with a sentence if the server says no. */
  async function patch(changes: Partial<Omit<BoardCardForm, "laneKey" | "parentId">>, optimistic: Partial<WikiBoardCard>, what: string) {
    if (!local) return;
    const before = local;
    setLocal({ ...local, ...optimistic });
    setSaveState((s) => ({ pending: s.pending + 1, error: null, saved: false }));
    try {
      const saved = await updateBoardCardApi(target, local.id, changes);
      setLocal(saved);
      props.onSaved(saved);
      void feedback.refetch();
      setSaveState((s) => ({ pending: s.pending - 1, error: s.error, saved: s.pending - 1 === 0 && !s.error }));
    } catch (err) {
      setLocal(before);
      const why = err instanceof Error ? err.message : "Please try again.";
      setSaveState((s) => ({ pending: s.pending - 1, error: `Couldn't change the ${what}. ${why}`, saved: false }));
    }
  }

  /** One property changed, from the rail. */
  function change<K extends FieldKey>(key: K, value: BoardCardForm[K], what: string) {
    if (isAdd) {
      setForm((f) => ({ ...f, [key]: value }));
      return;
    }
    if (!local) return;
    if (JSON.stringify(values[key] ?? null) === JSON.stringify(value ?? null)) return;
    const optimistic: Partial<WikiBoardCard> = {};
    switch (key) {
      case "title":
      case "area":
      case "list":
      case "tier":
      case "priority":
      case "estimateHours":
        Object.assign(optimistic, { [key]: value });
        break;
      case "itemType":
        optimistic.itemType = value as string;
        break;
      case "releaseId": {
        const r = section.releases.find((x) => x.id === value);
        optimistic.release = r ? { id: r.id, label: r.label } : null;
        break;
      }
      case "dueDate":
        optimistic.dueDate = (value as string | null) ?? null;
        break;
      case "dependsOn":
        optimistic.dependsOn = (value as string[]).map((id) => ({ id, title: cards.find((c) => c.id === id)?.title ?? "A card" }));
        break;
      default:
        break;
    }
    const sent = key === "area" || key === "list" ? ((value as string | null)?.trim() || null) : value;
    void patch({ [key]: sent } as Partial<Omit<BoardCardForm, "laneKey" | "parentId">>, optimistic, what);
  }

  // ---- Screenshots ----
  const existingImages = isAdd ? 0 : (local?.images.length ?? 0);
  const imagesAllowed = editing.fields && values.itemType !== "subitem";
  const [imageError, setImageError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  async function takeImages(picked: File[]) {
    if (!picked.length || !imagesAllowed) return;
    const check = pickCardImages(existingImages, isAdd ? files.length : 0, picked);
    if (!check.ok) return setImageError(check.error);
    setImageError(null);
    if (isAdd) {
      setFiles((f) => [...f, ...picked]);
      return;
    }
    if (!local) return;
    setUploading(true);
    try {
      let saved = local;
      // nginx refuses a body over 25 MB, so a big selection goes up in several requests.
      for (const batch of uploadBatches(picked)) saved = await uploadBoardImagesApi(target, local.id, batch);
      setLocal(saved);
      props.onSaved(saved);
      void feedback.refetch();
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Couldn't add the images. Please try again.");
    } finally {
      setUploading(false);
    }
  }
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  // ---- Adding ----
  async function add() {
    const title = form.title.trim();
    if (!title) return setAddError("Give the card a title.");
    if (form.itemType === "subitem" && !form.parentId) return setAddError("Pick the feature this sub-item belongs to.");
    setAdding(true);
    setAddError(null);
    try {
      let saved = await addBoardCardApi(target, { ...form, title });
      if (files.length && form.itemType !== "subitem") {
        try {
          for (const batch of uploadBatches(files)) saved = await uploadBoardImagesApi(target, saved.id, batch);
        } catch (err) {
          toast.error("The card is added, but the images weren't", err instanceof Error ? err.message : "Please add them again.");
        }
      }
      props.onAdded(saved);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Couldn't add the card. Please try again.");
      setAdding(false);
    }
  }

  async function remove() {
    if (!local) return;
    setDeleting(true);
    try {
      await deleteBoardCardApi(target, local.id);
      props.onDeleted(local);
    } catch (err) {
      setSaveState((s) => ({ ...s, error: err instanceof Error ? err.message : "Couldn't delete the card. Please try again." }));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  // ---- Activity ----
  const feedback = useBoardFeedback(target, isAdd ? null : (local?.id ?? null));
  const activity = useMemo(
    () => (local ? cardActivity(feedback.data?.feedback ?? [], local.stageHistory) : []),
    [feedback.data, local],
  );

  const lane = section.lanes.find((l) => l.key === values.laneKey);
  const readout = [lane?.label, values.list].filter(Boolean).join(" · ");

  const properties = (
    <Properties
      isAdd={isAdd}
      card={local}
      values={values}
      editing={editing}
      section={section}
      cards={cards}
      audience={audience}
      previewing={previewing}
      target={target}
      addLanes={addLanes}
      onChange={change}
      onParent={(id) => setForm((f) => ({ ...f, parentId: id }))}
      onMove={(l) => {
        if (isAdd) setForm((f) => ({ ...f, laneKey: l.key }));
        else if (local) props.onMove(local, l);
      }}
      onOpenCard={props.onOpenCard}
    />
  );

  return (
    <Modal
      open
      onClose={onClose}
      labelledById={titleId}
      panelClassName="app-dialog-fixed w-full max-w-[960px] max-sm:fixed max-sm:inset-0 max-sm:mt-0 max-sm:h-auto max-sm:max-h-none max-sm:min-h-0 max-sm:max-w-none max-sm:rounded-none"
    >
      <div className="widget-header shrink-0" data-card-dialog-header>
        <span className="flex min-w-0 items-center gap-2">
          {isAdd ? null : <ItemTypeChip itemType={local?.itemType ?? null} />}
          {local?.signOff ? <SignOffChip signOff={local.signOff} /> : null}
          <span id={titleId} className="widget-header-label min-w-0 truncate" title={readout || undefined}>
            {isAdd ? "New card" : readout || "Card"}
          </span>
        </span>
        <button type="button" onClick={onClose} className="shrink-0 text-[var(--text-4)] transition hover:text-[var(--text-1)]" aria-label="Close">
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="relative grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_280px]" data-card-dialog>
        <div className="flex min-h-0 flex-col">
          <div
            className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4"
            onPaste={(e) => {
              const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
              if (imgs.length && imagesAllowed) {
                e.preventDefault();
                void takeImages(imgs);
              }
            }}
            onDragOver={(e) => {
              if (imagesAllowed && e.dataTransfer.types.includes("Files")) e.preventDefault();
            }}
            onDrop={(e) => {
              if (!imagesAllowed || !e.dataTransfer.files.length) return;
              e.preventDefault();
              void takeImages(Array.from(e.dataTransfer.files));
            }}
          >
            <TitleField
              inputRef={titleRef}
              value={values.title}
              editable={editing.fields}
              placeholder={values.itemType === "bug" ? "What's going wrong?" : "What should it do?"}
              onCommit={(v) => (isAdd ? setForm((f) => ({ ...f, title: v })) : change("title", v.trim(), "title"))}
              live={isAdd}
            />

            {/* Phone: the properties fold under the title. The rail is the desktop's. */}
            <details className="rounded-[8px] border border-[var(--border-2)] md:hidden" open={isAdd}>
              <summary className="cursor-pointer select-none px-3 py-2 text-[12px] font-medium text-[var(--text-2)]">Details</summary>
              <div className="border-t border-[var(--border-2)] px-1 py-2">{properties}</div>
            </details>

            <DescriptionField
              isAdd={isAdd}
              value={values.description}
              editable={editing.fields}
              onChange={(v) => setForm((f) => ({ ...f, description: v }))}
              onSave={(v) => change("description", v, "description")}
            />

            {imagesAllowed || (local?.images.length ?? 0) > 0 ? (
              <Block label="Screenshots">
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-card-images>
                  {(local && !isAdd ? local.images : []).map((img, i) => (
                    <button
                      key={img}
                      type="button"
                      onClick={() => setLightbox(i)}
                      className="block overflow-hidden rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] hover:border-[var(--border-1)]"
                      title="View the image"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={boardImageUrl(target, local!.id, img, true)}
                        alt={`Image ${i + 1} on ${local!.title}`}
                        loading="lazy"
                        className="aspect-[4/3] w-full object-cover"
                      />
                    </button>
                  ))}
                  {isAdd
                    ? files.map((f, i) => (
                        <span key={`${f.name}-${i}`} className="relative block overflow-hidden rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={previews[i]} alt={f.name} className="aspect-[4/3] w-full object-cover" />
                          <button
                            type="button"
                            className="absolute right-1 top-1 rounded-[4px] bg-[var(--surface-0)] p-0.5 text-[var(--text-3)] shadow-sm hover:text-[var(--text-1)]"
                            aria-label={`Remove ${f.name}`}
                            onClick={() => setFiles((list) => list.filter((_, j) => j !== i))}
                          >
                            <XMarkIcon className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))
                    : null}
                  {imagesAllowed ? (
                    <label
                      className={cn(
                        "flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1 rounded-[6px] border border-dashed border-[var(--border-1)] px-2 text-center text-[11px] text-[var(--text-3)] hover:border-[var(--brand-500)] hover:text-[var(--text-1)]",
                        uploading && "pointer-events-none opacity-60",
                      )}
                    >
                      <PhotoIcon className="h-5 w-5" />
                      {uploading ? "Adding…" : "Add, drop or paste"}
                      <input
                        type="file"
                        accept={CARD_IMAGE_TYPES.join(",")}
                        multiple
                        className="sr-only"
                        data-board-file
                        onChange={(e) => {
                          const picked = Array.from(e.target.files ?? []);
                          e.target.value = "";
                          void takeImages(picked);
                        }}
                      />
                    </label>
                  ) : null}
                </div>
                {imageError ? <p className="mt-1.5 text-[12px] text-red-700">{imageError}</p> : null}
                {imagesAllowed ? (
                  <p className="mt-1 text-[11px] text-[var(--text-4)]">PNG, JPEG, GIF or WebP, up to 10 MB each, {BOARD_LIMITS.images} a card.</p>
                ) : null}
              </Block>
            ) : values.itemType === "subitem" ? (
              <p className="text-[12px] text-[var(--text-4)]">Add screenshots on the feature card itself.</p>
            ) : null}

            <LinksField
              links={values.links}
              editable={editing.fields}
              onChange={(next) => (isAdd ? setForm((f) => ({ ...f, links: next })) : change("links", next, "links"))}
            />

            {local && !isAdd && local.subtasks.length ? (
              <Block label="Sub-items">
                <ul className="space-y-1">
                  {local.subtasks.map((s, i) => (
                    <li key={i} className="flex items-center gap-2 text-[13px] text-[var(--text-2)]">
                      <span className={cn("h-3 w-3 shrink-0 rounded-full border", s.done ? "border-emerald-500 bg-emerald-500" : "border-[var(--border-1)]")} />
                      <span className={cn(s.done && "text-[var(--text-4)] line-through")}>{s.title}</span>
                    </li>
                  ))}
                </ul>
              </Block>
            ) : null}

            {!isAdd && local ? (
              <Block label="Activity">
                {feedback.isLoading ? <p className="text-[13px] text-[var(--text-4)]">Loading…</p> : null}
                {feedback.isError ? <p className="text-[13px] text-red-700">Couldn&apos;t load the activity.</p> : null}
                {!feedback.isLoading && activity.length === 0 ? (
                  <p className="text-[13px] text-[var(--text-4)]">
                    {audience === "client" ? "Nothing yet. Say what you think, approve it, or ask for changes." : "The client hasn’t said anything on this card yet."}
                  </p>
                ) : null}
                <ol className="space-y-3" data-card-activity>
                  {activity.map((item, i) =>
                    item.kind === "stage" ? (
                      <li key={`s${i}`} className="text-[12px] text-[var(--text-3)]">
                        <span className="text-[11px] text-[var(--text-4)]" style={MONO}>
                          {formatDay(item.date)} ·{" "}
                        </span>
                        Moved to <span className="text-[var(--text-2)]">{item.label}</span> on their planning board
                      </li>
                    ) : item.feedback.kind === "change" ? (
                      <li key={item.feedback.id} className="text-[12px] text-[var(--text-3)]" data-board-change>
                        <p>
                          <span className="text-[11px] text-[var(--text-4)]" style={MONO}>
                            {formatDay(item.feedback.createdAt)} ·{" "}
                          </span>
                          {item.feedback.body}
                        </p>
                        <PreviousValues previous={item.feedback.previous} />
                      </li>
                    ) : (
                      <li key={item.feedback.id} className="text-[13px]">
                        <p className="text-[11px] text-[var(--text-4)]" style={MONO}>
                          {item.feedback.side === "team" ? "GITWORK" : "CLIENT"} · {item.feedback.authorName} · {formatDay(item.feedback.createdAt)}
                        </p>
                        {item.feedback.kind !== "comment" ? <SignOffChip signOff={item.feedback.kind} className="mt-1" /> : null}
                        {item.feedback.body ? <p className="mt-1 whitespace-pre-wrap text-[var(--text-2)]">{item.feedback.body}</p> : null}
                      </li>
                    ),
                  )}
                </ol>
              </Block>
            ) : null}
          </div>
          {!isAdd && local ? <Composer target={target} cardId={local.id} audience={audience} /> : null}
        </div>

        <aside className="hidden min-h-0 overflow-y-auto border-l border-[var(--border-2)] px-3 py-4 md:block" data-card-rail>
          {properties}
        </aside>

        {lightbox !== null && local && local.images[lightbox] ? (
          <Lightbox
            target={target}
            card={local}
            index={lightbox}
            onIndex={setLightbox}
            onClose={() => setLightbox(null)}
          />
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--border-2)] px-5 py-3" data-card-dialog-footer>
        {isAdd ? (
          <>
            {addError ? <p className="mr-auto min-w-0 text-[12px] text-red-700">{addError}</p> : <span className="mr-auto" />}
            <button type="button" className="app-button app-button-secondary app-button-md" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="app-button app-button-primary app-button-md" disabled={adding} onClick={() => void add()} data-card-add>
              {adding ? "Adding…" : "Add card"}
            </button>
          </>
        ) : confirmDelete && local ? (
          <div className="flex w-full flex-wrap items-center gap-2 text-[13px] text-red-800" data-board-delete-confirm>
            <p className="mr-auto min-w-0">
              Delete this card? It comes off the board.{" "}
              {audience === "client" ? "Gitwork can put it back if you need it." : "You can restore it from the deleted list."}
              {local.progress ? " Its dev tasks aren’t deleted, just unlinked." : ""}
            </p>
            <button type="button" className="app-button app-button-secondary app-button-sm" onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
            <button type="button" className="app-button app-button-danger app-button-sm" disabled={deleting} onClick={() => void remove()}>
              {deleting ? "Deleting…" : "Delete card"}
            </button>
          </div>
        ) : (
          <>
            {props.canDelete && editing.fields ? (
              <button
                type="button"
                className="app-button app-button-secondary app-button-sm text-red-700"
                onClick={() => setConfirmDelete(true)}
                data-board-delete
              >
                <TrashIcon className="h-3.5 w-3.5" /> Delete
              </button>
            ) : null}
            <p className={cn("ml-auto min-w-0 text-right text-[12px]", saveState.error ? "text-red-700" : "text-[var(--text-4)]")} role="status" data-card-save-state>
              {saveState.error
                ? saveState.error
                : saveState.pending
                  ? "Saving…"
                  : saveState.saved
                    ? "All changes saved"
                    : editing.fields
                      ? "Changes save as you make them"
                      : previewing
                        ? "Previewing the client’s view"
                        : audience === "client"
                          ? "One of Gitwork’s own tasks: read only"
                          : "A dev task: edit its details on the task board"}
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}

/** A labelled block on the card's left side. */
function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="widget-data-label mb-1.5 text-[var(--text-4)]">{label}</h3>
      {children}
    </section>
  );
}

/** The card's title, large: typed straight in while adding, changed in place on a card. */
function TitleField({
  inputRef,
  value,
  editable,
  placeholder,
  onCommit,
  live,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  editable: boolean;
  placeholder: string;
  onCommit: (v: string) => void;
  /** Adding: every keystroke is the draft. Open card: saved on Enter or leaving the field. */
  live: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  if (!editable) {
    return <h2 className="text-[20px] font-semibold leading-snug text-[var(--text-1)]">{value}</h2>;
  }
  const commit = () => {
    const v = draft.trim();
    if (!live && v && v !== value) onCommit(v);
    if (!live && !v) setDraft(value);
  };
  return (
    <textarea
      ref={inputRef}
      rows={1}
      aria-label="Title"
      value={draft}
      maxLength={BOARD_LIMITS.title}
      placeholder={placeholder}
      onChange={(e) => {
        setDraft(e.target.value);
        if (live) onCommit(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
      // field-sizing grows the box with the title; older browsers keep one line and scroll.
      className="block w-full resize-none rounded-[6px] border border-transparent bg-transparent px-2 py-1 text-[20px] font-semibold leading-snug text-[var(--text-1)] [field-sizing:content] placeholder:text-[var(--text-4)] hover:border-[var(--border-2)] focus:border-[var(--brand-500)] focus:outline-none max-sm:text-[20px]"
      // The app's focus ring is unlayered CSS a utility can't remove; the brand border shows focus.
      style={{ marginLeft: -8, width: "calc(100% + 8px)", outline: "none" }}
      data-card-title
    />
  );
}

/** The description: markdown, read as it renders; written with a preview while editing. */
function DescriptionField({
  isAdd,
  value,
  editable,
  onChange,
  onSave,
}: {
  isAdd: boolean;
  value: string;
  editable: boolean;
  onChange: (v: string) => void;
  onSave: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [tab, setTab] = useState<"write" | "preview">("write");
  useEffect(() => {
    if (!open) setDraft(value);
  }, [value, open]);
  const writing = isAdd || open;

  if (!writing) {
    return (
      <Block label="Description">
        {value ? (
          <div className={cn("rounded-[6px] text-[14px]", editable && "-mx-2 cursor-text px-2 py-1 hover:bg-[var(--surface-1)]")} onClick={editable ? () => setOpen(true) : undefined}>
            <Markdown compact>{value}</Markdown>
          </div>
        ) : editable ? (
          <button type="button" className="text-[13px] text-[var(--text-4)] hover:text-[var(--text-1)]" onClick={() => setOpen(true)}>
            Add a description…
          </button>
        ) : (
          <p className="text-[13px] text-[var(--text-4)]">No description.</p>
        )}
      </Block>
    );
  }
  const text = isAdd ? value : draft;
  return (
    <Block label="Description">
      <Segmented
        label="Description"
        className="mb-1.5 h-7"
        value={tab}
        onChange={setTab}
        options={[
          { value: "write", label: "Write" },
          { value: "preview", label: "Preview" },
        ]}
      />
      {tab === "write" ? (
        <textarea
          className="app-input w-full resize-y px-3 py-2 text-[16px] sm:text-sm"
          rows={5}
          value={text}
          maxLength={BOARD_LIMITS.description}
          autoFocus={!isAdd}
          placeholder="What it is, what done looks like. Markdown works."
          aria-label="Description"
          onChange={(e) => (isAdd ? onChange(e.target.value) : setDraft(e.target.value))}
        />
      ) : (
        <div className="min-h-[110px] rounded-[6px] border border-[var(--border-2)] px-3 py-2 text-[14px]">
          {text.trim() ? <Markdown compact>{text}</Markdown> : <p className="text-[13px] text-[var(--text-4)]">Nothing to preview.</p>}
        </div>
      )}
      {isAdd ? null : (
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="app-button app-button-secondary app-button-sm" onClick={() => { setOpen(false); setTab("write"); }}>
            Cancel
          </button>
          <button
            type="button"
            className="app-button app-button-primary app-button-sm"
            onClick={() => {
              if (draft !== value) onSave(draft);
              setOpen(false);
              setTab("write");
            }}
            data-card-description-save
          >
            Save description
          </button>
        </div>
      )}
    </Block>
  );
}

/** Links on the card: a recognisable label each, added one at a time, web links only. */
function LinksField({ links, editable, onChange }: { links: string[]; editable: boolean; onChange: (links: string[]) => void }) {
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!links.length && !editable) return null;
  const submit = () => {
    const r = addCardLink(links, raw);
    if (!r.ok) return setError(r.error);
    setError(null);
    setRaw("");
    onChange(r.links);
  };
  return (
    <Block label="Links">
      {links.length ? (
        <ul className="space-y-1">
          {links.map((l) => (
            <li key={l} className="group/link flex min-w-0 items-center gap-2 text-[13px]">
              <LinkIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-4)]" />
              <a href={l} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-[var(--brand-600)] hover:underline" title={l}>
                {linkLabel(l)}
              </a>
              {editable ? (
                <button
                  type="button"
                  className="shrink-0 text-[var(--text-4)] opacity-0 hover:text-[var(--text-1)] focus:opacity-100 group-hover/link:opacity-100"
                  aria-label={`Remove ${l}`}
                  onClick={() => onChange(links.filter((x) => x !== l))}
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {editable && links.length < BOARD_LIMITS.links ? (
        <div className={cn("flex gap-2", links.length > 0 && "mt-2")}>
          <input
            className="app-input h-8 min-w-0 flex-1 px-2 text-[16px] sm:text-[13px]"
            type="url"
            inputMode="url"
            value={raw}
            placeholder="Paste a link (https://…)"
            aria-label="Add a link"
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button type="button" className="app-button app-button-secondary app-button-sm h-8 shrink-0" onClick={submit}>
            Add
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-1 text-[12px] text-red-700">{error}</p> : null}
    </Block>
  );
}

/** The properties rail: label on the left, the value as a cell you change in place. */
function Properties({
  isAdd,
  card,
  values,
  editing,
  section,
  cards,
  audience,
  previewing,
  target,
  addLanes,
  onChange,
  onParent,
  onMove,
  onOpenCard,
}: {
  isAdd: boolean;
  card: WikiBoardCard | null;
  values: BoardCardForm;
  editing: { fields: boolean; move: boolean };
  section: WikiBoardSection;
  cards: WikiBoardCard[];
  audience: "client" | "team";
  previewing: boolean;
  target: BoardTarget;
  addLanes: WikiBoardLane[];
  onChange: <K extends FieldKey>(key: K, value: BoardCardForm[K], what: string) => void;
  onParent: (id: string | null) => void;
  onMove: (lane: WikiBoardLane) => void;
  onOpenCard: (id: string) => void;
}) {
  const types = isAdd ? CLIENT_CARD_TYPES : BOARD_EDIT_TYPES;
  const lanes = isAdd ? addLanes : section.lanes;
  const release = section.releases.find((r) => r.id === values.releaseId) ?? null;
  // What this person may pick as a parent or a dependency: what they can see, not this card.
  const mayPick = cards.filter((c) => c.id !== card?.id && (audience === "team" || clientMayActOn(c)));
  const features = mayPick.filter((c) => c.itemType === "feature");
  const ro = !editing.fields;
  const text = (v: ReactNode) => <span className="block truncate px-2 py-1.5 text-[13px] text-[var(--text-2)]">{v}</span>;
  const empty = <span className="block px-2 py-1.5 text-[13px] text-[var(--text-4)]">—</span>;

  return (
    <dl className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-x-1 gap-y-0.5" data-card-properties>
      <Row label="Type">
        {ro ? (
          card?.itemType ? <span className="flex h-8 items-center px-2"><ItemTypeChip itemType={card.itemType} /></span> : text("Task")
        ) : (
          <PickCell
            label="Type"
            value={values.itemType}
            onChange={(v) => onChange("itemType", v as BoardCardForm["itemType"], "type")}
            display={<ItemTypeChip itemType={values.itemType} />}
            options={types.map((t) => ({ value: t, label: ITEM_TYPE_LABELS[t] }))}
          />
        )}
      </Row>
      {isAdd && values.itemType === "subitem" ? (
        <Row label="Feature">
          <PickCell
            label="Feature it belongs to"
            value={values.parentId ?? ""}
            onChange={(v) => onParent(v || null)}
            display={values.parentId ? (features.find((f) => f.id === values.parentId)?.title ?? null) : null}
            options={[{ value: "", label: features.length ? "Choose a feature card" : "No feature cards yet" }, ...features.map((f) => ({ value: f.id, label: f.title }))]}
          />
        </Row>
      ) : null}
      <Row label="Column">
        {editing.move ? (
          <PickCell
            label="Column"
            value={values.laneKey}
            onChange={(v) => {
              const l = lanes.find((x) => x.key === v);
              if (l) onMove(l);
            }}
            display={lanes.find((l) => l.key === values.laneKey)?.label ?? section.lanes.find((l) => l.key === values.laneKey)?.label ?? null}
            options={lanes.map((l) => ({ value: l.key, label: l.label }))}
          />
        ) : (
          text(section.lanes.find((l) => l.key === values.laneKey)?.label ?? "—")
        )}
      </Row>
      <Row label="Release">
        {ro ? (
          release ? text(release.label) : empty
        ) : (
          <PickCell
            label="Release"
            value={values.releaseId ?? ""}
            onChange={(v) => onChange("releaseId", v || null, "release")}
            display={release?.label ?? null}
            options={[{ value: "", label: "No release yet" }, ...section.releases.map((r) => ({ value: r.id, label: r.label }))]}
          />
        )}
      </Row>
      <Row label="List">
        {ro ? (
          values.list ? text(values.list) : empty
        ) : (
          <InlineText
            label="List"
            value={values.list ?? ""}
            suggestions={boardLists(cards)}
            maxLength={BOARD_LIST_MAX}
            placeholder="Add to a list"
            onCommit={(v) => onChange("list", v.trim() || null, "list")}
          />
        )}
      </Row>
      <Row label="Area">
        {ro ? (
          values.area ? text(values.area) : empty
        ) : (
          <InlineText
            label="Area"
            value={values.area ?? ""}
            suggestions={section.areas}
            maxLength={BOARD_LIMITS.area}
            placeholder="Choose or type one"
            onCommit={(v) => onChange("area", v.trim() || null, "area")}
          />
        )}
      </Row>
      <Row label="Priority">
        {ro ? (
          text(<span className={PRIORITY_TONE[values.priority]}>{TASK_PRIORITY_LABELS[values.priority as TaskPriority]}</span>)
        ) : (
          <PickCell
            label="Priority"
            value={values.priority}
            onChange={(v) => onChange("priority", v as TaskPriority, "priority")}
            display={<span className={PRIORITY_TONE[values.priority] ?? "text-[var(--text-2)]"}>{TASK_PRIORITY_LABELS[values.priority as TaskPriority]}</span>}
            options={PRIORITIES.map((p) => ({ value: p, label: TASK_PRIORITY_LABELS[p] }))}
          />
        )}
      </Row>
      <Row label="Tier">
        {ro ? (
          values.tier ? <span className="flex h-8 items-center px-2"><TierChip tier={values.tier} /></span> : empty
        ) : (
          <PickCell
            label="Tier"
            value={values.tier ?? ""}
            onChange={(v) => onChange("tier", v || null, "tier")}
            display={values.tier ? <TierChip tier={values.tier} /> : null}
            options={[{ value: "", label: "No tier" }, ...TIERS.map((t) => ({ value: t, label: TIER_LABELS[t] }))]}
          />
        )}
      </Row>
      <Row label="Estimate">
        {ro ? (
          values.estimateHours !== null ? text(`${values.estimateHours}h`) : empty
        ) : (
          <InlineText
            label="Estimate in hours"
            type="number"
            value={values.estimateHours === null ? "" : String(values.estimateHours)}
            display={`${values.estimateHours}h`}
            placeholder="Hours"
            onCommit={(v) => {
              const n = v.trim() === "" ? null : Number(v);
              if (n !== null && (!Number.isFinite(n) || n < 0 || n > BOARD_LIMITS.estimateHours)) return;
              onChange("estimateHours", n, "estimate");
            }}
          />
        )}
      </Row>
      <Row label="Due">
        {ro ? (
          values.dueDate ? text(formatDay(values.dueDate)) : empty
        ) : (
          <InlineText
            label="Due date"
            type="date"
            value={values.dueDate ?? ""}
            display={formatDay(values.dueDate)}
            placeholder="No date"
            onCommit={(v) => onChange("dueDate", v || null, "due date")}
          />
        )}
      </Row>
      <Row label="Depends on" top>
        <DependsOn
          ids={values.dependsOn}
          titles={card?.dependsOn ?? []}
          cards={cards}
          choices={mayPick}
          editable={!ro}
          onChange={(ids) => onChange("dependsOn", ids, "dependencies")}
          onOpenCard={onOpenCard}
        />
      </Row>

      {card && !isAdd ? (
        <>
          <div className="col-span-2 my-2 border-t border-[var(--border-2)]" />
          {card.progress ? (
            <Row label="Dev tasks">
              <span className="flex h-8 items-center gap-2 px-2">
                <CardProgressChip progress={card.progress} />
              </span>
            </Row>
          ) : null}
          {showsPeople(audience, previewing) ? (
            <Row label="People">{card.people.length ? text(card.people.join(", ")) : empty}</Row>
          ) : null}
          <Row label="Updated">{text(formatDay(card.updatedAt))}</Row>
          {audience === "team" && !previewing && target.mode === "internal" ? (
            <div className="col-span-2 mt-1 px-2">
              <a
                href={`/app/portal/${encodeURIComponent(target.slug)}/tasks?task=${encodeURIComponent(card.id)}`}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--brand-600)] hover:underline"
                data-card-open-task
              >
                Open on the task board <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
              </a>
            </div>
          ) : null}
        </>
      ) : null}
    </dl>
  );
}

function Row({ label, children, top = false }: { label: string; children: ReactNode; top?: boolean }) {
  return (
    <>
      <dt className={cn("widget-data-label truncate px-1 text-[var(--text-4)]", top && "self-start pt-2")}>{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

/** The cards this one waits on: each opens its card; the picker is an anchored popover. */
function DependsOn({
  ids,
  titles,
  cards,
  choices,
  editable,
  onChange,
  onOpenCard,
}: {
  ids: string[];
  titles: Array<{ id: string; title: string }>;
  cards: WikiBoardCard[];
  choices: WikiBoardCard[];
  editable: boolean;
  onChange: (ids: string[]) => void;
  onOpenCard: (id: string) => void;
}) {
  const titleOf = (id: string) => cards.find((c) => c.id === id)?.title ?? titles.find((t) => t.id === id)?.title ?? "A card";
  return (
    <div className="space-y-0.5 py-0.5">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          className="block w-full truncate rounded-[4px] px-2 py-1 text-left text-[13px] text-[var(--brand-600)] hover:bg-[var(--surface-2)]"
          onClick={() => onOpenCard(id)}
          title={titleOf(id)}
        >
          {titleOf(id)}
        </button>
      ))}
      {!ids.length && !editable ? <span className="block px-2 py-1.5 text-[13px] text-[var(--text-4)]">—</span> : null}
      {editable && choices.length ? (
        <Popover className="relative">
          <PopoverButton className="flex h-8 w-full items-center gap-1 rounded-[4px] px-2 text-[13px] text-[var(--text-4)] hover:bg-[var(--surface-2)] hover:text-[var(--text-1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-focus-ring)]">
            <PlusIcon className="h-3.5 w-3.5" /> {ids.length ? "Change" : "Add a card"}
          </PopoverButton>
          <PopoverPanel
            anchor="bottom end"
            className="z-[60] w-[300px] rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-0)] p-2 shadow-lg [--anchor-gap:4px]"
          >
            <DependsPicker initial={ids} choices={choices} onCommit={onChange} />
          </PopoverPanel>
        </Popover>
      ) : null}
    </div>
  );
}

/** The picker's draft: ticks change only the draft; it's saved once, when the picker closes. */
function DependsPicker({ initial, choices, onCommit }: { initial: string[]; choices: WikiBoardCard[]; onCommit: (ids: string[]) => void }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>(initial);
  const latest = useRef(picked);
  latest.current = picked;
  const commit = useRef(onCommit);
  commit.current = onCommit;
  // One save per visit to the picker, not one per tick: a client's edits are rate limited.
  useEffect(
    () => () => {
      if (JSON.stringify([...latest.current].sort()) !== JSON.stringify([...initial].sort())) commit.current(latest.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const shown = q.trim() ? fuzzySearch(choices, q, (c) => [c.title]) : choices;
  return (
    <div>
      <input
        className="app-input h-8 w-full px-2 text-[16px] sm:text-[13px]"
        type="search"
        value={q}
        autoFocus
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find a card…"
        aria-label="Find a card it depends on"
      />
      <ul className="mt-1.5 max-h-[220px] overflow-y-auto">
        {shown.slice(0, 50).map((c) => {
          const on = picked.includes(c.id);
          return (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-[4px] px-2 py-1.5 text-[13px] text-[var(--text-2)] hover:bg-[var(--surface-1)]">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!on && picked.length >= BOARD_LIMITS.dependsOn}
                  onChange={() => setPicked((p) => (on ? p.filter((d) => d !== c.id) : [...p, c.id]))}
                />
                <span className="min-w-0 truncate" title={c.title}>
                  {c.title}
                </span>
              </label>
            </li>
          );
        })}
        {!shown.length ? <li className="px-2 py-1.5 text-[13px] text-[var(--text-4)]">No cards match.</li> : null}
      </ul>
    </div>
  );
}

/** Reply, comment, approve or ask for changes: pinned under the card's activity. */
function Composer({ target, cardId, audience }: { target: BoardTarget; cardId: string; audience: "client" | "team" }) {
  const send = useSendBoardFeedback(target, cardId);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function submit(kind: FeedbackKind) {
    const refusal = feedbackRefusal(kind, body);
    if (refusal) return setError(refusal);
    setError(null);
    try {
      await send.mutateAsync({ kind, body });
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send. Please try again.");
    }
  }
  return (
    <div className="shrink-0 border-t border-[var(--border-2)] px-5 py-3" data-card-composer>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={1}
          maxLength={BOARD_LIMITS.feedback}
          placeholder={audience === "client" ? "Feedback, or what needs changing…" : "Reply to the client…"}
          aria-label="Feedback"
          // Grows with what's typed, up to a few lines, so an empty composer takes one line.
          className="app-input max-h-[120px] min-h-[36px] w-full flex-1 resize-none px-3 py-2 text-[16px] [field-sizing:content] sm:text-sm"
        />
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {audience === "client" ? (
            <>
              <button type="button" className="app-button app-button-secondary app-button-sm h-9" disabled={send.isPending} onClick={() => void submit("changes_requested")}>
                Changes needed
              </button>
              <button type="button" className="app-button app-button-secondary app-button-sm h-9" disabled={send.isPending} onClick={() => void submit("approved")}>
                Approve
              </button>
            </>
          ) : null}
          <button type="button" className="app-button app-button-primary app-button-sm h-9" disabled={send.isPending} onClick={() => void submit("comment")}>
            {audience === "client" ? "Comment" : "Reply"}
          </button>
        </div>
      </div>
      {error ? <p className="mt-1.5 text-[12px] text-red-700">{error}</p> : null}
    </div>
  );
}

/** A card's image at full size, over the dialog: ← and → step, Escape closes it (not the dialog). */
function Lightbox({
  target,
  card,
  index,
  onIndex,
  onClose,
}: {
  target: BoardTarget;
  card: WikiBoardCard;
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const count = card.images.length;
  useEffect(() => {
    // Capture, so this Escape closes the image and never reaches the dialog's own Escape.
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowRight") onIndex((index + 1) % count);
      else if (e.key === "ArrowLeft") onIndex((index - 1 + count) % count);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, count, onIndex, onClose]);
  const img = card.images[index];
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-black/85" role="group" aria-label={`Image ${index + 1} of ${count}`} data-card-lightbox>
      <div className="flex shrink-0 items-center justify-between px-4 py-2 text-[12px] text-white/80" style={MONO}>
        <span>
          {index + 1} / {count}
        </span>
        <span className="flex items-center gap-3">
          <a href={boardImageUrl(target, card.id, img, false)} target="_blank" rel="noopener noreferrer" className="hover:text-white">
            Open original
          </a>
          <button type="button" onClick={onClose} aria-label="Close image" className="hover:text-white">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </span>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={boardImageUrl(target, card.id, img, false)} alt={`Image ${index + 1} on ${card.title}`} className="max-h-full max-w-full object-contain" />
        {count > 1 ? (
          <>
            <button type="button" className="absolute left-2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70" aria-label="Previous image" onClick={() => onIndex((index - 1 + count) % count)}>
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <button type="button" className="absolute right-2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70" aria-label="Next image" onClick={() => onIndex((index + 1) % count)}>
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
