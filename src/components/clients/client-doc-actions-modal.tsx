"use client";

/**
 * Portal document-actions popup.
 *
 * Clicking a doc in the client-detail "Documents" table opens this fixed-width popup instead of
 * jumping straight into the builder. It offers a few clean actions: open the doc in Docs
 * (view/edit), open the client-facing share page, and Add / Remove it from the client's wiki. When
 * added, the doc is shared (so the link resolves) and mirrored onto the client's wiki view-only
 * Documents page.
 */

import { useState } from "react";
import Link from "next/link";
import {
  PencilSquareIcon,
  ArrowTopRightOnSquareIcon,
  BookOpenIcon,
  CheckCircleIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/status-badge";
import { useAddDocToWiki, useRemoveDocFromWiki } from "@/hooks/use-wiki";
import type { ProposalListItem } from "@/types/proposal";

const DOC_TYPE_LABEL: Record<string, string> = {
  PROPOSAL: "Proposal",
  SLA: "Service Level Agreement",
  SOW: "Statement of Work",
  MSA: "Master Service Agreement",
  NDA: "Non-Disclosure Agreement",
  CO: "Change Order",
  DSA: "Data Sharing Agreement",
  HANDOVER: "Handover",
  REPORT: "Report",
  BRIEF: "Brief",
  OTHER: "Document",
};

function ActionRow({
  icon: Icon,
  label,
  hint,
  trailing,
  href,
  external,
  onClick,
  disabled,
  tint = "rgba(0,0,0,0.05)",
  color = "var(--text-2)",
}: {
  icon: typeof BookOpenIcon;
  label: string;
  hint?: string;
  trailing?: React.ReactNode;
  href?: string;
  external?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  tint?: string;
  color?: string;
}) {
  const inner = (
    <>
      <span
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px]"
        style={{ background: tint, color }}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[14px] font-medium text-[var(--text-1)]">{label}</span>
        {hint ? <span className="block truncate text-[12px] text-[var(--text-4)]">{hint}</span> : null}
      </span>
      {trailing}
    </>
  );

  const cls =
    "flex w-full items-center gap-3 rounded-[10px] border border-[var(--border-2)] bg-white px-3 py-3 text-left transition hover:border-[var(--border-1)] hover:bg-[var(--surface-1)] disabled:opacity-50";

  if (href && !disabled) {
    return (
      <Link
        href={href}
        {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
        onClick={onClick}
        className={cls}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  );
}

export function ClientDocActionsModal({
  slug,
  proposal,
  canManage,
  onClose,
}: {
  slug: string;
  /** The doc whose actions are shown, or null when the popup is closed. */
  proposal: ProposalListItem | null;
  /** Gates the Add/Remove-to-wiki writes. */
  canManage: boolean;
  onClose: () => void;
}) {
  const addToWiki = useAddDocToWiki(slug);
  const removeFromWiki = useRemoveDocFromWiki(slug);
  const [error, setError] = useState<string | null>(null);

  const shared = Boolean(proposal?.isShared && proposal?.shareToken);
  const inWiki = Boolean(proposal?.inWiki);
  const busy = addToWiki.isPending || removeFromWiki.isPending;

  async function toggleWiki() {
    if (!proposal) return;
    setError(null);
    try {
      if (inWiki) {
        await removeFromWiki.mutateAsync(proposal.id);
      } else {
        await addToWiki.mutateAsync(proposal.id);
      }
    } catch {
      setError(inWiki ? "Couldn't remove from the wiki." : "Couldn't add to the wiki.");
    }
  }

  const typeLabel = proposal ? (DOC_TYPE_LABEL[proposal.documentType] ?? "Document") : "";

  return (
    <Modal open={Boolean(proposal)} onClose={onClose} panelClassName="w-full max-w-md">
      {proposal ? (
        <div>
          <div className="widget-header">
            <span className="widget-header-label truncate">{proposal.title}</span>
          </div>
          <div className="space-y-3 p-5">
            <div className="flex items-center gap-2 text-[12px] text-[var(--text-4)]">
              <span className="font-mono uppercase tracking-[0.08em]">{typeLabel}</span>
              <span aria-hidden>·</span>
              <StatusBadge status={proposal.status} />
            </div>

            <div className="space-y-2">
              <ActionRow
                icon={PencilSquareIcon}
                label="Open in Docs"
                hint="View and edit the full document"
                href={`/app/docs/${proposal.id}`}
                onClick={onClose}
                tint="rgba(37,99,235,0.10)"
                color="#1D4ED8"
                trailing={<ArrowTopRightOnSquareIcon className="h-4 w-4 shrink-0 text-[var(--text-4)]" />}
              />

              <ActionRow
                icon={BookOpenIcon}
                label="View share page"
                hint={shared ? "Open the client-facing view (with PDF download)" : "Not shared yet — add to the wiki or share it from the editor"}
                href={shared ? `/docs/${proposal.shareToken}` : undefined}
                external
                disabled={!shared}
                tint="rgba(0,0,0,0.05)"
                color="var(--text-2)"
                trailing={
                  shared ? (
                    <ArrowTopRightOnSquareIcon className="h-4 w-4 shrink-0 text-[var(--text-4)]" />
                  ) : undefined
                }
              />

              {canManage ? (
                <ActionRow
                  icon={inWiki ? CheckCircleIcon : PlusIcon}
                  label={inWiki ? "Remove from wiki" : "Add to wiki"}
                  hint={
                    inWiki
                      ? "Showing on the client's wiki documents page"
                      : "Show this doc on the client's wiki (view-only)"
                  }
                  onClick={toggleWiki}
                  disabled={busy}
                  tint={inWiki ? "rgba(16,185,129,0.12)" : "rgba(107,82,255,0.10)"}
                  color={inWiki ? "#059669" : "#6B52FF"}
                  trailing={
                    <span className="shrink-0 text-[12px] font-medium text-[var(--text-4)]">
                      {busy ? "…" : inWiki ? "Added" : ""}
                    </span>
                  }
                />
              ) : null}

              {error ? <p className="text-[12px] text-rose-600">{error}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
