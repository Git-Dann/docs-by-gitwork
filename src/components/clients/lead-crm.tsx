"use client";

/**
 * The lead CRM — pipeline, next steps, automation and activity on a lead's detail page.
 *
 * The rules live in src/lib/crm/lead-stage-engine.ts. This file only presents them, and it is
 * built so a person can always tell WHY a lead is where it is: every automatic move shows its
 * evidence, every suggestion shows what it was read from, and a stage set by hand says it is
 * pinned (automation won't touch it) with one click to resume.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeftIcon,
  ArrowPathIcon,
  ArrowUpRightIcon,
  CheckIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  FlagIcon,
  LockClosedIcon,
  PencilSquareIcon,
  PhoneIcon,
  SparklesIcon,
  TrashIcon,
  UsersIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate } from "@/lib/format";
import { LEAD_STAGES, STAGE_LABEL, STAGE_TRIGGER, isLadderStage } from "@/lib/crm/lead-stage-engine";
import { useAddClientTouchpoint, useUpdateClient } from "@/hooks/use-proposals";
import {
  useConvertLead,
  useConvertPreview,
  useCreateLeadAction,
  useDeleteLeadAction,
  useLeadCrm,
  useResolveCrmSuggestion,
  useSetMyCrmMailbox,
  useSyncLeadCrm,
  useUpdateLeadAction,
  useUpdateLeadCrm,
} from "@/hooks/use-crm";
import { usePreviewProjectPlan, useSeedProjectPlan } from "@/hooks/use-foundry-automation";
import type { ClientDetailRecord, ClientTouchpoint, LeadStage, TouchpointType } from "@/types/client";
import type { LeadActionDTO, LeadCrmStatus } from "@/types/crm";
import type { ProjectPlanPreview } from "@/types/foundry-automation";

/** A lead is re-synced on open when its last full sync is older than this. */
const STALE_SYNC_MS = 30 * 60_000;
const LADDER = LEAD_STAGES.filter((s) => isLadderStage(s));

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

function Header({ number, label, children }: { number: string; label: string; children?: React.ReactNode }) {
  return (
    <div className="widget-header">
      <span className="widget-header__label">
        <span className="widget-header__label--number">{number}</span>
        {` // ${label}`}
      </span>
      {children}
    </div>
  );
}

/** Mono-caps status chip in the widget-header voice. */
function Chip({ tone, children, title }: { tone: "brand" | "muted" | "warn"; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
        tone === "brand" && "border-[var(--mist-border)] bg-[var(--mist)] text-[var(--brand-700)]",
        tone === "muted" && "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-3)]",
        tone === "warn" && "border-amber-200 bg-amber-50 text-amber-800",
      )}
      style={{ fontFamily: "var(--font-mono)" }}
    >
      {children}
    </span>
  );
}

// ── Top-level ────────────────────────────────────────────────────────────────

export function LeadCrm({
  slug,
  client,
  touchpoints,
  canManage,
}: {
  slug: string;
  client: ClientDetailRecord["client"];
  touchpoints: ClientTouchpoint[];
  canManage: boolean;
}) {
  const { data: crm } = useLeadCrm(slug);
  const sync = useSyncLeadCrm(slug);
  const autoSynced = useRef(false);

  // Keep an automated lead current without anyone pressing anything: if it hasn't fully synced
  // for a while, sync once when the page opens. The scheduled job covers leads nobody opens.
  useEffect(() => {
    if (!crm || !canManage || autoSynced.current || !crm.enabled || crm.syncing) return;
    const stale = !crm.lastSyncedAt || Date.now() - new Date(crm.lastSyncedAt).getTime() > STALE_SYNC_MS;
    if (!stale) return;
    autoSynced.current = true;
    sync.mutate();
  }, [crm, canManage, sync]);

  return (
    <>
      <PipelineCard slug={slug} client={client} crm={crm} touchpoints={touchpoints} canManage={canManage} />
      <div className="grid gap-4 lg:grid-cols-2">
        <NextStepsCard slug={slug} crm={crm} canManage={canManage} />
        <AutomationCard slug={slug} crm={crm} canManage={canManage} syncing={sync.isPending} onSync={() => sync.mutate()} syncError={sync.error} />
      </div>
      <ActivityCard slug={slug} touchpoints={touchpoints} canManage={canManage} />
    </>
  );
}

// ── 02 // PIPELINE ───────────────────────────────────────────────────────────

function PipelineCard({
  slug,
  client,
  crm,
  touchpoints,
  canManage,
}: {
  slug: string;
  client: ClientDetailRecord["client"];
  crm: LeadCrmStatus | undefined;
  touchpoints: ClientTouchpoint[];
  canManage: boolean;
}) {
  const update = useUpdateClient(slug);
  const updateCrm = useUpdateLeadCrm(slug);
  const resolve = useResolveCrmSuggestion(slug);
  const { error: toastError } = useToast();
  const [source, setSource] = useState(client.leadSource ?? "");
  const [value, setValue] = useState(client.leadValue != null ? String(client.leadValue) : "");

  const stage: LeadStage = crm?.stage ?? client.leadStage ?? "NEW";
  const ladderIndex = LADDER.indexOf(stage);
  const outcome = isLadderStage(stage) ? null : stage;
  const lastMove = touchpoints.find((t) => t.type === "STAGE");
  const trigger = STAGE_TRIGGER[stage];

  const saveSource = () => {
    const next = source.trim();
    if ((client.leadSource ?? "") !== next) update.mutate({ leadSource: next || null });
  };
  const saveValue = () => {
    const next = value.trim() ? Number(value) : null;
    if ((client.leadValue ?? null) !== next) update.mutate({ leadValue: next });
  };

  return (
    <section className="widget-card">
      <Header number="02" label="PIPELINE">
        <div className="flex items-center gap-2">
          {crm?.enabled && !crm.pinned ? (
            <Chip tone="brand" title="Moves on emails, meetings, proposals and contracts">
              <SparklesIcon className="h-3 w-3" /> Auto
            </Chip>
          ) : null}
          {crm?.pinned ? (
            <>
              <Chip tone="muted" title="Set by hand — automation won't move it">
                <LockClosedIcon className="h-3 w-3" /> Pinned
              </Chip>
              {canManage && crm.enabled ? (
                <Button
                  type="button"
                  variant="tertiary"
                  size="xs"
                  onClick={() => updateCrm.mutate({ pinned: false }, { onError: (e) => toastError(errorText(e)) })}
                  disabled={updateCrm.isPending}
                >
                  Resume automation
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </Header>

      <div className="space-y-5 p-6">
        {/* Stage track — the ladder as segments, outcomes as a chip. */}
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--text-1)]">
              {STAGE_LABEL[stage]}
            </p>
            <span className="widget-data-label shrink-0">
              {outcome ? "Outcome" : `Stage ${ladderIndex + 1} of ${LADDER.length}`}
            </span>
          </div>
          <ol className="mt-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${LADDER.length}, minmax(0, 1fr))` }}>
            {LADDER.map((s, i) => {
              const reached = outcome === "WON" || (ladderIndex >= 0 && i <= ladderIndex);
              return (
                <li key={s} title={STAGE_LABEL[s]} className="min-w-0">
                  <span
                    className={cn(
                      "block h-1.5 rounded-full",
                      reached
                        ? outcome === "WON"
                          ? "bg-emerald-500"
                          : "bg-[var(--brand-700)]"
                        : "bg-[var(--surface-2)]",
                    )}
                  />
                  <span
                    className="mt-1.5 hidden truncate text-[10px] uppercase tracking-[0.06em] text-[var(--text-4)] lg:block"
                    style={{ fontFamily: "var(--font-mono)" }}
                    title={STAGE_LABEL[s]}
                  >
                    {STAGE_LABEL[s]}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-[13px] text-[var(--text-3)]">
            {lastMove?.note ? (
              <>
                {lastMove.note}
                <span className="text-[var(--text-4)]"> · {formatDate(lastMove.occurredAt)}</span>
              </>
            ) : (
              <>
                <span className="font-medium text-[var(--text-2)]">How a lead reaches {STAGE_LABEL[stage]}:</span>{" "}
                {trigger.when}
                {trigger.how === "suggestion" ? " (suggested, needs a click)" : trigger.how === "fact" ? " (automatic)" : ""}.
              </>
            )}
          </p>
        </div>

        {/* Suggestions read from wording — never applied without a click. */}
        {crm && crm.suggestions.length > 0 ? (
          <ul className="space-y-2">
            {crm.suggestions.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-3 rounded-[8px] border border-[var(--mist-border)] bg-[var(--mist)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm text-[var(--text-1)]">
                    <span className="widget-data-label mr-2 text-[var(--brand-700)]">Suggested</span>
                    Move to <span className="font-semibold">{STAGE_LABEL[s.stage]}</span>
                  </p>
                  {s.reason ? <p className="mt-0.5 text-[13px] text-[var(--text-3)]">{s.reason}</p> : null}
                  <p className="mt-0.5 text-[11px] text-[var(--text-4)]">
                    From {s.direction === "internal" ? "internal Slack" : s.direction === "inbound" ? "an email from them" : "an email from us"} ·{" "}
                    {formatDate(s.occurredAt)}
                  </p>
                </div>
                {canManage ? (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      size="xs"
                      disabled={resolve.isPending}
                      onClick={() => resolve.mutate({ id: s.id, action: "accept" }, { onError: (e) => toastError(errorText(e)) })}
                    >
                      <CheckIcon className="h-3 w-3" /> Accept
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      disabled={resolve.isPending}
                      onClick={() => resolve.mutate({ id: s.id, action: "dismiss" }, { onError: (e) => toastError(errorText(e)) })}
                    >
                      Dismiss
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="widget-data-label mb-1.5 block">Stage</span>
            <select
              value={stage}
              disabled={!canManage}
              onChange={(e) => update.mutate({ leadStage: e.target.value as LeadStage })}
              className="app-select w-full"
              title={crm?.enabled ? "Setting the stage by hand pins it — automation stops moving it until you resume" : undefined}
            >
              {LEAD_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="widget-data-label mb-1.5 block">Owner</span>
            <select
              value={crm?.owner?.id ?? ""}
              disabled={!canManage || !crm}
              onChange={(e) => updateCrm.mutate({ ownerId: e.target.value || null }, { onError: (err) => toastError(errorText(err)) })}
              className="app-select w-full"
            >
              <option value="">Nobody yet</option>
              {crm?.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="widget-data-label mb-1.5 block">Source</span>
            <input
              value={source}
              disabled={!canManage}
              onChange={(e) => setSource(e.target.value)}
              onBlur={saveSource}
              className="app-input w-full"
              placeholder="Referral, inbound…"
            />
          </label>
          <label className="block">
            <span className="widget-data-label mb-1.5 block">Est. value (£)</span>
            <input
              value={value}
              disabled={!canManage}
              onChange={(e) => setValue(e.target.value)}
              onBlur={saveValue}
              type="number"
              min="0"
              className="app-input w-full"
            />
          </label>
        </div>
      </div>
    </section>
  );
}

// ── 03 // NEXT STEPS ─────────────────────────────────────────────────────────

function dueTone(dueAt: string | null): "overdue" | "today" | "later" | null {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  const today = new Date();
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const nowDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (dueDay < nowDay) return "overdue";
  if (dueDay === nowDay) return "today";
  return "later";
}

function DueLabel({ dueAt }: { dueAt: string | null }) {
  const tone = dueTone(dueAt);
  if (!dueAt || !tone) return null;
  return (
    <span
      className={cn(
        "text-[11px]",
        tone === "overdue" && "font-semibold text-[var(--danger-500)]",
        tone === "today" && "font-semibold text-amber-700",
        tone === "later" && "text-[var(--text-4)]",
      )}
    >
      {tone === "overdue" ? "Overdue · " : tone === "today" ? "Due today" : "Due "}
      {tone === "today" ? "" : formatDate(dueAt)}
    </span>
  );
}

function NextStepsCard({ slug, crm, canManage }: { slug: string; crm: LeadCrmStatus | undefined; canManage: boolean }) {
  const create = useCreateLeadAction(slug);
  const update = useUpdateLeadAction(slug);
  const remove = useDeleteLeadAction(slug);
  const { error: toastError } = useToast();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [ownerId, setOwnerId] = useState<string>("");
  const [showDone, setShowDone] = useState(false);

  const actions = crm?.actions ?? [];
  const suggested = actions.filter((a) => a.state === "suggested");
  const open = actions.filter((a) => a.state === "open");
  const done = actions.filter((a) => a.state === "done");
  const next = crm?.nextStep ?? null;
  const onErr = { onError: (e: unknown) => toastError(errorText(e)) };

  async function add() {
    if (!title.trim()) return;
    try {
      await create.mutateAsync({ title: title.trim(), dueAt: due || null, ownerId: ownerId || undefined });
      setTitle("");
      setDue("");
    } catch (e) {
      toastError(errorText(e));
    }
  }

  return (
    <section className="widget-card flex flex-col">
      <Header number="03" label="NEXT STEPS">
        <span className="widget-header__status" style={{ fontFamily: "var(--font-mono)" }}>
          {open.length} open
        </span>
      </Header>
      <div className="flex-1 space-y-4 p-6">
        {/* The next step leads — it is the one thing someone should do about this lead. */}
        <div className="rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
          <p className="widget-data-label mb-1">Next step</p>
          {next ? (
            <>
              <p className="text-sm font-medium text-[var(--text-1)]">{next.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--text-4)]">
                <DueLabel dueAt={next.dueAt} />
                {next.ownerName ? <span>{next.ownerName}</span> : <span className="text-amber-700">No owner</span>}
              </p>
            </>
          ) : (
            <p className="text-sm text-[var(--text-4)]">Nothing planned. Add the next thing to do below.</p>
          )}
        </div>

        {suggested.length > 0 ? (
          <div className="space-y-2">
            <p className="widget-data-label">Proposed from conversations</p>
            {suggested.map((a) => (
              <div key={a.id} className="rounded-[8px] border border-[var(--mist-border)] bg-[var(--mist)] px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--text-1)]">{a.title}</p>
                    <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-[var(--text-4)]">
                      <DueLabel dueAt={a.dueAt} />
                      {a.reason ? <span>{a.reason}</span> : null}
                    </p>
                  </div>
                  {canManage ? (
                    <div className="flex shrink-0 gap-1.5">
                      <Button type="button" variant="primary" size="xs" disabled={update.isPending} onClick={() => update.mutate({ id: a.id, transition: "accept" }, onErr)}>
                        Add
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon-sm"
                        aria-label={`Dismiss “${a.title}”`}
                        title="Dismiss"
                        disabled={update.isPending}
                        onClick={() => update.mutate({ id: a.id, transition: "dismiss" }, onErr)}
                      >
                        <XMarkIcon className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {open.length > 0 ? (
          <ul className="divide-y divide-[var(--border-2)] rounded-[8px] border border-[var(--border-2)]">
            {open.map((a) => (
              <ActionRow key={a.id} action={a} canManage={canManage}
                onDone={() => update.mutate({ id: a.id, transition: "done" }, onErr)}
                onDelete={() => remove.mutate(a.id, onErr)} />
            ))}
          </ul>
        ) : null}

        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void add();
              }}
              placeholder="Add an action — e.g. Send revised quote"
              className="app-input min-w-[200px] flex-1"
              aria-label="New action"
            />
            <DatePicker value={due} onChange={setDue} className="w-[150px]" aria-label="Due date" />
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="app-select w-[150px]" aria-label="Owner">
              <option value="">Me</option>
              {crm?.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button type="button" variant="primary" size="sm" onClick={() => void add()} disabled={create.isPending || !title.trim()}>
              Add
            </Button>
          </div>
        ) : null}

        {done.length > 0 ? (
          <div>
            <button type="button" className="widget-data-label hover:text-[var(--text-2)]" onClick={() => setShowDone((v) => !v)}>
              {showDone ? "Hide" : "Show"} {done.length} done
            </button>
            {showDone ? (
              <ul className="mt-2 space-y-1">
                {done.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-[13px] text-[var(--text-4)]">
                    <span className="min-w-0 truncate line-through" title={a.title}>
                      {a.title}
                    </span>
                    {canManage ? (
                      <button type="button" className="shrink-0 text-[11px] text-[var(--brand-700)] hover:underline" onClick={() => update.mutate({ id: a.id, transition: "reopen" }, onErr)}>
                        Reopen
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ActionRow({ action, canManage, onDone, onDelete }: { action: LeadActionDTO; canManage: boolean; onDone: () => void; onDelete: () => void }) {
  return (
    <li className="group flex items-start gap-3 px-3 py-2.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={false}
        aria-label={`Mark “${action.title}” done`}
        disabled={!canManage}
        onClick={onDone}
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border border-[var(--border-3)] bg-[var(--surface-0)] transition hover:border-[var(--brand-700)] disabled:opacity-50"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-[var(--text-1)]">{action.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--text-4)]">
          <DueLabel dueAt={action.dueAt} />
          <span>{action.ownerName ?? "No owner"}</span>
          {action.source === "ai" ? <span title={action.reason ?? undefined}>· from a conversation</span> : null}
        </p>
      </div>
      {canManage ? (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete “${action.title}”`}
          className="shrink-0 rounded-[4px] p-1 text-[var(--text-4)] opacity-0 transition hover:text-[var(--danger-500)] focus:opacity-100 group-hover:opacity-100"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </li>
  );
}

// ── 04 // AUTOMATION ─────────────────────────────────────────────────────────

function AutomationCard({
  slug,
  crm,
  canManage,
  syncing,
  onSync,
  syncError,
}: {
  slug: string;
  crm: LeadCrmStatus | undefined;
  canManage: boolean;
  syncing: boolean;
  onSync: () => void;
  syncError: unknown;
}) {
  const update = useUpdateLeadCrm(slug);
  const mailbox = useSetMyCrmMailbox(slug);
  const { error: toastError } = useToast();
  const [domains, setDomains] = useState("");
  const [domainError, setDomainError] = useState<string | null>(null);

  useEffect(() => {
    if (crm) setDomains(crm.emailDomains.join(", "));
  }, [crm]);

  if (!crm) {
    return (
      <section className="widget-card">
        <Header number="04" label="AUTOMATION" />
        <div className="p-6">
          <p className="widget-data-label animate-pulse">Loading…</p>
        </div>
      </section>
    );
  }

  const busy = syncing || crm.syncing;
  const saveDomains = () => {
    const list = domains.split(/[,\s]+/).map((d) => d.trim()).filter(Boolean);
    if (list.join(",") === crm.emailDomains.join(",")) return;
    setDomainError(null);
    update.mutate({ emailDomains: list }, { onError: (e) => setDomainError(errorText(e)) });
  };

  return (
    <section className="widget-card flex flex-col">
      <Header number="04" label="AUTOMATION">
        {crm.enabled ? (
          <span className="widget-header__status" style={{ fontFamily: "var(--font-mono)" }}>
            {busy ? "Syncing…" : crm.lastSyncedAt ? `Synced ${formatDate(crm.lastSyncedAt)}` : "Not synced yet"}
          </span>
        ) : null}
      </Header>
      <div className="flex-1 space-y-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-1)]">Move this lead automatically</p>
            <p className="mt-0.5 text-[13px] text-[var(--text-3)]">
              Emails, meetings, proposals and contracts move the stage. Anything read from wording becomes a suggestion for you to accept.
            </p>
          </div>
          <Switch
            checked={crm.enabled}
            disabled={!canManage || update.isPending}
            label="Move this lead automatically"
            onChange={(next) => update.mutate({ enabled: next }, { onError: (e) => toastError(errorText(e)) })}
          />
        </div>

        <dl className="space-y-4">
          <div>
            <dt className="widget-data-label mb-1.5 flex items-center gap-1.5">
              <EnvelopeIcon className="h-3.5 w-3.5" /> Email
            </dt>
            <dd className="space-y-2 text-[13px] text-[var(--text-2)]">
              {crm.mailboxes.length > 0 ? (
                <p>
                  Reading{" "}
                  {crm.mailboxes.map((m, i) => (
                    <span key={m.userId}>
                      {i > 0 ? ", " : ""}
                      <span className={m.connected ? "font-medium text-[var(--text-1)]" : "text-amber-700"}>{m.name}</span>
                      {m.connected ? "" : " (not connected)"}
                    </span>
                  ))}
                  ’s Gmail.
                </p>
              ) : (
                <p className="text-[var(--text-4)]">No mailbox is connected, so emails aren&apos;t being read.</p>
              )}
              {crm.me ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    disabled={mailbox.isPending}
                    onClick={() => mailbox.mutate(!crm.me!.mailboxEnabled, { onError: (e) => toastError(errorText(e)) })}
                  >
                    {crm.me.mailboxEnabled ? "Stop using my Gmail" : "Use my Gmail"}
                  </Button>
                  {crm.me.mailboxEnabled && !crm.me.googleConnected ? (
                    <span className="text-[11px] text-amber-700">Sign out and back in to connect Google.</span>
                  ) : null}
                </div>
              ) : null}
              <p className="text-[11px] leading-relaxed text-[var(--text-4)]">
                Only emails to or from this lead&apos;s domains are read. Their subjects appear on the lead&apos;s timeline for anyone who can see it. Bodies are never stored.
              </p>
            </dd>
          </div>

          <div>
            <dt className="widget-data-label mb-1.5">Their email domains</dt>
            <dd>
              <input
                value={domains}
                disabled={!canManage}
                onChange={(e) => setDomains(e.target.value)}
                onBlur={saveDomains}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveDomains();
                }}
                placeholder="valu.com, valu.co.uk"
                className="app-input w-full"
                aria-label="Their email domains"
              />
              {domainError ? <p className="mt-1 text-[11px] text-[var(--danger-500)]">{domainError}</p> : null}
              <p className="mt-1 text-[11px] text-[var(--text-4)]">
                {crm.effectiveDomains.length > 0
                  ? `Matching ${crm.effectiveDomains.join(", ")} (includes their website and contact email).`
                  : "None known yet — add one, or set their website or contact email."}
              </p>
            </dd>
          </div>

          <div>
            <dt className="widget-data-label mb-1.5 flex items-center gap-1.5">
              <ChatBubbleLeftRightIcon className="h-3.5 w-3.5" /> Slack
            </dt>
            <dd className="text-[13px] text-[var(--text-2)]">
              {crm.slackChannel ? (
                <p>
                  Reading <span className="font-medium text-[var(--text-1)]">#{crm.slackChannel.name ?? crm.slackChannel.id}</span>.
                </p>
              ) : (
                <p className="text-[var(--text-4)]">No internal channel set — add one with Edit client.</p>
              )}
              <p className="mt-1 text-[11px] text-[var(--text-4)]">
                Internal messages only ever create suggestions and actions. Our own chat never moves the stage.
              </p>
            </dd>
          </div>
        </dl>

        {crm.lastSyncError.length > 0 || syncError ? (
          <ul className="space-y-1 rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            {syncError ? <li>{errorText(syncError)}</li> : null}
            {crm.lastSyncError.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}

        {canManage && crm.enabled ? (
          <Button type="button" variant="secondary" size="sm" onClick={onSync} disabled={busy}>
            <ArrowPathIcon className={cn("h-4 w-4", busy && "animate-spin")} />
            {busy ? "Syncing…" : "Sync now"}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

// ── 05 // ACTIVITY ───────────────────────────────────────────────────────────

type ActivityFilter = "all" | "email" | "slack" | "meeting" | "docs" | "stage" | "logged";

const FILTERS: Array<{ id: ActivityFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "email", label: "Email" },
  { id: "slack", label: "Slack" },
  { id: "meeting", label: "Meetings" },
  { id: "docs", label: "Proposals" },
  { id: "stage", label: "Stage" },
  { id: "logged", label: "Logged" },
];

function matchesFilter(t: ClientTouchpoint, f: ActivityFilter): boolean {
  switch (f) {
    case "all":
      return true;
    case "email":
      return t.source === "gmail";
    case "slack":
      return t.source === "slack";
    case "meeting":
      return t.source === "meeting" || (!t.source && t.type === "MEETING");
    case "docs":
      return t.source === "document";
    case "stage":
      return t.type === "STAGE";
    case "logged":
      return !t.source;
  }
}

const MANUAL_LABEL: Record<TouchpointType, string> = { CALL: "Call", EMAIL: "Email", MEETING: "Meeting", NOTE: "Note" };

function describe(t: ClientTouchpoint): { icon: React.ReactNode; label: string } {
  const cls = "h-3.5 w-3.5 shrink-0";
  if (t.source === "gmail") {
    const inbound = t.direction === "inbound";
    return {
      icon: inbound ? <ArrowDownLeftIcon className={cls} /> : <ArrowUpRightIcon className={cls} />,
      label: inbound ? `Email from ${t.counterpartName ?? t.counterpartEmail ?? "them"}` : `Email to ${t.counterpartName ?? t.counterpartEmail ?? "them"}`,
    };
  }
  if (t.source === "slack") return { icon: <ChatBubbleLeftRightIcon className={cls} />, label: "Slack · internal" };
  if (t.source === "meeting") return { icon: <UsersIcon className={cls} />, label: "Meeting" };
  if (t.source === "document") return { icon: <DocumentTextIcon className={cls} />, label: "Proposal / contract" };
  if (t.type === "STAGE") return { icon: <FlagIcon className={cls} />, label: "Stage" };
  const manual = MANUAL_LABEL[t.type as TouchpointType] ?? "Note";
  const icon = t.type === "CALL" ? <PhoneIcon className={cls} /> : t.type === "EMAIL" ? <EnvelopeIcon className={cls} /> : t.type === "MEETING" ? <UsersIcon className={cls} /> : <PencilSquareIcon className={cls} />;
  return { icon, label: manual };
}

/** Activity is paged, not grown: a synced lead logs every email and Slack message, so an
 *  open-ended list ran to hundreds of rows. Same pager as the Requests section. */
const PAGE_SIZE = 10;

export function ActivityCard({ slug, touchpoints, canManage }: { slug: string; touchpoints: ClientTouchpoint[]; canManage: boolean }) {
  const addTp = useAddClientTouchpoint(slug);
  const { error: toastError } = useToast();
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [page, setPage] = useState(1);
  const [tpType, setTpType] = useState<TouchpointType>("NOTE");
  const [tpNote, setTpNote] = useState("");

  const counts = useMemo(() => {
    const c = {} as Record<ActivityFilter, number>;
    for (const f of FILTERS) c[f.id] = touchpoints.filter((t) => matchesFilter(t, f.id)).length;
    return c;
  }, [touchpoints]);
  const shown = touchpoints.filter((t) => matchesFilter(t, filter));
  const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  // Clamped, not stored: a sync or a filter can shrink the list under the page you're on.
  const currentPage = Math.min(page, totalPages);
  const firstRow = (currentPage - 1) * PAGE_SIZE;
  const pageRows = shown.slice(firstRow, firstRow + PAGE_SIZE);

  async function log() {
    if (tpType === "NOTE" && !tpNote.trim()) return;
    try {
      await addTp.mutateAsync({ type: tpType, note: tpNote.trim() || undefined });
      setTpNote("");
      setPage(1); // what you just logged is newest, so it's on page 1
    } catch (e) {
      toastError(errorText(e));
    }
  }

  return (
    <section className="widget-card">
      <Header number="05" label="ACTIVITY">
        <span className="widget-header__status" style={{ fontFamily: "var(--font-mono)" }}>
          {touchpoints.length} {touchpoints.length === 1 ? "entry" : "entries"}
        </span>
      </Header>
      <div className="space-y-4 p-6">
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <select value={tpType} onChange={(e) => setTpType(e.target.value as TouchpointType)} className="app-select w-28" aria-label="Kind">
              {(Object.keys(MANUAL_LABEL) as TouchpointType[]).map((t) => (
                <option key={t} value={t}>
                  {MANUAL_LABEL[t]}
                </option>
              ))}
            </select>
            <input
              value={tpNote}
              onChange={(e) => setTpNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void log();
              }}
              placeholder="Log a call, email or note…"
              className="app-input min-w-[200px] flex-1"
              aria-label="Note"
            />
            <Button type="button" variant="primary" size="sm" onClick={() => void log()} disabled={addTp.isPending}>
              Log
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter activity">
          {FILTERS.filter((f) => f.id === "all" || counts[f.id] > 0).map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => {
                setFilter(f.id);
                setPage(1);
              }}
              className={cn(
                "rounded-[6px] border px-2.5 py-1 text-[11px] font-medium transition",
                filter === f.id
                  ? "border-[var(--brand-700)] bg-[var(--mist)] text-[var(--brand-700)]"
                  : "border-[var(--border-2)] bg-[var(--surface-0)] text-[var(--text-3)] hover:bg-[var(--surface-1)]",
              )}
            >
              {f.label} <span className="text-[var(--text-4)]">{counts[f.id]}</span>
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="text-sm text-[var(--text-4)]">No activity yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border-2)]">
            {pageRows.map((t) => {
              const d = describe(t);
              return (
                <li key={t.id} className="flex gap-3 py-2.5">
                  <span className="mt-0.5 text-[var(--text-4)]">{d.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[13px] font-medium text-[var(--text-2)]" title={d.label}>
                        {d.label}
                      </span>
                      <span className="widget-timestamp shrink-0">{formatDate(t.occurredAt)}</span>
                    </div>
                    {t.note ? (
                      <p className="mt-0.5 line-clamp-2 break-words text-[13px] text-[var(--text-3)]" title={t.note}>
                        {t.note}
                      </p>
                    ) : null}
                    {t.authorName ? <p className="mt-0.5 text-[11px] text-[var(--text-4)]">{t.authorName}</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {shown.length > PAGE_SIZE ? (
        <div className="flex items-center justify-between gap-3 border-t border-[var(--border-1)] px-6 py-3">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
            className="rounded-[7px] border border-[var(--border-2)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-center text-[11px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
            PAGE {currentPage} OF {totalPages}
            <span className="hidden sm:inline">
              {" "}· {firstRow + 1}–{Math.min(firstRow + PAGE_SIZE, shown.length)} OF {shown.length}
            </span>
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setPage(currentPage + 1)}
            className="rounded-[7px] border border-[var(--border-2)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}

// ── Convert to client ────────────────────────────────────────────────────────

/**
 * Two steps. 1: what the CRM can fill in on the client (empty fields only) and the proposal to
 * plan from. 2: once converted, the delivery plan preview from that proposal — the same
 * preview/seed path as HQ's Plan review, so nothing is created until it has been seen.
 */
export function ConvertLeadModal({
  open,
  slug,
  clientId,
  clientName,
  onClose,
}: {
  open: boolean;
  slug: string;
  clientId: string;
  clientName: string;
  onClose: () => void;
}) {
  const { data: preview, isPending } = useConvertPreview(slug, open);
  const convert = useConvertLead(slug);
  const previewPlan = usePreviewProjectPlan();
  const seedPlan = useSeedProjectPlan();
  const { success, error: toastError } = useToast();
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [withPlan, setWithPlan] = useState(true);
  const [plan, setPlan] = useState<ProjectPlanPreview | null>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [step, setStep] = useState<"review" | "plan">("review");

  useEffect(() => {
    if (!open) {
      setStep("review");
      setPlan(null);
      setChosen(null);
      setProposalId(null);
    }
  }, [open]);

  const fields = preview?.fields ?? [];
  const picked = chosen ?? new Set(fields.map((f) => f.field));

  async function loadPlan(docId: string, start: string) {
    try {
      const res = await previewPlan.mutateAsync({ clientId, documentId: docId, startDate: start });
      setPlan(res.preview);
    } catch (e) {
      toastError(errorText(e));
    }
  }

  async function doConvert() {
    try {
      const { result } = await convert.mutateAsync(fields.filter((f) => picked.has(f.field)).map((f) => f.field));
      success(`${clientName} is now a client.`);
      if (withPlan && result.proposalId) {
        setProposalId(result.proposalId);
        setStep("plan");
        await loadPlan(result.proposalId, startDate);
      } else {
        onClose();
      }
    } catch (e) {
      toastError(errorText(e));
    }
  }

  async function doSeed() {
    if (!proposalId) return;
    try {
      const { result } = await seedPlan.mutateAsync({ clientId, documentId: proposalId, startDate });
      success(`Delivery plan created — ${result.created.featureBlocks} blocks, ${result.created.tasks} tasks.`);
      onClose();
    } catch (e) {
      toastError(errorText(e));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={step === "review" ? "Convert to client" : "Delivery plan"} panelClassName="app-dialog-fixed w-full max-w-2xl">
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {step === "review" ? (
          isPending || !preview ? (
            <p className="widget-data-label animate-pulse">Reading the lead…</p>
          ) : (
            <div className="space-y-6">
              <p className="text-sm text-[var(--text-2)]">
                {clientName} becomes an active client. Its timeline, actions and history stay on the record, and the pipeline closes at <span className="font-medium">Won</span>.
              </p>

              <div>
                <p className="widget-data-label mb-2">Fill in from the CRM</p>
                {fields.length === 0 ? (
                  <p className="text-[13px] text-[var(--text-4)]">Nothing to fill in — the client&apos;s contact details are already set, or the CRM hasn&apos;t seen enough email yet.</p>
                ) : (
                  <ul className="divide-y divide-[var(--border-2)] rounded-[8px] border border-[var(--border-2)]">
                    {fields.map((f) => (
                      <li key={f.field} className="flex items-start gap-3 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={picked.has(f.field)}
                          onChange={() => {
                            const next = new Set(picked);
                            if (next.has(f.field)) next.delete(f.field);
                            else next.add(f.field);
                            setChosen(next);
                          }}
                          className="mt-1 h-4 w-4 accent-[var(--brand-700)]"
                          aria-label={f.label}
                        />
                        <div className="min-w-0">
                          <p className="text-[11px] text-[var(--text-4)]">{f.label}</p>
                          <p className="break-words text-sm text-[var(--text-1)]">{f.proposed}</p>
                          <p className="text-[11px] text-[var(--text-4)]">From {f.source.toLowerCase()}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[11px] text-[var(--text-4)]">Only empty fields are filled. Anything already on the client is left as it is.</p>
              </div>

              <div>
                <p className="widget-data-label mb-2">Delivery plan</p>
                {preview.proposal ? (
                  <label className="flex items-start gap-3 rounded-[8px] border border-[var(--border-2)] px-3 py-2.5">
                    <input type="checkbox" checked={withPlan} onChange={(e) => setWithPlan(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--brand-700)]" />
                    <span className="min-w-0">
                      <span className="block text-sm text-[var(--text-1)]">Plan delivery from “{preview.proposal.title}”</span>
                      <span className="block text-[11px] text-[var(--text-4)]">
                        {preview.proposal.accepted ? "Accepted proposal." : "Latest proposal — not marked accepted."} You&apos;ll review the blocks and tasks before anything is created.
                      </span>
                    </span>
                  </label>
                ) : (
                  <p className="text-[13px] text-[var(--text-4)]">No proposal for this lead in Docs, so there&apos;s no timeline to plan from.</p>
                )}
              </div>

              {preview.openActions > 0 ? (
                <p className="text-[13px] text-[var(--text-3)]">
                  {preview.openActions} open action{preview.openActions === 1 ? "" : "s"} stay on the record.
                </p>
              ) : null}
            </div>
          )
        ) : (
          <div className="space-y-4">
            <label className="block max-w-[220px]">
              <span className="widget-data-label mb-1.5 block">Start date</span>
              <DatePicker
                value={startDate}
                onChange={(next) => {
                  setStartDate(next);
                  if (proposalId && next) void loadPlan(proposalId, next);
                }}
                className="w-full"
              />
            </label>
            {previewPlan.isPending && !plan ? (
              <p className="widget-data-label animate-pulse">Building the plan…</p>
            ) : plan ? (
              <>
                <p className="text-sm text-[var(--text-2)]">
                  {plan.totals.newFeatureBlocks} blocks, {plan.totals.newTasks} tasks and {plan.totals.newMilestones} milestones from “{plan.sourceDocumentTitle}”.
                </p>
                <ul className="space-y-2">
                  {plan.blocks.map((b) => (
                    <li key={b.key} className="rounded-[8px] border border-[var(--border-2)] px-3 py-2.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 truncate text-sm font-medium text-[var(--text-1)]" title={b.name}>
                          {b.name}
                        </p>
                        <span className="widget-timestamp shrink-0">
                          {formatDate(b.startDate)} – {formatDate(b.endDate)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-[var(--text-4)]">
                        {b.tasks.length} task{b.tasks.length === 1 ? "" : "s"}
                        {b.existing ? " · already on the board" : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-[13px] text-[var(--text-4)]">The plan couldn&apos;t be built. You can do it later from HQ.</p>
            )}
          </div>
        )}
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border-2)] p-4">
        {step === "review" ? (
          <>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={() => void doConvert()} loading={convert.isPending} disabled={!preview}>
              Convert to client
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Skip for now
            </Button>
            <Button type="button" variant="primary" onClick={() => void doSeed()} loading={seedPlan.isPending} disabled={!plan}>
              Create delivery plan
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
