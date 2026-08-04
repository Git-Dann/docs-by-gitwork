"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AdjustmentsHorizontalIcon,
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  EyeIcon,
  EyeSlashIcon,
  LinkIcon,
  PencilSquareIcon,
  PlayIcon,
  PlusIcon,
  QueueListIcon,
  Squares2X2Icon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityFeed } from "@/components/proposals/activity-feed";
import { DocumentAnalyticsPanel } from "@/components/proposals/document-analytics-panel";
import { ProposalPreview } from "@/components/proposals/proposal-preview";
import { AiChatPanel } from "@/components/proposals/ai-chat-panel";
import { AiDraftModal } from "@/components/proposals/ai-draft-modal";
import { PullSupportDataModal } from "@/components/proposals/pull-support-data-modal";
import { BlockPalette } from "@/components/proposals/block-palette";
import { CollabPanel } from "@/components/proposals/collab-panel";
import { DocumentRelationsPanel } from "@/components/proposals/document-relations-panel";
import { RightRailTabs } from "@/components/proposals/right-rail-tabs";
import { SpeakerNotesField } from "@/components/proposals/speaker-notes-field";
import { useDocumentRelations } from "@/hooks/use-document-relations";
import { ProposalProofPanel } from "@/components/proposals/proposal-proof-panel";
import { SignaturePanel } from "@/components/proposals/signature-panel";
import { EnvelopeIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { SECTION_REGISTRY } from "@/lib/sections/registry";
import { Button } from "@/components/ui/button";
import { buttonStyles } from "@/components/ui/button-styles";
import { StatusBadge } from "@/components/status-badge";
import { slugifyClientName } from "@/lib/clients";
import { useProposal, useUpdateProposal } from "@/hooks/use-proposals";
import { useDeleteSnippet, useSnippets } from "@/hooks/use-snippets";
import { usePermissions } from "@/hooks/use-permissions";
import { cn, formatCurrency, formatDate, statusLabel } from "@/lib/format";
import { deriveProposalStatus } from "@/lib/proposal-workflow";
import { approvalTrackApplies } from "@/lib/templates";
import { createTemplateFromDocument } from "@/lib/api";
import { DEFAULT_DOC_THEME } from "@/types/proposal";
import type { DocumentType, ProposalDocument, ProposalSection, SectionKey } from "@/types/proposal";

type EditorTab = "overview" | "builder";
type SaveState = "idle" | "saving" | "saved" | "error";

// Builder-first: the editor opens straight into the canvas. Overview lives behind the header
// "Document details" button (a slide-over), not a primary tab — so a missing/unknown ?tab= lands
// on the builder, and only an explicit ?tab=overview opens the overview.
function parseEditorTab(value: string | null): EditorTab {
  return value === "overview" ? "overview" : "builder";
}

function loadProposalBuilderPanel() {
  return import("@/components/proposals/proposal-builder-panel");
}

const ProposalBuilderPanel = dynamic(
  () =>
    loadProposalBuilderPanel().then((mod) => ({
      default: mod.ProposalBuilderPanel,
    })),
  {
    // Renders inside the right properties rail's `01 // BLOCK` group, which supplies the chrome —
    // so the placeholder is chromeless too (a widget-card here would nest a card in a card).
    loading: () => <p className="p-4 text-sm text-[var(--text-3)]">Loading block options…</p>,
  },
);

/** Toolbar icon-button chrome. 32px square, 6px radius (DESIGN.md instrument geometry). */
const TOOL_ICON_BTN =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-[var(--border-2)] " +
  "bg-white text-[var(--text-2)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-1)] " +
  "disabled:cursor-not-allowed disabled:opacity-40";

/** Same geometry, pressed/active tone — used by the two pane toggles. */
const TOOL_ICON_BTN_ON =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border " +
  "border-[var(--brand-600)] bg-[var(--brand-200)] text-[var(--brand-700)] transition-colors";

/** Compact labelled toolbar button (Present · Details · Review & Send share this height). */
const TOOL_BTN =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white " +
  "px-2.5 text-[13px] font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]";

// Presentation mode is heavy (full-screen deck + canvas) and only mounts on demand — lazy-load it
// client-side so it stays out of the editor's initial bundle.
const PresentationMode = dynamic(
  () => import("@/components/proposals/presentation-mode").then((mod) => ({ default: mod.PresentationMode })),
  { ssr: false },
);

/**
 * Build a mailto: URL that pre-fills a sensible subject + body for sharing a doc. Used by the
 * "Email link" affordance on the share popover.
 */
function buildShareMailto(documentTitle: string, shareUrl: string): string {
  const subject = `Document for your review: ${documentTitle}`;
  const body =
    `Hi,\n\nPlease find the document for your review at the link below.\n\n${shareUrl}\n\n` +
    `If you have any questions, just reply to this email.\n\nBest,\nGitwork`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function getSectionEntryId(section: ProposalSection) {
  return section.id ?? section.key;
}

function cloneSectionData(section: ProposalSection["data"]) {
  return JSON.parse(JSON.stringify(section)) as ProposalSection["data"];
}

function createDraftSectionId() {
  const generated =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);

  return `draft-section-${generated}`;
}

const approvalOptions = [
  {
    key: "productSignOff",
    label: "Product sign off",
    description: "Product review is complete.",
  },
  {
    key: "techSignOff",
    label: "Tech sign off",
    description: "Technical review is complete.",
  },
  {
    key: "approvalChecked",
    label: "Approved",
    description: "CEO approval is complete.",
  },
] as const;

export function ProposalEditorLayout({ proposalId }: { proposalId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data, isPending, error } = useProposal(proposalId);
  const updateMutation = useUpdateProposal(proposalId);
  const snippetsQuery = useSnippets();
  const deleteSnippet = useDeleteSnippet();
  const urlTab = parseEditorTab(searchParams.get("tab"));

  const [localDraft, setLocalDraft] = useState<ProposalDocument | null>(null);
  const [activeTab, setActiveTab] = useState<EditorTab>(urlTab);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [aiDraftOpen, setAiDraftOpen] = useState(false);
  const [pullDataOpen, setPullDataOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  // Only AI-generation holders (admins by default) see AI authoring — it spends tokens.
  // Non-holders still edit the doc by hand; the server also blocks the routes.
  const { canGenerateAi } = usePermissions();
  const [templateSavedAt, setTemplateSavedAt] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  async function handleSaveAsTemplate() {
    if (!draft) return;
    const name = prompt(
      "Name this template",
      `${draft.title} — template`,
    );
    if (!name?.trim()) return;
    try {
      await createTemplateFromDocument(proposalId, { name: name.trim() });
      setTemplateSavedAt(name.trim());
      setTimeout(() => setTemplateSavedAt(null), 4000);
    } catch (err) {
      alert((err as Error).message);
    }
  }
  /** Index where the palette will insert a freshly-picked block. Null = palette closed. */
  const [paletteInsertAt, setPaletteInsertAt] = useState<number | null>(null);
  // Canvas editor (2026, Deck's three-pane shape): a compact top toolbar, then
  //   [left: block outline — NAVIGATION ONLY] [centre: canvas] [right: properties].
  // `outlineOpen` toggles the left rail; `optionsForId` drives the RIGHT rail — selecting a block
  // (canvas click or the outline's ✎) opens its Options there while the outline stays visible.
  // The old behaviour (Options drilled INTO the left rail, replacing the outline) is gone: the
  // 280px rail was too narrow for the forms and you lost your place while editing.
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [optionsForId, setOptionsForId] = useState<string | null>(null);

  // Scroll-spy: the outline highlights whichever block is currently in view as you scroll.
  const [viewingSectionId, setViewingSectionId] = useState<string | null>(null);
  const [approvalPos, setApprovalPos] = useState({ top: 0, right: 0 });
  const approvalButtonRef = useRef<HTMLButtonElement>(null);
  const approvalPanelRef = useRef<HTMLDivElement>(null);
  // AI actions menu (Ask AI · Quick draft). Fixed-positioned like the approval popover because the
  // editor header lives inside an overflow-hidden widget-card.
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [aiMenuPos, setAiMenuPos] = useState({ top: 0, right: 0 });
  const aiMenuButtonRef = useRef<HTMLButtonElement>(null);
  const aiMenuRef = useRef<HTMLDivElement>(null);
  // Doc settings (theme + labels). Re-housed out of the old tall header card into a popover so the
  // toolbar stays one row — same fixed-positioning trick as the approval popover, for the same
  // reason (the toolbar lives inside an overflow-hidden widget-card).
  const [docSettingsOpen, setDocSettingsOpen] = useState(false);
  const [docSettingsPos, setDocSettingsPos] = useState({ top: 0, right: 0 });
  const docSettingsButtonRef = useRef<HTMLButtonElement>(null);
  const docSettingsRef = useRef<HTMLDivElement>(null);

  const baselineRef = useRef("");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Undo / redo history (Phase 2b) ──────────────────────────────────────────
  // Snapshots of the draft (JSON) before each change. Rapid text edits coalesce into one step
  // (700ms window); structural ops (add/delete/reorder/toggle) are always discrete steps.
  const pastRef = useRef<string[]>([]);
  const futureRef = useRef<string[]>([]);
  const lastEditAtRef = useRef(0);
  const undoRef = useRef<() => void>(() => {});
  const redoRef = useRef<() => void>(() => {});
  const [, forceHistory] = useState(0);

  useEffect(() => {
    setActiveTab(urlTab);
  }, [urlTab]);

  const draft = localDraft ?? data?.proposal ?? null;

  function beginTitleEdit() {
    if (!draft) return;
    setTitleDraft(draft.title);
    setEditingTitle(true);
  }

  function commitTitleEdit() {
    if (!draft) return;
    const nextTitle = titleDraft.trim();
    if (nextTitle && nextTitle !== draft.title) {
      updateDraft({ ...draft, title: nextTitle });
    }
    setEditingTitle(false);
  }

  const sectionEntries = useMemo(() => {
    if (!draft) {
      return [] as Array<{ id: string; section: ProposalSection; order: number }>;
    }

    return [...draft.sections]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((section, index) => ({
        id: getSectionEntryId(section),
        section,
        order: index + 1,
      }));
  }, [draft]);

  const defaultActiveSectionId = useMemo(() => {
    if (!sectionEntries.length) {
      return null;
    }

    return sectionEntries[0].id;
  }, [sectionEntries]);

  const activeEntry = useMemo(() => {
    if (!sectionEntries.length) {
      return null;
    }

    const resolvedActiveId = activeSectionId ?? defaultActiveSectionId;
    return sectionEntries.find((entry) => entry.id === resolvedActiveId) ?? sectionEntries[0];
  }, [sectionEntries, activeSectionId, defaultActiveSectionId]);

  // Scroll-spy — highlight the block currently in view in the outline as the canvas scrolls.
  // Keyed on the block-id list (not the array identity) so it doesn't rebuild on every keystroke.
  const sectionIdsKey = sectionEntries.map((entry) => entry.id).join("|");
  useEffect(() => {
    if (activeTab === "overview" || typeof IntersectionObserver === "undefined") {
      return;
    }
    const blocks = Array.from(document.querySelectorAll<HTMLElement>("[data-canvas-block]"));
    if (!blocks.length) {
      return;
    }
    const order = blocks.map((block) => block.dataset.canvasBlock ?? "");
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.canvasBlock;
          if (!id) continue;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        const topmost = order.find((id) => visible.has(id));
        if (topmost) setViewingSectionId(topmost);
      },
      { rootMargin: "-12% 0px -72% 0px", threshold: 0 },
    );
    blocks.forEach((block) => observer.observe(block));
    return () => observer.disconnect();
  }, [activeTab, sectionIdsKey]);

  // Public share is now token-gated under /docs/[token]. The token comes from the document
  // record (minted on first POST to /api/documents/[id]/share, persisted from then on). If no
  // token exists yet, the Share button will mint one before copying.
  const publicShareToken = draft?.shareToken ?? null;
  const publicSharePath = publicShareToken ? `/docs/${publicShareToken}` : null;
  const publicShareUrl =
    publicSharePath && typeof window !== "undefined"
      ? `${window.location.origin}${publicSharePath}`
      : publicSharePath ?? "";

  // Whether the internal review/sign-off track applies to this document (per-doc override →
  // type default). Drives the Review & Send popover.
  const approvalApplies = draft
    ? approvalTrackApplies(draft.documentType, draft.metadata)
    : false;

  // The block whose options are open in the RIGHT properties rail, if any.
  const optionsEntry = optionsForId
    ? sectionEntries.find((entry) => entry.id === optionsForId) ?? null
    : null;
  // Its index in `draft.sections` — the speaker-notes group patches by index, like the builder panel.
  const optionsSectionIndex = optionsEntry
    ? (draft?.sections ?? []).findIndex(
        (section) => getSectionEntryId(section) === optionsEntry.id,
      )
    : -1;

  const handleTabChange = useCallback(
    (tab: EditorTab) => {
      setActiveTab(tab);

      const nextParams = new URLSearchParams(searchParams.toString());
      // Builder is the default view → clear the param for builder, write it only for overview.
      if (tab === "overview") {
        nextParams.set("tab", tab);
      } else {
        nextParams.delete("tab");
      }

      const nextQuery = nextParams.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (!draft || baselineRef.current) {
      return;
    }

    baselineRef.current = JSON.stringify(draft);
  }, [draft]);

  useEffect(() => {
    if (!approvalOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        approvalPanelRef.current?.contains(e.target as Node) ||
        approvalButtonRef.current?.contains(e.target as Node)
      ) return;
      setApprovalOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setApprovalOpen(false);
        approvalButtonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [approvalOpen]);

  useEffect(() => {
    if (!aiMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        aiMenuRef.current?.contains(e.target as Node) ||
        aiMenuButtonRef.current?.contains(e.target as Node)
      ) return;
      setAiMenuOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAiMenuOpen(false);
        aiMenuButtonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [aiMenuOpen]);

  useEffect(() => {
    if (!docSettingsOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        docSettingsRef.current?.contains(e.target as Node) ||
        docSettingsButtonRef.current?.contains(e.target as Node)
      ) return;
      setDocSettingsOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDocSettingsOpen(false);
        docSettingsButtonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [docSettingsOpen]);

  const saveDraft = useCallback(
    async (nextDraft: ProposalDocument) => {
      try {
        await updateMutation.mutateAsync(serializeDraft(nextDraft));
        baselineRef.current = JSON.stringify(nextDraft);
        setSaveState("saved");
        setLastSavedAt(new Date().toISOString());
      } catch {
        setSaveState("error");
      }
    },
    [updateMutation],
  );

  useEffect(() => {
    if (!localDraft) {
      return;
    }

    const nextSerialized = JSON.stringify(localDraft);
    if (!baselineRef.current || baselineRef.current === nextSerialized) {
      return;
    }

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      void saveDraft(localDraft);
    }, 900);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [localDraft, saveDraft]);

  // Undo / redo keyboard shortcuts. Bound once; calls the latest handler via refs. Skips when a
  // text field is focused so the browser's native per-character undo still works while typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const el = document.activeElement as HTMLElement | null;
      const inField =
        !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (inField) return;
      if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        redoRef.current();
      } else if (key === "z") {
        event.preventDefault();
        undoRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(() => {
        void loadProposalBuilderPanel();
      });

      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = setTimeout(() => {
      void loadProposalBuilderPanel();
    }, 1200);

    return () => clearTimeout(timeoutId);
  }, []);

  function updateDraft(nextDraft: ProposalDocument, opts?: { coalesce?: boolean }) {
    // Push the pre-change draft onto the undo stack. Coalesce rapid text edits so one undo
    // doesn't just remove a single character; structural ops never coalesce.
    if (draft) {
      const now = Date.now();
      const within = now - lastEditAtRef.current < 700;
      lastEditAtRef.current = now;
      if (!(opts?.coalesce && within)) {
        pastRef.current.push(JSON.stringify(draft));
        if (pastRef.current.length > 100) pastRef.current.shift();
        futureRef.current = [];
        forceHistory((v) => v + 1);
      }
    }
    setLocalDraft({
      ...nextDraft,
      status: deriveProposalStatus(
        nextDraft.metadata,
        approvalTrackApplies(nextDraft.documentType, nextDraft.metadata),
      ),
    });
    setSaveState("saving");
  }

  // Reassigned every render so the handlers close over the current `draft`; invoked via refs from
  // the toolbar buttons and the keyboard shortcut effect (which binds once).
  undoRef.current = () => {
    if (pastRef.current.length === 0 || !draft) return;
    futureRef.current.push(JSON.stringify(draft));
    const restored = JSON.parse(pastRef.current.pop() as string) as ProposalDocument;
    setLocalDraft(restored);
    setSaveState("saving");
    forceHistory((v) => v + 1);
  };
  redoRef.current = () => {
    if (futureRef.current.length === 0 || !draft) return;
    pastRef.current.push(JSON.stringify(draft));
    const restored = JSON.parse(futureRef.current.pop() as string) as ProposalDocument;
    setLocalDraft(restored);
    setSaveState("saving");
    forceHistory((v) => v + 1);
  };

  function updateSectionOrder(activeId: string, overId: string) {
    if (!draft || activeId === overId) {
      return;
    }

    const orderedSections = [...draft.sections].sort((left, right) => left.sortOrder - right.sortOrder);
    const fromIndex = orderedSections.findIndex((section) => getSectionEntryId(section) === activeId);
    const toIndex = orderedSections.findIndex((section) => getSectionEntryId(section) === overId);

    if (fromIndex < 0 || toIndex < 0) {
      return;
    }

    const nextSections = arrayMove(orderedSections, fromIndex, toIndex).map((section, index) => ({
      ...section,
      sortOrder: index,
    }));

    updateDraft({
      ...draft,
      sections: nextSections,
    });
  }

  /**
   * Insert a new block at `insertAt` (defaults to end). Uses the section registry's defaultData
   * so every block type — including the new heading/prose/callout/image/divider — works without
   * needing a parallel blueprint table.
   */
  function handleAddSection(key: SectionKey, insertAt?: number) {
    if (!draft) return;
    const sectionType = SECTION_REGISTRY[key];
    if (!sectionType) return;

    const insertIndex =
      typeof insertAt === "number"
        ? Math.max(0, Math.min(insertAt, draft.sections.length))
        : draft.sections.length;

    const nextSection: ProposalSection = {
      id: createDraftSectionId(),
      key: sectionType.key,
      title: sectionType.defaultTitle,
      description: sectionType.defaultDescription ?? "",
      sortOrder: insertIndex,
      isVisible: sectionType.defaultVisible !== false,
      data: cloneSectionData(sectionType.defaultData as ProposalSection["data"]),
    };

    const ordered = [...draft.sections].sort((a, b) => a.sortOrder - b.sortOrder);
    ordered.splice(insertIndex, 0, nextSection);
    const nextSections = ordered.map((section, index) => ({ ...section, sortOrder: index }));

    updateDraft({ ...draft, sections: nextSections });
    setActiveSectionId(getSectionEntryId(nextSection));
    setActiveTab("builder");
  }

  // Insert a saved snippet (Phase 3): a section pre-filled with the snippet's stored data.
  function handleAddSnippet(snippetId: string, insertAt?: number) {
    if (!draft) return;
    const snippet = (snippetsQuery.data ?? []).find((s) => s.id === snippetId);
    if (!snippet) return;
    const sectionType = SECTION_REGISTRY[snippet.sectionKey as SectionKey];
    if (!sectionType) return;

    const insertIndex =
      typeof insertAt === "number"
        ? Math.max(0, Math.min(insertAt, draft.sections.length))
        : draft.sections.length;

    const nextSection: ProposalSection = {
      id: createDraftSectionId(),
      key: sectionType.key,
      title: snippet.name || sectionType.defaultTitle,
      description: sectionType.defaultDescription ?? "",
      sortOrder: insertIndex,
      isVisible: sectionType.defaultVisible !== false,
      data: cloneSectionData(snippet.data as ProposalSection["data"]),
    };

    const ordered = [...draft.sections].sort((a, b) => a.sortOrder - b.sortOrder);
    ordered.splice(insertIndex, 0, nextSection);
    const nextSections = ordered.map((section, index) => ({ ...section, sortOrder: index }));

    updateDraft({ ...draft, sections: nextSections });
    setActiveSectionId(getSectionEntryId(nextSection));
    setActiveTab("builder");
  }

  function handleToggleVisibility(sectionId: string, nextVisible: boolean) {
    if (!draft) return;
    updateDraft({
      ...draft,
      sections: draft.sections.map((section) =>
        getSectionEntryId(section) === sectionId
          ? { ...section, isVisible: nextVisible }
          : section,
      ),
    });
  }

  function handleDeleteSection(sectionId: string) {
    if (!draft) {
      return;
    }

    const orderedSections = [...draft.sections].sort((left, right) => left.sortOrder - right.sortOrder);
    const removedIndex = orderedSections.findIndex((section) => getSectionEntryId(section) === sectionId);

    if (removedIndex < 0) {
      return;
    }

    const nextSections = orderedSections
      .filter((section) => getSectionEntryId(section) !== sectionId)
      .map((section, index) => ({
        ...section,
        sortOrder: index,
      }));

    updateDraft({
      ...draft,
      sections: nextSections,
    });

    if (activeSectionId === sectionId) {
      const nextActiveSection =
        nextSections[Math.min(removedIndex, nextSections.length - 1)] ?? null;
      setActiveSectionId(nextActiveSection ? getSectionEntryId(nextActiveSection) : null);
    }
  }

  // Inline canvas editing: a text-first block wrote new data directly on the page. Route it
  // through the coalesced autosave so undo/redo + save-state keep working.
  function handleSectionDataChange(sectionId: string, next: ProposalSection["data"]) {
    if (!draft) {
      return;
    }
    updateDraft(
      {
        ...draft,
        sections: draft.sections.map((section) =>
          getSectionEntryId(section) === sectionId ? { ...section, data: next } : section,
        ),
      },
      { coalesce: true },
    );
  }

  // Inline edits to a block's own heading + caption (which live on the section, not its `data`) so
  // every block's title and caption text can be changed straight on the canvas — not just the
  // handful of blocks whose body is inline-editable.
  function handleSectionMetaChange(
    sectionId: string,
    meta: { title?: string; description?: string },
  ) {
    if (!draft) {
      return;
    }
    updateDraft(
      {
        ...draft,
        sections: draft.sections.map((section) =>
          getSectionEntryId(section) === sectionId ? { ...section, ...meta } : section,
        ),
      },
      { coalesce: true },
    );
  }

  function scrollToBlock(id: string) {
    if (typeof document !== "undefined") {
      document
        .querySelector(`[data-canvas-block="${window.CSS.escape(id)}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // Outline-row click: navigate — scroll the canvas to the block (text is edited inline there).
  function handleOutlineSelect(id: string) {
    setActiveSectionId(id);
    scrollToBlock(id);
  }

  // Select a block: open its options in the RIGHT properties rail and scroll to it on the canvas.
  // The left outline is untouched, so you keep your place in the document while editing.
  function openOptions(id: string) {
    setActiveSectionId(id);
    setOptionsForId(id);
    scrollToBlock(id);
  }

  async function handleShareLink() {
    if (typeof window === "undefined" || !draft) {
      return;
    }

    // If we don't yet have a share token, mint one. Otherwise the existing token is reused so
    // a previously distributed link keeps working.
    let token = draft.shareToken;
    if (!token) {
      try {
        const res = await fetch(`/api/documents/${proposalId}/share`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Failed to enable sharing");
        token = json.data?.shareToken ?? json.shareToken;
        if (token) {
          setLocalDraft((current) => (current ? { ...current, shareToken: token, isShared: true } : current));
        }
      } catch (err) {
        console.error(err);
        return;
      }
    }

    if (!token) return;
    const url = `${window.location.origin}/docs/${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleExportPdf() {
    if (typeof window === "undefined") {
      return;
    }

    // When the document is shared we can produce a real, pixel-accurate server-side PDF (Chromium
    // renders the public page). Otherwise fall back to the browser print view.
    if (draft?.isShared && draft.shareToken) {
      window.open(`/api/proposals/${proposalId}/pdf`, "_blank", "noopener,noreferrer");
    } else {
      window.open(`/app/docs/${proposalId}/print?autoprint=1`, "_blank", "noopener,noreferrer");
    }
  }

  function handleApprovalToggle(key: (typeof approvalOptions)[number]["key"], checked: boolean) {
    if (!draft) {
      return;
    }

    const nextMetadata = {
      ...draft.metadata,
      [key]: checked,
    };

    if (key === "approvalChecked" && checked) {
      nextMetadata.productSignOff = true;
      nextMetadata.techSignOff = true;
    }

    if ((key === "productSignOff" || key === "techSignOff") && !checked) {
      nextMetadata.approvalChecked = false;
    }

    if (key === "approvalChecked" && !checked) {
      nextMetadata.approvalChecked = false;
    }

    updateDraft({
      ...draft,
      metadata: nextMetadata,
    });
  }

  // Per-document override for the internal review / sign-off track. Setting it explicitly wins
  // over the doc type's default. When switched off we also clear any sign-off flags so the doc
  // settles back to DRAFT cleanly.
  function handleApprovalTrackToggle(enabled: boolean) {
    if (!draft) {
      return;
    }
    updateDraft({
      ...draft,
      metadata: {
        ...draft.metadata,
        approvalTrackEnabled: enabled,
        ...(enabled
          ? {}
          : { productSignOff: false, techSignOff: false, approvalChecked: false }),
      },
    });
  }

  // P5.18 — surface the parent doc in the editor header so the link is visible at a glance.
  // useDocumentRelations is cached, so the Linked-tab panel re-uses this query (no extra fetch).
  // Declared before the early-returns to satisfy the rules-of-hooks linter.
  const relations = useDocumentRelations(proposalId);
  const parentDoc = relations.data?.parent ?? null;

  if (isPending) {
    return (
      <section className="app-card p-6">
        <p className="text-sm text-[var(--text-3)]">Loading proposal...</p>
      </section>
    );
  }

  if (error || !draft) {
    return (
      <section className="app-card p-6">
        <p className="text-sm text-rose-700">{(error as Error)?.message ?? "Proposal unavailable"}</p>
      </section>
    );
  }

  // Save state is now a mono readout in the toolbar's widget-header strip rather than a chip on its
  // own row — same information, no vertical cost.
  const saveTone =
    saveState === "saved"
      ? "text-emerald-600"
      : saveState === "saving"
        ? "text-amber-600"
        : saveState === "error"
          ? "text-rose-600"
          : "text-[var(--text-4)]";
  const saveReadout =
    saveState === "saved"
      ? `SAVED ${lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "JUST NOW"}`
      : saveState === "saving"
        ? "SAVING…"
        : saveState === "error"
          ? "SAVE FAILED"
          : "WAITING TO SAVE";
  const docMetaReadout = [
    draft.documentNumber || null,
    draft.version || null,
    statusLabel(draft.status).toUpperCase(),
  ]
    .filter(Boolean)
    .join(" · ");
  const labelCount = draft.labels?.length ?? 0;
  const activeDocTheme = draft.metadata.docTheme ?? DEFAULT_DOC_THEME;

  return (
    // Desktop: a FIXED-HEIGHT frame (fills <main>) so the page never scrolls past the viewport —
    // the header/toolbar are fixed and the canvas + outline scroll internally. Mobile keeps normal
    // document flow. (Never revert this to an unbounded flow: a long doc used to grow the whole
    // page. See DESIGN.md → "Docs editor is a fixed-height frame".)
    <div className="flex flex-col gap-3 lg:h-full lg:min-h-0 lg:overflow-hidden">
      {/* 01 // DOCUMENT — ONE compact toolbar row (Deck's topbar shape). Everything that used to
          stack vertically here is either a mono readout in this header strip (doc number, version,
          status, save state), an inline field (the title), or one click behind a popover (theme +
          labels, under the ⚙; sign-off/share/export/save-as-template under Review & Send). */}
      <section className="widget-card overflow-hidden lg:shrink-0">
        <div className="widget-header">
          <span className="widget-header-label">01 // DOCUMENT</span>
          <span className="flex min-w-0 items-center gap-2">
            {/* Ellipses on a phone, so it carries its own title (audit-clipping TRUNCATED). */}
            <span className="widget-header-right truncate" title={docMetaReadout}>
              {docMetaReadout}
            </span>
            <span className={cn("widget-header-right", saveTone)}>{saveReadout}</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-2 sm:px-3">
          <Link
            href="/app/docs"
            aria-label="Back to Docs"
            title="Back to Docs"
            className={TOOL_ICON_BTN}
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>

          {/* Condensed breadcrumb — the document itself is named by the title field beside it, so
              the old trailing "› {title}" crumb is gone as pure duplication. */}
          <span className="hidden min-w-0 items-center gap-1 text-xs text-[var(--text-4)] xl:flex">
            <Link href="/app/docs" className="hover:text-[var(--text-1)]">
              Docs
            </Link>
            <ChevronRightIcon className="h-3 w-3 shrink-0" />
            {draft.clientName ? (
              <Link
                href={`/app/portal/${slugifyClientName(draft.clientName)}`}
                className="max-w-[130px] truncate hover:text-[var(--text-1)]"
              >
                {draft.clientName}
              </Link>
            ) : (
              <span>Client</span>
            )}
            <ChevronRightIcon className="h-3 w-3 shrink-0" />
          </span>

          {/* Title — a compact inline-editable field, not a 44px display heading. Focus begins the
              edit; blur / Enter commits; Escape reverts. Same commit path as before. */}
          <input
            aria-label="Document title"
            value={editingTitle ? titleDraft : draft.title}
            onFocus={beginTitleEdit}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={commitTitleEdit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                setEditingTitle(false);
                event.currentTarget.blur();
              }
            }}
            title="Rename document"
            className="h-8 min-w-[7rem] flex-1 rounded-[6px] border border-transparent bg-transparent px-2 text-sm font-semibold tracking-[-0.01em] text-[var(--text-1)] transition hover:border-[var(--border-2)] hover:bg-white focus:border-[var(--brand-500)] focus:bg-white focus:outline-none"
          />

          {parentDoc ? (
            <Link
              href={`/app/docs/${parentDoc.id}`}
              className="hidden h-8 shrink-0 items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-white px-2 text-xs font-medium text-[var(--brand-700)] transition hover:bg-[var(--brand-200)]/50 lg:inline-flex"
              title={`Linked under ${parentDoc.documentType}: ${parentDoc.title}`}
            >
              <LinkIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="max-w-[110px] truncate">{parentDoc.title}</span>
            </Link>
          ) : null}

          {/* Pane toggles (Deck's left/right panel toggles) — outline left, properties right. */}
          <span className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setOutlineOpen((v) => !v)}
              aria-pressed={outlineOpen}
              aria-label={outlineOpen ? "Hide outline" : "Show outline"}
              title={outlineOpen ? "Hide outline" : "Show outline"}
              className={outlineOpen ? TOOL_ICON_BTN_ON : TOOL_ICON_BTN}
            >
              <QueueListIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() =>
                setOptionsForId((current) =>
                  current ? null : activeEntry?.id ?? sectionEntries[0]?.id ?? null,
                )
              }
              aria-pressed={optionsForId !== null}
              aria-label={optionsForId ? "Hide block options" : "Show block options"}
              title={optionsForId ? "Hide block options" : "Show block options"}
              className={optionsForId !== null ? TOOL_ICON_BTN_ON : TOOL_ICON_BTN}
            >
              <AdjustmentsHorizontalIcon className="h-4 w-4" />
            </button>
          </span>

          <span className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => undoRef.current()}
              disabled={pastRef.current.length === 0}
              title="Undo (⌘Z)"
              aria-label="Undo"
              className={TOOL_ICON_BTN}
            >
              <ArrowUturnLeftIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => redoRef.current()}
              disabled={futureRef.current.length === 0}
              title="Redo (⌘⇧Z)"
              aria-label="Redo"
              className={TOOL_ICON_BTN}
            >
              <ArrowUturnRightIcon className="h-4 w-4" />
            </button>
            <Link
              href={`/app/docs/${proposalId}/preview`}
              title="Open full preview"
              aria-label="Open full preview"
              className={TOOL_ICON_BTN}
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={() => setPresenting(true)}
              title="Present"
              aria-label="Present"
              className={TOOL_ICON_BTN}
            >
              <PlayIcon className="h-4 w-4" />
            </button>
          </span>

            {/* AI menu — Ask AI · Quick draft. Hidden for non-generators (cost gate). */}
            {canGenerateAi && (
            <div className="shrink-0">
              <button
                ref={aiMenuButtonRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={aiMenuOpen}
                title="AI authoring"
                onClick={() => {
                  const rect = aiMenuButtonRef.current?.getBoundingClientRect();
                  if (rect) setAiMenuPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
                  setAiMenuOpen((v) => !v);
                }}
                className={cn(TOOL_BTN, "gap-1 px-2")}
              >
                <SparklesIcon className="h-4 w-4" />
                AI
                <ChevronDownIcon className={cn("h-3.5 w-3.5 opacity-70 transition", aiMenuOpen && "rotate-180")} />
              </button>
              {aiMenuOpen && (
                <div
                  ref={aiMenuRef}
                  role="menu"
                  aria-label="AI actions"
                  style={{ top: aiMenuPos.top, right: aiMenuPos.right }}
                  className="fixed z-[100] w-60 overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-white py-1 shadow-[var(--shadow-lg)]"
                >
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => { setAiMenuOpen(false); setAiChatOpen(true); }}
                    className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-1)]"
                  >
                    <SparklesIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-700)]" />
                    <span>
                      <span className="block text-sm font-medium text-[var(--text-1)]">Ask AI</span>
                      <span className="block text-xs text-[var(--text-3)]">Chat to refine sections as you write.</span>
                    </span>
                  </button>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => { setAiMenuOpen(false); setAiDraftOpen(true); }}
                    className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-1)]"
                  >
                    <SparklesIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-700)]" />
                    <span>
                      <span className="block text-sm font-medium text-[var(--text-1)]">Quick draft</span>
                      <span className="block text-xs text-[var(--text-3)]">Generate a first-pass draft of every section.</span>
                    </span>
                  </button>
                </div>
              )}
            </div>
            )}
            {draft.documentType === "REPORT" && (
              <button
                type="button"
                onClick={() => setPullDataOpen(true)}
                className={TOOL_ICON_BTN}
                aria-label="Pull client data"
                title="Fill this report's data sections from a Care client's live tickets & analytics"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
              </button>
            )}

            {/* ⚙ Doc settings — the per-document theme toggle + labels, re-housed out of the old
                header rows so neither costs the toolbar any vertical space. */}
            <div className="shrink-0">
              <button
                ref={docSettingsButtonRef}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={docSettingsOpen}
                aria-label="Document theme and labels"
                title="Theme & labels"
                onClick={() => {
                  const rect = docSettingsButtonRef.current?.getBoundingClientRect();
                  if (rect) {
                    setDocSettingsPos({
                      top: rect.bottom + 8,
                      right: window.innerWidth - rect.right,
                    });
                  }
                  setDocSettingsOpen((v) => !v);
                }}
                className={docSettingsOpen ? TOOL_ICON_BTN_ON : TOOL_ICON_BTN}
              >
                <Cog6ToothIcon className="h-4 w-4" />
              </button>
              {docSettingsOpen && (
                <div
                  ref={docSettingsRef}
                  role="dialog"
                  aria-label="Document theme and labels"
                  style={{ top: docSettingsPos.top, right: docSettingsPos.right }}
                  className="fixed z-[100] w-[300px] max-w-[94vw] overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-white shadow-[var(--shadow-lg)]"
                >
                  <div className="widget-header">
                    <span className="widget-header-label">DOCUMENT</span>
                    <span className="widget-header-right">
                      {activeDocTheme.toUpperCase()} · {labelCount} LABEL{labelCount === 1 ? "" : "S"}
                    </span>
                  </div>
                  <div className="space-y-4 p-4">
                    <div>
                      <p className="app-eyebrow">Theme</p>
                      {/* Gitwork first — it's the default. "Light/Dark" was misleading: both themes
                          are cream paper (only the COVER is navy), so this names the brand, not a
                          brightness. Live-updates the canvas via the draft/autosave path. */}
                      <div className="mt-2 inline-flex items-center gap-0.5 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] p-0.5">
                        {([["gitwork", "Gitwork"], ["foundry", "Foundry"]] as const).map(
                          ([theme, label]) => {
                            const themeActive = activeDocTheme === theme;
                            return (
                              <button
                                key={theme}
                                type="button"
                                onClick={() =>
                                  updateDraft({
                                    ...draft,
                                    metadata: { ...draft.metadata, docTheme: theme },
                                  })
                                }
                                aria-pressed={themeActive}
                                className={cn(
                                  "rounded-[4px] px-2.5 py-1 text-xs font-medium transition",
                                  themeActive
                                    ? "bg-[var(--brand-200)] text-[var(--brand-700)]"
                                    : "text-[var(--text-3)] hover:text-[var(--text-1)]",
                                )}
                              >
                                {label}
                              </button>
                            );
                          },
                        )}
                      </div>
                    </div>
                    <div className="border-t border-[var(--border-2)] pt-3">
                      <p className="app-eyebrow">Labels</p>
                      <LabelEditor
                        labels={draft.labels ?? []}
                        onChange={(labels) => updateDraft({ ...draft, labels })}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleTabChange(activeTab === "overview" ? "builder" : "overview")}
              aria-pressed={activeTab === "overview"}
              title={activeTab === "overview" ? "Back to the editor" : "Document details"}
              className={cn(
                TOOL_BTN,
                activeTab === "overview" &&
                  "border-[var(--brand-600)] bg-[var(--brand-200)] text-[var(--brand-700)]",
              )}
            >
              {activeTab === "overview" ? (
                <>
                  <ArrowLeftIcon className="h-4 w-4" />
                  Editor
                </>
              ) : (
                <>
                  <Squares2X2Icon className="h-4 w-4" />
                  Details
                </>
              )}
            </button>

            <button
              ref={approvalButtonRef}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={approvalOpen}
              onClick={() => {
                const rect = approvalButtonRef.current?.getBoundingClientRect();
                if (rect) {
                  setApprovalPos({
                    top: rect.bottom + 8,
                    right: window.innerWidth - rect.right,
                  });
                }
                setApprovalOpen((v) => !v);
              }}
              className={buttonStyles({
                variant: "primary",
                size: "sm",
                className: "h-8 shrink-0 gap-1.5 pr-1.5",
              })}
            >
              <CheckCircleIcon className="h-4 w-4" />
              Review &amp; Send
              {/* The status is already a mono readout in this card's header strip, so the chip is a
                  nicety — dropped below 2xl to keep the toolbar on ONE row at 1280. */}
              <span className="hidden rounded-[4px] border border-white/20 bg-white/12 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-white/95 2xl:inline-block">
                {statusLabel(draft.status)}
              </span>
              <ChevronDownIcon
                className={cn("h-4 w-4 opacity-80 transition", approvalOpen && "rotate-180")}
              />
            </button>

            {approvalOpen && (
              <div
                ref={approvalPanelRef}
                role="dialog"
                aria-label="Approve, share and export"
                style={{ top: approvalPos.top, right: approvalPos.right }}
                className="fixed z-[100] w-[360px] overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-white shadow-[var(--shadow-lg)]"
              >
                {/* Widget-header strip — the platform signature; live status on the right. */}
                <div className="widget-header">
                  <span className="widget-header-label">REVIEW &amp; SEND</span>
                  <span className="widget-header-right">{statusLabel(draft.status)}</span>
                </div>

                <div className="p-5">
                  {/* Internal review track — opt-in per doc. Lightweight docs (handover, report,
                      brief, blank) default off; proposals/contracts default on. The toggle stores
                      an explicit override on metadata.approvalTrackEnabled. */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
                        Internal review
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-3)]">
                        Require Product / Tech / MD sign-off before this doc is ready.
                      </p>
                    </div>
                    <label className="relative mt-0.5 inline-flex shrink-0 cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={approvalApplies}
                        onChange={(event) => handleApprovalTrackToggle(event.target.checked)}
                        className="peer sr-only"
                      />
                      <span className="h-5 w-9 rounded-full bg-[var(--text-4)]/40 transition-colors peer-checked:bg-[var(--brand-600)]" />
                      <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
                    </label>
                  </div>

                  {approvalApplies ? (
                    <div className="mt-3 divide-y divide-[var(--border-2)] border-t border-[var(--border-2)] pt-1">
                      {approvalOptions.map((option) => {
                        const checked = Boolean(draft.metadata[option.key]);
                        return (
                          <label
                            key={option.key}
                            className="flex cursor-pointer items-start gap-3 py-2.5 text-sm text-[var(--text-2)]"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => handleApprovalToggle(option.key, event.target.checked)}
                              className="app-checkbox mt-0.5 rounded"
                            />
                            <span>
                              <span className="block font-medium text-[var(--text-1)]">{option.label}</span>
                              <span className="block text-xs text-[var(--text-3)]">{option.description}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-3 border-t border-[var(--border-2)] pt-3 text-xs text-[var(--text-3)]">
                      No sign-off needed — share or send whenever you&apos;re ready.
                    </p>
                  )}

                  {/* Public link */}
                  <div className="mt-5 border-t border-[var(--border-2)] pt-4">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
                      Public link
                    </p>
                    {publicSharePath ? (
                      <>
                        <input readOnly value={publicShareUrl} className="app-input mt-2" />
                        <div className="mt-2 flex items-center gap-3 text-sm">
                          <Link
                            href={publicSharePath}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-[var(--brand-700)] hover:underline"
                          >
                            Open shared preview
                          </Link>
                          <span className="text-[var(--text-4)]">·</span>
                          <a
                            href={buildShareMailto(draft.title, publicShareUrl)}
                            className="inline-flex items-center gap-1 font-medium text-[var(--brand-700)] hover:underline"
                          >
                            <EnvelopeIcon className="h-3.5 w-3.5" />
                            Email link
                          </a>
                        </div>
                      </>
                    ) : (
                      <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
                        No public link yet — <span className="font-medium text-[var(--text-1)]">Share</span> below to mint a
                        tokenised URL. Revocable any time.
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-5 flex items-center gap-2 border-t border-[var(--border-2)] pt-4">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="flex-1 justify-center"
                      onClick={handleShareLink}
                      leadingIcon={<ClipboardDocumentIcon className="h-4 w-4" />}
                    >
                      {copied ? "Copied" : "Share"}
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      className="flex-1 justify-center"
                      onClick={handleExportPdf}
                      leadingIcon={<ArrowDownTrayIcon className="h-4 w-4" />}
                    >
                      Export
                    </Button>
                  </div>

                  <div className="mt-3 border-t border-[var(--border-2)] pt-3">
                    <button
                      type="button"
                      onClick={handleSaveAsTemplate}
                      className="text-sm font-medium text-[var(--brand-700)] hover:underline"
                    >
                      Save current structure as a template…
                    </button>
                    {templateSavedAt ? (
                      <p className="mt-1 text-xs text-[var(--success-500)]">
                        Saved as &ldquo;{templateSavedAt}&rdquo;
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
        </div>
      </section>

      {activeTab === "overview" ? (
        <div className="space-y-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <OverviewCanvas proposal={draft} sections={sectionEntries.map((entry) => entry.section)} />
          <RightRailTabs
            defaultTabId="collab"
            tabs={[
              { id: "collab",     label: "Collaboration", panel: <CollabPanel documentId={proposalId} currentVersion={draft.version || "v1.0"} /> },
              { id: "signature",  label: "Signatures",    panel: <SignaturePanel documentId={proposalId} /> },
              { id: "insights",   label: "Insights",      panel: <DocumentAnalyticsPanel documentId={proposalId} /> },
              { id: "activity",   label: "Activity",      panel: <ActivityFeed documentId={proposalId} /> },
              { id: "linked",     label: "Linked",        panel: <DocumentRelationsPanel documentId={proposalId} clientName={draft.clientName ?? null} /> },
              { id: "proof",      label: "Proof drafts",  panel: <ProposalProofPanel proposalId={proposalId} /> },
            ]}
          />
        </div>
      ) : (
        // Three panes (Deck's editor shape): [outline · navigation] [canvas] [properties].
        // The column template is written out as four literal class strings rather than composed at
        // runtime — Tailwind v4's scanner only sees static class text, so a template-literal
        // `lg:grid-cols-[${n}px_…]` would never be emitted.
        <section
          className={cn(
            "grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-rows-1",
            // Rails step up at 2xl. Three panes on a 1280 laptop leaves the canvas tight, so the
            // narrow band uses the documented 212px collections-rail width + a 320px props rail
            // (the low end of the 320–360 target, still wide enough for `@[26rem]` to engage).
            outlineOpen && optionsEntry
              ? "lg:grid-cols-[212px_minmax(0,1fr)_320px] 2xl:grid-cols-[260px_minmax(0,1fr)_352px]"
              : outlineOpen
                ? "lg:grid-cols-[240px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)]"
                : optionsEntry
                  ? "lg:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_352px]"
                  : "lg:grid-cols-1",
          )}
        >
          {/* 02 // OUTLINE — NAVIGATION ONLY. Drag-reorder, visibility, insert-at, delete, and
              click-to-scroll. A block's Options no longer drill in here; they open on the right, so
              you never lose your place in the document while editing. On mobile it stacks above the
              canvas with a capped scrollable height so it can't bury the document. */}
          {outlineOpen ? (
            <div className="max-h-[45vh] overflow-y-auto pr-1 lg:max-h-none lg:h-full lg:min-h-0 lg:overflow-visible lg:pr-0">
              <TableOfContentsCard
                sections={sectionEntries}
                activeId={viewingSectionId ?? activeEntry?.id ?? null}
                editable
                onSelect={handleOutlineSelect}
                onEditOptions={openOptions}
                onInsertAt={(index) => setPaletteInsertAt(index)}
                onDeleteSection={handleDeleteSection}
                onReorder={updateSectionOrder}
                onToggleVisibility={handleToggleVisibility}
              />
            </div>
          ) : null}

          {/* 03 // CANVAS — the live document; ALL text edited inline. Clicking a block selects it
              and opens its Options in the right rail. */}
          <div className="min-w-0 lg:flex lg:min-h-0 lg:flex-col">
            <div className="overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-canvas)] lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border-2)] bg-white px-3 py-2 lg:shrink-0">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-[var(--text-4)]">
                  03 // CANVAS
                </span>
                <span className="truncate text-[11px] text-[var(--text-4)]">
                  {optionsEntry
                    ? "What the client sees"
                    : "Click any block to edit it →"}
                </span>
              </div>
              {/* The canvas scrolls INSIDE this pane. On desktop the editor is a fixed-height
                  frame (root is lg:h-full), so this pane is lg:flex-1 lg:min-h-0 and the document
                  scrolls here — the page itself never scrolls past the viewport. On mobile it
                  flows normally. NEVER give this an unbounded height on desktop. */}
              <div className="overflow-auto p-4 sm:p-6 lg:min-h-0 lg:flex-1 [scrollbar-gutter:stable]">
                <ProposalPreview
                  proposal={draft}
                  showTableOfContents={false}
                  frame={false}
                  editable
                  onSelectSection={openOptions}
                  onSectionChange={handleSectionDataChange}
                  onSectionMetaChange={handleSectionMetaChange}
                  pageMode="paged"
                />
              </div>
            </div>
          </div>

          {/* PROPERTIES rail — the selected block's Options, in numbered groups like Deck's props
              rail. 340px (was a 280px shared rail), which is what finally lets the editors' own
              `@[26rem]:grid-cols-2` container queries engage. */}
          {optionsEntry ? (
            <div className="max-h-[60vh] overflow-y-auto pr-1 lg:max-h-none lg:h-full lg:min-h-0 lg:overflow-visible lg:pr-0">
              <aside className="widget-card proposal-form-theme overflow-hidden lg:flex lg:h-full lg:flex-col">
                <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto [scrollbar-gutter:stable]">
                  <RailGroup
                    index="01"
                    name="BLOCK"
                    right={
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="widget-header-right truncate">
                          {optionsEntry.section.title}
                        </span>
                        <button
                          type="button"
                          onClick={() => setOptionsForId(null)}
                          aria-label="Close block options"
                          title="Close block options"
                          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-[var(--text-4)] transition hover:bg-white hover:text-[var(--text-1)]"
                        >
                          <XMarkIcon className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    }
                  >
                    <ProposalBuilderPanel
                      embedded
                      withSpeakerNotes={false}
                      proposal={draft}
                      sections={sectionEntries}
                      activeId={optionsEntry.id}
                      onProposalChange={(next) => updateDraft(next, { coalesce: true })}
                    />
                  </RailGroup>

                  {optionsSectionIndex >= 0 ? (
                    <RailGroup index="02" name="SPEAKER NOTES" defaultOpen={false}>
                      <SpeakerNotesField
                        proposal={draft}
                        sectionIndex={optionsSectionIndex}
                        onProposalChange={(next) => updateDraft(next, { coalesce: true })}
                      />
                    </RailGroup>
                  ) : null}
                </div>
              </aside>
            </div>
          ) : null}
        </section>
      )}

      {presenting ? (
        <PresentationMode proposal={draft} onClose={() => setPresenting(false)} />
      ) : null}

      <AiDraftModal
        open={aiDraftOpen}
        onClose={() => setAiDraftOpen(false)}
        documentId={proposalId}
        onApply={(proposal) => {
          // AI mutates the document server-side; update local draft so the editor reflects
          // the new section data without a refetch dance.
          setLocalDraft(proposal);
          baselineRef.current = JSON.stringify(proposal);
        }}
      />

      <AiChatPanel
        open={aiChatOpen}
        onClose={() => setAiChatOpen(false)}
        documentId={proposalId}
        onAfterApply={(proposal) => {
          setLocalDraft(proposal);
          baselineRef.current = JSON.stringify(proposal);
        }}
      />

      <PullSupportDataModal
        open={pullDataOpen}
        onClose={() => setPullDataOpen(false)}
        documentId={proposalId}
        defaultClientName={draft.clientName}
        onApplied={(proposal) => {
          setLocalDraft(proposal);
          baselineRef.current = JSON.stringify(proposal);
        }}
      />

      <BlockPalette
        open={paletteInsertAt !== null}
        onClose={() => setPaletteInsertAt(null)}
        onPick={(key) => {
          if (paletteInsertAt !== null) {
            handleAddSection(key, paletteInsertAt);
          }
        }}
        snippets={(snippetsQuery.data ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          sectionKey: s.sectionKey,
        }))}
        onPickSnippet={(id) => {
          if (paletteInsertAt !== null) {
            handleAddSnippet(id, paletteInsertAt);
          }
        }}
        onDeleteSnippet={(id) => deleteSnippet.mutate(id)}
        documentType={draft.documentType}
        insertContextLabel={
          paletteInsertAt !== null && paletteInsertAt < sectionEntries.length
            ? `Inserting before block ${paletteInsertAt + 1}: ${sectionEntries[paletteInsertAt]?.section.title}`
            : paletteInsertAt === sectionEntries.length
              ? "Inserting at the end"
              : undefined
        }
      />
    </div>
  );
}

/**
 * One collapsible group in the right properties rail — Deck's props-rail grammar: a full-bleed
 * 36px `NN // GROUP` strip (number in the brand accent, exactly like Deck's CSS counter) over the
 * group's fields. The strip is sticky so the group you're editing stays labelled while you scroll.
 */
function RailGroup({
  index,
  name,
  right,
  defaultOpen = true,
  children,
}: {
  index: string;
  name: string;
  right?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-[var(--border-3)] first:border-t-0">
      <div className="widget-header sticky top-0 z-[1]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-1.5 text-left"
        >
          <ChevronRightIcon
            className={cn(
              "h-3 w-3 shrink-0 text-[var(--text-4)] transition-transform",
              open && "rotate-90",
            )}
          />
          <span className="widget-header-label">
            <span className="text-[var(--brand-700)]">{index}</span>
            {" // "}
            {name}
          </span>
        </button>
        {right}
      </div>
      {open ? <div className="p-4">{children}</div> : null}
    </div>
  );
}

function TableOfContentsCard({
  sections,
  activeId,
  editable,
  onSelect,
  onEditOptions,
  onInsertAt,
  onDeleteSection,
  onReorder,
  onToggleVisibility,
}: {
  sections: Array<{ id: string; section: ProposalSection; order: number }>;
  activeId: string | null;
  editable?: boolean;
  onSelect: (id: string) => void;
  /** Open a block's options/settings (drill-in) — shown as a ✎ on blocks that have settings. */
  onEditOptions?: (id: string) => void;
  /** Open the block palette to insert at the given index (0 = top, sections.length = end). */
  onInsertAt?: (index: number) => void;
  onDeleteSection?: (id: string) => void;
  onReorder?: (activeId: string, overId: string) => void;
  onToggleVisibility?: (id: string, nextVisible: boolean) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    if (!editable || !event.over || !onReorder) return;
    onReorder(String(event.active.id), String(event.over.id));
  }

  return (
    <aside className="widget-card overflow-hidden lg:flex lg:h-full lg:flex-col">
      <div className="widget-header lg:shrink-0">
        <span className="widget-header-label">02 {"// "}OUTLINE</span>
        <span className="widget-header-right">
          {sections.length} BLOCK{sections.length === 1 ? "" : "S"}
        </span>
      </div>
      <div className="p-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto [scrollbar-gutter:stable]">
        {sections.length ? (
          editable ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={sections.map((entry) => entry.id)} strategy={verticalListSortingStrategy}>
                <ol className="space-y-0">
                  {sections.map((entry, index) => (
                    <SortableTableOfContentsItem
                      key={entry.id}
                      entry={entry}
                      isActive={entry.id === activeId}
                      onSelect={onSelect}
                      onEditOptions={onEditOptions}
                      onDelete={onDeleteSection}
                      onToggleVisibility={onToggleVisibility}
                      onInsertAt={onInsertAt}
                      insertIndex={index}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
          ) : (
            <ol className="space-y-1">
              {sections.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(entry.id)}
                    className={cn(
                      "w-full rounded-[10px] px-3 py-2.5 text-left text-sm tracking-[-0.01em] transition",
                      entry.id === activeId
                        ? "bg-[var(--surface-1)] font-medium text-[var(--text-1)]"
                        : "text-[var(--text-2)] hover:bg-[var(--surface-1)]",
                    )}
                  >
                    {entry.order}. {entry.section.title}
                  </button>
                </li>
              ))}
            </ol>
          )
        ) : (
          <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-6 text-center text-sm text-[var(--text-4)]">
            No blocks yet. Use the button below to add your first.
          </p>
        )}

        {editable ? (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => onInsertAt?.(sections.length)}
              className="flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-[var(--border-2)] px-3 py-2.5 text-sm font-medium text-[var(--text-3)] transition hover:border-[var(--brand-300)] hover:bg-[var(--brand-200)]/30 hover:text-[var(--brand-700)]"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add block
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function SortableTableOfContentsItem({
  entry,
  isActive,
  insertIndex,
  onSelect,
  onEditOptions,
  onDelete,
  onInsertAt,
  onToggleVisibility,
}: {
  entry: { id: string; section: ProposalSection; order: number };
  isActive: boolean;
  /** This row's index in the section list. Used by the hover-"+" to know where to insert. */
  insertIndex: number;
  onSelect: (id: string) => void;
  onEditOptions?: (id: string) => void;
  onDelete?: (id: string) => void;
  onInsertAt?: (index: number) => void;
  onToggleVisibility?: (id: string, nextVisible: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });
  const sectionType = SECTION_REGISTRY[entry.section.key];
  // Fall back to a neutral icon for unregistered keys (e.g. Pulse's injected "audit_results")
  // so every outline row stays visually aligned.
  const Icon = sectionType?.icon ?? DocumentTextIcon;
  const isVisible = entry.section.isVisible !== false;

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn("relative", isDragging ? "z-10" : "")}
    >
      {/* Hover-reveal "+ insert above" — sits above each row, becomes a thin clickable region */}
      {onInsertAt ? (
        <button
          type="button"
          onClick={() => onInsertAt(insertIndex)}
          className="group/insert absolute -top-2 left-0 right-0 z-10 flex h-3 cursor-pointer items-center justify-center"
          aria-label={`Insert block before ${entry.section.title}`}
        >
          <span className="h-px w-full bg-transparent transition group-hover/insert:bg-[var(--brand-300)]" />
          <span className="absolute flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border-2)] bg-white text-[var(--text-3)] opacity-0 transition group-hover/insert:opacity-100">
            <PlusIcon className="h-3 w-3" />
          </span>
        </button>
      ) : null}

      <div
        className={cn(
          "group relative flex items-center gap-1.5 rounded-[10px] border px-1.5 py-2.5 transition xl:py-1.5",
          isActive
            ? "border-[var(--border-2)] bg-[var(--surface-1)]"
            : "border-transparent hover:bg-[var(--surface-1)]",
          isDragging ? "border-[var(--border-2)] bg-white shadow-[var(--shadow-lg)]" : "",
          !isVisible ? "opacity-50" : "",
        )}
      >
        <button
          type="button"
          aria-label={`Reorder ${entry.section.title}`}
          className="flex h-7 w-5 cursor-grab items-center justify-center text-[var(--text-4)] transition hover:text-[var(--text-2)] active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GrabberHandle />
        </button>

        {Icon ? (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[var(--text-3)]">
            <Icon className="h-3.5 w-3.5" />
          </span>
        ) : null}

        <button
          type="button"
          onClick={() => onSelect(entry.id)}
          // The rail is narrow, so long block titles ellipse — carry the full title so it stays
          // readable on hover (and so the clipping audit's TRUNCATED rule is satisfied).
          title={entry.section.title}
          className={cn(
            "min-w-0 flex-1 overflow-hidden text-left text-sm tracking-[-0.01em]",
            isActive ? "font-medium text-[var(--text-1)]" : "text-[var(--text-2)]",
          )}
        >
          {/* `title` repeated on the ellipsing element itself: audit-clipping's TRUNCATED rule reads
              the element's own title/aria-label, not an ancestor's. */}
          <span title={entry.section.title} className="block truncate whitespace-nowrap">
            {entry.section.title}
          </span>
        </button>

        {/* Row actions. From xl up they leave the flow entirely (absolute, hover-revealed over the
            row's own hover fill) — in flow they cost ~84px, which on the navigation rail left the
            block title clipped to a single letter. Pointer events follow the reveal so the invisible
            buttons can't be clicked through the label. */}
        <div className="flex items-center gap-0.5 transition xl:pointer-events-none xl:absolute xl:right-1 xl:top-1/2 xl:-translate-y-1/2 xl:rounded-[6px] xl:bg-[var(--surface-1)] xl:opacity-0 xl:group-hover:pointer-events-auto xl:group-hover:opacity-100">
          {onEditOptions ? (
            <button
              type="button"
              aria-label={`${entry.section.title} options and notes`}
              onClick={(event) => {
                event.stopPropagation();
                onEditOptions(entry.id);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-3)] transition hover:bg-white hover:text-[var(--brand-700)]"
              title="Options & speaker notes"
            >
              <PencilSquareIcon className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {onToggleVisibility ? (
            <button
              type="button"
              aria-label={isVisible ? `Hide ${entry.section.title}` : `Show ${entry.section.title}`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleVisibility(entry.id, !isVisible);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-3)] transition hover:bg-white hover:text-[var(--text-1)]"
              title={isVisible ? "Hide from preview + print" : "Show in preview + print"}
            >
              {isVisible ? (
                <EyeIcon className="h-3.5 w-3.5" />
              ) : (
                <EyeSlashIcon className="h-3.5 w-3.5" />
              )}
            </button>
          ) : null}
          <button
            type="button"
            aria-label={`Delete ${entry.section.title}`}
            onClick={(event) => {
              event.stopPropagation();
              onDelete?.(entry.id);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-3)] transition hover:bg-white hover:text-rose-600"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}

function GrabberHandle() {
  return (
    <span className="grid grid-cols-2 gap-[3px]">
      {Array.from({ length: 6 }).map((_, index) => (
        <span key={index} className="h-1 w-1 rounded-full bg-current opacity-55" />
      ))}
    </span>
  );
}

// The overview is no longer proposal-only — Docs builds SOWs, agreements, reports, briefs, etc.
// This noun genericises the commercial/scope figure labels so an SLA reads "AGREEMENT VALUE" and a
// report reads "REPORT COVERAGE" rather than always saying "PROPOSAL".
const DOC_TYPE_NOUN: Record<DocumentType, string> = {
  PROPOSAL: "PROPOSAL",
  SLA: "AGREEMENT",
  SOW: "STATEMENT",
  MSA: "AGREEMENT",
  NDA: "AGREEMENT",
  CO: "CHANGE ORDER",
  DSA: "AGREEMENT",
  HANDOVER: "HANDOVER",
  REPORT: "REPORT",
  BRIEF: "BRIEF",
  DECK: "DECK",
  OTHER: "DOCUMENT",
};

type OverviewCardDef = {
  name: string;
  rightSlot: string;
  figure: string;
  figureLabel: string;
  figureLong?: boolean;
  rows: Array<{ label: string; value: ReactNode }>;
};

// Friendly plural labels for the document's building blocks. Drives the generic CONTENT card so
// any doc type — including structured contracts like the SLA (service tiers, response targets,
// escalation, credits) that carry no costing/timeline/scope — gets a summary that reflects its
// actual template instead of collapsing to a lone stakeholders card. Grouped, so prose + intro
// read as one "Written sections" line and both table types read as "Tables".
const SECTION_BLOCK_LABEL: Partial<Record<SectionKey, string>> = {
  introduction: "Written sections",
  prose: "Written sections",
  product_overview: "Written sections",
  callout: "Callouts",
  checklist: "Checklists",
  breakdown: "Breakdowns",
  data_table: "Tables",
  comparison_table: "Tables",
  faq: "FAQs",
  kpi_strip: "KPI strips",
  parties: "Parties",
  service_tiers: "Service tiers",
  response_times: "Response targets",
  escalation: "Escalation paths",
  exclusions: "Exclusions",
  penalties: "Credits / penalties",
  pricing_tiers: "Pricing tiers",
  term: "Terms",
  signatures: "Signature blocks",
  objectives: "Objectives",
  touchpoints: "Scope items",
  image: "Images",
  video_embed: "Videos",
  supporting_links_assets: "Links & assets",
  code_snippet: "Code snippets",
  heading: "Headings",
};

// Count the items within a section (tiers, priorities, rows, parties…), falling back to 1 for a
// plain prose/heading block. Lets the CONTENT card surface "Response targets 4" rather than "1".
function sectionBlockItemCount(section: ProposalSection): number {
  const data = section.data as unknown as Record<string, unknown> | undefined;
  if (!data) return 1;
  for (const key of ["items", "tiers", "priorities", "levels", "rows", "parties", "blocks", "faqs", "questions"]) {
    const value = data[key];
    if (Array.isArray(value)) return value.filter(Boolean).length || 1;
  }
  return 1;
}

function OverviewCanvas({
  proposal,
  sections,
}: {
  proposal: ProposalDocument;
  sections: ProposalSection[];
}) {
  const cover = sections.find((section) => section.key === "cover")?.data as
    | {
        clientName?: string;
        productName?: string;
      }
    | undefined;

  const introduction = sections.find((section) => section.key === "introduction")?.data as
    | {
        statement?: string;
        summary?: string;
      }
    | undefined;

  const productOverview = sections.find((section) => section.key === "product_overview")?.data as
    | {
        platformDescription?: string;
        audience?: string;
        valueProposition?: string;
      }
    | undefined;

  const objectives = sections.find((section) => section.key === "objectives")?.data as
    | {
        items?: Array<{ title?: string }>;
      }
    | undefined;

  const touchpoints = sections.find((section) => section.key === "touchpoints")?.data as
    | {
        items?: Array<{ title?: string; features?: string[] }>;
      }
    | undefined;

  const costing = sections.find((section) => section.key === "costing")?.data as
    | {
        currency?: "GBP" | "USD" | "EUR";
        discount?: number;
        taxRate?: number;
        teamAllocations?: Array<{ included?: boolean }>;
        paymentSchedule?: Array<unknown>;
      }
    | undefined;

  const timeline = sections.find((section) => section.key === "timeline")?.data as
    | {
        viewMode?: string;
      }
    | undefined;

  const assumptions = sections.find((section) => section.key === "assumptions")?.data as
    | {
        items?: string[];
      }
    | undefined;

  const outOfScope = sections.find((section) => section.key === "out_of_scope")?.data as
    | {
        items?: string[];
      }
    | undefined;

  const signoff = sections.find((section) => section.key === "signoff_footer")?.data as
    | {
        preparedBy?: string;
        team?: string;
        contactDetails?: string;
      }
    | undefined;

  const currency = costing?.currency ?? "GBP";
  const subtotal = proposal.costLineItems.reduce((sum, item) => {
    const lineSubtotal = Number.isFinite(item.subtotal) ? item.subtotal : item.quantity * item.unitCost;
    return sum + lineSubtotal;
  }, 0);
  const oneOffTotal = proposal.costLineItems
    .filter((item) => item.costKind === "ONE_OFF")
    .reduce((sum, item) => sum + item.subtotal, 0);
  const recurringTotal = proposal.costLineItems
    .filter((item) => item.costKind === "RECURRING")
    .reduce((sum, item) => sum + item.subtotal, 0);
  const discount = costing?.discount ?? 0;
  const taxRate = costing?.taxRate ?? 0;
  const discountAmount = subtotal * (discount / 100);
  const netTotal = Math.max(subtotal - discountAmount, 0);
  const taxAmount = netTotal * (taxRate / 100);
  const grandTotal = netTotal + taxAmount;
  const billableTeamCount = proposal.costLineItems.filter(
    (item) => item.category.trim().length > 0 && item.unitCost > 0,
  ).length;
  const paymentMilestoneCount = costing?.paymentSchedule?.length ?? 0;

  const phasesCount = proposal.timelinePhases.length;
  const deliverablesCount = proposal.timelinePhases.reduce(
    (sum, phase) => sum + phase.deliverables.filter(Boolean).length,
    0,
  );
  const workstreamCount = new Set(
    proposal.costLineItems.map((item) => item.category).filter((category) => category.trim().length > 0),
  ).size;

  const objectiveCount = objectives?.items?.length ?? 0;
  const touchpointCount = touchpoints?.items?.length ?? 0;
  const featureCount =
    touchpoints?.items?.reduce((sum, item) => sum + (item.features?.filter(Boolean).length ?? 0), 0) ?? 0;
  const visibleSectionsCount = sections.filter((section) => section.isVisible).length;
  const assumptionCount = assumptions?.items?.length ?? 0;
  const outOfScopeCount = outOfScope?.items?.length ?? 0;

  const assetsCount = proposal.assets.filter((asset) => asset.url.trim().length > 0).length;
  const linksCount = proposal.links.filter((link) => link.url.trim().length > 0).length;
  const ctaCount = proposal.ctas.filter((cta) => cta.label.trim().length > 0).length;
  const primaryCta = proposal.ctas.find((cta) => cta.role === "PRIMARY");

  // Generic narrative blocks — the building blocks lightweight docs (reports, briefs, handovers)
  // lean on instead of costing/timeline/scope. Counted so their overview isn't a wall of zeroes.
  const calloutSections = sections.filter((section) => section.key === "callout");
  const checklistSections = sections.filter((section) => section.key === "checklist");
  const proseSections = sections.filter(
    (section) => section.key === "prose" || section.key === "introduction",
  );
  // Only a callout near the top reads as a period-status signal — report templates lead with a
  // "this period at a glance" callout. A closing sign-off callout (e.g. the Care report's
  // "Looking ahead") sits at the end and must NOT be promoted to the STATUS hero figure.
  const firstCalloutIndex = sections.findIndex((section) => section.key === "callout");
  const headlineCallout =
    firstCalloutIndex >= 0 && firstCalloutIndex <= 2
      ? (sections[firstCalloutIndex].data as { headline?: string; tone?: string } | undefined)
      : undefined;
  const checklistItemCount = checklistSections.reduce((sum, section) => {
    const items = (section.data as { items?: unknown[] } | undefined)?.items ?? [];
    return sum + items.filter(Boolean).length;
  }, 0);

  const noun = DOC_TYPE_NOUN[proposal.documentType] ?? "DOCUMENT";
  const hasCommercials = proposal.costLineItems.length > 0;
  const hasDelivery = phasesCount > 0;
  const hasScope = objectiveCount > 0 || touchpointCount > 0 || assumptionCount > 0 || outOfScopeCount > 0;

  // Generic content summary — every visible block that isn't the cover or sign-off footer, grouped
  // by friendly label and summed by item count. This is what lets non-costed types (contracts,
  // reports, briefs) reflect their real structure. Top groups become the CONTENT card's rows.
  const contentSections = sections.filter(
    (section) => section.isVisible && section.key !== "cover" && section.key !== "signoff_footer",
  );
  const blockGroups = new Map<string, number>();
  for (const section of contentSections) {
    const label = SECTION_BLOCK_LABEL[section.key];
    if (!label) continue;
    blockGroups.set(label, (blockGroups.get(label) ?? 0) + sectionBlockItemCount(section));
  }
  const contentRows = [...blockGroups.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, value]) => ({ label, value }));
  const hasContent = contentSections.length > 0;

  const clientName = proposal.clientName || proposal.metadata.client || cover?.clientName || "";
  const owner = proposal.metadata.owner || "";
  // Mirror the cover's author-line resolution exactly so the overview can't disagree with the
  // document. The cover renders "Prepared by" from metadata.owner (what the cover editor's
  // "Prepared by" field writes), falling back to the sign-off footer's prepared-by / team.
  const preparedByLine =
    owner.trim() || [signoff?.preparedBy, signoff?.team].filter(Boolean).join(" / ");
  const expiryDate = proposal.expiresAt ?? proposal.metadata.expiryDate ?? null;
  const isEmptyProposal =
    !clientName &&
    !proposal.productName &&
    !proposal.summary &&
    !proposal.version &&
    !introduction?.statement &&
    !introduction?.summary &&
    !productOverview?.platformDescription &&
    !productOverview?.audience &&
    !productOverview?.valueProposition &&
    !proposal.costLineItems.length &&
    !proposal.timelinePhases.length &&
    !objectiveCount &&
    !touchpointCount &&
    !linksCount &&
    !assetsCount &&
    !ctaCount &&
    !hasContent;

  if (isEmptyProposal) {
    return (
      <section className="widget-card overflow-hidden">
        <div className="widget-header">
          <span className="widget-header-label">02 // OVERVIEW</span>
          <span className="widget-header-right">EMPTY</span>
        </div>
        <div className="widget-body">
          <h4 className="font-[family-name:var(--font-display)] text-[28px] font-normal leading-[1.15] tracking-[-0.5px] text-[var(--text-1)]">
            Nothing to summarise yet
          </h4>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--text-3)]">
            New documents start blank. Use Builder to add content. The overview will stay empty until there is something real to summarise.
          </p>
        </div>
      </section>
    );
  }

  const titleCase = (value: string) =>
    value.toLowerCase().replace(/^\w/, (char) => char.toUpperCase());

  // Build the card set from what the document actually carries, rather than assuming a proposal's
  // shape. Costed docs lead with commercials/delivery/scope; lightweight docs (reports, briefs)
  // lead with their status + narrative content. Every doc closes on stakeholders.
  const cards: OverviewCardDef[] = [];

  if (hasCommercials) {
    cards.push({
      name: "COMMERCIAL",
      rightSlot: "VALUE",
      figure: formatCurrency(grandTotal, currency),
      figureLabel: `CURRENT ${noun} VALUE`,
      rows: [
        { label: "Billable people", value: billableTeamCount },
        { label: "One-off", value: formatCurrency(oneOffTotal, currency) },
        { label: "Recurring", value: formatCurrency(recurringTotal, currency) },
        { label: `Discount (${discount}%)`, value: formatCurrency(discountAmount, currency) },
        { label: `VAT (${taxRate}%)`, value: formatCurrency(taxAmount, currency) },
      ],
    });
  }

  if (hasDelivery) {
    cards.push({
      name: "DELIVERY",
      rightSlot: "SHAPE",
      figure: String(phasesCount),
      figureLabel: "PHASES · IMPLEMENTATION SHAPE",
      rows: [
        { label: "Deliverables", value: deliverablesCount },
        { label: "Workstreams", value: workstreamCount },
        { label: "Milestones", value: paymentMilestoneCount },
        { label: "Timeline mode", value: titleCase(timeline?.viewMode ?? "LIST") },
        { label: "Last updated", value: formatDate(proposal.updatedAt) },
      ],
    });
  }

  if (hasScope) {
    cards.push({
      name: "SCOPE",
      rightSlot: "COVERAGE",
      figure: String(touchpointCount || objectiveCount),
      figureLabel: `${touchpointCount ? "TOUCHPOINTS" : "OBJECTIVES"} · ${noun} COVERAGE`,
      rows: [
        { label: "Objectives", value: objectiveCount },
        { label: "Features", value: featureCount },
        { label: "Visible modules", value: visibleSectionsCount },
        { label: "Assumptions", value: assumptionCount },
        { label: "Out of scope", value: outOfScopeCount },
      ],
    });
  }

  // Status + content cards for non-costed docs (contracts, reports, briefs, handovers). A headline
  // callout (reports/handovers) leads with a STATUS signal; the CONTENT card summarises the real
  // building blocks and only appears when SCOPE hasn't already covered the doc's structure.
  if (!hasCommercials) {
    if (proposal.documentType === "REPORT" && headlineCallout?.headline) {
      cards.push({
        name: "STATUS",
        rightSlot: "SIGNAL",
        figure: headlineCallout.headline,
        figureLabel: `${noun} · THIS PERIOD`,
        figureLong: true,
        rows: [
          { label: "Highlights", value: calloutSections.length },
          { label: "Checklist items", value: checklistItemCount },
          { label: "Written updates", value: proseSections.length },
          { label: "Last updated", value: formatDate(proposal.updatedAt) },
        ],
      });
    }

    if (!hasScope && contentRows.length > 0) {
      cards.push({
        name: "CONTENT",
        rightSlot: "STRUCTURE",
        figure: String(contentSections.length),
        figureLabel: `SECTIONS · ${noun} STRUCTURE`,
        rows: contentRows,
      });
    }
  }

  cards.push({
    name: "STAKEHOLDERS",
    rightSlot: "OWNERSHIP",
    figure: clientName || "—",
    figureLabel: "CLIENT · OWNERSHIP",
    figureLong: true,
    rows: [
      { label: "Prepared by", value: preparedByLine || "Not set" },
      { label: "Primary CTA", value: primaryCta?.label || "Not set" },
      { label: "Status", value: <StatusBadge status={proposal.status} /> },
      { label: "Expiry", value: formatDate(expiryDate) },
    ],
  });

  return (
    <section className="grid gap-3 xl:grid-cols-2">
      {cards.map((card, index) => (
        <OverviewWidget
          key={card.name}
          number={String(index + 2).padStart(2, "0")}
          name={card.name}
          rightSlot={card.rightSlot}
          figure={card.figure}
          figureLabel={card.figureLabel}
          figureLong={card.figureLong}
        >
          {card.rows.map((row) => (
            <OverviewStatRow key={row.label} label={row.label} value={row.value} />
          ))}
        </OverviewWidget>
      ))}
    </section>
  );
}

function OverviewWidget({
  number,
  name,
  rightSlot,
  figure,
  figureLabel,
  figureLong,
  children,
}: {
  number: string;
  name: string;
  rightSlot?: string;
  figure: string;
  figureLabel: string;
  figureLong?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="widget-card overflow-hidden">
      <div className="widget-header">
        <span className="widget-header-label">{number} {"// "}{name}</span>
        {rightSlot ? <span className="widget-header-right">{rightSlot}</span> : null}
      </div>
      <div className="widget-body">
        <p
          className={cn(
            "font-[family-name:var(--font-display)] font-normal leading-[1.05] tracking-[-1px] text-[var(--text-1)]",
            figureLong ? "text-[28px]" : "text-[44px]",
          )}
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          title={figure}
        >
          {figure}
        </p>
        <p className="widget-data-label mt-2">{figureLabel}</p>
        <div className="mt-4 space-y-2 border-t border-[var(--border-3)] pt-4">{children}</div>
      </div>
    </section>
  );
}

function OverviewStatRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-[var(--text-3)]">{label}</span>
      <span className="text-right font-medium text-[var(--text-1)]">{value}</span>
    </div>
  );
}

function serializeDraft(draft: ProposalDocument) {
  return {
    title: draft.title,
    status: draft.status,
    productName: draft.productName ?? undefined,
    clientName: draft.clientName ?? undefined,
    summary: draft.summary ?? undefined,
    version: draft.version,
    expiresAt: draft.expiresAt ?? null,
    metadata: draft.metadata,
    sections: draft.sections.map((section, index) => ({
      ...section,
      sortOrder: index,
    })),
    costLineItems: draft.costLineItems.map((item, index) => ({
      ...item,
      sortOrder: index,
    })),
    timelinePhases: draft.timelinePhases.map((phase, index) => ({
      ...phase,
      sortOrder: index,
    })),
    links: draft.links.map((link, index) => ({
      ...link,
      sortOrder: index,
    })),
    ctas: draft.ctas.map((cta, index) => ({
      ...cta,
      sortOrder: index,
    })),
    assets: draft.assets.map((asset, index) => ({
      ...asset,
      sortOrder: index,
    })),
  };
}

/**
 * Compact label editor — chips for each existing label + an inline input that adds a new label
 * on Enter. Lives in the editor header so the operator can tag a document without leaving the
 * canvas. Labels are persisted via the same draft → autosave pipeline as everything else.
 */
function LabelEditor({
  labels,
  onChange,
}: {
  labels: string[];
  onChange: (next: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function commit() {
    const value = draft.trim();
    if (!value) {
      setAdding(false);
      setDraft("");
      return;
    }
    if (labels.includes(value)) {
      setDraft("");
      return;
    }
    onChange([...labels, value]);
    setDraft("");
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {labels.map((label) => (
        <span
          key={label}
          className="inline-flex items-center gap-1 rounded-[4px] bg-[var(--brand-200)] px-2 py-0.5 text-[11px] font-medium text-[var(--brand-700)]"
        >
          {label}
          <button
            type="button"
            onClick={() => onChange(labels.filter((entry) => entry !== label))}
            className="text-[var(--brand-700)] hover:text-[var(--brand-800)]"
            aria-label={`Remove ${label} label`}
          >
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setAdding(false);
              setDraft("");
            }
          }}
          maxLength={40}
          placeholder="New label"
          className="h-6 w-32 rounded-[4px] border border-[var(--border-2)] bg-white px-2 text-[11px] focus:border-[var(--brand-500)] focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center rounded-[4px] border border-dashed border-[var(--border-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-4)] hover:border-[var(--brand-500)] hover:text-[var(--brand-700)]"
        >
          + label
        </button>
      )}
    </div>
  );
}
