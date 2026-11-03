"use client";

/**
 * The Platform console (/app/platform): Gitwork's view of every business on Foundry.
 * Phase 0 of docs/multi-tenant-roadmap.md: list the businesses, choose which modules
 * each one has and whether it may use Gitwork's AI keys, and show every platform
 * action. Later phases add creating, suspending, plans, branding and usage here.
 *
 * Built for many businesses: the list is searched, filtered, sorted and paged on the
 * server (20 a page), and a business opens in the house fixed-height two-column popup,
 * kept in the URL as ?business=<id> so a link opens it directly.
 *
 * Edits are a draft with Save / Discard, never a write per click: changing what a
 * business can reach is not something to do by accident, and the audit log should
 * show one considered change, not ten toggles.
 */

import { useEffect, useState } from "react";
import { cn, formatRelative } from "@/lib/format";
import { DEFAULT_BUSINESS_MODULES, WORKSPACE_MODULES } from "@/lib/workspace-modules";
import type { PlatformAuditItem, PlatformWorkspace } from "@/lib/platform-types";
import { PLATFORM_PAGE_SIZE, type PlatformSortKey, type PlatformWorkspaceQuery } from "@/lib/platform-rules";
import {
  usePlatformAudit,
  usePlatformWorkspace,
  usePlatformWorkspaces,
  useUpdatePlatformWorkspace,
} from "@/hooks/use-platform";
import { Modal } from "@/components/ui/modal";
import { Pager } from "@/components/ui/pager";
import { SortHeader } from "@/components/ui/sort-header";

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

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function ModulesBadge({ w }: { w: PlatformWorkspace }) {
  return <Badge tone={w.modulesRestricted ? "neutral" : "green"}>{modulesSummary(w)}</Badge>;
}

function AiBadge({ w }: { w: PlatformWorkspace }) {
  return (
    <Badge tone={w.platformAiKeysAllowed ? "amber" : "green"}>
      {w.platformAiKeysAllowed ? "Can use Gitwork's" : "Own keys only"}
    </Badge>
  );
}

const DEFAULT_QUERY: PlatformWorkspaceQuery = {
  q: "",
  page: 0,
  pageSize: PLATFORM_PAGE_SIZE,
  sort: "created",
  dir: "desc",
  modules: "any",
  ai: "any",
};

/** Waits until typing stops before searching, so each keystroke isn't a request. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function BusinessesPanel({ onOpen }: { onOpen: (id: string) => void }) {
  const [query, setQueryState] = useState<PlatformWorkspaceQuery>(DEFAULT_QUERY);
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 300);
  const effective = { ...query, q, page: q === query.q ? query.page : 0 };
  const list = usePlatformWorkspaces(effective);

  // Any change to what is listed goes back to page one.
  const setQuery = (patch: Partial<PlatformWorkspaceQuery>) => setQueryState((cur) => ({ ...cur, q, ...patch, page: patch.page ?? 0 }));
  const onSort = (key: PlatformSortKey) =>
    setQuery({ sort: key, dir: query.sort === key ? (query.dir === "asc" ? "desc" : "asc") : key === "name" ? "asc" : "desc" });
  const filtered = Boolean(q || query.modules !== "any" || query.ai !== "any");
  const data = list.data;
  const sort = { key: query.sort, dir: query.dir };

  return (
    <Panel
      number="01"
      title="Businesses"
      status={data ? (filtered ? `${data.total} match` : `${data.total} on Foundry`) : undefined}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            className="app-input min-w-[200px] flex-1 sm:max-w-xs"
            placeholder="Search by name or slug…"
            aria-label="Search businesses"
            maxLength={100}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="app-select w-full sm:w-auto"
            aria-label="Modules"
            value={query.modules}
            onChange={(e) => setQuery({ modules: e.target.value as PlatformWorkspaceQuery["modules"] })}
          >
            <option value="any">Any modules</option>
            <option value="every">Every module</option>
            <option value="chosen">Chosen modules</option>
          </select>
          <select
            className="app-select w-full sm:w-auto"
            aria-label="AI keys"
            value={query.ai}
            onChange={(e) => setQuery({ ai: e.target.value as PlatformWorkspaceQuery["ai"] })}
          >
            <option value="any">Any AI keys</option>
            <option value="gitwork">Can use Gitwork&rsquo;s</option>
            <option value="own">Own keys only</option>
          </select>
          {filtered ? (
            <button
              type="button"
              className="app-button app-button-tertiary app-button-sm"
              onClick={() => {
                setSearch("");
                setQueryState(DEFAULT_QUERY);
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {list.isPending ? (
          <p className="text-sm text-[var(--text-3)]">Loading businesses…</p>
        ) : list.isError ? (
          <p role="alert" className="text-sm text-[var(--danger-500)]">
            Could not load businesses: {list.error instanceof Error ? list.error.message : "unknown error"}
          </p>
        ) : !data || data.total === 0 ? (
          <p className="text-sm text-[var(--text-3)]">
            {filtered ? "No business matches these filters." : "No businesses on Foundry yet."}
          </p>
        ) : (
          <div className={cn("space-y-3", list.isPlaceholderData && "opacity-60")} aria-busy={list.isFetching}>
            {/* Phones: one card per business. */}
            <ul className="divide-y divide-[var(--border-3)] md:hidden" aria-label="Businesses">
              {data.workspaces.map((w) => (
                <li key={w.id}>
                  <button type="button" onClick={() => onOpen(w.id)} className="flex w-full flex-col gap-1.5 py-3 text-left">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium text-[var(--text-1)]" title={w.name}>{w.name}</span>
                      {w.isHome ? <Badge tone="blue">Gitwork</Badge> : null}
                    </span>
                    <span className="font-mono text-[11px] text-[var(--text-4)]">
                      {w.slug} · {w.activeMembers} member{w.activeMembers === 1 ? "" : "s"} · {formatDay(w.createdAt)}
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      <ModulesBadge w={w} />
                      <AiBadge w={w} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="-mx-4 hidden overflow-x-auto md:block">
              <table className="app-table app-table--dense w-full table-fixed [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
                <thead>
                  <tr>
                    <SortHeader label="Business" k="name" sort={sort} onSort={onSort} />
                    <SortHeader label="Members" k="members" sort={sort} onSort={onSort} className="w-[100px]" />
                    <th className="w-[140px] text-left">Modules</th>
                    <th className="hidden w-[170px] text-left lg:table-cell">AI keys</th>
                    <SortHeader label="Created" k="created" sort={sort} onSort={onSort} className="w-[120px]" />
                  </tr>
                </thead>
                <tbody>
                  {data.workspaces.map((w) => (
                    <tr key={w.id} className="cursor-pointer" onClick={() => onOpen(w.id)}>
                      <td>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpen(w.id);
                          }}
                          className="flex w-full min-w-0 items-center gap-2 text-left font-medium text-[var(--text-1)] hover:text-[var(--brand-600)]"
                        >
                          <span className="truncate" title={w.name}>{w.name}</span>
                          {w.isHome ? <Badge tone="blue">Gitwork</Badge> : null}
                        </button>
                        <span className="block truncate font-mono text-[11px] text-[var(--text-4)]" title={w.slug}>{w.slug}</span>
                      </td>
                      <td className="font-mono text-[var(--text-2)]">{w.activeMembers}</td>
                      <td><ModulesBadge w={w} /></td>
                      <td className="hidden lg:table-cell"><AiBadge w={w} /></td>
                      <td className="whitespace-nowrap font-mono text-[12px] text-[var(--text-3)]">{formatDay(w.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(page) => setQuery({ page })} label="Business pages" />
          </div>
        )}
      </div>
    </Panel>
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

/** What is wrong with a draft before it is sent, in the same words the server uses. */
export function draftProblem(d: Draft): string | null {
  if (d.modulesRestricted && d.enabledModules.length === 0) {
    return "Pick at least one module, or give this business every module.";
  }
  return null;
}

type Section = "overview" | "modules" | "ai" | "activity";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "modules", label: "Modules" },
  { id: "ai", label: "AI keys" },
  { id: "activity", label: "Activity" },
];

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="font-mono text-[10px] uppercase tracking-[0.6px] text-[var(--text-4)]">{label}</dt>
      <dd className="text-sm text-[var(--text-1)]">{children}</dd>
    </div>
  );
}

function BusinessDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const ws = usePlatformWorkspace(id);
  const workspace = ws.data ?? null;
  const [section, setSection] = useState<Section>("overview");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmHome, setConfirmHome] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [auditPage, setAuditPage] = useState(0);
  const audit = usePlatformAudit(auditPage, section === "activity" ? id : null);
  const update = useUpdatePlatformWorkspace();

  // The draft starts from what is stored, and starts again when a save comes back.
  const base = workspace ? draftOf(workspace) : null;
  const current = draft ?? base;
  const dirty = Boolean(current && base && !sameDraft(current, base));
  const problem = current ? draftProblem(current) : null;
  const needsConfirm = Boolean(workspace?.isHome && dirty);

  const edit = (fn: (d: Draft) => Draft) => {
    if (!current) return;
    setNotice(null);
    setDraft(fn(current));
  };
  const toggleModule = (mid: string) =>
    edit((d) => ({
      ...d,
      enabledModules: d.enabledModules.includes(mid) ? d.enabledModules.filter((m) => m !== mid) : [...d.enabledModules, mid],
    }));

  const discard = () => {
    setDraft(null);
    setConfirmHome(false);
    setNotice(null);
  };

  const close = () => {
    if (dirty && !window.confirm("Discard your unsaved changes to this business?")) return;
    onClose();
  };

  const save = () => {
    if (!workspace || !current || problem) return;
    setNotice(null);
    update.mutate(
      {
        id: workspace.id,
        update: {
          ...current,
          confirmHome: workspace.isHome ? confirmHome : undefined,
          expectedUpdatedAt: workspace.updatedAt,
        },
      },
      {
        onSuccess: () => {
          setDraft(null);
          setConfirmHome(false);
          setNotice({ tone: "ok", text: "Saved. Open sessions pick it up within five minutes." });
        },
        onError: (e) => setNotice({ tone: "error", text: e instanceof Error ? e.message : "Could not save" }),
      },
    );
  };

  const rail = (active: boolean) =>
    cn(
      "flex w-full min-w-0 shrink-0 items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[13px] sm:shrink",
      active ? "bg-[var(--brand-50)] text-[var(--brand-600)]" : "text-[var(--text-2)] hover:bg-[var(--surface-1)]",
    );

  return (
    <Modal open onClose={close} title={workspace ? workspace.name.toUpperCase() : "BUSINESS"} panelClassName="app-dialog-fixed w-full max-w-3xl">
      {ws.isPending ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-5 text-sm text-[var(--text-3)]">Loading…</div>
      ) : !workspace || !current ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-5 text-sm text-[var(--danger-500)]" role="alert">
          {ws.error instanceof Error ? ws.error.message : "This business could not be found."}
        </div>
      ) : (
        <>
          <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] sm:grid-cols-[200px_minmax(0,1fr)] sm:grid-rows-1">
            <nav
              aria-label="Business sections"
              className="flex min-h-0 gap-1 overflow-x-auto border-b border-[var(--border-1)] p-2 sm:flex-col sm:overflow-x-visible sm:overflow-y-auto sm:border-b-0 sm:border-r"
            >
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-current={section === s.id ? "page" : undefined}
                  className={rail(section === s.id)}
                  onClick={() => setSection(s.id)}
                >
                  <span className="truncate">{s.label}</span>
                </button>
              ))}
            </nav>

            <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
              {section === "overview" ? (
                <div className="space-y-5">
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <Fact label="Name">
                      <span className="flex flex-wrap items-center gap-2">
                        {workspace.name}
                        {workspace.isHome ? <Badge tone="blue">Gitwork</Badge> : null}
                      </span>
                    </Fact>
                    <Fact label="Slug"><span className="font-mono text-[13px]">{workspace.slug}</span></Fact>
                    <Fact label="Active members">{workspace.activeMembers}</Fact>
                    <Fact label="Created">{formatDay(workspace.createdAt)}</Fact>
                    <Fact label="Modules"><ModulesBadge w={workspace} /></Fact>
                    <Fact label="AI keys"><AiBadge w={workspace} /></Fact>
                  </dl>
                  <p className="text-[12px] text-[var(--text-4)]">Last changed {formatRelative(workspace.updatedAt)}.</p>
                </div>
              ) : section === "modules" ? (
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
                        aria-checked={current.modulesRestricted === opt.value}
                        onClick={() => edit((d) => ({ ...d, modulesRestricted: opt.value }))}
                        className={cn(
                          "app-button app-button-sm",
                          current.modulesRestricted === opt.value ? "app-button-primary" : "app-button-secondary",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                    {current.modulesRestricted ? (
                      <button
                        type="button"
                        className="app-button app-button-tertiary app-button-sm"
                        onClick={() => edit((d) => ({ ...d, enabledModules: [...DEFAULT_BUSINESS_MODULES] }))}
                      >
                        Use the standard bundle
                      </button>
                    ) : null}
                  </div>
                  <ul className="grid gap-2 sm:grid-cols-2" aria-label="Modules">
                    {WORKSPACE_MODULES.map((m) => {
                      const on = !current.modulesRestricted || current.enabledModules.includes(m.id);
                      return (
                        <li key={m.id}>
                          <label
                            className={cn(
                              "flex h-full gap-3 rounded-[6px] border px-3 py-2.5",
                              on ? "border-[var(--border-1)] bg-[var(--surface-0)]" : "border-[var(--border-2)] bg-[var(--surface-1)]",
                              !current.modulesRestricted && "opacity-70",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="app-checkbox mt-0.5 shrink-0"
                              checked={on}
                              disabled={!current.modulesRestricted}
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
              ) : section === "ai" ? (
                <section aria-labelledby="platform-ai-heading" className="space-y-2">
                  <h3 id="platform-ai-heading" className="text-sm font-semibold text-[var(--text-1)]">AI keys</h3>
                  <label className="flex gap-3 rounded-[6px] border border-[var(--border-1)] px-3 py-2.5">
                    <input
                      type="checkbox"
                      className="app-checkbox mt-0.5 shrink-0"
                      checked={current.platformAiKeysAllowed}
                      onChange={(e) => edit((d) => ({ ...d, platformAiKeysAllowed: e.target.checked }))}
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
              ) : (
                <div className="space-y-3">
                  {audit.isPending ? (
                    <p className="text-sm text-[var(--text-3)]">Loading…</p>
                  ) : audit.isError ? (
                    <p role="alert" className="text-sm text-[var(--danger-500)]">Could not load activity.</p>
                  ) : (
                    <>
                      <ActivityList entries={audit.data?.entries ?? []} showBusiness={false} />
                      {audit.data ? (
                        <Pager page={audit.data.page} pageSize={audit.data.pageSize} total={audit.data.total} onPage={setAuditPage} label="Activity pages" />
                      ) : null}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 space-y-2 border-t border-[var(--border-1)] px-4 py-3">
            {needsConfirm ? (
              <label className="flex gap-3 rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
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
            {dirty && problem ? (
              <p role="alert" className="text-[13px] text-[var(--danger-500)]">{problem}</p>
            ) : notice ? (
              <p
                role={notice.tone === "error" ? "alert" : "status"}
                className={cn("text-[13px]", notice.tone === "error" ? "text-[var(--danger-500)]" : "text-[var(--text-3)]")}
              >
                {notice.text}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {dirty ? <span className="mr-auto text-[12px] text-[var(--text-3)]">Unsaved changes</span> : null}
              <button type="button" className="app-button app-button-secondary app-button-sm" disabled={!dirty || update.isPending} onClick={discard}>
                Discard
              </button>
              <button
                type="button"
                className="app-button app-button-primary app-button-sm"
                disabled={!dirty || Boolean(problem) || update.isPending || (needsConfirm && !confirmHome)}
                onClick={save}
              >
                {update.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </>
      )}
    </Modal>
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

function ActivityList({ entries, showBusiness = true }: { entries: PlatformAuditItem[]; showBusiness?: boolean }) {
  if (!entries.length) {
    return <p className="text-sm text-[var(--text-3)]">No platform changes yet. Each change made here is listed, with who made it.</p>;
  }
  return (
    <ul className="divide-y divide-[var(--border-2)]">
      {entries.map((e) => (
        <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
          <p className="min-w-0 text-sm text-[var(--text-2)]">
            <span className="font-medium text-[var(--text-1)]">{e.actorName}</span> {describePlatformChange(e)}
            {showBusiness ? (
              <>
                {" "}on <span className="font-medium text-[var(--text-1)]">{e.workspaceName}</span>
              </>
            ) : null}
          </p>
          <time dateTime={e.createdAt} className="shrink-0 font-mono text-[11px] text-[var(--text-4)]">
            {formatRelative(e.createdAt)}
          </time>
        </li>
      ))}
    </ul>
  );
}

/** The open business lives in ?business=<id>, so a link opens it and Back closes it. */
function useOpenBusiness(): [string | null, (id: string | null) => void] {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setId(new URLSearchParams(window.location.search).get("business"));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const open = (next: string | null) => {
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("business", next);
    else url.searchParams.delete("business");
    window.history[next ? "pushState" : "replaceState"](null, "", url);
    setId(next);
  };
  return [id, open];
}

export function PlatformConsole() {
  const [openId, setOpenId] = useOpenBusiness();
  const [auditPage, setAuditPage] = useState(0);
  const audit = usePlatformAudit(auditPage);

  return (
    <div className="space-y-5">
      <BusinessesPanel onOpen={setOpenId} />

      <Panel number="02" title="Platform activity" status={audit.data ? `${audit.data.total} change${audit.data.total === 1 ? "" : "s"}` : undefined}>
        {audit.isPending ? (
          <p className="text-sm text-[var(--text-3)]">Loading…</p>
        ) : audit.isError ? (
          <p role="alert" className="text-sm text-[var(--danger-500)]">Could not load activity.</p>
        ) : (
          <div className="space-y-3">
            <ActivityList entries={audit.data?.entries ?? []} />
            {audit.data ? (
              <Pager page={audit.data.page} pageSize={audit.data.pageSize} total={audit.data.total} onPage={setAuditPage} label="Activity pages" />
            ) : null}
          </div>
        )}
      </Panel>

      {openId ? <BusinessDialog key={openId} id={openId} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}
