"use client";

/**
 * The Platform console (/app/platform): Gitwork's view of every business on Foundry.
 * Phase 0 of docs/multi-tenant-roadmap.md: list the businesses, choose which modules
 * each one has and whether it may use Gitwork's AI keys, and show every platform
 * action. Later phases add creating, suspending, plans, branding and usage here.
 *
 * Edits are a draft with Save / Discard, never a write per click: changing what a
 * business can reach is not something to do by accident, and the audit log should
 * show one considered change, not ten toggles.
 */

import { useEffect, useMemo, useState } from "react";
import { cn, formatRelative } from "@/lib/format";
import { DEFAULT_BUSINESS_MODULES, WORKSPACE_MODULES } from "@/lib/workspace-modules";
import type { PlatformAuditItem, PlatformWorkspace } from "@/lib/platform-types";
import { usePlatformAudit, usePlatformWorkspaces, useUpdatePlatformWorkspace } from "@/hooks/use-platform";

function Panel({
  number,
  title,
  status,
  children,
}: {
  number: string;
  title: string;
  status?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label min-w-0 truncate" title={title}>
          <span className="widget-header__label--number">{number}</span>
          <span className="mx-1.5 text-[var(--text-4)]">{"//"}</span>
          {title}
        </span>
        {status ? <span className="widget-header__status">{status}</span> : null}
      </div>
      <div className="widget-body">{children}</div>
    </section>
  );
}

function Badge({ tone, children }: { tone: "blue" | "green" | "amber" | "neutral"; children: React.ReactNode }) {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    neutral: "border-slate-300 bg-slate-100 text-slate-600",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-[4px] border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/** "Every module" or "6 of 13", for the table. */
export function modulesSummary(w: Pick<PlatformWorkspace, "modulesRestricted" | "enabledModules">): string {
  return w.modulesRestricted ? `${w.enabledModules.length} of ${WORKSPACE_MODULES.length}` : "Every module";
}

function BusinessesTable({
  workspaces,
  selectedId,
  onSelect,
}: {
  workspaces: PlatformWorkspace[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="app-table app-table--dense min-w-[720px]">
        <thead>
          <tr>
            <th className="text-left">Business</th>
            <th className="w-[90px] text-left">Members</th>
            <th className="w-[140px] text-left">Modules</th>
            <th className="w-[190px] text-left">AI keys</th>
            <th className="w-[120px] text-left">Created</th>
          </tr>
        </thead>
        <tbody>
          {workspaces.map((w) => {
            const selected = w.id === selectedId;
            return (
              <tr key={w.id} className={cn(selected && "bg-[var(--brand-50)]")}>
                <td>
                  <button
                    type="button"
                    onClick={() => onSelect(w.id)}
                    aria-pressed={selected}
                    className="flex min-w-0 items-center gap-2 text-left font-medium text-[var(--text-1)] hover:text-[var(--brand-600)]"
                  >
                    <span className="truncate" title={w.name}>{w.name}</span>
                    {w.isHome ? <Badge tone="blue">Gitwork</Badge> : null}
                  </button>
                  <span className="block font-mono text-[11px] text-[var(--text-4)]">{w.slug}</span>
                </td>
                <td className="font-mono text-[var(--text-2)]">{w.activeMembers}</td>
                <td>
                  <Badge tone={w.modulesRestricted ? "neutral" : "green"}>{modulesSummary(w)}</Badge>
                </td>
                <td>
                  <Badge tone={w.platformAiKeysAllowed ? "amber" : "green"}>
                    {w.platformAiKeysAllowed ? "Can use Gitwork's" : "Own keys only"}
                  </Badge>
                </td>
                <td className="font-mono text-[12px] text-[var(--text-3)]">
                  {new Date(w.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface Draft {
  modulesRestricted: boolean;
  enabledModules: string[];
  platformAiKeysAllowed: boolean;
}

function draftOf(w: PlatformWorkspace): Draft {
  return {
    modulesRestricted: w.modulesRestricted,
    enabledModules: w.enabledModules,
    platformAiKeysAllowed: w.platformAiKeysAllowed,
  };
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (
    a.modulesRestricted === b.modulesRestricted &&
    a.platformAiKeysAllowed === b.platformAiKeysAllowed &&
    [...a.enabledModules].sort().join() === [...b.enabledModules].sort().join()
  );
}

function WorkspaceSettings({ workspace }: { workspace: PlatformWorkspace }) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(workspace));
  const [confirmHome, setConfirmHome] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const update = useUpdatePlatformWorkspace();

  // A different business, or a saved change coming back: start again from what is stored.
  useEffect(() => {
    setDraft(draftOf(workspace));
    setConfirmHome(false);
  }, [workspace]);

  const dirty = !sameDraft(draft, draftOf(workspace));
  const needsConfirm = workspace.isHome && dirty;

  const toggleModule = (id: string) =>
    setDraft((d) => ({
      ...d,
      enabledModules: d.enabledModules.includes(id) ? d.enabledModules.filter((m) => m !== id) : [...d.enabledModules, id],
    }));

  const save = () => {
    setNotice(null);
    update.mutate(
      { id: workspace.id, update: { ...draft, confirmHome: workspace.isHome ? confirmHome : undefined } },
      {
        onSuccess: () => setNotice({ tone: "ok", text: "Saved. Open sessions pick it up within five minutes." }),
        onError: (e) => setNotice({ tone: "error", text: e instanceof Error ? e.message : "Could not save" }),
      },
    );
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="platform-modules-heading" className="space-y-3">
        <div>
          <h3 id="platform-modules-heading" className="text-sm font-semibold text-[var(--text-1)]">Modules</h3>
          <p className="mt-0.5 text-[13px] text-[var(--text-3)]">
            What this business can open. A module it doesn&rsquo;t have is refused to everyone in it, its own admins included.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Which modules">
          {[
            { value: false, label: "Every module" },
            { value: true, label: "Chosen modules" },
          ].map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              role="radio"
              aria-checked={draft.modulesRestricted === opt.value}
              onClick={() => setDraft((d) => ({ ...d, modulesRestricted: opt.value }))}
              className={cn(
                "app-button app-button-sm",
                draft.modulesRestricted === opt.value ? "app-button-primary" : "app-button-secondary",
              )}
            >
              {opt.label}
            </button>
          ))}
          {draft.modulesRestricted ? (
            <button
              type="button"
              className="app-button app-button-tertiary app-button-sm"
              onClick={() => setDraft((d) => ({ ...d, enabledModules: [...DEFAULT_BUSINESS_MODULES] }))}
            >
              Use the standard bundle
            </button>
          ) : null}
        </div>
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Modules">
          {WORKSPACE_MODULES.map((m) => {
            const on = !draft.modulesRestricted || draft.enabledModules.includes(m.id);
            return (
              <li key={m.id}>
                <label
                  className={cn(
                    "flex h-full gap-3 rounded-[6px] border px-3 py-2.5",
                    on ? "border-[var(--border-1)] bg-[var(--surface-0)]" : "border-[var(--border-2)] bg-[var(--surface-1)]",
                    !draft.modulesRestricted && "opacity-70",
                  )}
                >
                  <input
                    type="checkbox"
                    className="app-checkbox mt-0.5 shrink-0"
                    checked={on}
                    disabled={!draft.modulesRestricted}
                    onChange={() => toggleModule(m.id)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[var(--text-1)]">{m.label}</span>
                    <span className="block text-[12px] leading-snug text-[var(--text-3)]">{m.description}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="platform-ai-heading" className="space-y-2">
        <h3 id="platform-ai-heading" className="text-sm font-semibold text-[var(--text-1)]">AI keys</h3>
        <label className="flex gap-3 rounded-[6px] border border-[var(--border-1)] px-3 py-2.5">
          <input
            type="checkbox"
            className="app-checkbox mt-0.5 shrink-0"
            checked={draft.platformAiKeysAllowed}
            onChange={(e) => setDraft((d) => ({ ...d, platformAiKeysAllowed: e.target.checked }))}
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-[var(--text-1)]">May use Gitwork&rsquo;s AI keys</span>
            <span className="block text-[12px] leading-snug text-[var(--text-3)]">
              Off means this business only uses the keys it adds in Settings, and its AI is off until it does. Its AI
              calls are then never billed to Gitwork.
            </span>
          </span>
        </label>
      </section>

      {needsConfirm ? (
        <label className="flex gap-3 rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-800">
          <input
            type="checkbox"
            className="app-checkbox mt-0.5 shrink-0"
            checked={confirmHome}
            onChange={(e) => setConfirmHome(e.target.checked)}
          />
          <span className="text-[13px] leading-snug">
            This is Gitwork&rsquo;s own workspace, used by the whole team. I understand this changes what everyone at
            Gitwork can open.
          </span>
        </label>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-2)] pt-4">
        <button
          type="button"
          className="app-button app-button-primary app-button-sm"
          disabled={!dirty || update.isPending || (needsConfirm && !confirmHome)}
          onClick={save}
        >
          {update.isPending ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          className="app-button app-button-secondary app-button-sm"
          disabled={!dirty || update.isPending}
          onClick={() => {
            setDraft(draftOf(workspace));
            setConfirmHome(false);
            setNotice(null);
          }}
        >
          Discard
        </button>
        {notice ? (
          <p
            role={notice.tone === "error" ? "alert" : "status"}
            className={cn("text-[13px]", notice.tone === "error" ? "text-[var(--danger-500)]" : "text-[var(--text-3)]")}
          >
            {notice.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** One line per audit entry: who, which business, what changed. */
export function describePlatformChange(entry: Pick<PlatformAuditItem, "before" | "after">): string {
  const before = (entry.before ?? {}) as Partial<Draft>;
  const after = (entry.after ?? {}) as Partial<Draft>;
  const parts: string[] = [];
  if (before.modulesRestricted !== after.modulesRestricted) {
    parts.push(after.modulesRestricted ? "limited it to chosen modules" : "gave it every module");
  }
  const was = new Set(before.enabledModules ?? []);
  const now = new Set(after.enabledModules ?? []);
  const label = (id: string) => WORKSPACE_MODULES.find((m) => m.id === id)?.label ?? id;
  const added = [...now].filter((id) => !was.has(id)).map(label);
  const removed = [...was].filter((id) => !now.has(id)).map(label);
  if (after.modulesRestricted && added.length) parts.push(`added ${added.join(", ")}`);
  if (after.modulesRestricted && removed.length) parts.push(`removed ${removed.join(", ")}`);
  if (before.platformAiKeysAllowed !== after.platformAiKeysAllowed) {
    parts.push(after.platformAiKeysAllowed ? "allowed Gitwork's AI keys" : "switched it to its own AI keys");
  }
  return parts.length ? parts.join("; ") : "saved its settings";
}

function ActivityList({ entries }: { entries: PlatformAuditItem[] }) {
  if (!entries.length) {
    return <p className="text-sm text-[var(--text-3)]">No platform changes yet. Each change made here is listed, with who made it.</p>;
  }
  return (
    <ul className="divide-y divide-[var(--border-2)]">
      {entries.map((e) => (
        <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
          <p className="min-w-0 text-sm text-[var(--text-2)]">
            <span className="font-medium text-[var(--text-1)]">{e.actorName}</span> {describePlatformChange(e)} on{" "}
            <span className="font-medium text-[var(--text-1)]">{e.workspaceName}</span>
          </p>
          <time dateTime={e.createdAt} className="shrink-0 font-mono text-[11px] text-[var(--text-4)]">
            {formatRelative(e.createdAt)}
          </time>
        </li>
      ))}
    </ul>
  );
}

export function PlatformConsole() {
  const workspaces = usePlatformWorkspaces();
  const audit = usePlatformAudit();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useMemo(() => workspaces.data ?? [], [workspaces.data]);
  // Opens on the first business that isn't Gitwork's own, if there is one, since that is
  // what this page is for; otherwise on Gitwork.
  const selected = list.find((w) => w.id === selectedId) ?? list.find((w) => !w.isHome) ?? list[0] ?? null;

  return (
    <div className="space-y-5">
      <Panel number="01" title="Businesses" status={workspaces.data ? `${list.length} on Foundry` : undefined}>
        {workspaces.isPending ? (
          <p className="text-sm text-[var(--text-3)]">Loading businesses…</p>
        ) : workspaces.isError ? (
          <p role="alert" className="text-sm text-[var(--danger-500)]">
            Could not load businesses: {workspaces.error instanceof Error ? workspaces.error.message : "unknown error"}
          </p>
        ) : (
          <BusinessesTable workspaces={list} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
        )}
      </Panel>

      {selected ? (
        <Panel number="02" title={selected.name} status={selected.isHome ? "Gitwork's own workspace" : undefined}>
          <WorkspaceSettings key={selected.id} workspace={selected} />
        </Panel>
      ) : null}

      <Panel number={selected ? "03" : "02"} title="Platform activity">
        {audit.isPending ? (
          <p className="text-sm text-[var(--text-3)]">Loading…</p>
        ) : audit.isError ? (
          <p role="alert" className="text-sm text-[var(--danger-500)]">Could not load activity.</p>
        ) : (
          <ActivityList entries={audit.data ?? []} />
        )}
      </Panel>
    </div>
  );
}
