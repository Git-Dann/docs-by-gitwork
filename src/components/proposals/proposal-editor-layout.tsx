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
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
  HomeIcon,
  MinusIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import dynamic from "next/dynamic";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { proposalSectionBlueprints } from "@/lib/default-template";
import { useExportProposal, useProposal, useUpdateProposal } from "@/hooks/use-proposals";
import { cn, formatCurrency, formatDate, statusLabel } from "@/lib/format";
import type { DocumentStatus, ProposalDocument, ProposalSection, SectionKey } from "@/types/proposal";

type EditorTab = "overview" | "builder";
type SaveState = "idle" | "saving" | "saved" | "error";

const tabs: Array<{ id: EditorTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "builder", label: "Builder" },
];

const workflowStatuses: DocumentStatus[] = [
  "DRAFT",
  "PRODUCT_SIGN_OFF",
  "TECH_SIGN_OFF",
  "APPROVED",
];

const exportOptionConfig = [
  { key: "includeCover", label: "Include cover page" },
  { key: "includeSupportingLinks", label: "Include supporting links" },
  { key: "includeAssumptions", label: "Include assumptions" },
  { key: "includeOutOfScope", label: "Include out of scope" },
  { key: "includeFooter", label: "Include sign-off footer" },
] as const;

function getExportOptions(settings?: Record<string, unknown> | null) {
  return {
    includeCover: settings?.includeCover !== false,
    includeSupportingLinks: settings?.includeSupportingLinks !== false,
    includeAssumptions: settings?.includeAssumptions !== false,
    includeOutOfScope: settings?.includeOutOfScope !== false,
    includeFooter: settings?.includeFooter !== false,
  };
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
      <article className="rounded-2xl border border-[var(--border-1)] bg-white p-6">
        <p className="text-sm text-[var(--text-3)]">Loading builder...</p>
      </article>
    ),
  },
);

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

export function ProposalEditorLayout({ proposalId }: { proposalId: string }) {
  const { data, isPending, error } = useProposal(proposalId);
  const updateMutation = useUpdateProposal(proposalId);
  const exportMutation = useExportProposal(proposalId);

  const [localDraft, setLocalDraft] = useState<ProposalDocument | null>(null);
  const [activeTab, setActiveTab] = useState<EditorTab>("overview");
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const baselineRef = useRef("");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const exportOptions = useMemo(() => getExportOptions(draft?.exportSettings), [draft?.exportSettings]);
  const publicSharePath = `/preview/${proposalId}`;
  const publicShareUrl =
    typeof window !== "undefined" ? `${window.location.origin}${publicSharePath}` : publicSharePath;

  useEffect(() => {
    if (!draft || baselineRef.current) {
      return;
    }

    baselineRef.current = JSON.stringify(draft);
  }, [draft]);

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

  function updateDraft(nextDraft: ProposalDocument) {
    setLocalDraft(nextDraft);
    setSaveState("saving");
  }

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

  function handleAddSection(key: SectionKey) {
    if (!draft) {
      return;
    }

    const blueprint = proposalSectionBlueprints.find((entry) => entry.key === key);
    if (!blueprint) {
      return;
    }

    const nextSection: ProposalSection = {
      id: createDraftSectionId(),
      key: blueprint.key,
      title: blueprint.title,
      description: blueprint.description,
      sortOrder: draft.sections.length,
      isVisible: blueprint.visible ?? true,
      data: cloneSectionData(blueprint.data),
    };

    const nextSections = [...draft.sections, nextSection].map((section, index) => ({
      ...section,
      sortOrder: index,
    }));

    updateDraft({
      ...draft,
      sections: nextSections,
    });
    setActiveSectionId(getSectionEntryId(nextSection));
    setActiveTab("builder");
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

  async function handleShareLink() {
    const result = await exportMutation.mutateAsync({
      format: "SHARE_LINK",
      settings: exportOptions,
    });

    if (typeof window !== "undefined" && result.export.url) {
      const shareUrl = `${window.location.origin}${result.export.url}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  if (isPending) {
    return <p className="text-sm text-[var(--text-3)]">Loading proposal...</p>;
  }

  if (error || !draft) {
    return <p className="text-sm text-rose-700">{(error as Error)?.message ?? "Proposal unavailable"}</p>;
  }

  const saveTone =
    saveState === "saved"
      ? "text-emerald-700"
      : saveState === "saving"
        ? "text-amber-700"
        : saveState === "error"
          ? "text-rose-700"
          : "text-[var(--text-3)]";

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[var(--border-1)] bg-white px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-3)]">
              <HomeIcon className="h-4 w-4" />
              <ChevronRightIcon className="h-4 w-4" />
              <Link href="/app/proposals" className="hover:text-[var(--text-1)]">
                Proposals
              </Link>
              <ChevronRightIcon className="h-4 w-4" />
              <span>{draft.clientName || "Client"}</span>
              <ChevronRightIcon className="h-4 w-4" />
              <span className="font-medium text-[var(--text-1)]">{draft.title}</span>
            </div>

            <h1 className="mt-3 text-5xl font-semibold tracking-tight text-[var(--text-1)]">{draft.title}</h1>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--text-3)]">
              <StatusBadge status={draft.status} />
              <span className={cn("inline-flex items-center gap-1", saveTone)}>
                {saveState === "saved" ? (
                  <CheckCircleIcon className="h-3.5 w-3.5" />
                ) : saveState === "error" ? (
                  <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                ) : null}
                Last Saved: {lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString() : "Not yet"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/app/proposals/${proposalId}/preview`}
              className={buttonStyles({
                variant: "secondary",
                size: "md",
              })}
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              Preview
            </Link>
            <details className="group relative">
              <summary
                className={buttonStyles({
                  variant: "primary",
                  size: "md",
                  className:
                    "list-none gap-2 pr-2 [&::-webkit-details-marker]:hidden",
                })}
              >
                <CheckCircleIcon className="h-4 w-4" />
                Approve, Share & Export
                <span className="rounded-full border border-white/20 bg-white/12 px-2 py-1 text-[11px] font-semibold tracking-[0.01em] text-white/95">
                  {statusLabel(draft.status)}
                </span>
                <ChevronDownIcon className="h-4 w-4 opacity-80 transition group-open:rotate-180" />
              </summary>

              <div className="absolute right-0 z-30 mt-2 w-[360px] rounded-2xl border border-[var(--border-1)] bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-1)]">Approve, share & export</p>
                  <p className="mt-1 text-sm text-[var(--text-3)]">
                    Manage proposal sign-off, control shared output, and publish the client-facing link from one place.
                  </p>
                </div>

                <div className="mt-4 rounded-2xl border border-[var(--border-1)] bg-[var(--surface-1)] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-3)]">Approvals</p>
                  <div className="mt-3 space-y-2">
                  {workflowStatuses.map((status) => (
                    <label
                      key={status}
                      className="flex items-center gap-3 rounded-xl border border-[var(--border-1)] bg-white px-3 py-2.5 text-sm text-[var(--text-2)]"
                    >
                      <input
                        type="checkbox"
                        checked={draft.status === status}
                        onChange={() =>
                          updateDraft({
                            ...draft,
                            status,
                          })
                        }
                        className="h-4 w-4 rounded border-[var(--border-1)] text-[var(--brand-600)]"
                      />
                      <span>{statusLabel(status)}</span>
                    </label>
                  ))}
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-[var(--border-1)] bg-[var(--surface-1)] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-3)]">Export settings</p>
                  <p className="mt-1 text-sm text-[var(--text-3)]">
                    Control what appears in the shared and export-ready proposal output.
                  </p>

                  <div className="mt-3 space-y-2">
                  {exportOptionConfig.map((option) => (
                    <label
                      key={option.key}
                      className="flex items-center gap-3 rounded-xl border border-[var(--border-1)] bg-white px-3 py-2.5 text-sm text-[var(--text-2)]"
                    >
                      <input
                        type="checkbox"
                        checked={exportOptions[option.key]}
                        onChange={(event) =>
                          updateDraft({
                            ...draft,
                            exportSettings: {
                              ...draft.exportSettings,
                              [option.key]: event.target.checked,
                            },
                          })
                        }
                        className="h-4 w-4 rounded border-[var(--border-1)] text-[var(--brand-600)]"
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-[var(--border-1)] bg-[var(--surface-1)] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-3)]">
                    Public link
                  </p>
                  <input
                    readOnly
                    value={publicShareUrl}
                    className="mt-2 h-[42px] w-full rounded-xl border border-[var(--border-1)] bg-white px-3 text-sm text-[var(--text-2)]"
                  />
                  <Link
                    href={publicSharePath}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex text-sm font-medium text-[var(--brand-700)] hover:underline"
                  >
                    Open shared preview
                  </Link>
                </div>

                <div className="mt-4 flex items-center gap-2 border-t border-[var(--border-1)] pt-4">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="flex-1 justify-center"
                    onClick={handleShareLink}
                    loading={exportMutation.isPending}
                    leadingIcon={<ClipboardDocumentIcon className="h-4 w-4" />}
                  >
                    {copied ? "Copied" : "Share"}
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    className="flex-1 justify-center"
                    onClick={() =>
                      exportMutation.mutate({
                        format: "PDF",
                        settings: exportOptions,
                      })
                    }
                    loading={exportMutation.isPending}
                    leadingIcon={<ArrowDownTrayIcon className="h-4 w-4" />}
                  >
                    Export
                  </Button>
                </div>
              </div>
            </details>
          </div>
        </div>

        <div className="mt-5 border-t border-[var(--border-1)] pt-4">
          <div className="inline-flex h-11 items-center rounded-xl border border-[var(--border-1)] bg-white p-1">
            {tabs.map((tab) => (
              <Button
                key={tab.id}
                type="button"
                variant={activeTab === tab.id ? "secondary" : "tertiary"}
                size="sm"
                className={cn(
                  "px-4",
                  activeTab === tab.id
                    ? "border-[var(--border-1)] bg-white text-[var(--text-1)]"
                    : "text-[var(--text-3)] hover:text-[var(--text-1)]",
                )}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {activeTab === "overview" ? (
        <OverviewCanvas proposal={draft} sections={sectionEntries.map((entry) => entry.section)} />
      ) : (
        <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
          <TableOfContentsCard
            sections={sectionEntries}
            activeId={activeEntry?.id ?? null}
            editable
            onSelect={(id) => setActiveSectionId(id)}
            onAddSection={handleAddSection}
            onDeleteSection={handleDeleteSection}
            onReorder={updateSectionOrder}
          />

          <ProposalBuilderPanel
            proposal={draft}
            sections={sectionEntries}
            activeId={activeEntry?.id ?? null}
            onProposalChange={updateDraft}
          />
        </section>
      )}
    </div>
  );
}

function TableOfContentsCard({
  sections,
  activeId,
  editable,
  onSelect,
  onAddSection,
  onDeleteSection,
  onReorder,
}: {
  sections: Array<{ id: string; section: ProposalSection; order: number }>;
  activeId: string | null;
  editable?: boolean;
  onSelect: (id: string) => void;
  onAddSection?: (key: SectionKey) => void;
  onDeleteSection?: (id: string) => void;
  onReorder?: (activeId: string, overId: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    if (!editable || !event.over || !onReorder) {
      return;
    }

    onReorder(String(event.active.id), String(event.over.id));
  }

  return (
    <aside className="rounded-2xl border border-[var(--border-1)] bg-white p-5">
      <div className="flex items-center justify-between border-b border-[var(--border-1)] pb-4">
        <h2 className="text-3xl font-semibold tracking-tight text-[var(--text-1)]">Table of Contents</h2>
        {editable ? (
          <details className="group relative">
            <summary
              className={buttonStyles({
                variant: "secondary",
                size: "md",
                className:
                  "list-none gap-2 rounded-xl px-3.5 [&::-webkit-details-marker]:hidden",
              })}
            >
              <PlusIcon className="h-4 w-4" />
              Add
            </summary>

            <div className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-2xl border border-[var(--border-1)] bg-white py-2 shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
              {proposalSectionBlueprints.map((module) => (
                <button
                  key={module.key}
                  type="button"
                  onClick={(event) => {
                    onAddSection?.(module.key);
                    event.currentTarget.closest("details")?.removeAttribute("open");
                  }}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-lg font-medium tracking-[-0.01em] text-[var(--text-2)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                >
                  <span>{module.title}</span>
                </button>
              ))}
            </div>
          </details>
        ) : null}
      </div>

      {sections.length ? (
        editable ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sections.map((entry) => entry.id)} strategy={verticalListSortingStrategy}>
              <ol className="mt-5 space-y-1.5">
                {sections.map((entry) => (
                  <SortableTableOfContentsItem
                    key={entry.id}
                    entry={entry}
                    isActive={entry.id === activeId}
                    onSelect={onSelect}
                    onDelete={onDeleteSection}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        ) : (
          <ol className="mt-5 space-y-1.5">
            {sections.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onSelect(entry.id)}
                  className={cn(
                    "w-full rounded-xl px-3 py-2.5 text-left text-lg tracking-[-0.01em] transition",
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
        <p className="mt-4 text-sm text-[var(--text-3)]">No modules yet. Use Add to start building the proposal.</p>
      )}
    </aside>
  );
}

function SortableTableOfContentsItem({
  entry,
  isActive,
  onSelect,
  onDelete,
}: {
  entry: { id: string; section: ProposalSection; order: number };
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(isDragging ? "relative z-10" : "")}
    >
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border px-3 py-2.5 transition",
          isActive
            ? "border-[var(--border-1)] bg-[var(--surface-1)]"
            : "border-transparent hover:bg-[var(--surface-1)]",
          isDragging ? "border-[var(--border-1)] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.12)]" : "",
        )}
      >
        <button
          type="button"
          aria-label={`Reorder ${entry.section.title}`}
          className="flex h-7 w-7 cursor-grab items-center justify-center rounded-lg text-[var(--text-3)] transition hover:bg-white active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GrabberHandle />
        </button>

        <button
          type="button"
          onClick={() => onSelect(entry.id)}
          className={cn(
            "min-w-0 flex-1 text-left text-lg tracking-[-0.01em]",
            isActive ? "font-medium text-[var(--text-1)]" : "text-[var(--text-2)]",
          )}
        >
          {entry.order}. {entry.section.title}
        </button>

        <button
          type="button"
          aria-label={`Delete ${entry.section.title}`}
          onClick={(event) => {
            event.stopPropagation();
            onDelete?.(entry.id);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-3)] transition hover:bg-white hover:text-rose-600"
        >
          <MinusIcon className="h-4 w-4" />
        </button>
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

  return (
    <article className="space-y-7 rounded-2xl border border-[var(--border-1)] bg-white p-6">
      <header>
        <h3 className="text-4xl font-semibold tracking-tight text-[var(--text-1)]">Proposal overview</h3>
        <p className="mt-1 text-lg text-[var(--text-3)]">
          A light snapshot of the proposal setup, delivery shape, and commercial status.
        </p>
      </header>

      {isEmptyProposal ? (
        <section className="rounded-2xl bg-[var(--surface-0)] p-6 shadow-[0_1px_3px_rgba(16,24,40,0.08)]">
          <h4 className="text-2xl font-semibold tracking-tight text-[var(--text-1)]">Nothing to summarise yet</h4>
          <p className="mt-2 max-w-2xl text-base leading-7 text-[var(--text-3)]">
            New proposals now start blank. Use Builder to add client details, scope, timeline, and pricing. The overview will stay empty until there is something real to summarise.
          </p>
        </section>
      ) : (
        <section className="grid gap-4 xl:grid-cols-2">
          <OverviewMetricCard
            eyebrow="Commercial"
            title={formatCurrency(grandTotal, currency)}
            subtitle="Current proposal value"
          >
            <OverviewStatRow label="Billable people" value={billableTeamCount} />
            <OverviewStatRow label="One-off" value={formatCurrency(oneOffTotal, currency)} />
            <OverviewStatRow label="Recurring" value={formatCurrency(recurringTotal, currency)} />
            <OverviewStatRow label={`Discount (${discount}%)`} value={formatCurrency(discountAmount, currency)} />
            <OverviewStatRow label={`VAT (${taxRate}%)`} value={formatCurrency(taxAmount, currency)} />
          </OverviewMetricCard>

          <OverviewMetricCard eyebrow="Delivery" title={`${phasesCount} phases`} subtitle="Implementation shape">
            <OverviewStatRow label="Deliverables" value={deliverablesCount} />
            <OverviewStatRow label="Workstreams" value={workstreamCount} />
            <OverviewStatRow label="Milestones" value={paymentMilestoneCount} />
            <OverviewStatRow
              label="Timeline mode"
              value={(timeline?.viewMode ?? "LIST").toLowerCase().replace(/^\w/, (char) => char.toUpperCase())}
            />
            <OverviewStatRow label="Last updated" value={formatDate(proposal.updatedAt)} />
          </OverviewMetricCard>

          <OverviewMetricCard eyebrow="Scope" title={`${touchpointCount} touchpoints`} subtitle="Structured proposal coverage">
            <OverviewStatRow label="Objectives" value={objectiveCount} />
            <OverviewStatRow label="Features" value={featureCount} />
            <OverviewStatRow label="Visible modules" value={visibleSectionsCount} />
            <OverviewStatRow label="Assumptions" value={assumptionCount} />
            <OverviewStatRow label="Out of scope" value={outOfScopeCount} />
          </OverviewMetricCard>

          <OverviewMetricCard eyebrow="Stakeholders" title={clientName || "No client set"} subtitle="Client and ownership">
            <OverviewStatRow label="Owner" value={owner || "Not set"} />
            <OverviewStatRow label="Prepared by" value={signoff?.preparedBy || "Not set"} />
            <OverviewStatRow label="Primary CTA" value={primaryCta?.label || "Not set"} />
            <OverviewStatRow label="Status" value={<StatusBadge status={proposal.status} />} />
            <OverviewStatRow label="Expiry" value={formatDate(expiryDate)} />
          </OverviewMetricCard>
        </section>
      )}
    </article>
  );
}

function OverviewMetricCard({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-[var(--surface-0)] p-5 shadow-[0_1px_3px_rgba(16,24,40,0.08)]">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-3)]">{eyebrow}</p>
      <h4 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text-1)]">{title}</h4>
      <p className="mt-1 text-sm text-[var(--text-3)]">{subtitle}</p>
      <div className="mt-4 space-y-2.5">{children}</div>
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
      <span className="text-right font-semibold text-[var(--text-1)]">{value}</span>
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
    exportSettings: draft.exportSettings,
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
