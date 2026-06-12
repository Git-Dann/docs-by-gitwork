"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeftIcon,
  PlusIcon,
  ArrowUpTrayIcon,
  Squares2X2Icon,
  ListBulletIcon,
  CalendarDaysIcon,
  ShareIcon,
  CheckIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";
import { cn, taskRef } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import { useClientDetail } from "@/hooks/use-proposals";
import {
  useTasks,
  useUpdateTask,
  useFeatureBlocks,
  useMilestones,
  useTimelineShare,
  useSetTimelineShare,
} from "@/hooks/use-tasks";
import type { FeatureBlockDTO, MilestoneDTO } from "@/types/tasks";
import { TaskBoard } from "@/components/tasks/task-board";
import { TaskList } from "@/components/tasks/task-list";
import { GanttChart, type GanttBlock, type GanttMilestone } from "@/components/tasks/gantt-chart";
import { TaskFormModal } from "@/components/tasks/task-form";
import { TaskDetailDrawer } from "@/components/tasks/task-detail-drawer";
import { FeatureBlockFormModal } from "@/components/tasks/feature-block-form";
import { MilestoneFormModal } from "@/components/tasks/milestone-form";
import { TaskBatchBar } from "@/components/tasks/task-batch-bar";
import { TaskImportModal } from "@/components/tasks/task-import-modal";
import { TaskFilterBar, EMPTY_FILTERS, type TaskFilters } from "@/components/tasks/task-filter-bar";

type View = "board" | "list" | "gantt";

export function ClientTasksWorkspace({ slug }: { slug: string }) {
  const { data, isPending: clientLoading } = useClientDetail(slug);
  const client = data?.client;
  const clientId = client?.id ?? null;

  const [view, setView] = useState<View>("board");
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creatingTask, setCreatingTask] = useState(false);
  const [importing, setImporting] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  // Deep-link sync: lets Slack standup cards (and any other shared URL) jump
  // straight to a task by opening the drawer on mount. Clearing the param on
  // drawer close keeps the URL tidy for back-button navigation.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    const fromUrl = searchParams.get("task");
    if (fromUrl && !openTaskId) setOpenTaskId(fromUrl);
    // Intentionally only react to the search-params object identity; opening
    // the drawer manually shouldn't fight the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const closeTaskDrawer = () => {
    setOpenTaskId(null);
    if (searchParams.get("task")) {
      router.replace(pathname, { scroll: false });
    }
  };
  const [blockModal, setBlockModal] = useState<{ open: boolean; block: FeatureBlockDTO | null }>({
    open: false,
    block: null,
  });
  const [milestoneModal, setMilestoneModal] = useState<{ open: boolean; milestone: MilestoneDTO | null }>({
    open: false,
    milestone: null,
  });

  const { data: tasks = [], isPending: tasksLoading } = useTasks({ clientId: clientId ?? undefined });
  const updateTask = useUpdateTask();
  const { data: blocks = [] } = useFeatureBlocks(clientId);
  const { data: milestones = [] } = useMilestones(clientId);

  // Board + List honour the search/filter bar; Gantt always shows everything.
  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const cat = new Set(filters.categoryIds);
    const asg = new Set(filters.assigneeIds);
    const pri = new Set(filters.priorities);
    return tasks.filter((t) => {
      if (q && !(t.title.toLowerCase().includes(q) || taskRef(t.id).toLowerCase().includes(q))) return false;
      if (cat.size && !cat.has(t.featureBlock?.id ?? "none")) return false;
      if (asg.size && !t.assignees.some((a) => asg.has(a.id))) return false;
      if (pri.size && !pri.has(t.priority)) return false;
      return true;
    });
  }, [tasks, filters]);

  // Only dated blocks become Gantt bars; undated ones are board-only groupings.
  // A section shows on the Gantt once it has a span: explicit start/end, or — when
  // undated — derived from the date range of its tasks' due dates.
  const ganttBlocks: GanttBlock[] = useMemo(
    () =>
      blocks
        .map((b): GanttBlock | null => {
          const blockTasks = tasks.filter((t) => t.featureBlock?.id === b.id);
          const dues = blockTasks
            .map((t) => t.dueDate)
            .filter((d): d is string => Boolean(d))
            .sort();
          const startDate = b.startDate ?? (dues.length ? dues[0] : null);
          const endDate = b.endDate ?? (dues.length ? dues[dues.length - 1] : null);
          if (!startDate || !endDate) return null;
          return {
            id: b.id,
            name: b.name,
            startDate,
            endDate,
            color: b.color,
            progress: b.progress,
            tasks: blockTasks.map((t) => ({ title: t.title, done: t.status === "DONE" })),
          };
        })
        .filter((b): b is GanttBlock => b !== null),
    [blocks, tasks],
  );

  const ganttMilestones: GanttMilestone[] = useMemo(
    () => milestones.map((m) => ({ id: m.id, name: m.name, date: m.date, color: m.color })),
    [milestones],
  );

  function switchView(v: View) {
    setView(v);
    setSelected(new Set()); // selection is list-view only
  }
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (clientLoading || !client) {
    return <div className="h-64 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar — back-to-client · view toggle · actions (page title lives in the AppShell band) */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/app/portal/${slug}`}
          className="inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--border-2)] bg-white px-2.5 py-2 text-xs font-medium text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          {client.name}
        </Link>

        <div className="inline-flex overflow-hidden rounded-[8px] border border-[var(--border-2)]">
          <ViewTab active={view === "board"} onClick={() => switchView("board")} icon={<Squares2X2Icon className="h-4 w-4" />}>
            Board
          </ViewTab>
          <ViewTab active={view === "list"} onClick={() => switchView("list")} icon={<ListBulletIcon className="h-4 w-4" />} borderLeft>
            List
          </ViewTab>
          <ViewTab active={view === "gantt"} onClick={() => switchView("gantt")} icon={<CalendarDaysIcon className="h-4 w-4" />} borderLeft>
            Gantt
          </ViewTab>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {view === "gantt" ? (
            <>
              <TimelineShareControl slug={slug} />
              <Button
                type="button"
                variant="secondary"
                leadingIcon={<PlusIcon className="h-4 w-4" />}
                onClick={() => setMilestoneModal({ open: true, milestone: null })}
              >
                New milestone
              </Button>
              <Button
                type="button"
                variant="secondary"
                leadingIcon={<PlusIcon className="h-4 w-4" />}
                onClick={() => setBlockModal({ open: true, block: null })}
              >
                New category
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            leadingIcon={<ArrowUpTrayIcon className="h-4 w-4" />}
            onClick={() => setImporting(true)}
          >
            Import
          </Button>
          <Button
            type="button"
            variant="primary"
            leadingIcon={<PlusIcon className="h-4 w-4" />}
            onClick={() => setCreatingTask(true)}
          >
            New task
          </Button>
        </div>
      </div>

      {/* Search + filters (board + list) */}
      {view !== "gantt" ? (
        <TaskFilterBar tasks={tasks} categories={blocks} value={filters} onChange={setFilters} />
      ) : null}

      {/* Content */}
      {tasksLoading && view !== "gantt" ? (
        <div className="h-64 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />
      ) : view === "board" ? (
        <TaskBoard tasks={filtered} showClient={false} onCardClick={setOpenTaskId} />
      ) : view === "list" ? (
        <TaskList
          tasks={filtered}
          showClient={false}
          onRowClick={setOpenTaskId}
          selectable
          selectedIds={selected}
          onToggleSelect={toggleSelect}
          onToggleAll={(checked) => setSelected(checked ? new Set(filtered.map((t) => t.id)) : new Set())}
          onToggleDone={(task) =>
            updateTask.mutate({ id: task.id, input: { status: task.status === "DONE" ? "TODO" : "DONE" } })
          }
        />
      ) : (
        <GanttChart
          blocks={ganttBlocks}
          milestones={ganttMilestones}
          onBlockClick={(id) => {
            const block = blocks.find((b) => b.id === id) ?? null;
            setBlockModal({ open: true, block });
          }}
          onMilestoneClick={(id) => {
            const milestone = milestones.find((m) => m.id === id) ?? null;
            setMilestoneModal({ open: true, milestone });
          }}
          emptyHint="No timeline yet — add a milestone or give a feature block start/end dates."
        />
      )}

      {/* Floating batch bar — fixed overlay, never shifts the list */}
      {view === "list" && selected.size > 0 ? (
        <TaskBatchBar selectedIds={[...selected]} blocks={blocks} onClear={() => setSelected(new Set())} />
      ) : null}

      {creatingTask ? (
        <TaskFormModal defaultClientId={clientId ?? undefined} lockClient onClose={() => setCreatingTask(false)} />
      ) : null}
      {importing && clientId ? (
        <TaskImportModal
          slug={slug}
          blocks={blocks}
          onClose={() => setImporting(false)}
          onDone={() => setImporting(false)}
        />
      ) : null}
      {openTaskId ? <TaskDetailDrawer taskId={openTaskId} onClose={closeTaskDrawer} /> : null}
      {blockModal.open && clientId ? (
        <FeatureBlockFormModal
          block={blockModal.block}
          clientId={clientId}
          onClose={() => setBlockModal({ open: false, block: null })}
        />
      ) : null}
      {milestoneModal.open && clientId ? (
        <MilestoneFormModal
          milestone={milestoneModal.milestone}
          clientId={clientId}
          onClose={() => setMilestoneModal({ open: false, milestone: null })}
        />
      ) : null}
    </div>
  );
}

function ViewTab({
  active,
  borderLeft,
  icon,
  onClick,
  children,
}: {
  active: boolean;
  borderLeft?: boolean;
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition",
        borderLeft && "border-l border-[var(--border-2)]",
        active ? "bg-[var(--surface-brand)] text-[var(--brand-800)]" : "bg-white text-[var(--text-3)] hover:bg-[var(--surface-1)]",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function TimelineShareControl({ slug }: { slug: string }) {
  const { canShareClientTimeline } = usePermissions();
  const { data: share } = useTimelineShare(slug);
  const setShare = useSetTimelineShare(slug);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const fullUrl = share?.url ? `${origin}${share.url}` : "";
  const enabled = share?.enabled ?? false;

  // High-risk (public link) — hidden unless the role holds clients.shareTimeline.
  if (!canShareClientTimeline) return null;

  return (
    <div className="relative">
      <Button
        type="button"
        variant="secondary"
        leadingIcon={<ShareIcon className="h-4 w-4" />}
        onClick={() => setOpen((o) => !o)}
      >
        Share
        {enabled ? <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" /> : null}
      </Button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-80 rounded-[10px] border border-[var(--border-2)] bg-white p-4 shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
          <p className="text-sm font-semibold text-[var(--text-1)]">Public timeline</p>
          <p className="mt-0.5 text-xs text-[var(--text-4)]">
            A read-only Gantt for the client — feature blocks, task names, and progress. No
            assignees or internal notes.
          </p>
          <label className="mt-3 flex cursor-pointer items-center justify-between gap-2 rounded-[8px] border border-[var(--border-2)] px-3 py-2">
            <span className="text-sm font-medium text-[var(--text-2)]">
              {enabled ? "Link is live" : "Sharing off"}
            </span>
            <input
              type="checkbox"
              checked={enabled}
              disabled={setShare.isPending}
              onChange={(e) => setShare.mutate(e.target.checked)}
            />
          </label>
          {enabled && fullUrl ? (
            <div className="mt-2 flex items-center gap-2 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-1.5">
              <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-3)]" style={{ fontFamily: "var(--font-mono)" }}>
                {fullUrl}
              </span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(fullUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-white px-2 py-1 text-[11px] font-medium text-[var(--text-2)] hover:bg-[var(--surface-1)]"
              >
                {copied ? <CheckIcon className="h-3 w-3 text-emerald-600" /> : <ClipboardDocumentIcon className="h-3 w-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
