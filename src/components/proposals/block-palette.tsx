/**
 * Slide-in block palette for the document builder (Sprint 7).
 *
 * Right-edge sliding panel. Triggered by hover "+" buttons in the outline, or by a persistent
 * "Add block" button. Lists every block grouped by category, with doc-type recommendations
 * surfaced first so the operator sees relevant blocks without having to scroll.
 *
 * Closes via:
 *   - Picking a block (mounted at the parent's `onPick` handler — typically inserts at the
 *     `insertAt` index passed in via props)
 *   - Backdrop click
 *   - Escape key
 *   - Explicit close button
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { BookmarkIcon, MagnifyingGlassIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import {
  SECTION_REGISTRY,
  sectionsByCategory,
  sortedKeysForDocumentType,
} from "@/lib/sections/registry";
import { SECTION_CATEGORIES } from "@/lib/sections/types";
import { cn } from "@/lib/format";
import type { DocumentType, SectionKey } from "@/types/proposal";

// The handful of blocks people reach for most — surfaced in a "Common" tier at the top of the
// palette so the first thing you see is the everyday set, not a wall of 38 categorised options.
const COMMON_KEYS: SectionKey[] = [
  "heading",
  "prose",
  "callout",
  "checklist",
  "data_table",
  "image",
  "kpi_strip",
];

interface BlockPaletteProps {
  open: boolean;
  onClose: () => void;
  /** Called when the operator picks a block. The parent inserts at insertAt or appends. */
  onPick: (key: SectionKey) => void;
  /** Saved content snippets to offer for insertion (Phase 3). */
  snippets?: Array<{ id: string; name: string; sectionKey: string }>;
  /** Called when the operator picks a saved snippet. */
  onPickSnippet?: (id: string) => void;
  /** Called when the operator removes a saved snippet. */
  onDeleteSnippet?: (id: string) => void;
  /** Document type for filtering — recommended-first ordering. */
  documentType?: DocumentType;
  /** Optional context label (e.g. "Inserting before §03 Objectives") for the header. */
  insertContextLabel?: string;
}

export function BlockPalette({
  open,
  onClose,
  onPick,
  snippets = [],
  onPickSnippet,
  onDeleteSnippet,
  documentType,
  insertContextLabel,
}: BlockPaletteProps) {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const groups = useMemo(() => {
    const allKeys = sortedKeysForDocumentType(documentType);
    const recommendedKeys = documentType
      ? allKeys.filter((key) => {
          const section = SECTION_REGISTRY[key];
          return section.recommendedFor === undefined || section.recommendedFor.includes(documentType);
        })
      : allKeys;

    const visibleKeys = showAll || !documentType ? allKeys : recommendedKeys;

    const filtered = search.trim()
      ? visibleKeys.filter((key) => {
          const section = SECTION_REGISTRY[key];
          const needle = search.toLowerCase();
          return (
            section.displayName.toLowerCase().includes(needle) ||
            section.description.toLowerCase().includes(needle)
          );
        })
      : visibleKeys;

    return sectionsByCategory(filtered);
  }, [documentType, search, showAll]);

  const moreBlocksHidden =
    documentType && !showAll
      ? sortedKeysForDocumentType(documentType).length -
        sortedKeysForDocumentType(documentType).filter((key) => {
          const s = SECTION_REGISTRY[key];
          return s.recommendedFor === undefined || s.recommendedFor.includes(documentType);
        }).length
      : 0;

  if (!open) return null;

  return (
    // z-50 (not z-40): the persistent "On Your Desk" bottom drawer (src/components/desk/
    // desk-drawer.tsx) also docks at z-40 — sharing that value let its dock-bar text bleed
    // through underneath this palette. A transient overlay like this one must outrank
    // persistent bottom chrome, matching the z-50 convention used by the generic Modal.
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close palette"
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-[var(--shadow-lg)]"
        style={{ animation: "blockPaletteSlide 220ms ease-out" }}
      >
        {/* Header */}
        <div className="widget-header">
          <span className="widget-header-label">ADD A BLOCK</span>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-4)] transition hover:text-[var(--text-1)]"
            aria-label="Close palette"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Search + context */}
        <div className="space-y-2 border-b border-[var(--border-2)] px-5 py-4">
          {insertContextLabel ? (
            <p className="text-xs text-[var(--text-3)]">{insertContextLabel}</p>
          ) : null}
          <label className="relative block">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-4)]" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search blocks…"
              className="app-input pl-9"
            />
          </label>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* Saved snippets (Phase 3) — reusable sections, shown first when present. */}
          {(() => {
            const needle = search.trim().toLowerCase();
            const matched = needle
              ? snippets.filter((s) => s.name.toLowerCase().includes(needle))
              : snippets;
            if (matched.length === 0) return null;
            return (
              <div className="mb-6">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
                  Saved snippets
                </p>
                <ul className="mt-3 grid grid-cols-1 gap-2">
                  {matched.map((snippet) => {
                    const section = SECTION_REGISTRY[snippet.sectionKey as SectionKey];
                    return (
                      <li key={snippet.id} className="group/snippet relative">
                        <button
                          type="button"
                          onClick={() => {
                            onPickSnippet?.(snippet.id);
                            onClose();
                          }}
                          className={cn(
                            "flex w-full items-start gap-3 rounded-[10px] border border-[var(--border-2)] bg-white p-3 pr-9 text-left transition",
                            "hover:border-[var(--brand-300)] hover:bg-[var(--brand-200)]/30",
                          )}
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] bg-[var(--surface-1)] text-[var(--brand-700)]">
                            <BookmarkIcon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-[var(--text-1)]">{snippet.name}</p>
                            <p className="mt-0.5 text-xs text-[var(--text-3)]">
                              {section?.displayName ?? snippet.sectionKey}
                            </p>
                          </div>
                        </button>
                        {onDeleteSnippet ? (
                          <button
                            type="button"
                            onClick={() => onDeleteSnippet(snippet.id)}
                            aria-label={`Delete snippet ${snippet.name}`}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[6px] p-1.5 text-[var(--text-4)] opacity-0 transition hover:bg-[var(--danger-50)] hover:text-[var(--danger-500)] group-hover/snippet:opacity-100"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })()}

          {/* Common tier — everyday blocks first (hidden while searching, which shows flat results). */}
          {!search.trim() ? (
            <div className="mb-6">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
                Common
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--text-4)]">The blocks you&rsquo;ll reach for most</p>
              <ul className="mt-3 grid grid-cols-1 gap-2">
                {COMMON_KEYS.filter((key) => SECTION_REGISTRY[key]).map((key) => {
                  const section = SECTION_REGISTRY[key];
                  const Icon = section.icon;
                  return (
                    <li key={`common-${key}`}>
                      <button
                        type="button"
                        onClick={() => {
                          onPick(key);
                          onClose();
                        }}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-[10px] border border-[var(--border-2)] bg-white p-3 text-left transition",
                          "hover:border-[var(--brand-300)] hover:bg-[var(--brand-200)]/30",
                        )}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] bg-[var(--surface-1)] text-[var(--brand-700)]">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[var(--text-1)]">{section.displayName}</p>
                          <p className="mt-0.5 text-xs leading-5 text-[var(--text-3)]">{section.description}</p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {groups.length === 0 ? (
            <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-6 text-center text-sm text-[var(--text-4)]">
              No blocks match &ldquo;{search}&rdquo;
              {!showAll && moreBlocksHidden > 0 ? (
                <>
                  {" — "}
                  <button
                    type="button"
                    onClick={() => setShowAll(true)}
                    className="text-[var(--brand-700)] hover:underline"
                  >
                    show all blocks
                  </button>
                </>
              ) : null}
            </p>
          ) : (
            <div className="space-y-6">
              {groups.map((group) => {
                const meta = SECTION_CATEGORIES.find((c) => c.key === group.category);
                return (
                  <div key={group.category}>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
                      {meta?.label ?? group.category}
                    </p>
                    {meta?.hint ? (
                      <p className="mt-0.5 text-[11px] text-[var(--text-4)]">{meta.hint}</p>
                    ) : null}
                    <ul className="mt-3 grid grid-cols-1 gap-2">
                      {group.keys.map((key) => {
                        const section = SECTION_REGISTRY[key];
                        const Icon = section.icon;
                        return (
                          <li key={key}>
                            <button
                              type="button"
                              onClick={() => {
                                onPick(key);
                                onClose();
                              }}
                              className={cn(
                                "flex w-full items-start gap-3 rounded-[10px] border border-[var(--border-2)] bg-white p-3 text-left transition",
                                "hover:border-[var(--brand-300)] hover:bg-[var(--brand-200)]/30",
                              )}
                            >
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] bg-[var(--surface-1)] text-[var(--brand-700)]">
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-[var(--text-1)]">
                                  {section.displayName}
                                </p>
                                <p className="mt-0.5 text-xs leading-5 text-[var(--text-3)]">
                                  {section.description}
                                </p>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          {/* "Show all" affordance when filtered by doc type */}
          {documentType && !showAll && moreBlocksHidden > 0 && groups.length > 0 ? (
            <div className="mt-6 border-t border-[var(--border-3)] pt-4">
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-700)] hover:underline"
              >
                Show {moreBlocksHidden} more block{moreBlocksHidden === 1 ? "" : "s"} not specific to this doc type
              </button>
            </div>
          ) : null}

          {documentType && showAll ? (
            <div className="mt-6 border-t border-[var(--border-3)] pt-4">
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-700)] hover:underline"
              >
                Show only blocks recommended for this doc type
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Slide-in animation keyframes */}
      <style jsx>{`
        @keyframes blockPaletteSlide {
          from { transform: translateX(40px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
