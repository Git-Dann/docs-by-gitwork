"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import {
  PencilSquareIcon,
  DocumentDuplicateIcon,
  TrashIcon,
  ArrowLeftIcon,
  CheckIcon,
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  ArrowDownTrayIcon,
  EllipsisHorizontalIcon,
  ClockIcon,
  ChatBubbleLeftRightIcon,
  WrenchScrewdriverIcon,
  PuzzlePieceIcon,
  CubeIcon,
  RectangleStackIcon,
} from "@heroicons/react/24/outline";
import {
  useStarter,
  useDeleteStarter,
  useDuplicateStarter,
  useAdoptStarter,
} from "@/hooks/use-starters";
import { usePulseScan } from "@/hooks/use-pulse";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/format";
import { Markdown } from "@/lib/markdown";
import { buttonStyles } from "@/components/ui/button";
import { StarterForm } from "@/components/starters/starter-form";
import { StarterPromptEditor, type StarterEditorPicks } from "@/components/starters/starter-prompt-editor";
import { StarterVersionsModal } from "@/components/starters/starter-versions-modal";
import type { StarterType } from "@/server/starters";

const TYPE_LABEL: Record<StarterType, string> = {
  PROMPT: "Prompt",
  SKILL: "Skill",
  PLUGIN: "Plugin",
  KIT: "Kit",
  COLLECTION: "Collection",
};

const TYPE_TONE: Record<StarterType, string> = {
  PROMPT: "bg-[var(--mist)] text-[var(--brand-700)] border border-[var(--mist-border)]",
  SKILL: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  PLUGIN: "bg-violet-50 text-violet-700 border border-violet-200",
  KIT: "bg-amber-50 text-amber-700 border border-amber-200",
  COLLECTION: "bg-[var(--surface-1)] text-[var(--text-3)] border border-[var(--border-2)]",
};

const TYPE_ICON: Record<StarterType, typeof ChatBubbleLeftRightIcon> = {
  PROMPT: ChatBubbleLeftRightIcon,
  SKILL: WrenchScrewdriverIcon,
  PLUGIN: PuzzlePieceIcon,
  KIT: CubeIcon,
  COLLECTION: RectangleStackIcon,
};

// Matches the client-detail "..." action menu (src/components/clients/client-detail.tsx) verbatim.
const actionMenuPanel =
  "z-50 mt-1.5 w-56 rounded-[10px] border border-[rgba(0,0,0,0.10)] bg-white p-1.5 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)] focus:outline-none";
const actionMenuItem =
  "flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[13px] font-medium text-[var(--text-2)] transition data-[focus]:bg-[var(--surface-1)] data-[focus]:text-[var(--text-1)] disabled:opacity-50";

export function StarterDetail({ starterId }: { starterId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scanId = searchParams.get("scanId");
  const { canManageStarters } = usePermissions();
  const { data: starter, isLoading } = useStarter(starterId);
  const { data: scanData } = usePulseScan(scanId ?? "");
  const scan = scanId ? scanData?.scan ?? null : null;
  const { mutate: deleteStarter } = useDeleteStarter();
  const { mutateAsync: duplicate, isPending: duplicating } = useDuplicateStarter();
  const { mutateAsync: adopt, isPending: adopting } = useAdoptStarter();
  const [editing, setEditing] = useState(false);
  // Session-only picks from the prompt editor (PROMPT/SKILL only) — threaded onto the download
  // link so the downloaded Skill resolves the same client/document/scan shown on screen.
  const [editorPicks, setEditorPicks] = useState<StarterEditorPicks>({});
  const [historyOpen, setHistoryOpen] = useState(false);

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)]" />;
  }
  if (!starter) {
    return (
      <div className="widget-card px-6 py-16 text-center">
        <p className="text-sm text-[var(--text-3)]">Starter not found.</p>
        <Link href="/app/starters" className={cn("mt-4 inline-flex", buttonStyles({ variant: "secondary", size: "sm" }))}>
          Back to library
        </Link>
      </div>
    );
  }

  if (editing) {
    return <StarterForm starter={starter} onSaved={() => setEditing(false)} />;
  }

  async function handleDuplicate() {
    const copy = await duplicate(starter!.id);
    router.push(`/app/starters/${copy.id}`);
  }

  async function handleAdopt() {
    if (!scanId) return;
    await adopt({ scanId, starterId: starter!.id });
    router.push(`/app/pulse/${scanId}`);
  }

  const whatYouGet = starter.content?.whatYouGet ?? [];
  const install = starter.content?.install ?? [];
  const techStack = starter.content?.techStack ?? [];
  const promptText = starter.content?.promptText;
  const sourceUrl = starter.content?.sourceUrl;
  const sourceLabel = starter.content?.sourceLabel;
  const isSkillLike = starter.type === "SKILL" || starter.type === "PROMPT";
  // Every Kit/Collection in the catalog now carries a promptText too (a kickoff/recommendation
  // prompt synthesized from its whatYouGet/install steps), so the live editor (insert client/doc/
  // scan data, preview + copy resolved) is available whenever there's a prompt to work with —
  // not just for SKILL/PROMPT types. isSkillLike above stays type-based: it only decides the
  // download button's label ("Add to Claude" vs "Download source"), a separate concern.
  const hasEditablePrompt = Boolean(promptText);
  // Everything except the STARTER card + the main PROMPT folds into one "OVERVIEW" card, so every
  // starter renders the same clean two-card top row regardless of which sections it happens to have.
  const hasOverview =
    Boolean(starter.description) || whatYouGet.length > 0 || install.length > 0 || techStack.length > 0;
  const downloadParams = new URLSearchParams();
  if (hasEditablePrompt) {
    if (editorPicks.clientSlug) downloadParams.set("clientSlug", editorPicks.clientSlug);
    if (editorPicks.documentId) downloadParams.set("documentId", editorPicks.documentId);
    if (editorPicks.scanId) downloadParams.set("scanId", editorPicks.scanId);
  }
  const downloadQs = downloadParams.toString();
  const downloadUrl = `/api/starters/${starter.id}/download${downloadQs ? `?${downloadQs}` : ""}`;

  const TypeIcon = TYPE_ICON[starter.type] ?? CubeIcon;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <Link
        href={scanId ? `/app/starters?scanId=${scanId}` : "/app/starters"}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-3)] transition hover:text-[var(--text-1)]"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        {scanId ? "Back to recommendations" : "Back to library"}
      </Link>

      {/* 01 // STARTER — mirrors the Portal client-record card: icon + identity + a right-side
          pill action, "…" menu for edit/duplicate/delete, and (if present) about/what-you-get/
          install/stack in a compact two-column body below. */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">01</span>
            {" // STARTER"}
          </span>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-[4px] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]",
                TYPE_TONE[starter.type] ?? TYPE_TONE.KIT,
              )}
            >
              {TYPE_LABEL[starter.type]}
            </span>
            {canManageStarters && (
              <Menu as="div" className="relative">
                <MenuButton
                  className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-[var(--border-2)] bg-white text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                  aria-label="Starter actions"
                  title="Starter actions"
                >
                  <EllipsisHorizontalIcon className="h-4 w-4" />
                </MenuButton>
                <MenuItems anchor="bottom end" className={actionMenuPanel}>
                  <MenuItem>
                    <button type="button" className={actionMenuItem} onClick={handleDuplicate} disabled={duplicating}>
                      <DocumentDuplicateIcon className="h-4 w-4 text-[var(--text-4)]" />
                      Duplicate
                    </button>
                  </MenuItem>
                  <MenuItem>
                    <button type="button" className={actionMenuItem} onClick={() => setEditing(true)}>
                      <PencilSquareIcon className="h-4 w-4 text-[var(--text-4)]" />
                      Edit
                    </button>
                  </MenuItem>
                  <MenuItem>
                    <button type="button" className={actionMenuItem} onClick={() => setHistoryOpen(true)}>
                      <ClockIcon className="h-4 w-4 text-[var(--text-4)]" />
                      Version history
                    </button>
                  </MenuItem>
                  <MenuItem>
                    <button
                      type="button"
                      className={actionMenuItem}
                      onClick={() => {
                        if (confirm("Delete this starter?")) {
                          deleteStarter(starter.id);
                          router.push("/app/starters");
                        }
                      }}
                    >
                      <TrashIcon className="h-4 w-4 text-[var(--text-4)]" />
                      Delete
                    </button>
                  </MenuItem>
                </MenuItems>
              </Menu>
            )}
          </div>
        </div>

        <div className="p-4">
          <div className="flex flex-wrap items-start gap-3.5">
            {/* Type icon */}
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px]",
                TYPE_TONE[starter.type] ?? TYPE_TONE.KIT,
              )}
            >
              <TypeIcon className="h-5 w-5" />
            </div>

            {/* Identity */}
            <div className="min-w-0 flex-1">
              <h1
                className="text-lg leading-tight tracking-[-0.02em] text-[var(--text-1)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {starter.name}
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-[var(--text-3)]">{starter.summary}</p>

              {(sourceUrl || starter.tags.length > 0) && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {sourceUrl && (
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-[var(--brand-700)] hover:underline"
                    >
                      <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                      {sourceLabel ? `Based on ${sourceLabel}` : "View & use"}
                    </a>
                  )}
                  {starter.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-3)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Right-side action stack — bottom-aligned, mirrors the Portal "Wiki →" pill. */}
            <div className="ml-auto flex shrink-0 flex-col items-end justify-end gap-1 self-stretch">
              <a
                href={downloadUrl}
                download
                className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)]"
              >
                <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                {isSkillLike ? "Add to Claude" : "Download source"}
              </a>
              <p className="text-right font-mono text-[10px] leading-4 text-[var(--text-4)]">
                {isSkillLike ? "Claude → Settings → Skills" : "Zip is your off-platform backup"}
              </p>
            </div>
          </div>

          {scan && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[var(--mist-border)] bg-[var(--mist)] px-4 py-2">
              <p className="text-xs text-[var(--text-2)]">
                Link this starter to the scan of{" "}
                <span className="font-semibold text-[var(--text-1)]">{scan.projectName || "this project"}</span>?
              </p>
              <button
                type="button"
                onClick={handleAdopt}
                disabled={adopting}
                className="inline-flex items-center gap-1.5 rounded-[6px] bg-[var(--brand-700)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                <CheckIcon className="h-4 w-4" />
                Use this starter
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {hasOverview && (
            <div className="mt-3 grid gap-x-6 gap-y-2.5 border-t border-[var(--border-2)] pt-3 sm:grid-cols-2">
              {starter.description && (
                <div className={cn(whatYouGet.length === 0 && install.length === 0 && "sm:col-span-2")}>
                  <p className="widget-data-label mb-1">About</p>
                  <Markdown compact className="space-y-3">
                    {starter.description}
                  </Markdown>
                </div>
              )}

              {(whatYouGet.length > 0 || install.length > 0) && (
                <div className="space-y-2.5">
                  {whatYouGet.length > 0 && (
                    <div>
                      <p className="widget-data-label mb-1">What you get</p>
                      <ul className="space-y-1">
                        {whatYouGet.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-2)]">
                            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-700)]" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {install.length > 0 && (
                    <div>
                      <p className="widget-data-label mb-1">Install</p>
                      <ol className="space-y-1">
                        {install.map((step, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-2)]">
                            <span className="mt-0.5 font-mono text-[11px] font-semibold text-[var(--brand-700)]">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}

              {techStack.length > 0 && (
                <div className="sm:col-span-2 flex flex-wrap items-center gap-1.5">
                  <p className="widget-data-label mr-1">Stack</p>
                  {techStack.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 font-mono text-[11px] text-[var(--text-2)]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Main piece — the actual prompt gets the full page width and the most visual weight;
          everything above is context for this. */}
      {promptText && (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">02</span>
              {" // PROMPT"}
            </span>
          </div>
          <StarterPromptEditor initialPromptText={promptText} onPicksChange={setEditorPicks} />
        </section>
      )}

      {canManageStarters && (
        <StarterVersionsModal open={historyOpen} onClose={() => setHistoryOpen(false)} starterId={starter.id} />
      )}
    </div>
  );
}
