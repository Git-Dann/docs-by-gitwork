"use client";

import PulseWidget from "@/components/dashboard/pulse-widget";
import CodeClearWidget from "@/components/dashboard/codeclear-widget";
import StudyWidget from "@/components/dashboard/study-widget";
import CareWidget from "@/components/dashboard/care-widget";
import ProposalsWidget from "@/components/dashboard/proposals-widget";
import ClientsWidget from "@/components/dashboard/clients-widget";
import GmailWidget from "@/components/dashboard/gmail-widget";
import CalendarWidget from "@/components/dashboard/calendar-widget";
import MeetingSummaryWidget from "@/components/dashboard/meeting-summary-widget";
import ProofWidget from "@/components/dashboard/proof-widget";

export type WidgetSize = { cols: 1 | 2 | 3; rows: 1 | 2 | 3 };

const ROW_HEIGHT = 180;

type WidgetId = (typeof ALL_WIDGET_IDS)[number];
type WidgetSize = "sm" | "md" | "lg";

const WIDGET_META: Record<WidgetId, { label: string }> = {
  stats:       { label: "Summary stats" },
  proposals:   { label: "Recent proposals" },
  quickstarts: { label: "Quick starts" },
  status:      { label: "Status breakdown" },
  proof:       { label: "Proof sessions" },
  clients:     { label: "Top clients" },
};

const DEFAULT_SIZES: Record<WidgetId, WidgetSize> = {
  stats:       "lg",
  proposals:   "lg",
  quickstarts: "md",
  status:      "sm",
  proof:       "md",
  clients:     "sm",
};

// col-span values for Tailwind (must be static strings so the scanner picks them up)
const SPAN_CLASS: Record<WidgetSize, string> = {
  sm: "lg:col-span-1",
  md: "lg:col-span-2",
  lg: "lg:col-span-3",
};

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "gitwork.dashboard.widgets.v2";

type PersistedState = {
  order: WidgetId[];
  hidden: WidgetId[];
  sizes: Partial<Record<WidgetId, WidgetSize>>;
};

function loadState(): PersistedState {
  try {
    const raw =
      typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      const validId = (v: unknown): v is WidgetId =>
        ALL_WIDGET_IDS.includes(v as WidgetId);
      const validSize = (v: unknown): v is WidgetSize =>
        v === "sm" || v === "md" || v === "lg";
      const order = Array.isArray(parsed.order)
        ? (parsed.order as unknown[]).filter(validId)
        : [];
      const hidden = Array.isArray(parsed.hidden)
        ? (parsed.hidden as unknown[]).filter(validId)
        : [];
      const sizes: Partial<Record<WidgetId, WidgetSize>> = {};
      if (parsed.sizes && typeof parsed.sizes === "object") {
        for (const [k, v] of Object.entries(parsed.sizes)) {
          if (validId(k) && validSize(v)) sizes[k] = v;
        }
      }
      return {
        order: order.length ? order : [...ALL_WIDGET_IDS],
        hidden,
        sizes,
      };
    }
  } catch {
    // ignore
  }
  return { order: [...ALL_WIDGET_IDS], hidden: [], sizes: {} };
}

function saveState(state: PersistedState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Shared data shape
// ---------------------------------------------------------------------------

type DashData = {
  proposals: ReturnType<typeof useProposalList>["data"] extends
    | { proposals: infer T }
    | undefined
    ? T
    : never;
  clients: ReturnType<typeof useClientList>["data"] extends
    | { clients: infer T }
    | undefined
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
    .slice(0, 8);

  const [widgetOrder, setWidgetOrder] = useState<WidgetId[]>([...ALL_WIDGET_IDS]);
  const [hiddenWidgets, setHiddenWidgets] = useState<WidgetId[]>([]);
  const [widgetSizes, setWidgetSizes] = useState<Partial<Record<WidgetId, WidgetSize>>>({});
  const [customizing, setCustomizing] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Keep a ref so drag-end closures always see the latest state
  const stateRef = useRef({ order: widgetOrder, hidden: hiddenWidgets, sizes: widgetSizes });
  stateRef.current = { order: widgetOrder, hidden: hiddenWidgets, sizes: widgetSizes };

  useEffect(() => {
    const s = loadState();
    setWidgetOrder(s.order);
    setHiddenWidgets(s.hidden);
    setWidgetSizes(s.sizes);
    setHydrated(true);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setWidgetOrder((prev) => {
      const next = arrayMove(
        prev,
        prev.indexOf(active.id as WidgetId),
        prev.indexOf(over.id as WidgetId),
      );
      saveState({ order: next, hidden: stateRef.current.hidden, sizes: stateRef.current.sizes });
      return next;
    });
  }

  function toggleWidget(id: WidgetId) {
    setHiddenWidgets((prev) => {
      const next = prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id];
      saveState({ order: stateRef.current.order, hidden: next, sizes: stateRef.current.sizes });
      return next;
    });
  }

  function setSize(id: WidgetId, size: WidgetSize) {
    setWidgetSizes((prev) => {
      const next = { ...prev, [id]: size };
      saveState({ order: stateRef.current.order, hidden: stateRef.current.hidden, sizes: next });
      return next;
    });
  }

  function sizeOf(id: WidgetId): WidgetSize {
    return widgetSizes[id] ?? DEFAULT_SIZES[id];
  }

  const visibleWidgets = widgetOrder.filter((id) => !hiddenWidgets.includes(id));

  const data: DashData = {
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
      {/* Toolbar */}
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
        <Button
          type="button"
          variant={customizing ? "secondary" : "utility"}
          size="md"
          onClick={() => setCustomizing((v) => !v)}
          leadingIcon={<Squares2X2Icon className="h-4 w-4" />}
        >
          {customizing ? "Done" : "Customise"}
        </Button>
      </div>

      {/* Widget visibility picker */}
      {customizing && (
        <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
            Show / hide — drag to reorder — S / M / L to resize
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
                  {!hidden && <XMarkIcon className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Grid */}
      {hydrated ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={visibleWidgets} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {visibleWidgets.map((id) => {
                const size = sizeOf(id);
                return (
                  <SortableWidget
                    key={id}
                    id={id}
                    size={size}
                    customizing={customizing}
                    onSizeChange={(s) => setSize(id, s)}
                  >
                    <WidgetContent id={id} size={size} data={data} />
                  </SortableWidget>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {visibleWidgets.map((id) => {
            const size = sizeOf(id);
            return (
              <div key={id} className={cn("app-card flex flex-col overflow-hidden", SPAN_CLASS[size])}>
                <WidgetSignatureHeader id={id} />
                <div className="min-h-0 flex-1 p-5">
                  <WidgetContent id={id} size={size} data={data} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {visibleWidgets.length === 0 && (
        <div className="rounded-[10px] border border-dashed border-[var(--border-2)] px-6 py-10 text-center">
          <p className="text-sm text-[var(--text-4)]">
            All widgets are hidden. Click <strong>Customise</strong> to re-enable them.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable shell
// ---------------------------------------------------------------------------

function SortableWidget({
  id,
  size,
  customizing,
  onSizeChange,
  children,
}: {
  id: WidgetId;
  size: WidgetSize;
  label: string;
}> = [
  { component: PulseWidget,          size: { cols: 2, rows: 1 }, label: "Pulse" },
  { component: CodeClearWidget,      size: { cols: 1, rows: 1 }, label: "Code" },
  { component: StudyWidget,          size: { cols: 1, rows: 1 }, label: "Study" },
  { component: CareWidget,           size: { cols: 1, rows: 1 }, label: "Care" },
  { component: ProposalsWidget,      size: { cols: 2, rows: 2 }, label: "Docs" },
  { component: ClientsWidget,        size: { cols: 1, rows: 2 }, label: "Portal" },
  { component: GmailWidget,          size: { cols: 2, rows: 2 }, label: "Gmail" },
  { component: CalendarWidget,       size: { cols: 1, rows: 2 }, label: "Calendar" },
  { component: MeetingSummaryWidget, size: { cols: 3, rows: 2 }, label: "Meetings" },
  { component: ProofWidget,          size: { cols: 1, rows: 1 }, label: "Proof" },
];

// ─── Signature header — THE SIGNATURE ────────────────────────────────────────
// 36px monospace header row per the Foundry design system

function WidgetSignatureHeader({ slot, label }: { slot: number; label: string }) {
  return (
    <div
      style={{
        height: 36,
        padding: "0 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#FAFAF9",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        flexShrink: 0,
      }}
      className={cn("app-card flex flex-col overflow-hidden", SPAN_CLASS[size])}
    >
      <WidgetSignatureHeader id={id} />
      {customizing && (
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2">
          {/* Drag area */}
          <div
            {...attributes}
            {...listeners}
            className="flex flex-1 cursor-grab items-center gap-2 active:cursor-grabbing"
            aria-label={`Drag ${WIDGET_META[id].label}`}
          >
            <DragHandleIcon className="h-4 w-4 text-[var(--text-4)]" />
            <span className="text-xs font-semibold text-[var(--text-3)]">
              {WIDGET_META[id].label}
            </span>
          </div>

export function AppOverview() {
  return (
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: "repeat(3, 1fr)",
        gridAutoRows: ROW_HEIGHT,
        gridAutoFlow: "dense",
      }}
    >
      {GRID.map(({ component: Widget, size, label }, i) => (
        <div
          key={i}
          className="flex flex-col overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white"
          style={{ gridColumn: `span ${size.cols}`, gridRow: `span ${size.rows}` }}
        >
          <WidgetSignatureHeader slot={i + 1} label={label} />
          <div className="min-h-0 flex-1 overflow-hidden p-3">
            <Widget size={size} />
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 p-5">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Widget content router
// ---------------------------------------------------------------------------

function WidgetContent({ id, size, data }: { id: WidgetId; size: WidgetSize; data: DashData }) {
  switch (id) {
    case "stats":       return <StatsWidget size={size} data={data} />;
    case "proposals":   return <ProposalsWidget size={size} data={data} />;
    case "quickstarts": return <QuickStartsWidget size={size} />;
    case "status":      return <StatusWidget size={size} data={data} />;
    case "proof":       return <ProofWidget size={size} data={data} />;
    case "clients":     return <ClientsWidget size={size} data={data} />;
  }
}

// ---------------------------------------------------------------------------
// Stats widget
// ---------------------------------------------------------------------------

function StatsWidget({ size, data }: { size: WidgetSize; data: DashData }) {
  if (size === "sm") {
    return (
      <div>
        <p className="app-eyebrow">Overview</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <MiniStat label="Proposals" value={data.proposalCount} />
          <MiniStat label="In review" value={data.reviewCount} />
          <MiniStat label="Clients" value={data.clientCount} />
          <MiniStat label="Proof" value={data.proofCount} />
        </div>
      </div>
    );
  }

  if (size === "md") {
    return (
      <div>
        <WidgetHeader eyebrow="Overview" title="Workspace at a glance" />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <MetricCard label="Proposals" value={data.proposalCount}
            detail={data.latestActivity ? `Active ${formatDate(data.latestActivity)}` : "No activity yet"} />
          <MetricCard label="In review" value={data.reviewCount} detail="Awaiting sign-off" />
          <MetricCard label="Clients" value={data.clientCount} detail="Linked accounts" />
          <MetricCard label="Proof drafts" value={data.proofCount} detail="Collaborative sessions" />
        </div>
      </div>
    );
  }

  // lg — full row of 4
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <WidgetHeader eyebrow="Overview" title="Workspace at a glance" />
        {data.latestActivity && (
          <p className="text-sm text-[var(--text-4)]">
            Last activity {formatDate(data.latestActivity)}
          </p>
        )}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <MetricCard label="Proposals" value={data.proposalCount}
          detail="Total proposals across all clients" />
        <MetricCard label="In review" value={data.reviewCount}
          detail="Waiting on client or internal sign-off" />
        <MetricCard label="Clients" value={data.clientCount}
          detail="Active accounts linked to proposals" />
        <MetricCard label="Proof drafts" value={data.proofCount}
          detail="Persistent collaborative sessions" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Proposals widget
// ---------------------------------------------------------------------------

function ProposalsWidget({ size, data }: { size: WidgetSize; data: DashData }) {
  const rowLimit = size === "sm" ? 3 : size === "md" ? 5 : 8;
  const showClient = size !== "sm";
  const showUpdated = size === "lg";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <WidgetHeader eyebrow="Recent work" title="Proposal activity" />
        {size !== "sm" && (
          <Link href="/app/proposals" className={buttonStyles({ variant: "secondary", size: "sm" })}>
            View all
          </Link>
        )}
      </div>

      {size === "sm" ? (
        <div className="mt-3 space-y-2">
          {data.proposalsQuery.isPending ? (
            <p className="text-sm text-[var(--text-4)]">Loading...</p>
          ) : data.proposals.length ? (
            data.proposals.slice(0, rowLimit).map((p) => (
              <Link
                key={p.id}
                href={`/app/proposals/${p.id}`}
                className="flex items-center justify-between gap-2 rounded-[10px] border border-[var(--border-2)] px-3 py-2 transition hover:bg-[var(--surface-1)]"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-1)]">
                  {p.title}
                </span>
                <StatusBadge status={p.status} />
              </Link>
            ))
          ) : (
            <p className="text-sm text-[var(--text-4)]">No proposals yet.</p>
          )}
          <Link
            href="/app/proposals"
            className="block pt-1 text-xs font-medium text-[var(--brand-600)] hover:underline"
          >
            View all →
          </Link>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-[10px] border border-[var(--border-2)]">
          <table className="app-table min-w-full">
            <thead>
              <tr>
                <th className="text-left">Proposal</th>
                {showClient && <th className="text-left">Client</th>}
                <th className="text-left">Status</th>
                {showUpdated && <th className="text-left">Updated</th>}
              </tr>
            </thead>
            <tbody>
              {data.proposalsQuery.isPending ? (
                <tr>
                  <td colSpan={showUpdated ? 4 : showClient ? 3 : 2} className="text-sm text-[var(--text-4)]">
                    Loading...
                  </td>
                </tr>
              ) : data.proposals.length ? (
                data.proposals.slice(0, rowLimit).map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link
                        href={`/app/proposals/${p.id}`}
                        className="font-medium text-[var(--text-1)] transition hover:text-[var(--brand-700)]"
                      >
                        {p.title}
                      </Link>
                    </td>
                    {showClient && (
                      <td className="text-[var(--text-3)]">{p.clientName || "No client"}</td>
                    )}
                    <td>
                      <StatusBadge status={p.status} />
                    </td>
                    {showUpdated && (
                      <td className="text-[var(--text-3)]">{formatDate(p.updatedAt)}</td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={showUpdated ? 4 : showClient ? 3 : 2} className="text-sm text-[var(--text-4)]">
                    No proposals yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick starts widget
// ---------------------------------------------------------------------------

function QuickStartsWidget({ size }: { size: WidgetSize }) {
  const tiles = [
    {
      href: "/app/proposals?new=1",
      title: "Start a proposal",
      description: "New document with costing, timeline, and engagement sections.",
      icon: <DocumentPlusIcon className="h-5 w-5" />,
    },
    {
      href: "/app/proof",
      title: "Continue in Proof",
      description: "Open the collaborative drafting workspace.",
      icon: <DocumentTextIcon className="h-5 w-5" />,
    },
    {
      href: "/app/clients",
      title: "Manage clients",
      description: "Keep logos, names, and proposal relationships consistent.",
      icon: <ChartBarSquareIcon className="h-5 w-5" />,
    },
  ];

  if (size === "sm") {
    return (
      <div>
        <p className="app-eyebrow">Quick starts</p>
        <div className="mt-3 space-y-1.5">
          {tiles.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="flex items-center gap-3 rounded-[10px] border border-[var(--border-2)] px-3 py-2.5 transition hover:bg-[var(--surface-1)]"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] bg-[var(--surface-brand)] text-[var(--brand-700)]">
                {t.icon}
              </span>
              <span className="text-sm font-semibold text-[var(--text-1)]">{t.title}</span>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  if (size === "md") {
    return (
      <div>
        <WidgetHeader eyebrow="Quick starts" title="Jump into the next task" />
        <div className="mt-4 space-y-3">
          {tiles.map((t) => (
            <ActionTile key={t.href} {...t} />
          ))}
        </div>
      </div>
    );
  }

  // lg — horizontal row
  return (
    <div>
      <WidgetHeader eyebrow="Quick starts" title="Jump into the next task" />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <ActionTile key={t.href} {...t} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status widget
// ---------------------------------------------------------------------------

function StatusWidget({ size, data }: { size: WidgetSize; data: DashData }) {
  if (size === "sm") {
    return (
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="app-eyebrow">Status</p>
          <span className="app-chip">{data.proposalCount} total</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {STATUS_ORDER.map((status) => {
            const count = data.proposals.filter((p) => p.status === status).length;
            return (
              <div
                key={status}
                className="flex items-center justify-between rounded-[10px] border border-[var(--border-2)] px-3 py-2"
              >
                <StatusBadge status={status} />
                <span className="text-sm font-semibold text-[var(--text-2)]">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // md + lg share the same bar layout; lg shows percentages
  const showPercent = size === "lg";
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <WidgetHeader eyebrow="Health" title="Status breakdown" />
        <span className="app-chip">{data.proposalCount} total</span>
      </div>
      <div className="mt-4 space-y-3">
        {STATUS_ORDER.map((status) => {
          const count = data.proposals.filter((p) => p.status === status).length;
          const pct = data.proposalCount
            ? Math.max((count / data.proposalCount) * 100, count ? 8 : 0)
            : 0;
          return (
            <div key={status} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <StatusBadge status={status} />
                <span className="font-medium text-[var(--text-3)]">
                  {count}
                  {showPercent && data.proposalCount > 0 && (
                    <span className="ml-1.5 text-xs text-[var(--text-4)]">
                      ({Math.round((count / data.proposalCount) * 100)}%)
                    </span>
                  )}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--surface-1)]">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    status === "APPROVED"
                      ? "bg-emerald-500"
                      : status === "IN_REVIEW"
                        ? "bg-amber-500"
                        : status === "ARCHIVED"
                          ? "bg-zinc-400"
                          : "bg-[var(--brand-600)]",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Proof widget
// ---------------------------------------------------------------------------

function ProofWidget({ size, data }: { size: WidgetSize; data: DashData }) {
  const limit = size === "sm" ? 2 : size === "md" ? 4 : 6;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <WidgetHeader eyebrow="Proof" title="Recent sessions" />
        {size !== "sm" && (
          <Link href="/app/proof" className={buttonStyles({ variant: "tertiary", size: "sm" })}>
            Open workspace
          </Link>
        )}
      </div>

      <div className={cn("mt-4", size === "lg" ? "grid gap-3 sm:grid-cols-2" : "space-y-3")}>
        {data.proofQuery.isPending ? (
          <p className="text-sm text-[var(--text-4)]">Loading...</p>
        ) : data.proofDocuments.length ? (
          data.proofDocuments.slice(0, limit).map((doc) => (
            <Link
              key={doc.id}
              href="/app/proof"
              className="flex items-start gap-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3 transition hover:border-[var(--border-1)] hover:bg-white"
            >
              <div className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-white text-[var(--brand-700)] shadow-[var(--shadow-xs)]">
                <DocumentTextIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--text-1)]">{doc.title}</p>
                {size !== "sm" && (
                  <p className="mt-0.5 truncate text-xs text-[var(--text-3)]">
                    {doc.proposalTitle || "Standalone draft"}
                  </p>
                )}
                <p className="mt-1 text-xs font-medium text-[var(--text-4)]">
                  {formatDate(doc.updatedAt)}
                </p>
              </div>
            </Link>
          ))
        ) : (
          <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-4 text-sm text-[var(--text-4)]">
            No Proof sessions yet.
          </p>
        )}
      </div>

      {size === "sm" && (
        <Link
          href="/app/proof"
          className="mt-3 block text-xs font-medium text-[var(--brand-600)] hover:underline"
        >
          Open workspace →
        </Link>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clients widget
// ---------------------------------------------------------------------------

function ClientsWidget({ size, data }: { size: WidgetSize; data: DashData }) {
  const limit = size === "sm" ? 3 : size === "md" ? 5 : 8;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <WidgetHeader eyebrow="Clients" title="Most active accounts" />
        {size !== "sm" && (
          <Link href="/app/clients" className={buttonStyles({ variant: "tertiary", size: "sm" })}>
            View all
          </Link>
        )}
      </div>

      <div className={cn("mt-4", size === "lg" ? "grid gap-3 sm:grid-cols-2" : "space-y-2")}>
        {data.clientsQuery.isPending ? (
          <p className="text-sm text-[var(--text-4)]">Loading...</p>
        ) : data.topClients.length ? (
          data.topClients.slice(0, limit).map((client) => (
            <Link
              key={client.id}
              href={`/app/clients/${client.slug}`}
              className="flex items-center gap-3 rounded-[10px] border border-[var(--border-2)] px-4 py-3 transition hover:bg-[var(--surface-1)]"
            >
              <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-brand)] text-sm font-semibold text-[var(--brand-700)]">
                {client.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--text-1)]">
                  {client.name}
                </p>
                {size !== "sm" && (
                  <p className="text-xs text-[var(--text-3)]">
                    {client.proposalCount} proposal{client.proposalCount === 1 ? "" : "s"}
                  </p>
                )}
              </div>
              <ArrowTopRightOnSquareIcon className="h-4 w-4 shrink-0 text-[var(--text-4)]" />
            </Link>
          ))
        ) : (
          <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-4 text-sm text-[var(--text-4)]">
            No clients yet.
          </p>
        )}
      </div>

      {size === "sm" && (
        <Link
          href="/app/clients"
          className="mt-3 block text-xs font-medium text-[var(--brand-600)] hover:underline"
        >
          View all →
        </Link>
      )}
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

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
        {value}
      </p>
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
    <article className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-4">
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
      className="group flex items-start gap-4 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-4 transition hover:border-[var(--border-1)] hover:bg-white"
    >
      <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-white text-[var(--brand-700)] shadow-[var(--shadow-xs)]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--text-1)]">{title}</p>
        <p className="mt-1 text-sm leading-6 text-[var(--text-3)]">{description}</p>
      </div>
      <ArrowTopRightOnSquareIcon className="h-4 w-4 shrink-0 text-[var(--text-4)] transition group-hover:text-[var(--text-2)]" />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Widget signature header — THE SIGNATURE
// 36px monospace header row per the Foundry design system
// ---------------------------------------------------------------------------

function WidgetSignatureHeader({ id }: { id: WidgetId }) {
  const slot = ALL_WIDGET_IDS.indexOf(id) + 1;
  const label = WIDGET_META[id].label;
  return (
    <div
      style={{
        height: 36,
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#FAFAF9",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "1.2px",
          color: "#94A3B8",
          textTransform: "uppercase",
        }}
      >
        {String(slot).padStart(2, "0")} // {label.toUpperCase()}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.8px",
          color: "#16A34A",
          textTransform: "uppercase",
        }}
      >
        LIVE
      </span>
    </div>
  );
}

function DragHandleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="4" r="1.2" />
      <circle cx="11" cy="4" r="1.2" />
      <circle cx="5" cy="8" r="1.2" />
      <circle cx="11" cy="8" r="1.2" />
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="11" cy="12" r="1.2" />
    </svg>
  );
}
