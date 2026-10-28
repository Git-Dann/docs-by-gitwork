"use client";

/**
 * The one list of what a scan found, and what the team is doing about each item.
 *
 * Rules in src/lib/pulse-findings.ts. A finding is a failing or warning check; the
 * team can send it to the client's board, accept the risk, or mark it not a real issue,
 * and those decisions carry to the next scan of the same project. Fixed is derived: a
 * check that passes now, after failing before.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { ChevronDownIcon, EllipsisHorizontalIcon } from "@heroicons/react/20/solid";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { menuItem, menuPanel } from "@/components/ui/menu-styles";
import { usePulseFindings, useSendPulseFindingToBoard, useSetPulseFindingDecision } from "@/hooks/use-pulse";
import { rankFindings } from "@/server/pulse-checks/priority";
import {
  FINDING_VIEWS,
  buildFindings,
  compareFindings,
  countByView,
  findingTaskHref,
  stageLabel,
  type Finding,
  type FindingDecision,
  type FindingView,
} from "@/lib/pulse-findings";
import { cn, formatRelative } from "@/lib/format";
import type { PulseScanCheckRecord, PulseScanDiff } from "@/types/pulse";

type Check = PulseScanCheckRecord;

/** Rows shown before "Show more": a real scan has 50 to 100 open findings. */
const PAGE = 25;

const STAGE_TONE: Record<string, string> = {
  open: "",
  task_done: "text-[var(--danger-500)]",
  in_progress: "text-[var(--brand-600)]",
  fixed: "text-[var(--success-500)]",
  accepted: "text-[var(--text-3)]",
  false_positive: "text-[var(--text-3)]",
  unchecked: "text-[var(--text-3)]",
};

const TIER_TONE: Record<string, string> = {
  P1: "bg-[var(--danger-50)] text-[var(--danger-500)] border-[var(--danger-500)]/30",
  P2: "bg-[var(--warning-50)] text-[var(--warning-500)] border-[var(--warning-500)]/30",
  P3: "bg-[var(--surface-1)] text-[var(--text-3)] border-[var(--border-2)]",
};

export function PulseFindings({
  scanId,
  clientId,
  checks,
  diff,
  canManage,
  num,
  onShowAllChecks,
}: {
  scanId: string;
  clientId: string | null;
  checks: Check[];
  diff: PulseScanDiff | null;
  canManage: boolean;
  num: string;
  onShowAllChecks: () => void;
}) {
  const { data } = usePulseFindings(scanId);
  const decide = useSetPulseFindingDecision(scanId);
  const send = useSendPulseFindingToBoard(scanId);
  const [view, setView] = useState<FindingView>("open");
  const [open, setOpen] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ check: Check; decision: FindingDecision } | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const { findings, rank, tierOf } = useMemo(() => {
    const ranked = rankFindings(checks);
    const score = new Map(ranked.map((r) => [r.check.checkKey, r.priority.score]));
    const tier = new Map(ranked.map((r) => [r.check.checkKey, r.priority.tier]));
    const previouslyAdverse = new Set((diff?.fixed ?? []).map((d) => d.checkKey));
    return {
      findings: buildFindings(checks, data?.states ?? [], data?.tasks ?? [], previouslyAdverse),
      rank: (k: string) => score.get(k) ?? 0,
      tierOf: (k: string) => tier.get(k) ?? null,
    };
  }, [checks, data, diff]);

  const counts = countByView(findings);
  const stages = FINDING_VIEWS.find((v) => v.id === view)!.stages;
  const visible = findings.filter((f) => stages.includes(f.stage)).sort((a, b) => compareFindings(a, b, rank));

  async function run(key: string, fn: () => Promise<unknown>) {
    setError(null);
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="widget-header-label">{`${num} // FINDINGS`}</span>
        {/* The view tabs below carry the same counts; on a phone this line would be cut off. */}
        <span className="widget-header-right hidden sm:inline">
          {counts.open} open · {counts.in_progress} on the board · {counts.fixed} fixed
        </span>
      </div>
      <div className="widget-body space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="tablist" aria-label="Findings" className="flex flex-wrap gap-1 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-1">
            {FINDING_VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={view === v.id}
                onClick={() => { setView(v.id); setLimit(PAGE); }}
                className={cn(
                  "flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.04em] transition",
                  view === v.id
                    ? "bg-[var(--surface-0)] text-[var(--brand-700)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    : "text-[var(--text-3)] hover:text-[var(--text-1)]",
                )}
              >
                {v.label}
                <span className="rounded-[4px] bg-[var(--surface-2)] px-1 tabular-nums text-[var(--text-3)]">{counts[v.id]}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={onShowAllChecks} className="text-xs text-[var(--brand-600)] hover:underline">
            Every check by category →
          </button>
        </div>

        {!clientId && canManage && counts.open > 0 && (
          <p className="text-xs leading-5 text-[var(--text-3)]">
            Link this scan to a client to send findings to their board.
          </p>
        )}
        {error && <p role="alert" className="text-xs text-[var(--danger-500)]">{error}</p>}

        {visible.length === 0 ? (
          <p className="rounded-[8px] border border-dashed border-[var(--border-2)] px-3 py-6 text-center text-sm text-[var(--text-3)]">
            {EMPTY[view]}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border-2)] rounded-[8px] border border-[var(--border-2)]">
            {visible.slice(0, limit).map((f) => {
              const key = f.check.checkKey;
              const tier = tierOf(key);
              const expanded = open === key;
              const taskHref = f.task ? findingTaskHref(f.task) : null;
              return (
                <li key={key} className="px-3 py-2.5">
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-2 sm:flex-nowrap">
                    <span className={cn("mt-0.5 w-7 shrink-0 rounded-[4px] border text-center font-mono text-[10px] font-semibold leading-5", tier ? TIER_TONE[tier] : "border-transparent text-[var(--text-4)]")}>
                      {tier ?? "·"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setOpen(expanded ? null : key)}
                      aria-expanded={expanded}
                      // Full width beside the tier chip on a phone, so the actions drop to their own line.
                      className="min-w-0 flex-1 basis-[calc(100%-2.5rem)] text-left sm:basis-auto"
                    >
                      <span className="flex items-start gap-1.5 text-sm font-medium text-[var(--text-1)]">
                        <span className="min-w-0">{f.check.label}</span>
                        <ChevronDownIcon aria-hidden className={cn("mt-0.5 h-4 w-4 shrink-0 text-[var(--text-4)] transition", expanded && "rotate-180")} />
                      </span>
                      <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-4)]">
                        {f.check.category} · <span className={STAGE_TONE[f.stage]}>{stageLabel(f)}</span>
                        {f.task?.assigneeName ? ` · ${f.task.assigneeName}` : ""}
                      </span>
                    </button>
                    {(canManage || taskHref) && (
                      <div className="flex shrink-0 items-center gap-1.5 pl-10 sm:pl-0">
                        {taskHref && (
                          <Link href={taskHref} className="whitespace-nowrap text-xs text-[var(--brand-600)] hover:underline" title={f.task?.title}>
                            View task
                          </Link>
                        )}
                        {canManage && f.stage === "open" && clientId && (
                          <Button size="xs" variant="secondary" disabled={busy === key} onClick={() => run(key, () => send.mutateAsync(key))}>
                            {busy === key ? "Sending…" : "Send to board"}
                          </Button>
                        )}
                        {canManage && (
                          <FindingMenu
                            finding={f}
                            onDecide={(decision) => { setNote(""); setDialog({ check: f.check, decision }); }}
                            onReopen={() => run(key, () => decide.mutateAsync({ checkKey: key, decision: null }))}
                          />
                        )}
                      </div>
                    )}
                  </div>
                  {expanded && (
                    <div className="mt-2 space-y-2 pl-10 text-sm leading-6 text-[var(--text-2)]">
                      {f.check.detail && <p>{f.check.detail}</p>}
                      {f.check.evidence && (
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-[6px] bg-[var(--surface-1)] p-2 font-mono text-[11px] leading-5 text-[var(--text-3)]">{f.check.evidence}</pre>
                      )}
                      {f.state?.decision && (
                        <p className="text-xs text-[var(--text-3)]">
                          {f.state.decision === "ACCEPTED_RISK" ? "Risk accepted" : "Marked not a real issue"}
                          {f.state.decidedByName ? ` by ${f.state.decidedByName}` : ""}
                          {f.state.decidedAt ? `, ${formatRelative(f.state.decidedAt)}` : ""}
                          {f.state.note ? `: "${f.state.note}"` : "."}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {visible.length > limit && (
          <button type="button" onClick={() => setLimit((n) => n + PAGE)} className="w-full rounded-[8px] border border-[var(--border-2)] py-2 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-3)] hover:text-[var(--text-1)]">
            Show {Math.min(PAGE, visible.length - limit)} more of {visible.length - limit}
          </button>
        )}

        {view === "dismissed" && visible.length > 0 && (
          <p className="text-xs leading-5 text-[var(--text-3)]">
            Dismissed findings still count in the score, which measures what Pulse found, not what was decided about it.
          </p>
        )}
      </div>

      <Modal open={Boolean(dialog)} onClose={() => setDialog(null)} title={dialog?.decision === "ACCEPTED_RISK" ? "Accept the risk" : "Not a real issue"}>
        {dialog && (
          <div className="widget-body space-y-3">
            <p className="text-sm text-[var(--text-2)]">
              <span className="font-medium text-[var(--text-1)]">{dialog.check.label}</span>
              {dialog.decision === "ACCEPTED_RISK"
                ? " moves to Dismissed for this project and stays there on later scans. Say why, so the next person can see the reasoning."
                : " moves to Dismissed for this project and stays there on later scans. Say what Pulse got wrong, so the check can be fixed."}
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={dialog.decision === "ACCEPTED_RISK" ? "Why it is acceptable" : "What Pulse got wrong"}
              className="app-input w-full px-3 py-2 text-base sm:text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={busy === dialog.check.checkKey}
                onClick={() => {
                  const d = dialog;
                  void run(d.check.checkKey, async () => {
                    await decide.mutateAsync({ checkKey: d.check.checkKey, decision: d.decision, note: note.trim() || null });
                    setDialog(null);
                  });
                }}
              >
                {dialog.decision === "ACCEPTED_RISK" ? "Accept risk" : "Dismiss"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

const EMPTY: Record<FindingView, string> = {
  open: "Nothing open. Every failing or warning check is on the board, fixed or dismissed.",
  in_progress: "Nothing has been sent to the board yet.",
  fixed: "Nothing fixed since the last scan yet. A finding moves here when a later scan passes it.",
  dismissed: "Nothing dismissed.",
  unchecked: "Pulse could check everything it looked at.",
};

function FindingMenu({ finding, onDecide, onReopen }: { finding: Finding; onDecide: (d: FindingDecision) => void; onReopen: () => void }) {
  const adverse = ["open", "in_progress", "task_done"].includes(finding.stage);
  const dismissed = finding.stage === "accepted" || finding.stage === "false_positive";
  if (!adverse && !dismissed) return null;
  return (
    <Menu>
      <MenuButton aria-label={`More actions for ${finding.check.label}`} className="rounded-[6px] p-1 text-[var(--text-3)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]">
        <EllipsisHorizontalIcon className="h-4 w-4" />
      </MenuButton>
      <MenuItems anchor="bottom end" className={cn(menuPanel, "min-w-[12rem]")}>
        {adverse && (
          <>
            <MenuItem><button type="button" className={menuItem} onClick={() => onDecide("ACCEPTED_RISK")}>Accept the risk…</button></MenuItem>
            <MenuItem><button type="button" className={menuItem} onClick={() => onDecide("FALSE_POSITIVE")}>Not a real issue…</button></MenuItem>
          </>
        )}
        {dismissed && (
          <MenuItem><button type="button" className={menuItem} onClick={onReopen}>Reopen</button></MenuItem>
        )}
      </MenuItems>
    </Menu>
  );
}
