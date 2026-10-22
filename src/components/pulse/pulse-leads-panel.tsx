"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import {
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  DocumentDuplicateIcon,
  EllipsisHorizontalIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import {
  useDeletePulseLead,
  useImportPulseLead,
  usePulseLeadPreview,
  usePulseLeads,
  useUpdatePulseLead,
} from "@/hooks/use-pulse";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Pager } from "@/components/ui/pager";
import { menuItem, menuPanel } from "@/components/ui/menu-styles";
import { ScoreRing } from "@/components/pulse/pulse-shared";
import { cn, formatDate, formatRelative } from "@/lib/format";
import { CAPTURE_LIMITS, captureFieldErrors } from "@/lib/pulse-capture";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { PulseLeadView } from "@/server/pulse-lite/leads-admin";

/** Leads per page. Matches the scan list's density. */
const PAGE_SIZE = 10;

function scoreTone(score: number | null): string {
  if (score == null) return "text-[var(--text-4)]";
  if (score >= 75) return "text-[var(--success-500)]";
  if (score >= 50) return "text-[var(--warning-500)]";
  return "text-[var(--danger-500)]";
}

// Where a scan was started, in words.
const SOURCE_LABELS: Record<string, string> = {
  "gitwork.co.uk": "gitwork.co.uk",
  "production-ready": "Sales page",
  "foundry-demo": "Demo",
  embed: "Embedded scanner",
};

function host(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function displayName(lead: { name: string | null; email: string }): string {
  return lead.name?.trim() || lead.email;
}

// ─── Report status ────────────────────────────────────────────────────────────

/** The visitor's report, in one line: what a teammate needs before replying to them. */
function ReportStatus({ report }: { report: PulseLeadView["report"] }) {
  const dot = (cls: string, pulse = false) => (
    <span className={cn("size-1.5 shrink-0 rounded-full", cls, pulse && "animate-pulse")} aria-hidden="true" />
  );
  const base = "inline-flex items-center gap-1.5 text-xs";
  switch (report.state) {
    case "sent":
      return (
        <span className={cn(base, "text-[var(--text-2)]")} title={report.sentAt ? new Date(report.sentAt).toLocaleString("en-GB") : undefined}>
          {dot("bg-[var(--success-500)]")}Sent{report.sentAt ? ` ${formatRelative(report.sentAt)}` : ""}
        </span>
      );
    case "preparing":
      return <span className={cn(base, "text-[var(--text-2)]")}>{dot("bg-[var(--brand-500)]", true)}Being prepared</span>;
    case "failed":
      return <span className={cn(base, "text-[var(--danger-500)]")} title={report.error ?? undefined}>{dot("bg-[var(--danger-500)]")}Not sent</span>;
    case "untracked":
      return (
        <span className={cn(base, "text-[var(--text-4)]")} title="This lead unlocked before Foundry recorded report emails, so there is no send record.">
          {dot("bg-[var(--text-4)]")}Before tracking
        </span>
      );
    default:
      return <span className={cn(base, "text-[var(--text-4)]")}>{dot("bg-[var(--border-1)]")}Not requested</span>;
  }
}

// ─── The full-scan action (open / running / run) ──────────────────────────────

function FullScanAction({ lead, size = "sm" }: { lead: PulseLeadView; size?: "sm" | "md" }) {
  const { mutate: importLead, isPending } = useImportPulseLead();
  if (lead.importedScanId && lead.importedScanStatus === "RUNNING") {
    // The full scan behind their report is still running; opening it now shows it mid-run,
    // which reads as "it's scanning again".
    return <Button variant="secondary" size={size} disabled title="The full scan for their report is still running">Scan running…</Button>;
  }
  if (lead.importedScanId) {
    return (
      <Link href={`/app/pulse/${lead.importedScanId}`}>
        <Button variant="secondary" size={size}>Open full scan</Button>
      </Link>
    );
  }
  return (
    <Button variant="secondary" size={size} onClick={() => importLead(lead.id)} loading={isPending} title="Runs the full scan, with the AI pass, on their site">
      Run full scan
    </Button>
  );
}

// ─── Popup: checks column ─────────────────────────────────────────────────────

const GROUPS = [
  { key: "fail", label: "Failing", statuses: ["FAIL"], dot: "bg-[var(--danger-500)]", empty: "Nothing failing." },
  { key: "warn", label: "Warnings", statuses: ["WARN"], dot: "bg-[var(--warning-500)]", empty: "No warnings." },
  { key: "unknown", label: "Not assessed", statuses: ["INCONCLUSIVE", "ERROR", "NOT_TESTED", "EVIDENCE_REQUIRED"], dot: "bg-[var(--text-4)]", empty: "Every check reached a verdict." },
  { key: "pass", label: "Passed", statuses: ["PASS"], dot: "bg-[var(--success-500)]", empty: "Nothing passed." },
] as const;
type GroupKey = (typeof GROUPS)[number]["key"];

function ChecksColumn({ checks }: { checks: PulseScanCheckInput[] }) {
  const byGroup = useMemo(() => {
    const out = {} as Record<GroupKey, PulseScanCheckInput[]>;
    for (const g of GROUPS) out[g.key] = checks.filter((c) => (g.statuses as readonly string[]).includes(c.status));
    return out;
  }, [checks]);
  // Open on the worst thing there is to see.
  const [tab, setTab] = useState<GroupKey>(() => GROUPS.find((g) => byGroup[g.key].length > 0)?.key ?? "fail");
  const group = GROUPS.find((g) => g.key === tab)!;
  const rows = byGroup[tab];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label="Checks by result" className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--border-2)] px-4 pt-3">
        {GROUPS.map((g) => {
          const active = g.key === tab;
          return (
            <button
              key={g.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(g.key)}
              className={cn(
                "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 pb-2.5 pt-1 text-xs font-medium transition",
                active ? "border-[var(--brand-600)] text-[var(--text-1)]" : "border-transparent text-[var(--text-3)] hover:text-[var(--text-1)]",
              )}
            >
              <span className={cn("size-1.5 rounded-full", g.dot)} aria-hidden="true" />
              {g.label}
              <span className="font-mono tabular-nums text-[var(--text-4)]">{byGroup[g.key].length}</span>
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto">
        {checks.length === 0 ? (
          <p className="p-6 text-sm text-[var(--text-4)]">No check data was captured for this scan.</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-[var(--text-4)]">{group.empty}</p>
        ) : (
          <ul className="divide-y divide-[var(--border-2)]">
            {rows.map((c) => (
              <li key={c.checkKey} className="px-5 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium text-[var(--text-1)]">{c.label}</p>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]">{c.category}</span>
                </div>
                {c.detail && <p className="mt-1 text-xs leading-relaxed text-[var(--text-3)]">{c.detail}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="shrink-0 border-t border-[var(--border-2)] px-5 py-2 text-[11px] text-[var(--text-4)]">
        The free scan they ran. The report they were emailed comes from a full scan, so its numbers can differ.
      </p>
    </div>
  );
}

// ─── Popup: person column ─────────────────────────────────────────────────────

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="shrink-0 rounded p-1 text-[var(--text-4)] hover:bg-[var(--surface-2)] hover:text-[var(--text-2)]"
    >
      {copied ? <CheckIcon className="size-3.5" /> : <DocumentDuplicateIcon className="size-3.5" />}
    </button>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-2 py-1.5">
      <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-4)]">{label}</dt>
      <dd className="min-w-0 text-sm text-[var(--text-2)]">{children}</dd>
    </div>
  );
}

function EditLeadForm({ lead, onDone }: { lead: PulseLeadView; onDone: () => void }) {
  const [name, setName] = useState(lead.name ?? "");
  const [business, setBusiness] = useState(lead.business ?? "");
  const [email, setEmail] = useState(lead.email);
  const { mutate: save, isPending, error } = useUpdatePulseLead();
  const errors = captureFieldErrors({ name, business, email, termsAccepted: true });
  const valid = Object.keys(errors).length === 0;
  const field = (label: string, value: string, set: (v: string) => void, err: string | undefined, max: number, type = "text") => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--text-2)]">{label}</span>
      <input type={type} value={value} maxLength={max} onChange={(e) => set(e.target.value)} aria-invalid={err ? true : undefined} className="app-input w-full" />
      {err && <span className="mt-1 block text-xs text-[var(--danger-500)]">{err}</span>}
    </label>
  );
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save({ leadId: lead.id, patch: { name, business, email } }, { onSuccess: onDone });
      }}
    >
      {field("Name", name, setName, errors.name, CAPTURE_LIMITS.name)}
      {field("Business", business, setBusiness, errors.business, CAPTURE_LIMITS.business)}
      {field("Email", email, setEmail, errors.email, CAPTURE_LIMITS.email, "email")}
      {error && <p role="alert" className="text-xs text-[var(--danger-500)]">{error instanceof Error ? error.message : "Couldn't save that."}</p>}
      <div className="flex gap-2 pt-1">
        <Button type="submit" variant="primary" size="sm" disabled={!valid} loading={isPending}>Save</Button>
        <Button type="button" variant="tertiary" size="sm" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

function DeleteLeadConfirm({ lead, onCancel, onDeleted }: { lead: PulseLeadView; onCancel: () => void; onDeleted: () => void }) {
  const { mutate: remove, isPending, error } = useDeletePulseLead();
  return (
    <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-3">
      <p className="text-sm font-medium text-[var(--text-1)]">Delete this lead?</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--text-3)]">
        {lead.email} will be able to unlock a report again. Their scans are kept.
      </p>
      {error && <p role="alert" className="mt-2 text-xs text-[var(--danger-500)]">{error instanceof Error ? error.message : "Couldn't delete it."}</p>}
      <div className="mt-3 flex gap-2">
        <Button variant="danger" size="sm" loading={isPending} onClick={() => remove(lead.id, { onSuccess: onDeleted })}>Delete lead</Button>
        <Button variant="tertiary" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

type Mode = "view" | "edit" | "delete";

function LeadModal({ lead, initialMode, onClose }: { lead: PulseLeadView | null; initialMode: Mode; onClose: () => void }) {
  const { data, isLoading } = usePulseLeadPreview(lead?.id ?? null);
  const [mode, setMode] = useState<Mode>(initialMode);
  useEffect(() => setMode(initialMode), [lead?.id, initialMode]);

  return (
    <Modal open={lead != null} onClose={onClose} title="Pulse lead" panelClassName="max-w-3xl">
      {lead && (
        <div className="grid h-[min(560px,80vh)] grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] md:overflow-hidden">
          {/* Who they are, and everything you can do about them. */}
          <aside className="flex min-h-0 flex-col border-b border-[var(--border-2)] bg-[var(--surface-1)] md:overflow-y-auto md:border-b-0 md:border-r">
            <div className="flex items-center gap-4 px-5 pb-4 pt-5">
              <ScoreRing score={lead.healthScore ?? 0} size={68} />
              <div className="min-w-0">
                <p className="truncate font-display text-2xl leading-tight text-[var(--text-1)]" title={displayName(lead)}>{displayName(lead)}</p>
                {lead.business && <p className="truncate text-sm text-[var(--text-3)]" title={lead.business}>{lead.business}</p>}
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-4)]">Free scan score</p>
              </div>
            </div>

            <div className="px-5 pb-5">
              {mode === "edit" ? (
                <EditLeadForm lead={lead} onDone={() => setMode("view")} />
              ) : (
                <>
                  <dl className="border-y border-[var(--border-2)] py-2">
                    <Detail label="Email">
                      <span className="flex min-w-0 items-center gap-1">
                        <a href={`mailto:${lead.email}`} className="truncate text-[var(--brand-600)] hover:underline" title={lead.email}>{lead.email}</a>
                        <CopyButton value={lead.email} label="Copy email address" />
                      </span>
                    </Detail>
                    <Detail label="Site">
                      <a href={lead.targetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 hover:underline" title={lead.targetUrl}>
                        <span className="truncate">{host(lead.targetUrl)}</span>
                        <ArrowTopRightOnSquareIcon className="size-3 shrink-0 text-[var(--text-4)]" aria-hidden="true" />
                      </a>
                    </Detail>
                    <Detail label="Came from">{SOURCE_LABELS[lead.source] ?? lead.source}</Detail>
                    <Detail label="Received"><span title={new Date(lead.createdAt).toLocaleString("en-GB")}>{formatDate(lead.createdAt)}</span></Detail>
                    <Detail label="Report"><ReportStatus report={lead.report} /></Detail>
                  </dl>
                  {lead.report.state === "failed" && lead.report.error && (
                    <p className="mt-2 text-xs leading-relaxed text-[var(--danger-500)]">{lead.report.error}</p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <a href={`mailto:${lead.email}?subject=${encodeURIComponent(`Your Pulse report for ${host(lead.targetUrl)}`)}`}>
                      <Button variant="primary" size="sm">Email {lead.name?.trim().split(/\s+/)[0] ?? "them"}</Button>
                    </a>
                    <FullScanAction lead={lead} />
                  </div>

                  <div className="mt-5">
                    {mode === "delete" ? (
                      <DeleteLeadConfirm lead={lead} onCancel={() => setMode("view")} onDeleted={onClose} />
                    ) : (
                      <div className="flex gap-4 text-xs">
                        <button type="button" className="text-[var(--text-3)] hover:text-[var(--text-1)]" onClick={() => setMode("edit")}>Edit details</button>
                        <button type="button" className="text-[var(--danger-500)] hover:underline" onClick={() => setMode("delete")}>Delete lead</button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </aside>

          {/* What their free scan found. */}
          <section className="flex min-h-[320px] flex-col md:min-h-0">
            {isLoading || !data ? (
              <p className="p-6 text-sm text-[var(--text-4)]">Loading the scan…</p>
            ) : (
              <ChecksColumn key={lead.id} checks={data.checks} />
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

// ─── The list ─────────────────────────────────────────────────────────────────

export function PulseLeadsPanel() {
  const { data, isLoading } = usePulseLeads();
  const [open, setOpen] = useState<{ id: string; mode: Mode } | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const leads = useMemo(() => data?.leads ?? [], [data]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) =>
      [l.name, l.business, l.email, l.targetUrl].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [leads, query]);

  // Back to page 1 when the search changes; a page past the end falls back to the last one.
  useEffect(() => setPage(0), [query]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const openLead = open ? leads.find((l) => l.id === open.id) ?? null : null;

  if (isLoading || leads.length === 0) return null; // quietly absent until leads exist

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-[var(--text-1)]">Pulse leads</p>
          <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-xs font-medium tabular-nums text-[var(--text-3)]">{leads.length}</span>
        </div>
        <label className="relative w-full sm:w-64">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--text-4)]" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search leads"
            aria-label="Search leads by name, business, email or site"
            className="app-input w-full pl-8 text-sm"
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)]">
        <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_56px_128px_88px_40px] items-center gap-3 border-b border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-4)] md:grid">
          <span>Lead</span>
          <span>Site</span>
          <span className="text-right">Score</span>
          <span>Report</span>
          <span>Received</span>
          <span className="sr-only">Actions</span>
        </div>

        {visible.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--text-4)]">No leads match “{query}”.</p>
        ) : (
          <ul className="divide-y divide-[var(--border-2)]">
            {visible.map((lead) => (
              <li
                key={lead.id}
                className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-[var(--surface-1)] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_56px_128px_88px_40px]"
                onClick={() => setOpen({ id: lead.id, mode: "view" })}
              >
                <div className="min-w-0">
                  <button
                    type="button"
                    className="block max-w-full truncate text-left text-sm font-medium text-[var(--text-1)] focus-visible:underline"
                    title={lead.email}
                    onClick={(e) => { e.stopPropagation(); setOpen({ id: lead.id, mode: "view" }); }}
                  >
                    {displayName(lead)}
                  </button>
                  <p className="truncate text-xs text-[var(--text-4)]" title={[lead.business, lead.name ? lead.email : null].filter(Boolean).join(" · ")}>
                    {[lead.business, lead.name ? lead.email : null].filter(Boolean).join(" · ") || "No business given"}
                  </p>
                </div>
                <div className="hidden min-w-0 md:block">
                  <p className="truncate text-sm text-[var(--text-2)]" title={lead.targetUrl}>{host(lead.targetUrl)}</p>
                  <p className="truncate text-xs text-[var(--text-4)]">{SOURCE_LABELS[lead.source] ?? lead.source}</p>
                </div>
                <span className={cn("hidden text-right font-display text-xl tabular-nums md:block", scoreTone(lead.healthScore))} title="Free scan score">
                  {lead.healthScore ?? "–"}
                </span>
                <span className="hidden md:block"><ReportStatus report={lead.report} /></span>
                <span className="hidden text-xs text-[var(--text-3)] md:block" title={new Date(lead.createdAt).toLocaleString("en-GB")}>{formatRelative(lead.createdAt)}</span>

                {/* Phone: score and report under the name. */}
                <div className="flex items-center gap-3 md:hidden">
                  <span className={cn("font-display text-base tabular-nums", scoreTone(lead.healthScore))}>{lead.healthScore ?? "–"}</span>
                  <ReportStatus report={lead.report} />
                </div>

                <div className="col-start-2 row-span-2 row-start-1 flex justify-end md:col-start-auto md:row-span-1 md:row-start-auto" onClick={(e) => e.stopPropagation()}>
                  <Menu>
                    <MenuButton className="rounded-[6px] p-1.5 text-[var(--text-4)] hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]" aria-label={`Actions for ${displayName(lead)}`}>
                      <EllipsisHorizontalIcon className="size-5" />
                    </MenuButton>
                    <MenuItems anchor="bottom end" className={cn(menuPanel, "w-44")}>
                      <MenuItem>
                        <button type="button" className={menuItem} onClick={() => setOpen({ id: lead.id, mode: "view" })}>View lead</button>
                      </MenuItem>
                      <MenuItem>
                        <button type="button" className={menuItem} onClick={() => setOpen({ id: lead.id, mode: "edit" })}>Edit details</button>
                      </MenuItem>
                      <MenuItem>
                        <a className={menuItem} href={`mailto:${lead.email}`}>Email them</a>
                      </MenuItem>
                      <MenuItem>
                        <button type="button" className={cn(menuItem, "text-[var(--danger-500)]")} onClick={() => setOpen({ id: lead.id, mode: "delete" })}>Delete lead</button>
                      </MenuItem>
                    </MenuItems>
                  </Menu>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {filtered.length > PAGE_SIZE && (
        <Pager page={current} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} label="Lead pages" />
      )}

      <LeadModal lead={openLead} initialMode={open?.mode ?? "view"} onClose={() => setOpen(null)} />
    </div>
  );
}
