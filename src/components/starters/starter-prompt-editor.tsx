"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardIcon,
  CheckIcon,
  XMarkIcon,
  ChevronLeftIcon,
  EyeIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
import { useClientDetail, useProposal } from "@/hooks/use-proposals";
import { usePulseScan } from "@/hooks/use-pulse";
import { cn } from "@/lib/format";
import {
  STARTER_MERGE_GROUPS,
  applyMergeVariables,
  resolveClientTokens,
  resolveDocumentTokens,
  resolvePulseTokens,
  type StarterMergeGroup,
} from "@/lib/starter-merge-variables";
import { StarterRecordPicker, type PickedRecord } from "@/components/starters/starter-record-picker";

const GROUP_LABEL: Record<StarterMergeGroup, string> = {
  client: "Client",
  document: "Document",
  pulseScan: "Pulse scan",
};

export interface StarterEditorPicks {
  clientSlug?: string;
  documentId?: string;
  scanId?: string;
}

/**
 * Session-only prompt editor for PROMPT/SKILL starters: lets you insert `{{tokens}}` for a picked
 * client/document/Pulse scan, then copy or preview the RESOLVED text (real values, not raw
 * tokens). Nothing here ever writes back to the stored starter template — reopening the starter
 * later starts fresh. `onPicksChange` reports the current picks so the parent can pass them to the
 * download route (`?clientSlug=&documentId=&scanId=`) so the downloaded Skill matches the screen.
 */
export function StarterPromptEditor({
  initialPromptText,
  onPicksChange,
}: {
  initialPromptText: string;
  onPicksChange?: (picks: StarterEditorPicks) => void;
}) {
  const [text, setText] = useState(initialPromptText);
  const [picked, setPicked] = useState<Partial<Record<StarterMergeGroup, PickedRecord>>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuGroup, setMenuGroup] = useState<StarterMergeGroup | null>(null);
  const [showPickerFor, setShowPickerFor] = useState<StarterMergeGroup | null>(null);
  const [previewResolved, setPreviewResolved] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const clientSlug = picked.client?.kind === "client" ? picked.client.slug : "";
  const documentId = picked.document?.kind === "document" ? picked.document.id : "";
  const scanId = picked.pulseScan?.kind === "pulseScan" ? picked.pulseScan.id : "";

  const { data: clientDetail } = useClientDetail(clientSlug);
  const { data: proposalData } = useProposal(documentId);
  const { data: scanData } = usePulseScan(scanId);

  useEffect(() => {
    onPicksChange?.({
      clientSlug: clientSlug || undefined,
      documentId: documentId || undefined,
      scanId: scanId || undefined,
    });
    // onPicksChange is expected to be a stable callback (or the parent accepts re-invocation);
    // only the picks themselves should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSlug, documentId, scanId]);

  const vars = useMemo(() => {
    let v: Record<string, string> = {};
    if (clientDetail?.client) v = { ...v, ...resolveClientTokens(clientDetail.client) };
    if (proposalData?.proposal) v = { ...v, ...resolveDocumentTokens(proposalData.proposal) };
    if (scanData?.scan) v = { ...v, ...resolvePulseTokens(scanData.scan) };
    return v;
  }, [clientDetail, proposalData, scanData]);

  const resolvedText = useMemo(() => applyMergeVariables(text, vars), [text, vars]);

  const restoreSelection = useCallback((start: number, end: number) => {
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(start, end);
    });
  }, []);

  const insertToken = useCallback(
    (token: string) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const { selectionStart: s, selectionEnd: e, value: v } = ta;
      const insert = `{{${token}}}`;
      setText(v.slice(0, s) + insert + v.slice(e));
      restoreSelection(s + insert.length, s + insert.length);
      setMenuOpen(false);
      setMenuGroup(null);
      setShowPickerFor(null);
    },
    [restoreSelection],
  );

  async function copyResolved() {
    try {
      await navigator.clipboard.writeText(resolvedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — nothing to fall back to */
    }
  }

  function clearPick(group: StarterMergeGroup) {
    setPicked((prev) => {
      const next = { ...prev };
      delete next[group];
      return next;
    });
  }

  function openGroup(group: StarterMergeGroup) {
    setMenuGroup(group);
    // Already picked this session → skip straight to the field list; otherwise show the picker.
    setShowPickerFor(picked[group] ? null : group);
  }

  return (
    <div>
      {/* Picked-record chips */}
      {(Object.keys(picked) as StarterMergeGroup[]).length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border-2)] px-6 py-2.5">
          {(Object.keys(picked) as StarterMergeGroup[]).map((group) => {
            const rec = picked[group];
            if (!rec) return null;
            return (
              <span
                key={group}
                className="inline-flex items-center gap-1 rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-2)]"
              >
                {GROUP_LABEL[group]}: {rec.label}
                <button
                  type="button"
                  onClick={() => clearPick(group)}
                  className="ml-0.5 text-[var(--text-4)] transition hover:text-red-600"
                  aria-label={`Clear ${GROUP_LABEL[group]}`}
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-2)] bg-[var(--surface-1)] px-6 py-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setMenuOpen((o) => !o);
              setMenuGroup(null);
              setShowPickerFor(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2.5 py-1 font-mono text-[11px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
          >
            <span className="font-mono text-[11px] leading-none">{"{ }"}</span>
            Insert
          </button>

          {menuOpen && (
            <div className="absolute left-0 top-9 z-20 overflow-hidden rounded-[8px] border border-[var(--border-2)] bg-white shadow-[var(--shadow-lg)]">
              {menuGroup === null ? (
                <div className="w-52 py-1">
                  <p className="px-3 py-1.5 font-mono text-[9px] uppercase tracking-[1px] text-[var(--text-4)]">
                    Insert from
                  </p>
                  {STARTER_MERGE_GROUPS.map(({ group, label }) => (
                    <button
                      key={group}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => openGroup(group)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--surface-1)]"
                    >
                      <span className="text-[var(--text-2)]">{label}</span>
                      {picked[group] && (
                        <span className="truncate font-mono text-[10px] text-[var(--text-4)]">
                          {picked[group]!.label}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : showPickerFor === menuGroup ? (
                <div>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setMenuGroup(null)}
                    className="flex w-full items-center gap-1 border-b border-[var(--border-2)] px-3 py-1.5 text-left text-[11px] text-[var(--text-3)] transition hover:bg-[var(--surface-1)]"
                  >
                    <ChevronLeftIcon className="h-3 w-3" />
                    Back
                  </button>
                  <StarterRecordPicker
                    group={menuGroup}
                    onPick={(record) => {
                      setPicked((prev) => ({ ...prev, [menuGroup]: record }));
                      setShowPickerFor(null);
                    }}
                  />
                </div>
              ) : (
                <div className="w-60 py-1">
                  <div className="flex items-center justify-between px-3 py-1.5">
                    <p className="font-mono text-[9px] uppercase tracking-[1px] text-[var(--text-4)]">
                      {GROUP_LABEL[menuGroup]} fields
                    </p>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setShowPickerFor(menuGroup)}
                      className="font-mono text-[9px] uppercase tracking-[1px] text-[var(--brand-700)] hover:underline"
                    >
                      Change
                    </button>
                  </div>
                  {STARTER_MERGE_GROUPS.find((g) => g.group === menuGroup)?.tokens.map((t) => (
                    <button
                      key={t.token}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => insertToken(t.token)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--surface-1)]"
                    >
                      <span className="text-[var(--text-2)]">{t.label}</span>
                      <code className="font-mono text-[10px] text-[var(--text-4)]">{`{{${t.token}}}`}</code>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setPreviewResolved((p) => !p)}
          className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2.5 py-1 font-mono text-[11px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
        >
          {previewResolved ? <PencilSquareIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
          {previewResolved ? "Edit" : "Preview resolved"}
        </button>

        <button
          type="button"
          onClick={copyResolved}
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1 font-mono text-[11px] font-semibold text-white transition",
            copied ? "bg-emerald-600" : "bg-[var(--brand-700)] hover:opacity-90",
          )}
        >
          {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <ClipboardIcon className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy resolved"}
        </button>
      </div>

      {previewResolved ? (
        <div className="whitespace-pre-wrap px-6 py-5 font-mono text-[13px] leading-6 text-[var(--text-2)]">
          {resolvedText}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          className="block w-full resize-y border-0 bg-white px-6 py-5 font-mono text-[13px] leading-6 text-[var(--text-2)] outline-none"
        />
      )}
    </div>
  );
}
