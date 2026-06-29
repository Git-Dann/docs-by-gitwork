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
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
  DocumentTextIcon,
  EyeIcon,
  EyeSlashIcon,
  HomeIcon,
  LinkIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityFeed } from "@/components/proposals/activity-feed";
import { DocumentAnalyticsPanel } from "@/components/proposals/document-analytics-panel";
import { ProposalPreview } from "@/components/proposals/proposal-preview";
import { AiChatPanel } from "@/components/proposals/ai-chat-panel";
import { AiDraftModal } from "@/components/proposals/ai-draft-modal";
import { BlockPalette } from "@/components/proposals/block-palette";
import { CollabPanel } from "@/components/proposals/collab-panel";
import { DocumentRelationsPanel } from "@/components/proposals/document-relations-panel";
import { RightRailTabs } from "@/components/proposals/right-rail-tabs";
import { useDocumentRelations } from "@/hooks/use-document-relations";
import { ProposalProofPanel } from "@/components/proposals/proposal-proof-panel";
import { SignaturePanel } from "@/components/proposals/signature-panel";
import { EnvelopeIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { SECTION_REGISTRY } from "@/lib/sections/registry";
import { Button } from "@/components/ui/button";
import { buttonStyles } from "@/components/ui/button-styles";
import { SlideOver } from "@/components/ui/slide-over";
import { StatusBadge } from "@/components/status-badge";
import { slugifyClientName } from "@/lib/clients";
import { useProposal, useUpdateProposal } from "@/hooks/use-proposals";
import { useDeleteSnippet, useSnippets } from "@/hooks/use-snippets";
import { cn, formatCurrency, formatDate, statusLabel } from "@/lib/format";
import { deriveProposalStatus } from "@/lib/proposal-workflow";
import { approvalTrackApplies } from "@/lib/templates";
import { createTemplateFromDocument } from "@/lib/api";
import type { ProposalDocument, ProposalSection, SectionKey } from "@/types/proposal";

type EditorTab = "overview" | "builder";
type SaveState = "idle" | "saving" | "saved" | "error";

const tabs: Array<{ id: EditorTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "builder", label: "Builder" },
];

function parseEditorTab(value: string | null): EditorTab {
  return value === "builder" ? "builder" : "overview";
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
    loading: () => (
      <article className="widget-card">
        <div className="widget-header">
          <span className="widget-header-label">04 // BUILDER</span>
          <span className="widget-header-right">LOADING</span>
        </div>
        <div className="widget-body">
          <p className="text-sm text-[var(--text-3)]">Loading builder...</p>
        </div>
      </article>
    ),
  },
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
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [templateSavedAt, setTemplateSavedAt] = useState<string | null>(null);

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
  /** P5.17 — outline drawer toggle on < xl screens. */
  const [mobileOutlineOpen, setMobileOutlineOpen] = useState(false);
  // Canvas editor (2026): the document IS the canvas. The outline collapses to reclaim width, and
  // selecting a block opens its editor in a contextual right-hand inspector drawer.
  const [railOpen, setRailOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  // Scroll-position preservation when switching active section. We capture window.scrollY in
  // a ref *before* setActiveSectionId fires, then a useLayoutEffect restores it on the next
  // paint so React's section-editor swap doesn't yank the page back to the top.
  const scrollRestoreRef = useRef<number | null>(null);
  const selectSection = useCallback((id: string) => {
    scrollRestoreRef.current = typeof window !== "undefined" ? window.scrollY : null;
    setActiveSectionId(id);
    // Selecting a block (from the canvas or the outline rail) opens its contextual inspector.
    setInspectorOpen(true);
  }, []);
  useLayoutEffect(() => {
    if (scrollRestoreRef.current != null && typeof window !== "undefined") {
      window.scrollTo({ top: scrollRestoreRef.current, behavior: "instant" as ScrollBehavior });
      scrollRestoreRef.current = null;
    }
  }, [activeSectionId]);
  const [approvalPos, setApprovalPos] = useState({ top: 0, right: 0 });
  const approvalButtonRef = useRef<HTMLButtonElement>(null);
  const approvalPanelRef = useRef<HTMLDivElement>(null);
  // AI actions menu (Ask AI · Quick draft). Fixed-positioned like the approval popover because the
  // editor header lives inside an overflow-hidden widget-card.
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [aiMenuPos, setAiMenuPos] = useState({ top: 0, right: 0 });
  const aiMenuButtonRef = useRef<HTMLButtonElement>(null);
  const aiMenuRef = useRef<HTMLDivElement>(null);

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

  const handleTabChange = useCallback(
    (tab: EditorTab) => {
      setActiveTab(tab);

      const nextParams = new URLSearchParams(searchParams.toString());
      if (tab === "overview") {
        nextParams.delete("tab");
      } else {
        nextParams.set("tab", tab);
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

  const saveTone =
    saveState === "saved"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : saveState === "saving"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : saveState === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-[var(--border-2)] bg-white text-[var(--text-3)]";

  return (
    <div className="space-y-5">
      <section className="widget-card overflow-hidden">
        <div className="widget-header">
          <span className="widget-header-label">01 // DOCUMENT</span>
          <span className="widget-header-right">
            {draft.documentNumber ? `${draft.documentNumber} · ` : ""}
            {draft.version ? `${draft.version} · ` : ""}
            {statusLabel(draft.status).toUpperCase()}
          </span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4 px-4 py-5 sm:px-6">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-3)]">
              <HomeIcon className="h-4 w-4" />
              <ChevronRightIcon className="h-4 w-4" />
              <Link href="/app/docs" className="hover:text-[var(--text-1)]">
                Proposals
              </Link>
              <ChevronRightIcon className="h-4 w-4" />
              {draft.clientName ? (
                <Link
                  href={`/app/clients/${slugifyClientName(draft.clientName)}`}
                  className="hover:text-[var(--text-1)]"
                >
                  {draft.clientName}
                </Link>
              ) : (
                <span>Client</span>
              )}
              <ChevronRightIcon className="h-4 w-4" />
              <span className="font-medium text-[var(--text-1)]">{draft.title}</span>
            </div>

            <h1 className="mt-4 font-[family-name:var(--font-display)] text-[40px] font-normal leading-[1.1] tracking-[-0.5px] text-[var(--text-1)] sm:text-[44px]">
              {draft.title}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={draft.status} />
              {draft.version ? <span className="app-chip">Version {draft.version}</span> : null}
              {parentDoc ? (
                <Link
                  href={`/app/docs/${parentDoc.id}`}
                  className="app-chip inline-flex items-center gap-1.5 text-[var(--brand-700)] transition hover:bg-[var(--brand-200)]/60"
                  title={`Linked under: ${parentDoc.title}`}
                >
                  <LinkIcon className="h-3 w-3" />
                  <span>Under {parentDoc.documentType}</span>
                  <span className="max-w-[160px] truncate text-[var(--text-1)]">
                    {parentDoc.title}
                  </span>
                </Link>
              ) : null}
              <span className={cn("app-chip", saveTone)}>
                {saveState === "saved"
                  ? `Saved ${lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "just now"}`
                  : saveState === "saving"
                    ? "Saving..."
                    : saveState === "error"
                      ? "Save failed"
                      : "Waiting to save"}
              </span>
            </div>

            <LabelEditor
              labels={draft.labels ?? []}
              onChange={(labels) => updateDraft({ ...draft, labels })}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => undoRef.current()}
                disabled={pastRef.current.length === 0}
                title="Undo (⌘Z)"
                aria-label="Undo"
                className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[var(--border-2)] bg-white text-[var(--text-2)] transition-colors hover:bg-[var(--surface-1)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowUturnLeftIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => redoRef.current()}
                disabled={futureRef.current.length === 0}
                title="Redo (⌘⇧Z)"
                aria-label="Redo"
                className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[var(--border-2)] bg-white text-[var(--text-2)] transition-colors hover:bg-[var(--surface-1)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowUturnRightIcon className="h-4 w-4" />
              </button>
              <Link
                href={`/app/docs/${proposalId}/preview`}
                title="Open full preview"
                aria-label="Open full preview"
                className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[var(--border-2)] bg-white text-[var(--text-2)] transition-colors hover:bg-[var(--surface-1)]"
              >
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </Link>
            </div>

            {/* AI menu — Ask AI · Quick draft */}
            <div>
              <button
                ref={aiMenuButtonRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={aiMenuOpen}
                onClick={() => {
                  const rect = aiMenuButtonRef.current?.getBoundingClientRect();
                  if (rect) setAiMenuPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
                  setAiMenuOpen((v) => !v);
                }}
                className={buttonStyles({ variant: "secondary", size: "md", className: "gap-1.5 pr-2" })}
              >
                <SparklesIcon className="h-4 w-4" />
                AI
                <ChevronDownIcon className={cn("h-4 w-4 opacity-70 transition", aiMenuOpen && "rotate-180")} />
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
                size: "md",
                className: "gap-2 pr-2",
              })}
            >
              <CheckCircleIcon className="h-4 w-4" />
              Review &amp; Send
              <span className="rounded-[4px] border border-white/20 bg-white/12 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-white/95">
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
        </div>

        <div className="border-t border-[var(--border-2)] px-4 py-4 sm:px-6">
          <div className="inline-flex items-center rounded-[10px] bg-[var(--surface-1)] p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={cn(
                  "inline-flex h-[36px] min-w-[92px] items-center justify-center rounded-[6px] px-4 text-sm font-medium transition outline-none",
                  "focus-visible:ring-2 focus-visible:ring-[var(--brand-500)] focus-visible:ring-offset-1 focus-visible:ring-offset-white",
                  activeTab === tab.id
                    ? "bg-[var(--brand-focus-ring)] text-[var(--brand-700)]"
                    : "bg-transparent text-[var(--text-3)] hover:text-[var(--text-1)]",
                )}
                onClick={() => handleTabChange(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {activeTab === "overview" ? (
        <div className="space-y-5">
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
        <div className="space-y-3">
          {/* Toolbar — the document IS the canvas: click any block to edit it. Outline collapses
              to reclaim width on a laptop. */}
          <div className="hidden items-center justify-between xl:flex">
            <button
              type="button"
              onClick={() => setRailOpen((v) => !v)}
              aria-pressed={railOpen}
              className={`inline-flex items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-sm font-medium transition-colors ${
                railOpen
                  ? "border-[var(--brand-600)] bg-[var(--brand-200)] text-[var(--brand-700)]"
                  : "border-[var(--border-2)] bg-white text-[var(--text-2)] hover:border-[var(--border-1)]"
              }`}
            >
              {railOpen ? <EyeIcon className="h-4 w-4" /> : <EyeSlashIcon className="h-4 w-4" />}
              {railOpen ? "Outline shown" : "Outline hidden"}
            </button>
            <span className="text-[11px] text-[var(--text-4)]">Click any block on the page to edit it →</span>
          </div>

          <section
            className={`grid gap-4 ${railOpen ? "xl:grid-cols-[280px_minmax(0,1fr)]" : "xl:grid-cols-1"}`}
          >
            {/* Desktop: collapsible outline rail */}
            {railOpen ? (
              <div className="hidden xl:block">
                <TableOfContentsCard
                  sections={sectionEntries}
                  activeId={activeEntry?.id ?? null}
                  editable
                  onSelect={(id) => selectSection(id)}
                  onInsertAt={(index) => setPaletteInsertAt(index)}
                  onDeleteSection={handleDeleteSection}
                  onReorder={updateSectionOrder}
                  onToggleVisibility={handleToggleVisibility}
                />
              </div>
            ) : null}

            {/* Mobile/tablet: outline opens as a slide-in drawer (P5.17) */}
            <div className="xl:hidden">
              <button
                type="button"
                onClick={() => setMobileOutlineOpen(true)}
                className="inline-flex h-11 w-full items-center justify-between rounded-[10px] border border-[var(--border-2)] bg-white px-4 text-sm font-medium text-[var(--text-1)] shadow-[var(--shadow-xs)] transition active:bg-[var(--surface-1)]"
              >
                <span>
                  Outline · {sectionEntries.length} block{sectionEntries.length === 1 ? "" : "s"}
                </span>
                <ChevronRightIcon className="h-4 w-4 text-[var(--text-3)]" />
              </button>
            </div>

            {mobileOutlineOpen ? (
              <div className="fixed inset-0 z-40 xl:hidden" role="dialog" aria-label="Document outline">
                <button
                  type="button"
                  aria-label="Close outline"
                  onClick={() => setMobileOutlineOpen(false)}
                  className="absolute inset-0 bg-black/30"
                />
                <aside className="absolute inset-y-0 left-0 flex w-full max-w-[380px] flex-col bg-white shadow-[var(--shadow-lg)]">
                  <div className="flex items-center justify-between border-b border-[var(--border-2)] px-4 py-3">
                    <span className="widget-header-label">02 {"// "}OUTLINE</span>
                    <button
                      type="button"
                      onClick={() => setMobileOutlineOpen(false)}
                      aria-label="Close"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:text-[var(--text-1)]"
                    >
                      <ChevronRightIcon className="h-4 w-4 rotate-180" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <TableOfContentsCard
                      sections={sectionEntries}
                      activeId={activeEntry?.id ?? null}
                      editable
                      onSelect={(id) => {
                        selectSection(id);
                        setMobileOutlineOpen(false);
                      }}
                      onInsertAt={(index) => {
                        setPaletteInsertAt(index);
                        setMobileOutlineOpen(false);
                      }}
                      onDeleteSection={handleDeleteSection}
                      onReorder={updateSectionOrder}
                      onToggleVisibility={handleToggleVisibility}
                    />
                  </div>
                </aside>
              </div>
            ) : null}

            {/* Canvas — the live client document. Click a block to open its inspector. */}
            <div className="min-w-0">
              <div className="overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-canvas)]">
                <div className="flex items-center justify-between border-b border-[var(--border-2)] bg-white px-3 py-2">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-[var(--text-4)]">
                    03 // CANVAS
                  </span>
                  <span className="text-[11px] text-[var(--text-4)]">What the client sees</span>
                </div>
                <div className="overflow-auto p-4 sm:p-6">
                  <ProposalPreview
                    proposal={draft}
                    showTableOfContents={false}
                    frame={false}
                    editable
                    activeSectionId={activeEntry?.id ?? null}
                    onSelectSection={(id) => selectSection(id)}
                    onSectionChange={handleSectionDataChange}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Contextual block inspector — hosts the existing per-block editor unchanged. */}
          <SlideOver
            open={inspectorOpen && Boolean(activeEntry)}
            onClose={() => setInspectorOpen(false)}
            title="Edit block"
            dim={false}
            panelClassName="w-[460px] max-w-[94vw]"
          >
            <ProposalBuilderPanel
              proposal={draft}
              sections={sectionEntries}
              activeId={activeEntry?.id ?? null}
              onProposalChange={(next) => updateDraft(next, { coalesce: true })}
            />
          </SlideOver>
        </div>
      )}

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

function TableOfContentsCard({
  sections,
  activeId,
  editable,
  onSelect,
  onInsertAt,
  onDeleteSection,
  onReorder,
  onToggleVisibility,
}: {
  sections: Array<{ id: string; section: ProposalSection; order: number }>;
  activeId: string | null;
  editable?: boolean;
  onSelect: (id: string) => void;
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
    <aside className="widget-card overflow-hidden xl:sticky xl:top-6">
      <div className="widget-header">
        <span className="widget-header-label">02 {"// "}OUTLINE</span>
        <span className="widget-header-right">
          {sections.length} BLOCK{sections.length === 1 ? "" : "S"}
        </span>
      </div>
      <div className="p-3">
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
  onDelete,
  onInsertAt,
  onToggleVisibility,
}: {
  entry: { id: string; section: ProposalSection; order: number };
  isActive: boolean;
  /** This row's index in the section list. Used by the hover-"+" to know where to insert. */
  insertIndex: number;
  onSelect: (id: string) => void;
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
          "group flex items-center gap-1.5 rounded-[10px] border px-1.5 py-2.5 transition xl:py-1.5",
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
          className={cn(
            "min-w-0 flex-1 overflow-hidden text-left text-sm tracking-[-0.01em]",
            isActive ? "font-medium text-[var(--text-1)]" : "text-[var(--text-2)]",
          )}
        >
          <span className="block truncate whitespace-nowrap">{entry.section.title}</span>
        </button>

        <div className="flex items-center gap-0.5 transition xl:opacity-0 xl:group-hover:opacity-100">
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
    !ctaCount;

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
            New proposals start blank. Use Builder to add client details, scope, timeline, and pricing. The overview will stay empty until there is something real to summarise.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-3 xl:grid-cols-2">
      <OverviewWidget
        number="02"
        name="COMMERCIAL"
        rightSlot="VALUE"
        figure={formatCurrency(grandTotal, currency)}
        figureLabel="CURRENT PROPOSAL VALUE"
      >
        <OverviewStatRow label="Billable people" value={billableTeamCount} />
        <OverviewStatRow label="One-off" value={formatCurrency(oneOffTotal, currency)} />
        <OverviewStatRow label="Recurring" value={formatCurrency(recurringTotal, currency)} />
        <OverviewStatRow label={`Discount (${discount}%)`} value={formatCurrency(discountAmount, currency)} />
        <OverviewStatRow label={`VAT (${taxRate}%)`} value={formatCurrency(taxAmount, currency)} />
      </OverviewWidget>

      <OverviewWidget
        number="03"
        name="DELIVERY"
        rightSlot="SHAPE"
        figure={String(phasesCount)}
        figureLabel="PHASES · IMPLEMENTATION SHAPE"
      >
        <OverviewStatRow label="Deliverables" value={deliverablesCount} />
        <OverviewStatRow label="Workstreams" value={workstreamCount} />
        <OverviewStatRow label="Milestones" value={paymentMilestoneCount} />
        <OverviewStatRow
          label="Timeline mode"
          value={(timeline?.viewMode ?? "LIST").toLowerCase().replace(/^\w/, (char) => char.toUpperCase())}
        />
        <OverviewStatRow label="Last updated" value={formatDate(proposal.updatedAt)} />
      </OverviewWidget>

      <OverviewWidget
        number="04"
        name="SCOPE"
        rightSlot="COVERAGE"
        figure={String(touchpointCount)}
        figureLabel="TOUCHPOINTS · PROPOSAL COVERAGE"
      >
        <OverviewStatRow label="Objectives" value={objectiveCount} />
        <OverviewStatRow label="Features" value={featureCount} />
        <OverviewStatRow label="Visible modules" value={visibleSectionsCount} />
        <OverviewStatRow label="Assumptions" value={assumptionCount} />
        <OverviewStatRow label="Out of scope" value={outOfScopeCount} />
      </OverviewWidget>

      <OverviewWidget
        number="05"
        name="STAKEHOLDERS"
        rightSlot="OWNERSHIP"
        figure={clientName || "—"}
        figureLabel="CLIENT · OWNERSHIP"
        figureLong
      >
        <OverviewStatRow label="Prepared by" value={preparedByLine || "Not set"} />
        <OverviewStatRow label="Primary CTA" value={primaryCta?.label || "Not set"} />
        <OverviewStatRow label="Status" value={<StatusBadge status={proposal.status} />} />
        <OverviewStatRow label="Expiry" value={formatDate(expiryDate)} />
      </OverviewWidget>
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
