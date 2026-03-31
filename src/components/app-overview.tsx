"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowTopRightOnSquareIcon,
  ChartBarSquareIcon,
  DocumentPlusIcon,
  DocumentTextIcon,
  Squares2X2Icon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { useProofDocuments } from "@/hooks/use-proof";
import { useClientList, useProposalList } from "@/hooks/use-proposals";
import { buttonStyles } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/format";

// ---------------------------------------------------------------------------
// Widget registry
// ---------------------------------------------------------------------------

const ALL_WIDGET_IDS = [
  "stats",
  "proposals",
  "quickstarts",
  "status",
  "proof",
  "clients",
] as const;

type WidgetId = (typeof ALL_WIDGET_IDS)[number];

const WIDGET_META: Record<WidgetId, { label: string; description: string }> = {
  stats: { label: "Summary stats", description: "Proposal, client, and review counts" },
  proposals: { label: "Recent proposals", description: "Latest proposal activity table" },
  quickstarts: { label: "Quick starts", description: "Jump to common tasks" },
  status: { label: "Status breakdown", description: "Proposals by workflow status" },
  proof: { label: "Proof sessions", description: "Recent collaborative drafts" },
  clients: { label: "Top clients", description: "Most active accounts" },
};

const STORAGE_KEY = "gitwork.dashboard.widgets";

function loadState(): { order: WidgetId[]; hidden: WidgetId[] } {
  try {
    const raw =
      typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as { order?: unknown; hidden?: unknown };
      const valid = (arr: unknown): WidgetId[] =>
        Array.isArray(arr)
          ? (arr as string[]).filter((id): id is WidgetId =>
              ALL_WIDGET_IDS.includes(id as WidgetId),
            )
          : [];
      const order = valid(parsed.order);
      return {
        order: order.length ? order : [...ALL_WIDGET_IDS],
        hidden: valid(parsed.hidden),
      };
    }
  } catch {
    // ignore
  }
  return { order: [...ALL_WIDGET_IDS], hidden: [] };
}

function saveState(order: WidgetId[], hidden: WidgetId[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ order, hidden }));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Status colours
// ---------------------------------------------------------------------------

const STATUS_ORDER = ["DRAFT", "IN_REVIEW", "APPROVED", "ARCHIVED"] as const;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AppOverview() {
  const proposalsQuery = useProposalList({ status: "ALL", sort: "updatedAt:desc" });
  const clientsQuery = useClientList();
  const proofQuery = useProofDocuments();

  const proposals = proposalsQuery.data?.proposals ?? [];
  const clients = clientsQuery.data?.clients ?? [];
  const proofDocuments = proofQuery.data?.documents ?? [];

  const proposalCount = proposals.length;
  const clientCount = clients.length;
  const proofCount = proofDocuments.length;
  const reviewCount = proposals.filter((p) => p.status === "IN_REVIEW").length;
  const latestActivity = proposals[0]?.updatedAt ?? proofDocuments[0]?.updatedAt ?? null;
  const topClients = [...clients]
    .sort((a, b) => b.proposalCount - a.proposalCount)
    .slice(0, 4);

  // Widget state
  const [widgetOrder, setWidgetOrder] = useState<WidgetId[]>([...ALL_WIDGET_IDS]);
  const [hiddenWidgets, setHiddenWidgets] = useState<WidgetId[]>([]);
  const [customizing, setCustomizing] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const state = loadState();
    setWidgetOrder(state.order);
    setHiddenWidgets(state.hidden);
    setHydrated(true);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setWidgetOrder((prev) => {
        const oldIndex = prev.indexOf(active.id as WidgetId);
        const newIndex = prev.indexOf(over.id as WidgetId);
        const next = arrayMove(prev, oldIndex, newIndex);
        saveState(next, hiddenWidgets);
        return next;
      });
    }
  }

  function toggleWidget(id: WidgetId) {
    setHiddenWidgets((prev) => {
      const next = prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id];
      saveState(widgetOrder, next);
      return next;
    });
  }

  const visibleWidgets = widgetOrder.filter((id) => !hiddenWidgets.includes(id));

  // Data passed into each widget renderer
  const data = {
    proposals,
    clients,
    proofDocuments,
    proposalCount,
    clientCount,
    proofCount,
    reviewCount,
    latestActivity,
    topClients,
    proposalsQuery,
    clientsQuery,
    proofQuery,
  };

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Link
            href="/app/proposals?new=1"
            className={buttonStyles({ variant: "primary", size: "md" })}
          >
            New proposal
          </Link>
          <Link href="/app/proof" className={buttonStyles({ variant: "secondary", size: "md" })}>
            Open Proof
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setCustomizing((v) => !v)}
          className={cn(
            "inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-sm font-medium transition",
            customizing
              ? "border-[var(--brand-300)] bg-[var(--surface-brand)] text-[var(--brand-700)]"
              : "border-[var(--border-2)] bg-white text-[var(--text-2)] hover:border-[var(--border-1)] hover:text-[var(--text-1)]",
          )}
        >
          <Squares2X2Icon className="h-4 w-4" />
          {customizing ? "Done" : "Customise"}
        </button>
      </div>

      {/* Widget picker */}
      {customizing && (
        <div className="rounded-[18px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
            Show / hide widgets — drag to reorder
          </p>
          <div className="flex flex-wrap gap-2">
            {widgetOrder.map((id) => {
              const hidden = hiddenWidgets.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleWidget(id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-sm font-medium transition",
                    hidden
                      ? "border-[var(--border-2)] bg-white text-[var(--text-4)] line-through"
                      : "border-[var(--brand-300)] bg-[var(--surface-brand)] text-[var(--brand-700)]",
                  )}
                >
                  {WIDGET_META[id].label}
                  {hidden ? null : <XMarkIcon className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Sortable widget list */}
      {hydrated ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={visibleWidgets} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {visibleWidgets.map((id) => (
                <SortableWidget key={id} id={id} customizing={customizing}>
                  <WidgetContent id={id} data={data} />
                </SortableWidget>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="space-y-4">
          {visibleWidgets.map((id) => (
            <div key={id} className="app-card p-5">
              <WidgetContent id={id} data={data} />
            </div>
          ))}
        </div>
      )}

      {visibleWidgets.length === 0 && (
        <div className="rounded-[18px] border border-dashed border-[var(--border-2)] px-6 py-10 text-center">
          <p className="text-sm text-[var(--text-4)]">
            All widgets are hidden. Click <strong>Customise</strong> to re-enable them.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable wrapper
// ---------------------------------------------------------------------------

function SortableWidget({
  id,
  customizing,
  children,
}: {
  id: WidgetId;
  customizing: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="app-card overflow-hidden">
      {customizing && (
        <div
          {...attributes}
          {...listeners}
          className="flex cursor-grab items-center gap-2 border-b border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-2 active:cursor-grabbing"
          aria-label={`Drag to reorder ${WIDGET_META[id].label}`}
        >
          <DragHandleIcon className="h-4 w-4 text-[var(--text-4)]" />
          <span className="text-xs font-semibold text-[var(--text-3)]">
            {WIDGET_META[id].label}
          </span>
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Widget content router
// ---------------------------------------------------------------------------

type DashData = {
  proposals: ReturnType<typeof useProposalList>["data"] extends { proposals: infer T } | undefined
    ? T
    : never;
  clients: ReturnType<typeof useClientList>["data"] extends { clients: infer T } | undefined
    ? T
    : never;
  proofDocuments: ReturnType<
    typeof useProofDocuments
  >["data"] extends { documents: infer T } | undefined
    ? T
    : never;
  proposalCount: number;
  clientCount: number;
  proofCount: number;
  reviewCount: number;
  latestActivity: string | null;
  topClients: DashData["clients"];
  proposalsQuery: ReturnType<typeof useProposalList>;
  clientsQuery: ReturnType<typeof useClientList>;
  proofQuery: ReturnType<typeof useProofDocuments>;
};

function WidgetContent({ id, data }: { id: WidgetId; data: DashData }) {
  switch (id) {
    case "stats":
      return <StatsWidget data={data} />;
    case "proposals":
      return <ProposalsWidget data={data} />;
    case "quickstarts":
      return <QuickStartsWidget />;
    case "status":
      return <StatusWidget data={data} />;
    case "proof":
      return <ProofWidget data={data} />;
    case "clients":
      return <ClientsWidget data={data} />;
  }
}

// ---------------------------------------------------------------------------
// Individual widgets
// ---------------------------------------------------------------------------

function StatsWidget({ data }: { data: DashData }) {
  return (
    <div>
      <WidgetHeader eyebrow="Overview" title="Workspace at a glance" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Proposals"
          value={data.proposalCount}
          detail={
            data.latestActivity
              ? `Latest activity ${formatDate(data.latestActivity)}`
              : "No document activity yet"
          }
        />
        <MetricCard
          label="In review"
          value={data.reviewCount}
          detail="Waiting on sign-off"
        />
        <MetricCard
          label="Clients"
          value={data.clientCount}
          detail="Active linked accounts"
        />
        <MetricCard
          label="Proof drafts"
          value={data.proofCount}
          detail="Collaborative sessions"
        />
      </div>
    </div>
  );
}

function ProposalsWidget({ data }: { data: DashData }) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <WidgetHeader eyebrow="Recent work" title="Proposal activity" />
        <Link href="/app/proposals" className={buttonStyles({ variant: "secondary", size: "sm" })}>
          View all
        </Link>
      </div>
      <div className="mt-4 overflow-x-auto rounded-[14px] border border-[var(--border-2)]">
        <table className="app-table min-w-full">
          <thead>
            <tr>
              <th className="text-left">Proposal</th>
              <th className="text-left">Client</th>
              <th className="text-left">Status</th>
              <th className="text-left">Updated</th>
            </tr>
          </thead>
          <tbody>
            {data.proposalsQuery.isPending ? (
              <tr>
                <td className="text-sm text-[var(--text-4)]" colSpan={4}>
                  Loading...
                </td>
              </tr>
            ) : data.proposals.length ? (
              data.proposals.slice(0, 6).map((proposal) => (
                <tr key={proposal.id}>
                  <td>
                    <Link
                      href={`/app/proposals/${proposal.id}`}
                      className="font-medium text-[var(--text-1)] transition hover:text-[var(--brand-700)]"
                    >
                      {proposal.title}
                    </Link>
                  </td>
                  <td className="text-[var(--text-3)]">
                    {proposal.clientName || "No client"}
                  </td>
                  <td>
                    <StatusBadge status={proposal.status} />
                  </td>
                  <td className="text-[var(--text-3)]">{formatDate(proposal.updatedAt)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="text-sm text-[var(--text-4)]" colSpan={4}>
                  No proposals yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QuickStartsWidget() {
  return (
    <div>
      <WidgetHeader eyebrow="Quick starts" title="Jump into the next task" />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <ActionTile
          href="/app/proposals?new=1"
          title="Start a proposal"
          description="New document with costing, timeline, and engagement sections."
          icon={<DocumentPlusIcon className="h-5 w-5" />}
        />
        <ActionTile
          href="/app/proof"
          title="Continue in Proof"
          description="Open the collaborative drafting workspace."
          icon={<DocumentTextIcon className="h-5 w-5" />}
        />
        <ActionTile
          href="/app/clients"
          title="Manage clients"
          description="Keep logos, names, and proposal relationships consistent."
          icon={<ChartBarSquareIcon className="h-5 w-5" />}
        />
      </div>
    </div>
  );
}

function StatusWidget({ data }: { data: DashData }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <WidgetHeader eyebrow="Health" title="Status breakdown" />
        <span className="app-chip">{data.proposalCount} total</span>
      </div>
      <div className="mt-4 space-y-3">
        {STATUS_ORDER.map((status) => {
          const count = data.proposals.filter((p) => p.status === status).length;
          const percent = data.proposalCount
            ? Math.max((count / data.proposalCount) * 100, count ? 8 : 0)
            : 0;
          return (
            <div key={status} className="space-y-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <StatusBadge status={status} />
                <span className="font-medium text-[var(--text-3)]">{count}</span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--surface-1)]">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    status === "APPROVED"
                      ? "bg-emerald-500"
                      : status === "IN_REVIEW"
                        ? "bg-amber-500"
                        : status === "ARCHIVED"
                          ? "bg-zinc-400"
                          : "bg-[var(--brand-600)]",
                  )}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProofWidget({ data }: { data: DashData }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <WidgetHeader eyebrow="Proof" title="Recent sessions" />
        <Link href="/app/proof" className={buttonStyles({ variant: "tertiary", size: "sm" })}>
          Open workspace
        </Link>
      </div>
      <div className="mt-4 space-y-3">
        {data.proofQuery.isPending ? (
          <p className="text-sm text-[var(--text-4)]">Loading...</p>
        ) : data.proofDocuments.length ? (
          data.proofDocuments.slice(0, 4).map((doc) => (
            <Link
              key={doc.id}
              href="/app/proof"
              className="flex items-start gap-3 rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3 transition hover:border-[var(--border-1)] hover:bg-white"
            >
              <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-white text-[var(--brand-700)] shadow-[var(--shadow-xs)]">
                <DocumentTextIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--text-1)]">{doc.title}</p>
                <p className="mt-1 text-sm text-[var(--text-3)]">
                  {doc.proposalTitle || "Standalone Proof draft"}
                </p>
                <p className="mt-2 text-xs font-medium text-[var(--text-4)]">
                  Updated {formatDate(doc.updatedAt)}
                </p>
              </div>
            </Link>
          ))
        ) : (
          <p className="rounded-[14px] border border-dashed border-[var(--border-2)] px-4 py-4 text-sm text-[var(--text-4)]">
            No Proof sessions yet.
          </p>
        )}
      </div>
    </div>
  );
}

function ClientsWidget({ data }: { data: DashData }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <WidgetHeader eyebrow="Clients" title="Most active accounts" />
        <Link href="/app/clients" className={buttonStyles({ variant: "tertiary", size: "sm" })}>
          View clients
        </Link>
      </div>
      <div className="mt-4 space-y-3">
        {data.clientsQuery.isPending ? (
          <p className="text-sm text-[var(--text-4)]">Loading...</p>
        ) : data.topClients.length ? (
          data.topClients.map((client) => (
            <Link
              key={client.id}
              href={`/app/clients/${client.slug}`}
              className="flex items-center gap-3 rounded-[14px] border border-[var(--border-2)] px-4 py-3 transition hover:bg-[var(--surface-1)]"
            >
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-brand)] text-sm font-semibold text-[var(--brand-700)]">
                {client.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--text-1)]">{client.name}</p>
                <p className="text-sm text-[var(--text-3)]">
                  {client.proposalCount} linked proposal{client.proposalCount === 1 ? "" : "s"}
                </p>
              </div>
              <ArrowTopRightOnSquareIcon className="h-4 w-4 text-[var(--text-4)]" />
            </Link>
          ))
        ) : (
          <p className="rounded-[14px] border border-dashed border-[var(--border-2)] px-4 py-4 text-sm text-[var(--text-4)]">
            No clients added yet.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function WidgetHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="app-eyebrow">{eyebrow}</p>
      <h3 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
        {title}
      </h3>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <article className="rounded-[18px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-4">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-4)]">
        {label}
      </p>
      <p className="mt-3 text-[30px] font-semibold tracking-[-0.04em] text-[var(--text-1)]">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">{detail}</p>
    </article>
  );
}

function ActionTile({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-4 rounded-[18px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-4 transition hover:border-[var(--border-1)] hover:bg-white"
    >
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[var(--brand-700)] shadow-[var(--shadow-xs)]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--text-1)]">{title}</p>
        <p className="mt-1 text-sm leading-6 text-[var(--text-3)]">{description}</p>
      </div>
      <ArrowTopRightOnSquareIcon className="h-4 w-4 text-[var(--text-4)] transition group-hover:text-[var(--text-2)]" />
    </Link>
  );
}

function DragHandleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="5" cy="4" r="1.2" />
      <circle cx="11" cy="4" r="1.2" />
      <circle cx="5" cy="8" r="1.2" />
      <circle cx="11" cy="8" r="1.2" />
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="11" cy="12" r="1.2" />
    </svg>
  );
}
