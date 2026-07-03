"use client";

import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  BoltIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ClipboardDocumentListIcon,
  Cog8ToothIcon,
  DocumentTextIcon,
  EllipsisVerticalIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  FunnelIcon,
  InboxIcon,
  KeyIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  ClipboardDocumentIcon,
  PencilSquareIcon,
  PlusIcon,
  SparklesIcon,
  StarIcon,
  TrashIcon,
  UsersIcon,
  XMarkIcon,
  Squares2X2Icon,
  ListBulletIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useDeferredValue, useEffect, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/format";
import { Button } from "@/components/ui/button";
import type {
  AuditLog,
  ClientHealthScore,
  Connection,
  Conversation,
  SupportClient,
  SupportSource,
  Ticket,
  TicketPriority,
  TicketStatus,
  WorkflowRule,
} from "@/types/support";
import {
  useCreateSupportClient,
  useCreateSupportConnection,
  useCreateSupportReport,
  useCreateWorkflowRule,
  useUpdateWorkflowRule,
  useDeleteConnection,
  useDeleteSupportReport,
  useGenerateSupportReportDoc,
  useDeleteWorkflowRule,
  useSeedDefaultRules,
  useSupportClients,
  useSupportConversations,
  useSupportMessages,
  useSupportReports,
  useUpdateConversation,
  useUpdateConnection,
  useSupportTickets,
  useUpdateSupportClient,
  useUpdateSupportReport,
  useUpdateTicket,
  useSupportConnections,
  useSupportWorkflowRules,
  useSupportAuditLogs,
  useSyncConnection,
  useSendMessage,
  useGenerateAiDraft,
  useBatchUpdateTickets,
  useSemanticSearch,
  useGenerateReportNarrative,
  useTicketPerformance,
  useClientHealth,
} from "@/hooks/use-support";
import { getTicketStats } from "@/lib/api";
import type { AnalyticsReportMetric, SupportReport, SupportReportPayload } from "@/types/support";
import { useClientList } from "@/hooks/use-proposals";
import { usePermissions } from "@/hooks/use-permissions";
import { TicketsKanban } from "./tickets-kanban";
import { PerformanceStrip } from "./performance-strip";

// ─── health badge ────────────────────────────────────────────────────────────

const HEALTH_TIER_DOT: Record<ClientHealthScore["tier"], string> = {
  healthy: "bg-emerald-500",
  watch: "bg-amber-400",
  at_risk: "bg-red-500",
};
const HEALTH_TIER_RING: Record<ClientHealthScore["tier"], string> = {
  healthy: "border-emerald-200 bg-emerald-50 text-emerald-700",
  watch: "border-amber-200 bg-amber-50 text-amber-700",
  at_risk: "border-red-200 bg-red-50 text-red-600",
};
const HEALTH_TIER_LABEL: Record<ClientHealthScore["tier"], string> = {
  healthy: "Healthy",
  watch: "Watch",
  at_risk: "At risk",
};

function HealthBadge({
  health,
  size = "sm",
}: {
  health: ClientHealthScore;
  size?: "xs" | "sm";
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium transition hover:opacity-80",
          size === "xs" ? "text-[10px]" : "text-[11px]",
          HEALTH_TIER_RING[health.tier],
        )}
        title={`Account health: ${health.score}/100`}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", HEALTH_TIER_DOT[health.tier])} />
        {HEALTH_TIER_LABEL[health.tier]}
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1.5 w-56 rounded-[10px] border border-[var(--border-2)] bg-white p-3 shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-1)]">Account health</span>
            <span className={cn(
              "text-sm font-bold",
              health.tier === "healthy" ? "text-emerald-600" : health.tier === "watch" ? "text-amber-600" : "text-red-500",
            )}>{health.score}/100</span>
          </div>
          <div className="space-y-2">
            {health.factors.map((f) => (
              <div key={f.label}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--text-3)]">{f.label}</span>
                  <span className="text-[11px] font-medium text-[var(--text-2)]">{f.score}/{f.maxScore}</span>
                </div>
                <p className="text-[10px] text-[var(--text-4)]">{f.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TrendBadge({ delta, previous }: { delta: number; previous?: number }) {
  if (delta === 0) return null;
  const up = delta > 0;
  const pct = previous && previous !== 0 ? Math.round(Math.abs(delta / previous) * 100) : null;
  return (
    <span className={cn(
      "ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
      up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
    )}>
      {up ? "▲" : "▼"} {Math.abs(delta)}{pct !== null ? ` (${up ? "+" : "-"}${pct}%)` : ""}
    </span>
  );
}

function HighlightedText({ text, keywords }: { text: string; keywords: string[] }) {
  if (keywords.length === 0) return <>{text}</>;
  const pattern = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`(${pattern})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="rounded bg-amber-200 px-0.5 text-amber-900">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function SourceIcon({ source, className }: { source: SupportSource; className?: string }) {
  const cls = cn("h-4 w-4", className);
  switch (source) {
    case "gmail":
      return <EnvelopeIcon className={cls} />;
    case "reddit":
    case "instagram":
    case "discord":
      return <ChatBubbleLeftRightIcon className={cls} />;
    case "youtube":
      return <BoltIcon className={cls} />;
    case "stripe":
      return <KeyIcon className={cls} />;
    case "clickup":
      return <ClipboardDocumentListIcon className={cls} />;
    case "analytics":
      return <ChartBarIcon className={cls} />;
    case "app_reviews":
      return <StarIcon className={cls} />;
    case "webhook":
      return <ArrowUpTrayIcon className={cls} />;
    default:
      return <BoltIcon className={cls} />;
  }
}

const SOURCE_LABEL: Record<SupportSource, string> = {
  gmail: "Gmail",
  reddit: "Reddit",
  instagram: "Instagram",
  youtube: "YouTube",
  discord: "Discord",
  clickup: "ClickUp",
  stripe: "Stripe",
  analytics: "Analytics API",
  app_reviews: "App Reviews",
  webhook: "Webhook",
};

const LIVE_SOURCES: SupportSource[] = ["gmail", "discord", "reddit", "analytics", "app_reviews", "webhook"];

const SOURCE_TAGLINE: Partial<Record<SupportSource, string>> = {
  gmail: "Email forwarding via your support inbox",
  discord: "Monitor channels on a client's server",
  reddit: "Watch public subreddits for mentions",
  analytics: "Pull product metrics into monthly reports",
  app_reviews: "App Store + Play Store reviews, rated & tagged",
  webhook: "Receive messages from any external system",
};

// Mirrors the server-side registry in src/server/support-analytics/index.ts
const ANALYTICS_ADAPTERS: { key: string; label: string; defaultBaseUrl: string; requiresToken: boolean; hint: string }[] = [
  { key: "fellas", label: "Fellas Loaded", defaultBaseUrl: "https://api.fellasloaded.com", requiresToken: true, hint: "Subscription & user analytics — paste the Fellas API JWT." },
  { key: "bigwedge", label: "Big Wedge Golf", defaultBaseUrl: "https://apiv1.bigwedgegolf.com", requiresToken: true, hint: "Golf analytics — paste an admin JWT. Rounds played is month-scoped for trends." },
  { key: "firebase", label: "Firebase / Firestore", defaultBaseUrl: "", requiresToken: false, hint: "Paste a service-account JSON (from Firebase Console → Project settings → Service accounts). Then add collections to count per month in the metric specs below." },
  { key: "generic", label: "Generic JSON API", defaultBaseUrl: "", requiresToken: false, hint: "Enter the full endpoint URL — every numeric field becomes a metric." },
];

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  dev_review: "Dev review",
  awaiting_customer: "Awaiting customer",
  resolved: "Resolved",
};

const STATUS_TONE: Record<TicketStatus, string> = {
  open: "bg-[var(--surface-1)] text-[var(--text-3)]",
  in_progress: "bg-amber-50 text-amber-700 border border-amber-200",
  dev_review: "bg-[var(--mist)] text-[var(--brand-700)] border border-[var(--mist-border)]",
  awaiting_customer: "bg-purple-50 text-purple-700 border border-purple-200",
  resolved: "bg-emerald-50 text-emerald-700 border border-emerald-200",
};

const PRIORITY_TONE: Record<TicketPriority, string> = {
  urgent: "bg-red-50 text-red-700 border border-red-200",
  high: "bg-amber-50 text-amber-700 border border-amber-200",
  normal: "bg-[var(--surface-1)] text-[var(--text-3)]",
  low: "bg-[var(--surface-1)] text-[var(--text-4)]",
};

// ─── tab types ───────────────────────────────────────────────────────────────

type Tab = "inbox" | "tickets" | "reports";

// ─── shared modal wrapper ─────────────────────────────────────────────────────

function CareModal({
  title,
  onClose,
  children,
  wide,
  fixedHeight = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: "xl" | "2xl" | "3xl" | boolean;
  /** Pin the panel to a fixed height (h-[600px]) with the body scrolling — matches the platform's other 2-col modals. */
  fixedHeight?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className={cn(
          "app-dialog-panel relative z-10 flex w-full flex-col p-6",
          wide === "3xl" ? "max-w-3xl" : wide === "2xl" ? "max-w-2xl" : wide ? "max-w-xl" : "max-w-md",
          fixedHeight && "h-[600px] max-h-[85vh]",
        )}
      >
        <div className="mb-5 flex shrink-0 items-center justify-between gap-4">
          <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-4)] hover:bg-[var(--surface-1)]"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        {fixedHeight ? <div className="flex min-h-0 flex-1 flex-col">{children}</div> : children}
      </div>
    </div>
  );
}

// ─── add client modal ─────────────────────────────────────────────────────────

function AddClientModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [days, setDays] = useState("");
  const [recipient, setRecipient] = useState("");
  const [portalClientId, setPortalClientId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const createClient = useCreateSupportClient();
  const clientsQuery = useClientList();
  const portalClients = clientsQuery.data?.clients.filter(c => c.source === "MANUAL") ?? [];

  function slug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    createClient.mutate(
      {
        name: name.trim(),
        slug: slug(name.trim()),
        status: "active",
        supportDaysPerMonth: days ? Number(days) : undefined,
        supportDaysUsed: 0,
        reportingRecipient: recipient.trim() || undefined,
        workspaceClientId: portalClientId || undefined,
      },
      {
        onSuccess: () => onClose(),
        onError: (err) => setError(err instanceof Error ? err.message : "Failed to create client"),
      },
    );
  }

  return (
    <CareModal title="Add client" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {portalClients.length > 0 && (
          <label className="block space-y-1.5">
            <span className="app-field-label">Link to Portal client <span className="font-normal text-[var(--text-4)]">(optional)</span></span>
            <select
              value={portalClientId}
              onChange={(e) => {
                setPortalClientId(e.target.value);
                const selected = portalClients.find(c => c.id === e.target.value);
                if (selected && !name) setName(selected.name);
              }}
              className="app-select w-full"
            >
              <option value="">— None —</option>
              {portalClients.map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </label>
        )}

        <label className="block space-y-1.5">
          <span className="app-field-label">Client name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="app-input w-full"
            placeholder="Acme Corp"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className="app-field-label">Support days/month</span>
            <input
              value={days}
              onChange={(e) => setDays(e.target.value)}
              type="number"
              min="0"
              className="app-input w-full"
              placeholder="e.g. 5"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="app-field-label">Report recipient</span>
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              type="email"
              className="app-input w-full"
              placeholder="client@company.com"
            />
          </label>
        </div>

        {error && (
          <p className="rounded-[10px] bg-[var(--danger-50)] px-3 py-2.5 text-sm text-[var(--danger-500)]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={createClient.isPending || !name.trim()}
            loading={createClient.isPending}
          >
            {createClient.isPending ? "Adding…" : "Add client"}
          </Button>
        </div>
      </form>
    </CareModal>
  );
}

// ─── add connector modal ──────────────────────────────────────────────────────

const AUTH_MODE_LABEL: Record<Connection["authMode"], string> = {
  oauth: "OAuth",
  bot_token: "Bot token",
  manual: "No auth required",
  api_key: "API key",
};

function sourceAuthMode(s: SupportSource): Connection["authMode"] {
  if (s === "discord") return "bot_token";
  if (s === "reddit" || s === "gmail" || s === "app_reviews" || s === "webhook") return "manual";
  return "api_key";
}

// ─── shared connector filter state + UI ────────────────────────────────────────

interface FilterState {
  keywords: string;
  excludeKeywords: string;
  lookbackDays: string;
  maxItems: string;
  ignoreBots: boolean;
}

/** Initialise unified filter state from a saved scraperConfig. */
function initFilterState(cfg: Connection["scraperConfig"]): FilterState {
  return {
    keywords: (cfg?.keywords ?? []).join(", "),
    excludeKeywords: (cfg?.excludeKeywords ?? []).join(", "),
    lookbackDays: cfg?.lookbackDays ? String(cfg.lookbackDays) : "",
    maxItems: cfg?.maxItems ? String(cfg.maxItems) : "",
    ignoreBots: cfg?.ignoreBots ?? true,
  };
}

/** Serialise unified filter state into scraperConfig fields. */
function buildFilterConfig(source: SupportSource, f: FilterState) {
  const lookback = Number(f.lookbackDays);
  const max = Number(f.maxItems);
  return {
    keywords: f.keywords.split(",").map((s) => s.trim()).filter(Boolean),
    excludeKeywords: f.excludeKeywords.split(",").map((s) => s.trim()).filter(Boolean),
    ...(lookback > 0 ? { lookbackDays: lookback } : {}),
    ...(max > 0 ? { maxItems: max } : {}),
    ...(source === "discord" ? { ignoreBots: f.ignoreBots } : {}),
  };
}

function ConnectorFilterFields({
  source,
  filters,
  setFilters,
}: {
  source: SupportSource;
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
}) {
  const set = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));
  const lookbackPlaceholder = source === "gmail" ? "30" : "7";
  const maxPlaceholder = source === "reddit" ? "25" : "50";

  return (
    <div className="space-y-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
      <p className="app-field-label">
        Filters <span className="font-normal text-[var(--text-4)]">— dial in exactly what gets ingested</span>
      </p>
      <label className="block space-y-1">
        <span className="app-field-label">
          Include keywords{" "}
          <span className="font-normal text-[var(--text-4)]">(comma-separated · match any · blank = everything)</span>
        </span>
        <input
          value={filters.keywords}
          onChange={(e) => set("keywords", e.target.value)}
          className="app-input w-full"
          placeholder="e.g. bug, help, broken, refund"
        />
      </label>
      <label className="block space-y-1">
        <span className="app-field-label">
          Exclude keywords <span className="font-normal text-[var(--text-4)]">(drop items containing any)</span>
        </span>
        <input
          value={filters.excludeKeywords}
          onChange={(e) => set("excludeKeywords", e.target.value)}
          className="app-input w-full"
          placeholder="e.g. spam, giveaway, promo"
        />
      </label>
      <div className="flex gap-2">
        <label className="block flex-1 space-y-1">
          <span className="app-field-label">Lookback (days)</span>
          <input
            type="number"
            min={1}
            value={filters.lookbackDays}
            onChange={(e) => set("lookbackDays", e.target.value)}
            className="app-input w-full"
            placeholder={lookbackPlaceholder}
          />
        </label>
        <label className="block flex-1 space-y-1">
          <span className="app-field-label">Max per sync</span>
          <input
            type="number"
            min={1}
            value={filters.maxItems}
            onChange={(e) => set("maxItems", e.target.value)}
            className="app-input w-full"
            placeholder={maxPlaceholder}
          />
        </label>
      </div>
      {source === "discord" && (
        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={filters.ignoreBots}
            onChange={(e) => set("ignoreBots", e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--brand-700)]"
          />
          <span className="text-xs text-[var(--text-2)]">Ignore messages from bots</span>
        </label>
      )}
    </div>
  );
}

function AddConnectorModal({
  clientId,
  clientSlug,
  onClose,
}: {
  clientId: string;
  clientSlug: string;
  onClose: () => void;
}) {
  const [source, setSource] = useState<SupportSource>("gmail");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Gmail fields
  const defaultIntake = `support+${clientSlug}@gitwork.co.uk`;
  const [gmailQuery, setGmailQuery] = useState("");

  // Discord fields
  const [discordToken, setDiscordToken] = useState("");
  const [discordGuildId, setDiscordGuildId] = useState("");
  const [discordGuildName, setDiscordGuildName] = useState("");
  const [availableChannels, setAvailableChannels] = useState<{ id: string; name: string; accessible: boolean }[]>([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(new Set());
  const [fetchingChannels, setFetchingChannels] = useState(false);
  const [channelFetchError, setChannelFetchError] = useState<string | null>(null);
  const [tokenChecked, setTokenChecked] = useState(false);

  // Reddit fields
  const [redditSubreddit, setRedditSubreddit] = useState("");

  // App Reviews fields
  const [appStore, setAppStore] = useState<"app_store" | "play_store">("app_store");
  const [appId, setAppId] = useState("");
  const [appCountry, setAppCountry] = useState("us");
  const [playServiceAccount, setPlayServiceAccount] = useState("");

  // Webhook fields — token auto-generated, shown after creation
  const [webhookToken] = useState(() => crypto.randomUUID());

  // Analytics API fields
  const [analyticsAdapter, setAnalyticsAdapter] = useState(ANALYTICS_ADAPTERS[0].key);
  const [analyticsBaseUrl, setAnalyticsBaseUrl] = useState(ANALYTICS_ADAPTERS[0].defaultBaseUrl);
  const [analyticsToken, setAnalyticsToken] = useState("");
  const selectedAdapter = ANALYTICS_ADAPTERS.find((a) => a.key === analyticsAdapter) ?? ANALYTICS_ADAPTERS[0];
  // Firebase-specific
  const [firebaseServiceAccount, setFirebaseServiceAccount] = useState("");
  const [firebaseMetrics, setFirebaseMetrics] = useState<Array<{ label: string; collection: string; timestampField: string }>>([
    { label: "", collection: "", timestampField: "createdAt" },
  ]);

  // Shared filters (keywords, exclude, lookback, max, ignore-bots)
  const [filters, setFilters] = useState<FilterState>(() => initFilterState(undefined));

  const createConnection = useCreateSupportConnection(clientId);

  async function handleFetchChannels() {
    const guildId = discordGuildId.trim();
    const botToken = discordToken.trim();
    if (!guildId || !botToken) return;
    setFetchingChannels(true);
    setChannelFetchError(null);
    setAvailableChannels([]);
    setSelectedChannelIds(new Set());
    try {
      const res = await fetch("/api/support/discord/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildId, botToken }),
      });
      const data = await res.json() as { channels?: { id: string; name: string; accessible: boolean }[]; guildName?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch channels");
      setAvailableChannels(data.channels ?? []);
      setDiscordGuildName(data.guildName ?? "");
      setTokenChecked(true);
    } catch (err) {
      setChannelFetchError(err instanceof Error ? err.message : "Failed to fetch channels");
    } finally {
      setFetchingChannels(false);
    }
  }

  function toggleChannel(id: string) {
    setSelectedChannelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function buildScraperConfig(): Connection["scraperConfig"] {
    const f = buildFilterConfig(source, filters);
    if (source === "gmail") {
      return { query: gmailQuery.trim(), intakeAddress: defaultIntake, ...f };
    }
    if (source === "discord") {
      const channels = availableChannels
        .filter((c) => selectedChannelIds.has(c.id))
        .map((c) => ({ id: c.id, name: c.name, lastMessageId: null }));
      return {
        guildId: discordGuildId.trim(),
        guildName: discordGuildName,
        botToken: discordToken.trim(),
        channels,
        ...f,
      };
    }
    if (source === "reddit") {
      return { subreddit: redditSubreddit.trim(), ...f };
    }
    if (source === "analytics") {
      if (analyticsAdapter === "firebase") {
        return {
          adapter: "firebase",
          serviceAccountJson: firebaseServiceAccount.trim() || undefined,
          firebaseMetrics: firebaseMetrics
            .filter((m) => m.label.trim() && m.collection.trim())
            .map((m) => ({
              label: m.label.trim(),
              collection: m.collection.trim(),
              timestampField: m.timestampField.trim() || "createdAt",
            })),
        };
      }
      return {
        adapter: analyticsAdapter,
        baseUrl: analyticsBaseUrl.trim() || selectedAdapter.defaultBaseUrl,
        apiToken: analyticsToken.trim() || undefined,
      };
    }
    if (source === "app_reviews") {
      return {
        store: appStore,
        appId: appId.trim(),
        ...(appStore === "app_store" ? { country: appCountry.trim() || "us" } : {}),
        ...(appStore === "play_store" && playServiceAccount.trim() ? { serviceAccountJson: playServiceAccount.trim() } : {}),
      };
    }
    if (source === "webhook") {
      return { webhookToken };
    }
    return undefined;
  }

  function initialHealth(): "connected" | "needs_setup" {
    if (source === "discord") return selectedChannelIds.size > 0 ? "connected" : "needs_setup";
    if (source === "analytics") {
      if (analyticsAdapter === "firebase") {
        return firebaseServiceAccount.trim() && firebaseMetrics.some((m) => m.label.trim() && m.collection.trim())
          ? "connected"
          : "needs_setup";
      }
      const hasBase = Boolean(analyticsBaseUrl.trim() || selectedAdapter.defaultBaseUrl);
      const hasToken = !selectedAdapter.requiresToken || Boolean(analyticsToken.trim());
      return hasBase && hasToken ? "connected" : "needs_setup";
    }
    if (source === "app_reviews") return appId.trim() ? "connected" : "needs_setup";
    if (source === "webhook") return "connected";
    return source === "gmail" || source === "reddit" ? "connected" : "needs_setup";
  }

  function isSubmitDisabled() {
    if (createConnection.isPending) return true;
    if (source === "discord") return !discordToken.trim() || !discordGuildId.trim() || selectedChannelIds.size === 0;
    if (source === "analytics") {
      if (analyticsAdapter === "firebase") {
        return !firebaseServiceAccount.trim() || !firebaseMetrics.some((m) => m.label.trim() && m.collection.trim());
      }
      const hasBase = Boolean(analyticsBaseUrl.trim() || selectedAdapter.defaultBaseUrl);
      const hasToken = !selectedAdapter.requiresToken || Boolean(analyticsToken.trim());
      return !hasBase || !hasToken;
    }
    if (source === "app_reviews") return !appId.trim();
    return false;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    createConnection.mutate(
      {
        source,
        label: label.trim() || (source === "discord" && discordGuildName ? discordGuildName : SOURCE_LABEL[source]),
        authMode: sourceAuthMode(source),
        health: initialHealth(),
        scraperConfig: buildScraperConfig(),
      },
      {
        onSuccess: () => onClose(),
        onError: (err) =>
          setError(err instanceof Error ? err.message : "Failed to add connector"),
      },
    );
  }

  return (
    <CareModal title="Connect a channel" onClose={onClose} wide="2xl">
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-[200px_1fr] gap-6">

          {/* ── Left: source picker ── */}
          <div className="space-y-1">
            {LIVE_SOURCES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSource(s)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition",
                  source === s
                    ? "border-[var(--brand-700)] bg-[var(--mist)] shadow-sm"
                    : "border-[var(--border-2)] bg-white hover:border-[var(--border-1)] hover:bg-[var(--surface-1)]",
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]",
                    source === s ? "bg-white text-[var(--brand-700)]" : "bg-[var(--surface-1)] text-[var(--text-3)]",
                  )}
                >
                  <SourceIcon source={s} className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className={cn("text-sm font-semibold", source === s ? "text-[var(--brand-700)]" : "text-[var(--text-1)]")}>
                    {SOURCE_LABEL[s]}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-4)]">{SOURCE_TAGLINE[s]}</p>
                </div>
              </button>
            ))}

          </div>

          {/* ── Right: config ── */}
          <div className="flex flex-col gap-4">

            {/* label */}
            <label className="block space-y-1.5">
              <span className="app-field-label">Label</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="app-input w-full"
                placeholder={`e.g. ${SOURCE_LABEL[source]} — support`}
              />
            </label>

            {/* Gmail config */}
            {source === "gmail" && (
              <div className="space-y-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
                <p className="text-[11px] text-[var(--text-4)]">
                  Pulls all mail from the connected Google account. Leave the query blank to ingest everything, or add a Gmail search query to narrow it down (e.g. <span className="font-mono">label:support</span> or <span className="font-mono">from:client.com</span>).
                </p>
                <label className="block space-y-1">
                  <span className="app-field-label">Gmail query (optional — blank = all mail)</span>
                  <input
                    value={gmailQuery}
                    onChange={(e) => setGmailQuery(e.target.value)}
                    className="app-input w-full font-mono text-xs"
                    placeholder={`e.g. deliveredto:${defaultIntake} or label:inbox`}
                  />
                </label>
                <details className="group">
                  <summary className="cursor-pointer text-[11px] font-medium text-[var(--text-3)] hover:text-[var(--text-2)]">
                    Forwarding intake address (optional)
                  </summary>
                  <div className="mt-2 space-y-1">
                    <p className="select-all rounded-[6px] bg-white px-2.5 py-2 font-mono text-xs text-[var(--text-1)]">
                      {defaultIntake}
                    </p>
                    <p className="text-[11px] text-[var(--text-4)]">
                      Ask the client to forward their support inbox to this address, then set the query above to <span className="font-mono">deliveredto:{defaultIntake}</span> to scope the sync to their emails only.
                    </p>
                  </div>
                </details>
              </div>
            )}

            {/* Discord config */}
            {source === "discord" && (
              <div className="space-y-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
                <p className="text-[11px] text-[var(--text-4)]">
                  Invite your bot to the client&apos;s server via the Discord Developer Portal, granting <span className="font-medium text-[var(--text-2)]">View Channels</span> + <span className="font-medium text-[var(--text-2)]">Read Message History</span>. Private channels need these permissions granted <span className="font-medium text-[var(--text-2)]">per-channel</span> in Discord → channel Settings → Permissions.
                </p>

                <label className="block space-y-1">
                  <span className="app-field-label">Bot token</span>
                  <input
                    type="password"
                    value={discordToken}
                    onChange={(e) => { setDiscordToken(e.target.value); setAvailableChannels([]); setSelectedChannelIds(new Set()); setTokenChecked(false); }}
                    className="app-input w-full font-mono text-xs"
                    placeholder="Discord bot token (Developer Portal → Bot → Token)"
                    autoComplete="off"
                  />
                </label>

                <div className="flex gap-2">
                  <label className="block flex-1 space-y-1">
                    <span className="app-field-label">Server (guild) ID</span>
                    <input
                      value={discordGuildId}
                      onChange={(e) => { setDiscordGuildId(e.target.value); setAvailableChannels([]); setSelectedChannelIds(new Set()); setTokenChecked(false); }}
                      className="app-input w-full"
                      placeholder="Right-click server → Copy Server ID"
                    />
                  </label>
                  <div className="flex flex-col justify-end">
                    <button
                      type="button"
                      onClick={() => void handleFetchChannels()}
                      disabled={!discordGuildId.trim() || !discordToken.trim() || fetchingChannels}
                      className="flex h-9 items-center gap-1.5 rounded-[8px] border border-[var(--border-2)] bg-white px-3 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
                    >
                      {fetchingChannels ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--brand-700)] border-t-transparent" />
                      ) : tokenChecked ? (
                        <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <ArrowPathIcon className="h-3.5 w-3.5" />
                      )}
                      {fetchingChannels ? "Checking…" : tokenChecked ? "Re-fetch" : "Check token"}
                    </button>
                  </div>
                </div>

                {channelFetchError && (
                  <p className="rounded-[8px] bg-[var(--danger-50)] px-2.5 py-2 text-[11px] text-[var(--danger-500)]">
                    {channelFetchError}
                  </p>
                )}

                {availableChannels.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="app-field-label">
                        Channels to monitor
                        {discordGuildName && <span className="ml-1.5 font-normal text-[var(--text-4)]">in {discordGuildName}</span>}
                      </span>
                      {selectedChannelIds.size > 0 && (
                        <span className="text-[11px] font-semibold text-[var(--brand-700)]">
                          {selectedChannelIds.size} selected
                        </span>
                      )}
                    </div>
                    <div className="max-h-44 overflow-y-auto rounded-[8px] border border-[var(--border-2)] bg-white">
                      {availableChannels.map((ch) => (
                        <label
                          key={ch.id}
                          className={cn(
                            "flex cursor-pointer items-center gap-2.5 border-b border-[var(--border-2)] px-3 py-2 last:border-b-0",
                            ch.accessible === false ? "bg-amber-50 hover:bg-amber-50" : "hover:bg-[var(--surface-1)]",
                          )}
                          title={ch.accessible === false ? "Bot lacks read access to this channel — grant View Channel + Read Message History in Discord channel settings" : undefined}
                        >
                          <input
                            type="checkbox"
                            checked={selectedChannelIds.has(ch.id)}
                            onChange={() => toggleChannel(ch.id)}
                            className="h-3.5 w-3.5 shrink-0 accent-[var(--brand-700)]"
                          />
                          <span className={cn("text-xs", ch.accessible === false ? "text-amber-700" : "text-[var(--text-1)]")}>
                            # {ch.name}
                          </span>
                          {ch.accessible === false && (
                            <ExclamationTriangleIcon className="ml-auto h-3 w-3 shrink-0 text-amber-500" title="No read access" />
                          )}
                        </label>
                      ))}
                    </div>
                    {availableChannels.some((ch) => ch.accessible === false) && (
                      <p className="mt-1.5 text-[11px] text-amber-600">
                        Channels highlighted in amber need <strong>View Channel</strong> + <strong>Read Message History</strong> granted to the bot in Discord → channel Settings → Permissions.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Reddit config */}
            {source === "reddit" && (
              <div className="space-y-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
                <p className="text-[11px] text-[var(--text-4)]">
                  Polls the subreddit RSS feed for new posts. No credentials required.
                </p>
                <label className="block space-y-1">
                  <span className="app-field-label">Subreddit (without r/)</span>
                  <input
                    value={redditSubreddit}
                    onChange={(e) => setRedditSubreddit(e.target.value)}
                    className="app-input w-full"
                    placeholder="e.g. acmeapp"
                  />
                </label>
              </div>
            )}

            {/* Analytics API config */}
            {source === "analytics" && (
              <div className="space-y-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
                <p className="text-[11px] text-[var(--text-4)]">
                  Connect the client&apos;s product API so their monthly report auto-fills usage metrics with month-over-month trends.
                </p>
                <label className="block space-y-1">
                  <span className="app-field-label">Analytics source</span>
                  <select
                    value={analyticsAdapter}
                    onChange={(e) => {
                      const next = ANALYTICS_ADAPTERS.find((a) => a.key === e.target.value) ?? ANALYTICS_ADAPTERS[0];
                      setAnalyticsAdapter(next.key);
                      setAnalyticsBaseUrl(next.defaultBaseUrl);
                    }}
                    className="app-select w-full"
                  >
                    {ANALYTICS_ADAPTERS.map((a) => (
                      <option key={a.key} value={a.key}>{a.label}</option>
                    ))}
                  </select>
                </label>

                {/* Firebase-specific fields */}
                {analyticsAdapter === "firebase" && (
                  <div className="space-y-3">
                    <label className="block space-y-1">
                      <span className="app-field-label">Service-account JSON</span>
                      <textarea
                        value={firebaseServiceAccount}
                        onChange={(e) => setFirebaseServiceAccount(e.target.value)}
                        rows={4}
                        className="app-input w-full resize-none font-mono text-[11px]"
                        placeholder={'{"type":"service_account","project_id":"my-app","private_key":"-----BEGIN RSA..."}'}
                        autoComplete="off"
                      />
                      <p className="text-[11px] text-[var(--text-4)]">Firebase Console → Project settings → Service accounts → Generate new private key</p>
                    </label>
                    <div className="space-y-2">
                      <p className="app-field-label">Metric collections <span className="font-normal text-[var(--text-4)]">— each row = one monthly count</span></p>
                      <div className="grid grid-cols-[1fr_1fr_1fr_1.5rem] gap-x-1.5 gap-y-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-4)]">
                        <span>Label</span><span>Collection</span><span>Timestamp field</span><span />
                      </div>
                      {firebaseMetrics.map((m, i) => (
                        <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1.5rem] items-center gap-1.5">
                          <input value={m.label} onChange={(e) => setFirebaseMetrics((prev) => prev.map((r, j) => j === i ? { ...r, label: e.target.value } : r))} className="app-input text-xs" placeholder="e.g. Subscribers" />
                          <input value={m.collection} onChange={(e) => setFirebaseMetrics((prev) => prev.map((r, j) => j === i ? { ...r, collection: e.target.value } : r))} className="app-input text-xs" placeholder="e.g. users" />
                          <input value={m.timestampField} onChange={(e) => setFirebaseMetrics((prev) => prev.map((r, j) => j === i ? { ...r, timestampField: e.target.value } : r))} className="app-input text-xs" placeholder="createdAt" />
                          {firebaseMetrics.length > 1 ? (
                            <button type="button" onClick={() => setFirebaseMetrics((prev) => prev.filter((_, j) => j !== i))} className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-4)] hover:bg-red-50 hover:text-red-600">
                              <TrashIcon className="h-3 w-3" />
                            </button>
                          ) : <span />}
                        </div>
                      ))}
                      <button type="button" onClick={() => setFirebaseMetrics((prev) => [...prev, { label: "", collection: "", timestampField: "createdAt" }])} className="flex items-center gap-1.5 rounded-[6px] border border-dashed border-[var(--border-2)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-3)] transition hover:border-[var(--brand-700)] hover:text-[var(--brand-700)]">
                        <PlusIcon className="h-3 w-3" />Add metric
                      </button>
                    </div>
                  </div>
                )}

                {/* Non-Firebase fields */}
                {analyticsAdapter !== "firebase" && (
                  <>
                    <label className="block space-y-1">
                      <span className="app-field-label">
                        {analyticsAdapter === "generic" ? "Endpoint URL" : "API base URL"}
                      </span>
                      <input
                        value={analyticsBaseUrl}
                        onChange={(e) => setAnalyticsBaseUrl(e.target.value)}
                        className="app-input w-full font-mono text-xs"
                        placeholder={analyticsAdapter === "generic" ? "https://api.example.com/v1/metrics/" : selectedAdapter.defaultBaseUrl}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="app-field-label">
                        API token (bearer){selectedAdapter.requiresToken ? "" : " — optional"}
                      </span>
                      <input
                        type="password"
                        value={analyticsToken}
                        onChange={(e) => setAnalyticsToken(e.target.value)}
                        className="app-input w-full font-mono text-xs"
                        placeholder="eyJ… (stored securely on the connection)"
                        autoComplete="off"
                      />
                    </label>
                  </>
                )}
                {selectedAdapter.hint && (
                  <p className="text-[11px] text-[var(--text-4)]">{selectedAdapter.hint}</p>
                )}
              </div>
            )}

            {/* App Reviews config */}
            {source === "app_reviews" && (
              <div className="space-y-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
                <div className="flex gap-2">
                  {(["app_store", "play_store"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setAppStore(s)}
                      className={cn(
                        "flex-1 rounded-[8px] border px-3 py-1.5 text-xs font-medium transition",
                        appStore === s
                          ? "border-[var(--brand-700)] bg-[var(--mist)] text-[var(--brand-700)]"
                          : "border-[var(--border-2)] bg-white text-[var(--text-3)] hover:bg-[var(--surface-1)]",
                      )}
                    >
                      {s === "app_store" ? "App Store (iOS)" : "Play Store (Android)"}
                    </button>
                  ))}
                </div>
                <label className="block space-y-1">
                  <span className="app-field-label">
                    {appStore === "app_store" ? "App ID (numeric)" : "Package name"}
                  </span>
                  <input
                    value={appId}
                    onChange={(e) => setAppId(e.target.value)}
                    className="app-input w-full font-mono text-xs"
                    placeholder={appStore === "app_store" ? "e.g. 123456789" : "e.g. com.example.app"}
                  />
                </label>
                {appStore === "app_store" && (
                  <label className="block space-y-1">
                    <span className="app-field-label">Country code (optional)</span>
                    <input
                      value={appCountry}
                      onChange={(e) => setAppCountry(e.target.value)}
                      className="app-input w-full"
                      placeholder="us"
                      maxLength={2}
                    />
                  </label>
                )}
                {appStore === "play_store" && (
                  <label className="block space-y-1">
                    <span className="app-field-label">Google service account JSON</span>
                    <textarea
                      value={playServiceAccount}
                      onChange={(e) => setPlayServiceAccount(e.target.value)}
                      className="app-input w-full font-mono text-xs"
                      rows={4}
                      placeholder={'{"type":"service_account","project_id":"…"}'}
                      autoComplete="off"
                    />
                    <p className="text-[11px] text-[var(--text-4)]">
                      Requires the <span className="font-medium text-[var(--text-2)]">Android Publisher API</span> enabled and the <span className="font-mono">androidpublisher</span> scope granted to the service account.
                    </p>
                  </label>
                )}
              </div>
            )}

            {/* Webhook config */}
            {source === "webhook" && (
              <div className="space-y-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
                <p className="text-[11px] text-[var(--text-4)]">
                  A unique URL will be generated. POST a JSON body to it to create conversations.
                  The token is set once and cannot be changed after saving.
                </p>
                <div className="space-y-1">
                  <span className="app-field-label">Webhook URL (generated)</span>
                  <p className="select-all rounded-[6px] bg-white px-2.5 py-2 font-mono text-xs text-[var(--text-1)] break-all">
                    /api/support/webhook/{webhookToken}
                  </p>
                </div>
                <div className="rounded-[8px] border border-[var(--border-2)] bg-white p-2.5 space-y-1">
                  <p className="text-[11px] font-medium text-[var(--text-2)]">Expected payload</p>
                  <pre className="text-[10px] text-[var(--text-3)] leading-relaxed">{`POST /api/support/webhook/<token>
Content-Type: application/json

{
  "body": "Message text (required)",
  "subject": "Optional subject",
  "customerLabel": "Optional sender name",
  "externalId": "Optional dedup key",
  "receivedAt": "Optional ISO 8601 date",
  "tags": ["optional", "tags"]
}`}</pre>
                </div>
              </div>
            )}

            {/* Shared filters — ingestion sources only (analytics + webhook have none) */}
            {LIVE_SOURCES.includes(source) && source !== "analytics" && source !== "webhook" && (
              <ConnectorFilterFields source={source} filters={filters} setFilters={setFilters} />
            )}

            <div className="mt-auto space-y-3">
              {error && (
                <p className="rounded-[10px] bg-[var(--danger-50)] px-3 py-2.5 text-sm text-[var(--danger-500)]">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmitDisabled()}
                  loading={createConnection.isPending}
                >
                  {createConnection.isPending ? "Saving…" : "Add connector"}
                </Button>
              </div>
            </div>
          </div>

        </div>
      </form>
    </CareModal>
  );
}

// ─── add / edit rule modal ────────────────────────────────────────────────────

function RuleModal({
  clientId,
  rule,
  onClose,
}: {
  clientId: string;
  rule?: WorkflowRule | null;
  onClose: () => void;
}) {
  const isEdit = Boolean(rule);
  const [name, setName] = useState(rule?.name ?? "");
  const [when, setWhen] = useState(rule?.when ?? "");
  const [then, setThen] = useState(rule?.then ?? "");
  const [requiresApproval, setRequiresApproval] = useState(rule?.requiresApproval ?? false);
  const [error, setError] = useState<string | null>(null);
  const createRule = useCreateWorkflowRule(clientId);
  const updateRule = useUpdateWorkflowRule(clientId);
  const isPending = createRule.isPending || updateRule.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const data = { name: name.trim(), when: when.trim(), then: then.trim(), requiresApproval };
    if (isEdit && rule) {
      updateRule.mutate(
        { ruleId: rule.id, data },
        {
          onSuccess: () => onClose(),
          onError: (err) => setError(err instanceof Error ? err.message : "Failed to update rule"),
        },
      );
    } else {
      createRule.mutate(data, {
        onSuccess: () => onClose(),
        onError: (err) => setError(err instanceof Error ? err.message : "Failed to create rule"),
      });
    }
  }

  return (
    <CareModal title={isEdit ? "Edit workflow rule" : "Add workflow rule"} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-[var(--text-3)]">
          Rules are read by the AI when processing inbound messages. Write conditions and actions in plain language.
        </p>

        <label className="block space-y-1.5">
          <span className="app-field-label">Rule name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="app-input w-full"
            placeholder="e.g. Escalate billing issues"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="app-field-label">When…</span>
          <textarea
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            required
            rows={2}
            className="app-input w-full resize-none"
            placeholder="e.g. A message mentions a refund, payment failure, or billing dispute"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="app-field-label">Then…</span>
          <textarea
            value={then}
            onChange={(e) => setThen(e.target.value)}
            required
            rows={2}
            className="app-input w-full resize-none"
            placeholder="e.g. Set ticket priority to Urgent and assign to the billing team"
          />
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-[var(--border-2)] p-3.5">
          <input
            type="checkbox"
            checked={requiresApproval}
            onChange={(e) => setRequiresApproval(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <div>
            <p className="text-sm font-medium text-[var(--text-1)]">Require approval before executing</p>
            <p className="text-xs text-[var(--text-4)]">
              The AI will draft the action but wait for a team member to approve it before it runs.
            </p>
          </div>
        </label>

        {error && (
          <p className="rounded-[10px] bg-[var(--danger-50)] px-3 py-2.5 text-sm text-[var(--danger-500)]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={isPending || !name.trim() || !when.trim() || !then.trim()}
            loading={isPending}
          >
            {isPending ? "Saving…" : isEdit ? "Update rule" : "Save rule"}
          </Button>
        </div>
      </form>
    </CareModal>
  );
}


// ─── inbox view ──────────────────────────────────────────────────────────────


// ─── inbox filter dropdown ────────────────────────────────────────────────────

function FilterOption<T extends string | boolean>({
  value,
  active,
  onClick,
  children,
}: {
  value: T;
  active: boolean;
  onClick: (v: T) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2 text-left text-sm transition",
        active ? "bg-[var(--mist)] font-medium text-[var(--brand-700)]" : "text-[var(--text-2)] hover:bg-[var(--surface-1)]",
      )}
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
          active ? "border-[var(--brand-700)] bg-[var(--brand-700)]" : "border-[var(--border-2)]",
        )}
      >
        {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
      {children}
    </button>
  );
}

function InboxFiltersDropdown({
  filterSentiment,
  filterUnread,
  onSentimentChange,
  onUnreadChange,
  onClear,
}: {
  filterSentiment: "all" | "positive" | "neutral" | "negative";
  filterUnread: boolean;
  onSentimentChange: (v: "all" | "positive" | "neutral" | "negative") => void;
  onUnreadChange: (v: boolean) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const activeCount = [
    filterSentiment !== "all",
    filterUnread,
  ].filter(Boolean).length;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-[8px] border px-3 text-sm font-medium transition",
          activeCount > 0
            ? "border-[var(--brand-400)] bg-[var(--mist)] text-[var(--brand-700)]"
            : "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-2)] hover:bg-white",
        )}
      >
        <FunnelIcon className="h-4 w-4 shrink-0" />
        <span>Filters</span>
        {activeCount > 0 && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--brand-700)] text-[10px] font-bold text-white">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-52 rounded-[14px] border border-[var(--border-2)] bg-white p-2 shadow-lg">
          <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-4)]">Sentiment</p>
          <FilterOption value={"all" as const} active={filterSentiment === "all"} onClick={onSentimentChange}>All</FilterOption>
          <FilterOption value={"positive" as const} active={filterSentiment === "positive"} onClick={onSentimentChange}>Positive</FilterOption>
          <FilterOption value={"neutral" as const} active={filterSentiment === "neutral"} onClick={onSentimentChange}>Neutral</FilterOption>
          <FilterOption value={"negative" as const} active={filterSentiment === "negative"} onClick={onSentimentChange}>Negative</FilterOption>

          <div className="my-2 border-t border-[var(--border-2)]" />

          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-4)]">Status</p>
          <FilterOption value={false} active={!filterUnread} onClick={onUnreadChange}>All messages</FilterOption>
          <FilterOption value={true} active={filterUnread} onClick={onUnreadChange}>Unread only</FilterOption>

          {activeCount > 0 && (
            <>
              <div className="my-2 border-t border-[var(--border-2)]" />
              <button
                type="button"
                onClick={() => { onClear(); setOpen(false); }}
                className="w-full rounded-[8px] px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
              >
                Clear all filters
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function InboxView({ clientId }: { clientId: string }) {
  const { data: convoData, isLoading: convosLoading } = useSupportConversations(clientId);
  const convos = useMemo(() => convoData?.conversations ?? [], [convoData]);
  const syncConn = useSyncConnection(clientId);
  const { data: connectionsData } = useSupportConnections(clientId);
  const [filterSource, setFilterSource] = useState<SupportSource | "all">("all");
  // For the empty-state sync button: connector matching the selected source chip
  const matchingConn = useMemo(() => {
    if (filterSource === "all") return null;
    return (connectionsData?.connections ?? []).find((c) => c.source === filterSource) ?? null;
  }, [connectionsData, filterSource]);
  const [syncResult, setSyncResult] = useState<{ ingested?: number; errors: string[] } | null>(null);

  async function handleEmptySync(connId: string) {
    setSyncResult(null);
    try {
      const r = await syncConn.mutateAsync({ connId, resync: true });
      const res = r as unknown as { ingested?: number; created?: number; errors?: string[] };
      setSyncResult({ ingested: res.ingested ?? res.created ?? 0, errors: res.errors ?? [] });
    } catch (e) {
      setSyncResult({ errors: [e instanceof Error ? e.message : String(e)] });
    }
  }

  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search);
  const [filterSentiment, setFilterSentiment] = useState<"all" | "positive" | "neutral" | "negative">("all");
  const [filterUnread, setFilterUnread] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;

  // Semantic (vector) search state
  const [semanticMode, setSemanticMode] = useState(false);
  const [semanticResults, setSemanticResults] = useState<{ id: string; score: number }[] | null>(null);
  const [semanticError, setSemanticError] = useState<string | null>(null);
  const semanticSearch = useSemanticSearch(clientId);

  function clearSemantic() { setSemanticResults(null); setSemanticError(null); }

  async function handleSemanticSearch() {
    if (!search.trim()) return;
    setSemanticError(null);
    try {
      const res = await semanticSearch.mutateAsync({ query: search });
      setSemanticResults(res.results.map((r) => ({ id: r.id, score: r.score })));
    } catch (e) {
      setSemanticError(e instanceof Error ? e.message : "Semantic search failed");
    }
  }

  // Sources to show as filter chips: any configured connection (exc. analytics) + any source
  // that already has conversations. This way Reddit shows even before its first sync.
  const presentSources = useMemo(() => {
    const fromConvos = convos.map((c) => c.source as SupportSource);
    const fromConns = (connectionsData?.connections ?? [])
      .map((c) => c.source as SupportSource)
      .filter((s) => s !== "analytics");
    return [...new Set([...fromConns, ...fromConvos])];
  }, [convos, connectionsData]);

  const filtered = useMemo(() => convos.filter((c) => {
    if (deferred && !c.subject.toLowerCase().includes(deferred.toLowerCase()) && !c.tags.some((t) => t.includes(deferred.toLowerCase()))) return false;
    if (filterSource !== "all" && c.source !== filterSource) return false;
    if (filterSentiment !== "all" && c.sentiment !== filterSentiment) return false;
    if (filterUnread && !c.unread) return false;
    return true;
  }), [convos, deferred, filterSource, filterSentiment, filterUnread]);

  // If a selected conversation is no longer in the filtered list, clear the selection.
  // We do NOT auto-select the first item — the user picks explicitly.
  useEffect(() => {
    if (selectedConvId !== null && !filtered.find((c) => c.id === selectedConvId)) {
      setSelectedConvId(null);
    }
  }, [filtered, selectedConvId]);

  const { data: msgData, isLoading: msgsLoading } = useSupportMessages(clientId, selectedConvId);
  const messages = msgData?.messages ?? [];

  const sendMessage = useSendMessage(clientId, selectedConvId);
  const generateDraft = useGenerateAiDraft(clientId);
  const [replyText, setReplyText] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);

  async function handleSend() {
    if (!replyText.trim() || !selectedConvId) return;
    setReplyError(null);
    try {
      await sendMessage.mutateAsync({ direction: "outbound", authorLabel: "Gitwork Support", body: replyText.trim() });
      setReplyText("");
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : "Send failed");
    }
  }

  async function handleAiDraft() {
    if (!selectedConvId) return;
    try {
      const { draft } = await generateDraft.mutateAsync(selectedConvId);
      setReplyText(draft);
    } catch { /* ignore — if AI fails, the textarea stays empty */ }
  }

  const updateConversation = useUpdateConversation(clientId);

  // Mark conversation as read when opened
  const markedReadRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!selectedConvId) return;
    const convo = convos.find((c) => c.id === selectedConvId);
    if (convo?.unread && !markedReadRef.current.has(selectedConvId)) {
      markedReadRef.current.add(selectedConvId);
      updateConversation.mutate({ convId: selectedConvId, data: { unread: false } });
    }
  }, [selectedConvId, convos, updateConversation]);


  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset to first page when filters or search changes
  useEffect(() => { setPage(0); }, [deferred, filterSource, filterSentiment, filterUnread]);

  // When semantic results are active, show only matched convos ordered by similarity score.
  const displayedConvos = semanticResults
    ? semanticResults
        .map((r) => ({ ...convos.find((c) => c.id === r.id)!, _score: r.score }))
        .filter((c) => c.id)
    : paginated;

  const activeConvo = (semanticResults ? displayedConvos : filtered).find((c) => c.id === selectedConvId) ?? null;

  // Keywords stored in conversation tags as "kw:<term>" by Discord sync
  const activeKeywords = useMemo(
    () => (activeConvo?.tags ?? []).filter((t) => t.startsWith("kw:")).map((t) => t.slice(3)),
    [activeConvo],
  );

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {/* source chips — visible when multiple sources are present */}
      {presentSources.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFilterSource("all")}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition",
              filterSource === "all"
                ? "border-[var(--brand-700)] bg-[var(--mist)] text-[var(--brand-700)]"
                : "border-[var(--border-2)] bg-white text-[var(--text-3)] hover:bg-[var(--surface-1)]",
            )}
          >
            All
            <span className={cn(
              "flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-bold",
              filterSource === "all" ? "bg-[var(--brand-700)] text-white" : "bg-[var(--surface-1)] text-[var(--text-4)]",
            )}>
              {convos.length}
            </span>
          </button>
          {presentSources.map((src) => {
            const active = filterSource === src;
            const srcCount = convos.filter((c) => c.source === src).length;
            return (
              <button
                key={src}
                type="button"
                onClick={() => setFilterSource(active ? "all" : src)}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition",
                  active
                    ? "border-[var(--brand-700)] bg-[var(--mist)] text-[var(--brand-700)]"
                    : "border-[var(--border-2)] bg-white text-[var(--text-3)] hover:bg-[var(--surface-1)]",
                )}
              >
                <SourceIcon source={src} className="h-3 w-3" />
                {SOURCE_LABEL[src]}
                <span className={cn(
                  "flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-bold",
                  active ? "bg-[var(--brand-700)] text-white" : "bg-[var(--surface-1)] text-[var(--text-4)]",
                )}>
                  {srcCount}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* search + filter bar */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-[14rem] flex-1 sm:max-w-xs">
          {semanticMode
            ? <SparklesIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-500" />
            : <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-4)]" />
          }
          <input
            className={cn(
              "h-9 w-full rounded-[6px] border bg-[var(--surface-1)] pl-9 pr-3 text-sm text-[var(--text-1)] outline-none transition placeholder:text-[var(--text-4)]",
              semanticMode
                ? "border-violet-300 focus:border-violet-500 focus:bg-white"
                : "border-[var(--border-2)] focus:border-[var(--brand-700)] focus:bg-white",
            )}
            placeholder={semanticMode ? "Ask anything… (press Enter)" : "Search inbox…"}
            value={search}
            onChange={(e) => { setSearch(e.target.value); if (semanticResults) clearSemantic(); }}
            onKeyDown={(e) => { if (e.key === "Enter" && semanticMode && search.trim()) void handleSemanticSearch(); }}
          />
        </div>
        <button
          type="button"
          title={semanticMode ? "AI semantic search on — click for text search" : "Switch to AI semantic search"}
          onClick={() => { setSemanticMode((m) => !m); clearSemantic(); setSearch(""); }}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border transition",
            semanticMode
              ? "border-violet-400 bg-violet-50 text-violet-600"
              : "border-[var(--border-2)] bg-white text-[var(--text-3)] hover:bg-[var(--surface-1)]",
          )}
        >
          <SparklesIcon className="h-4 w-4" />
        </button>
        <InboxFiltersDropdown
          filterSentiment={filterSentiment}
          filterUnread={filterUnread}
          onSentimentChange={setFilterSentiment}
          onUnreadChange={setFilterUnread}
          onClear={() => { setFilterSentiment("all"); setFilterUnread(false); }}
        />
      </div>
      {semanticError && (
        <p className="rounded-[6px] bg-red-50 px-3 py-2 text-xs text-red-600">{semanticError}</p>
      )}

      {/* two-column layout */}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        {/* conversation list */}
        <div className="app-card flex min-w-0 flex-col overflow-hidden p-0">
          {/* widget header */}
          <div className="flex h-9 items-center justify-between border-b border-black/[0.06] px-4">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-stone-400">
              {semanticResults ? "AI SEARCH" : "01 // INBOX"}
            </span>
            <div className="flex items-center gap-2">
              {semanticResults && (
                <button
                  type="button"
                  onClick={clearSemantic}
                  className="flex h-4 items-center gap-0.5 rounded-full bg-violet-100 px-1.5 text-[10px] font-semibold text-violet-600 hover:bg-violet-200"
                >
                  <XMarkIcon className="h-2.5 w-2.5" /> clear
                </button>
              )}
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-stone-400">
                {semanticResults ? semanticResults.length : filtered.length}
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <div className="max-h-[calc(100vh-22rem)] space-y-2 overflow-y-auto pr-0.5">
            {(convosLoading || semanticSearch.isPending) && (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />
                ))}
              </div>
            )}
            {!convosLoading && !semanticSearch.isPending && displayedConvos.length === 0 && (
              <p className="py-8 text-center text-sm text-[var(--text-4)]">
                {semanticResults ? "No matching conversations found." : "No conversations found."}
              </p>
            )}
            {displayedConvos.map((c) => (
              <ConversationCard
                key={c.id}
                convo={c}
                active={c.id === selectedConvId}
                onClick={() => setSelectedConvId(c.id)}
              />
            ))}
            </div>
            {totalPages > 1 && (
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-40"
                >
                  ← Prev
                </button>
                <span className="text-xs text-[var(--text-4)]">{page + 1} / {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── detail pane ──────────────────────────────────────────────── */}
        <div className="app-card flex min-w-0 flex-col overflow-hidden" style={{ minHeight: 0, maxHeight: "calc(100vh - 14rem)" }}>
          {/* widget header */}
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-black/[0.06] px-4">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-stone-400">
              02 // CONVERSATION
            </span>
            {activeConvo && (
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-emerald-600">
                LIVE
              </span>
            )}
          </div>

          {!activeConvo ? (
            <div className="flex h-40 items-center justify-center text-sm text-[var(--text-4)]">
              Select a conversation
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {/* subject header */}
              <div className="shrink-0 border-b border-[var(--border-2)] px-5 py-3">
                <h2 className="truncate text-sm font-semibold text-[var(--text-1)]">
                  {activeConvo.subject}
                </h2>
                {activeKeywords.length > 0 && messages.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-amber-700">
                    <span className="font-semibold">Watching:</span>
                    {activeKeywords.map((kw) => (
                      <span key={kw} className="rounded bg-amber-200 px-1.5 py-0.5 font-medium text-amber-900">{kw}</span>
                    ))}
                  </div>
                )}
              </div>
              {/* messages */}
              <div className="flex-1 space-y-3 overflow-y-auto p-5">
                {msgsLoading && (
                  <div className="space-y-2">
                    {[...Array(2)].map((_, i) => (
                      <div key={i} className="h-16 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />
                    ))}
                  </div>
                )}
                {!msgsLoading && messages.length === 0 && (
                  <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <p className="text-sm text-[var(--text-4)]">No messages yet.</p>
                    {matchingConn && (
                      <button
                        type="button"
                        onClick={() => void handleEmptySync(matchingConn.id)}
                        disabled={syncConn.isPending}
                        className="flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
                      >
                        <BoltIcon className={cn("h-3.5 w-3.5", syncConn.isPending && "animate-spin")} />
                        {syncConn.isPending ? "Syncing…" : "Sync Now to pull messages"}
                      </button>
                    )}
                    {syncResult && (
                      <p className={cn(
                        "max-w-[20rem] text-[12px]",
                        syncResult.errors.length > 0 ? "text-red-600" : "text-emerald-700",
                      )}>
                        {syncResult.errors.length > 0
                          ? `Sync failed: ${syncResult.errors[0]}`
                          : `Synced — ${syncResult.ingested ?? 0} pulled in. If still empty, the bot may lack channel access (check Edit connector).`}
                      </p>
                    )}
                  </div>
                )}
                {messages.map((msg) => {
                  const hasKeyword = activeKeywords.length > 0 && activeKeywords.some((kw) =>
                    msg.body.toLowerCase().includes(kw.toLowerCase()),
                  );
                  return (
                    <div key={msg.id} className={cn("flex flex-col gap-0.5", msg.direction === "outbound" ? "items-end" : "items-start")}>
                      <div className="flex items-center gap-1.5 px-1 text-[10px] text-[var(--text-4)]">
                        <span className="font-medium text-[var(--text-3)]">{msg.authorLabel}</span>
                        <span>·</span>
                        <span>{formatShort(msg.createdAt)}</span>
                        {hasKeyword && (
                          <span className="rounded-[4px] bg-amber-100 px-1 py-px font-semibold text-amber-700">keyword</span>
                        )}
                      </div>
                      <div
                        className={cn(
                          "max-w-[85%] rounded-[10px] border px-3.5 py-2.5 text-sm leading-relaxed",
                          hasKeyword
                            ? "border-amber-300 bg-amber-50 text-[var(--text-1)]"
                            : msg.direction === "outbound"
                              ? "border-[var(--mist-border)] bg-[var(--mist)] text-[var(--text-1)]"
                              : "border-[var(--border-2)] bg-white text-[var(--text-2)]",
                        )}
                      >
                        <HighlightedText text={msg.body} keywords={activeKeywords} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Reply Composer ─────────────────────────────────────── */}
              {(() => {
                const source = activeConvo.source;
                const tags = activeConvo.tags ?? [];
                const isPlayReview = source === "app_reviews" && tags.includes("store:play_store");
                const isAppStoreReview = source === "app_reviews" && tags.includes("store:app_store");
                const canSend = source === "discord" || source === "gmail" || isPlayReview;
                // Google Play caps developer replies at 350 chars.
                const replyLimit = isPlayReview ? 350 : null;
                const overLimit = replyLimit !== null && replyText.length > replyLimit;
                const manualLabel = isAppStoreReview ? "Reply in App Store Connect" : `Manual — reply on ${source}`;
                return (
                  <div className="shrink-0 border-t border-[var(--border-2)] bg-[var(--surface-0,#fafafa)] px-4 py-3">
                    <div className="flex items-center justify-between pb-2">
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[1px] text-[var(--text-4)]">
                        Reply
                      </span>
                      <div className="flex items-center gap-2">
                        {!canSend && (
                          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            {manualLabel}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleAiDraft()}
                          disabled={generateDraft.isPending || !selectedConvId}
                          title="Generate AI draft"
                          className="flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-white px-2 py-1 text-[11px] font-medium text-[var(--text-3)] transition hover:bg-[var(--surface-1)] disabled:opacity-40"
                        >
                          <SparklesIcon className={cn("h-3.5 w-3.5 text-violet-500", generateDraft.isPending && "animate-spin")} />
                          {generateDraft.isPending ? "Drafting…" : "AI Draft"}
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !overLimit) void handleSend(); }}
                      maxLength={replyLimit ?? undefined}
                      placeholder={canSend ? "Write a reply… (⌘↵ to send)" : "Draft your reply, then copy it to send manually…"}
                      rows={3}
                      className="w-full resize-none rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:border-[var(--brand-600)] focus:outline-none"
                    />
                    {replyLimit !== null && (
                      <p className={cn("mt-1 text-right text-[11px]", overLimit ? "text-red-600" : "text-[var(--text-4)]")}>
                        {replyText.length}/{replyLimit}
                      </p>
                    )}
                    {replyError && (
                      <p className="mt-1 text-[11px] text-red-600">{replyError}</p>
                    )}
                    <div className="mt-2 flex justify-end gap-2">
                      {!canSend ? (
                        <button
                          type="button"
                          disabled={!replyText.trim()}
                          onClick={() => { void navigator.clipboard.writeText(replyText); }}
                          className="flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-40"
                        >
                          <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                          Copy
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!replyText.trim() || sendMessage.isPending || overLimit}
                          onClick={() => void handleSend()}
                          className="flex items-center gap-1.5 rounded-[6px] bg-[var(--brand-700)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--brand-800)] disabled:opacity-40"
                        >
                          <PaperAirplaneIcon className="h-3.5 w-3.5" />
                          {sendMessage.isPending ? "Sending…" : "Send"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConversationCard({
  convo,
  active,
  onClick,
}: {
  convo: Conversation;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-[10px] border px-3 py-2.5 text-left transition",
        active
          ? "border-[var(--mist-border)] bg-[var(--mist)] shadow-sm"
          : "border-[var(--border-2)] bg-white hover:border-[var(--mist-border)] hover:bg-[var(--surface-1)]",
      )}
    >
      {/* Row 1: icon + dots + subject + time */}
      {(() => {
        const dashIdx = convo.source === "gmail" ? convo.subject.indexOf(" - ") : -1;
        const subjectMain = dashIdx > -1 ? convo.subject.slice(0, dashIdx) : convo.subject;
        const subjectDetail = dashIdx > -1 ? convo.subject.slice(dashIdx + 3) : null;
        const preview = convo.source !== "gmail" ? convo.preview : null;
        return (
          <>
            <div className="flex items-center gap-1.5">
              <SourceIcon source={convo.source} />
              {convo.unread && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-700)]" title="Unread" />
              )}
              {convo.sentiment === "negative" && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" title="Negative sentiment" />
              )}
              <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-1)]">{subjectMain}</h3>
              <span className="shrink-0 whitespace-nowrap text-[11px] text-[var(--text-4)]">
                {formatShort(convo.receivedAt)}
              </span>
            </div>
            {/* Row 2: email detail or preview */}
            {(subjectDetail ?? preview) && (
              <p className="mt-0.5 truncate pl-[1.375rem] text-xs text-[var(--text-4)]">
                {subjectDetail ?? preview}
              </p>
            )}
          </>
        );
      })()}
      {(() => {
        const kwTags = convo.tags.filter((t) => t.startsWith("kw:"));
        const visibleTags = [...new Set(convo.tags)].filter((t) => t !== convo.source && !t.startsWith("kw:"));
        return (visibleTags.length > 0 || kwTags.length > 0) ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {visibleTags.map((tag) => (
              <span
                key={tag}
                className="rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-3)]"
              >
                {tag.replace(/_/g, " ")}
              </span>
            ))}
            {kwTags.length > 0 && (
              <span className="rounded-[6px] border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                {kwTags.length === 1 ? kwTags[0].slice(3) : `${kwTags.length} keywords`} watched
              </span>
            )}
          </div>
        ) : null;
      })()}
    </button>
  );
}

// ─── subreddit / tickets view ─────────────────────────────────────────────────

function SubredditView({ clientId, onGoToConnectors }: { clientId: string; onGoToConnectors?: () => void }) {
  const { data: connectionsData } = useSupportConnections(clientId);
  const { data: convoData } = useSupportConversations(clientId);
  const syncConn = useSyncConnection(clientId);

  const redditConnectors = useMemo(
    () => (connectionsData?.connections ?? []).filter((c) => c.source === "reddit"),
    [connectionsData],
  );
  const allConvos = useMemo(() => convoData?.conversations ?? [], [convoData]);

  const [selectedConnId, setSelectedConnId] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ ingested?: number; errors: string[] } | null>(null);

  async function handleSync(connId: string) {
    setSyncResult(null);
    try {
      const r = await syncConn.mutateAsync({ connId, resync: true });
      // server returns { ingested, filtered, errors } — types vary, read loosely
      const res = r as unknown as { ingested?: number; created?: number; errors?: string[] };
      setSyncResult({ ingested: res.ingested ?? res.created ?? 0, errors: res.errors ?? [] });
    } catch (e) {
      setSyncResult({ errors: [e instanceof Error ? e.message : String(e)] });
    }
  }

  // Auto-select first connector when data loads
  useEffect(() => {
    if (redditConnectors.length > 0 && !selectedConnId) {
      setSelectedConnId(redditConnectors[0].id);
    }
  }, [redditConnectors, selectedConnId]);

  const selectedConn = redditConnectors.find((c) => c.id === selectedConnId) ?? null;
  const subreddit = selectedConn?.scraperConfig?.subreddit ?? "";
  const keywords = useMemo(() => (selectedConn?.scraperConfig?.keywords ?? []), [selectedConn]);

  // Posts = conversations from this subreddit (tagged with subreddit name)
  const posts = useMemo(
    () => allConvos.filter((c) => c.source === "reddit" && (subreddit ? c.tags.includes(subreddit) : true)),
    [allConvos, subreddit],
  );

  const { data: msgData, isLoading: msgsLoading } = useSupportMessages(clientId, selectedPostId);
  const postMessages = msgData?.messages ?? [];
  const selectedPost = posts.find((p) => p.id === selectedPostId) ?? null;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">

        {/* ── Left: subreddit connector cards ─────────────────────────────── */}
        <div className="app-card flex min-w-0 flex-col overflow-hidden p-0">
          <div className="flex h-9 items-center justify-between border-b border-black/[0.06] px-4">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-stone-400">
              01 // POSTS
            </span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-stone-400">
              {posts.length}
            </span>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {redditConnectors.length === 0 ? (
              <div className="py-8 text-center text-sm text-[var(--text-4)]">
                <p>No Reddit connectors yet.</p>
                {onGoToConnectors && (
                  <button type="button" onClick={onGoToConnectors} className="mt-1 text-[var(--brand-700)]">
                    Add one in Connectors →
                  </button>
                )}
              </div>
            ) : (
              redditConnectors.map((conn) => {
                const sub = conn.scraperConfig?.subreddit ?? "";
                const connPosts = allConvos.filter((c) => c.source === "reddit" && c.tags.includes(sub));
                const kwCount = (conn.scraperConfig?.keywords ?? []).length;
                const flagged = connPosts.filter((p) =>
                  kwCount > 0 && (conn.scraperConfig?.keywords ?? []).some((kw) =>
                    p.subject.toLowerCase().includes(kw.toLowerCase()) || p.preview.toLowerCase().includes(kw.toLowerCase()),
                  ),
                ).length;
                const isActive = conn.id === selectedConnId;
                return (
                  <button
                    key={conn.id}
                    type="button"
                    onClick={() => { setSelectedConnId(conn.id); setSelectedPostId(null); }}
                    className={cn(
                      "w-full rounded-[10px] border px-3 py-2.5 text-left transition",
                      isActive
                        ? "border-[var(--mist-border)] bg-[var(--mist)] shadow-sm"
                        : "border-[var(--border-2)] bg-white hover:border-[var(--mist-border)] hover:bg-[var(--surface-1)]",
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <SourceIcon source="reddit" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-1)]">
                        r/{sub || conn.label}
                      </span>
                      <span className="shrink-0 text-[11px] text-[var(--text-4)]">{connPosts.length}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1 pl-[1.375rem]">
                      {kwCount > 0 && (
                        <span className="rounded-[6px] border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                          {kwCount} keyword{kwCount !== 1 ? "s" : ""} watched
                        </span>
                      )}
                      {flagged > 0 && (
                        <span className="rounded-[6px] border border-red-200 bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-600">
                          {flagged} flagged
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Right: posts feed or post detail ─────────────────────────────── */}
        <div className="app-card flex min-w-0 flex-col overflow-hidden p-0">
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-black/[0.06] px-4">
            <div className="flex items-center gap-2">
              {selectedPostId && (
                <button
                  type="button"
                  onClick={() => setSelectedPostId(null)}
                  className="mr-1 text-[11px] text-[var(--text-4)] hover:text-[var(--brand-700)]"
                >
                  ← Back
                </button>
              )}
              <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-stone-400">
                {selectedPost ? selectedPost.subject.slice(0, 40) : selectedConn ? `02 // r/${subreddit}` : "02 // SUBREDDIT"}
              </span>
            </div>
            {selectedConn && !selectedPostId && (
              <div className="flex items-center gap-2">
                <a
                  href={`https://www.reddit.com/r/${subreddit}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] font-medium text-[var(--text-4)] transition hover:text-[var(--brand-700)]"
                >
                  View ↗
                </a>
                <button
                  type="button"
                  onClick={() => void handleSync(selectedConn.id)}
                  disabled={syncConn.isPending}
                  className="flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-3)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
                >
                  <BoltIcon className={cn("h-3 w-3", syncConn.isPending && "animate-spin")} />
                  {syncConn.isPending ? "Syncing…" : "Sync Now"}
                </button>
              </div>
            )}
          </div>

          {!selectedConn ? (
            <div className="flex h-40 items-center justify-center text-sm text-[var(--text-4)]">
              Select a subreddit
            </div>
          ) : selectedPostId && selectedPost ? (
            /* ── Post detail view ── */
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="border-b border-[var(--border-2)] px-5 py-4">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]">
                  <SourceIcon source="reddit" />
                  <span>REDDIT</span>
                  <span className="text-[var(--text-4)]">·</span>
                  <span>{selectedPost.customerLabel}</span>
                  <span className="text-[var(--text-4)]">·</span>
                  <a
                    href={`https://www.reddit.com/r/${subreddit}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--text-4)] hover:text-[var(--brand-700)]"
                  >
                    r/{subreddit} ↗
                  </a>
                </div>
                <h2 className="mt-1 text-base font-semibold text-[var(--text-1)]">{selectedPost.subject}</h2>
                <p className="mt-0.5 text-[11px] text-[var(--text-4)]">{formatShort(selectedPost.receivedAt)}</p>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-5">
                {keywords.length > 0 && postMessages.length > 0 && (
                  <div className="flex items-center gap-1.5 rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                    <span className="font-semibold">Watching:</span>
                    {keywords.map((kw) => (
                      <span key={kw} className="rounded bg-amber-200 px-1.5 py-0.5 font-medium text-amber-900">{kw}</span>
                    ))}
                  </div>
                )}
                {msgsLoading && <div className="h-16 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />}
                {!msgsLoading && postMessages.length === 0 && (
                  <p className="py-6 text-center text-sm text-[var(--text-4)]">No message body synced for this post.</p>
                )}
                {postMessages.map((msg) => {
                  const hasKeyword = keywords.some((kw) => msg.body.toLowerCase().includes(kw.toLowerCase()));
                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "rounded-[10px] border p-3.5 text-sm leading-6",
                        hasKeyword
                          ? "border-amber-300 bg-amber-50"
                          : "border-[var(--border-2)] bg-[var(--surface-1)]",
                      )}
                    >
                      <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--text-3)]">
                        <span>{msg.authorLabel}</span>
                        <span>{formatShort(msg.createdAt)}</span>
                      </div>
                      <HighlightedText text={msg.body} keywords={keywords} />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ── Posts feed ── */
            <div className="flex-1 overflow-y-auto p-4">
              {keywords.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                  <span className="font-semibold">Watching for:</span>
                  {keywords.map((kw) => (
                    <span key={kw} className="rounded bg-amber-200 px-1.5 py-0.5 font-medium text-amber-900">{kw}</span>
                  ))}
                  <span className="ml-1 text-amber-600">— flagged below</span>
                </div>
              )}
              {/* sync result / error banner */}
              {syncResult && (
                <div className={cn(
                  "mb-3 rounded-[8px] border px-3 py-2 text-[12px]",
                  syncResult.errors.length > 0
                    ? "border-red-200 bg-red-50 text-red-600"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700",
                )}>
                  {syncResult.errors.length > 0
                    ? <><span className="font-semibold">Sync failed:</span> {syncResult.errors[0]}</>
                    : <><span className="font-semibold">Synced.</span> {syncResult.ingested ?? 0} new post{(syncResult.ingested ?? 0) !== 1 ? "s" : ""} pulled in.</>
                  }
                </div>
              )}
              {posts.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                  <p className="text-sm text-[var(--text-4)]">No posts synced yet for r/{subreddit}</p>
                  <p className="text-xs text-[var(--text-4)]">Hit Sync Now above to pull the latest posts</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {posts.map((post) => {
                    const hasKw = keywords.length > 0 && keywords.some((kw) =>
                      post.subject.toLowerCase().includes(kw.toLowerCase()) ||
                      post.preview.toLowerCase().includes(kw.toLowerCase()),
                    );
                    return (
                      <button
                        key={post.id}
                        type="button"
                        onClick={() => setSelectedPostId(post.id)}
                        className={cn(
                          "w-full rounded-[10px] border px-3 py-2.5 text-left transition",
                          hasKw
                            ? "border-amber-300 bg-amber-50 hover:bg-amber-100"
                            : "border-[var(--border-2)] bg-white hover:bg-[var(--surface-1)]",
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          {hasKw && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" title="Keyword match" />}
                          {post.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-700)]" title="Unread" />}
                          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-1)]">
                            {post.subject}
                          </h3>
                          <span className="shrink-0 text-[11px] text-[var(--text-4)]">{formatShort(post.receivedAt)}</span>
                        </div>
                        {post.preview && (
                          <p className="mt-0.5 line-clamp-2 pl-[1.375rem] text-xs text-[var(--text-4)]">
                            <HighlightedText text={post.preview} keywords={keywords} />
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function TicketsTableView({ clientId }: { clientId: string }) {
  const [view, setView] = useState<"board" | "table">("table");
  const { data, isLoading } = useSupportTickets(clientId);
  const tickets = data?.tickets ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const updateTicket = useUpdateTicket(clientId);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const batchUpdate = useBatchUpdateTickets(clientId);
  const [batchAssign, setBatchAssign] = useState("");
  const [batchError, setBatchError] = useState<string | null>(null);

  // Rolling 30-day performance window for the KPI strip.
  const { perfStart, perfEnd } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return { perfStart: start.toISOString().slice(0, 10), perfEnd: end.toISOString().slice(0, 10) };
  }, []);
  const { data: perfData } = useTicketPerformance(clientId, perfStart, perfEnd);

  async function runBatch(data: Partial<{ status: string; priority: string; assignedTo: string }>) {
    setBatchError(null);
    try {
      await batchUpdate.mutateAsync({ ticketIds: Array.from(selectedIds), data });
      clearSelection();
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : "Batch update failed");
    }
  }

  if (isLoading) {
    return (
      <div className="app-card overflow-hidden p-0">
        {[...Array(4)].map((_, i) => (
          <div key={i} className={cn("h-12 animate-pulse bg-[var(--surface-1)]", i > 0 && "border-t border-[var(--border-2)]")} />
        ))}
      </div>
    );
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function clearSelection() { setSelectedIds(new Set()); }

  if (tickets.length === 0) {
    return (
      <div className="app-card flex h-40 items-center justify-center text-sm text-[var(--text-4)]">
        No tickets for this client yet.
      </div>
    );
  }

  const open = tickets.filter((t) => t.status !== "resolved");
  const resolved = tickets.filter((t) => t.status === "resolved");
  const allIds = tickets.map((t) => t.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  function TicketTable({ rows }: { rows: Ticket[] }) {
    const rowIds = rows.map((t) => t.id);
    const allRowSelected = rowIds.every((id) => selectedIds.has(id));
    return (
      <div className="app-card overflow-hidden p-0">
        {/* column header */}
        <div className="grid grid-cols-[1.5rem_1fr_auto_auto_auto_auto] items-center gap-3 border-b border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-4)]">
          <input
            type="checkbox"
            checked={allRowSelected}
            onChange={() => {
              setSelectedIds((prev) => {
                const next = new Set(prev);
                allRowSelected ? rowIds.forEach((id) => next.delete(id)) : rowIds.forEach((id) => next.add(id));
                return next;
              });
            }}
            className="h-3.5 w-3.5 cursor-pointer rounded"
          />
          <span>Title</span>
          <span className="w-20 text-center">Priority</span>
          <span className="w-24 text-right">Updated</span>
          <span className="w-8" />
          <span className="w-36 text-right">Status</span>
        </div>
        {rows.map((ticket) => {
          const isExpanded = expandedId === ticket.id;
          const isSelected = selectedIds.has(ticket.id);
          return (
            <div key={ticket.id} className={cn("border-b border-[var(--border-2)] last:border-b-0", isSelected && "bg-[var(--mist)]")}>
              {/* main row */}
              <div className="grid w-full grid-cols-[1.5rem_1fr_auto_auto_auto_auto] items-center gap-3 px-4 py-3 transition hover:bg-[var(--surface-1)]">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(ticket.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-3.5 w-3.5 cursor-pointer rounded"
                />
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : ticket.id)}
                  className="min-w-0 text-left"
                >
                  <p className="truncate text-sm font-semibold text-[var(--text-1)]">{ticket.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-[var(--text-4)]">{ticket.customerLabel}</span>
                    {ticket.issueType && (
                      <span className="rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-3)]">
                        {ticket.issueType}
                      </span>
                    )}
                    <span className="flex items-center gap-1 rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-3)]">
                      <SourceIcon source={ticket.source} className="h-3 w-3" />
                      {SOURCE_LABEL[ticket.source]}
                    </span>
                  </div>
                </button>
                <span className={cn("inline-flex w-20 items-center justify-center rounded-md px-2 py-0.5 text-[10px] font-semibold", PRIORITY_TONE[ticket.priority])}>
                  {ticket.priority}
                </span>
                <span className="w-24 text-right text-[11px] text-[var(--text-4)]">{formatShort(ticket.updatedAt)}</span>
                {/* chevron */}
                <button type="button" onClick={() => setExpandedId(isExpanded ? null : ticket.id)} className="flex w-8 justify-center text-[var(--text-4)]">
                  <svg className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {/* status dropdown */}
                <div className="flex w-36 justify-end">
                  <select
                    value={ticket.status}
                    onChange={(e) => updateTicket.mutate({ ticketId: ticket.id, data: { status: e.target.value as TicketStatus } })}
                    className={cn(
                      "app-select-chevron cursor-pointer rounded-md border py-0.5 pl-2 pr-6 text-[10px] font-semibold outline-none transition",
                      STATUS_TONE[ticket.status],
                    )}
                  >
                    {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((s) => (
                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* expanded detail */}
              {isExpanded && (
                <div className="border-t border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
                  <div className="flex flex-wrap gap-x-8 gap-y-3 text-xs">
                    {ticket.nextAction && (
                      <div className="min-w-[12rem]">
                        <p className="font-semibold text-[var(--text-3)]">Next action</p>
                        <p className="mt-0.5 text-[var(--text-2)]">{ticket.nextAction}</p>
                      </div>
                    )}
                    {ticket.assignedTo && (
                      <div>
                        <p className="font-semibold text-[var(--text-3)]">Assigned to</p>
                        <p className="mt-0.5 text-[var(--text-2)]">{ticket.assignedTo}</p>
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-[var(--text-3)]">Quality (CSAT)</p>
                      <div className="mt-1 flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            title={`Rate ${star}/5`}
                            onClick={() => updateTicket.mutate({
                              ticketId: ticket.id,
                              data: { csatScore: ticket.csatScore === star ? null : star },
                            })}
                            className={cn(
                              "transition",
                              (ticket.csatScore ?? 0) >= star
                                ? "text-amber-400"
                                : "text-[var(--border-2)] hover:text-amber-300",
                            )}
                          >
                            <StarIcon className="h-4 w-4 fill-current" />
                          </button>
                        ))}
                        {ticket.csatScore && (
                          <span className="ml-1.5 text-[10px] text-[var(--text-4)]">{ticket.csatScore}/5</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 30-day performance KPIs */}
      {perfData?.metrics && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-stone-400">
              PERFORMANCE // LAST 30 DAYS
            </span>
          </div>
          <PerformanceStrip metrics={perfData.metrics} />
        </div>
      )}

      {/* view toggle */}
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => setView("table")}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-[6px] transition",
            view === "table" ? "bg-[var(--mist)] text-[var(--brand-700)]" : "text-[var(--text-4)] hover:bg-[var(--surface-1)]",
          )}
          title="List view"
        >
          <ListBulletIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setView("board")}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-[6px] transition",
            view === "board" ? "bg-[var(--mist)] text-[var(--brand-700)]" : "text-[var(--text-4)] hover:bg-[var(--surface-1)]",
          )}
          title="Board view"
        >
          <Squares2X2Icon className="h-4 w-4" />
        </button>
      </div>

      {view === "board" ? (
        <TicketsKanban clientId={clientId} tickets={tickets} />
      ) : (
        <>
          {/* Select-all row */}
          {tickets.length > 0 && (
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-[var(--text-3)]">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => {
                    setSelectedIds(allSelected ? new Set() : new Set(allIds));
                  }}
                  className="h-3.5 w-3.5 cursor-pointer rounded"
                />
                {allSelected ? "Deselect all" : "Select all"}
              </label>
              {someSelected && (
                <span className="text-[11px] text-[var(--text-4)]">{selectedIds.size} selected</span>
              )}
            </div>
          )}

          {open.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-4)]">
                Open · {open.length}
              </p>
              <TicketTable rows={open} />
            </div>
          )}
          {resolved.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-4)]">
                Resolved · {resolved.length}
              </p>
              <TicketTable rows={resolved} />
            </div>
          )}

          {/* Batch bar */}
          {someSelected && (
            <div className="sticky bottom-4 z-20 flex flex-col gap-1.5">
              {batchError && (
                <p className="rounded-[6px] border border-red-200 bg-red-50 px-3 py-1 text-[11px] text-red-600">{batchError}</p>
              )}
              <div className="flex items-center gap-3 rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-2.5 shadow-lg">
                <span className="text-[11px] font-semibold text-[var(--text-2)]">{selectedIds.size} selected</span>
                <div className="h-4 w-px bg-[var(--border-2)]" />
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const val = e.target.value;
                    e.target.value = "";
                    void runBatch({ status: val });
                  }}
                  className="app-select-compact h-7 !min-h-0 w-auto bg-[var(--surface-1)] text-[11px]"
                >
                  <option value="">Set status…</option>
                  {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((s) => (
                    <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                  ))}
                </select>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const val = e.target.value;
                    e.target.value = "";
                    void runBatch({ priority: val });
                  }}
                  className="app-select-compact h-7 !min-h-0 w-auto bg-[var(--surface-1)] text-[11px]"
                >
                  <option value="">Set priority…</option>
                  {(["urgent", "high", "normal", "low"] as TicketPriority[]).map((p) => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
                <div className="flex items-center gap-1.5">
                  <input
                    value={batchAssign}
                    onChange={(e) => setBatchAssign(e.target.value)}
                    placeholder="Assign to…"
                    className="h-7 w-32 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2 text-[11px] text-[var(--text-1)] outline-none focus:border-[var(--brand-700)]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && batchAssign.trim()) {
                        void runBatch({ assignedTo: batchAssign.trim() }).then(() => setBatchAssign(""));
                      }
                    }}
                  />
                  {batchAssign.trim() && (
                    <button
                      type="button"
                      onClick={() => void runBatch({ assignedTo: batchAssign.trim() }).then(() => setBatchAssign(""))}
                      className="h-7 rounded-[6px] border border-[var(--border-2)] bg-[var(--brand-700)] px-2 text-[11px] font-medium text-white transition hover:bg-[var(--brand-800)]"
                    >
                      Assign
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="ml-auto flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--text-4)] hover:bg-[var(--surface-1)]"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── reports view ────────────────────────────────────────────────────────────

function emptyPayload(author: string, forMonth?: Date): SupportReportPayload {
  // Default to previous month — when creating in June you're reporting on May
  const ref = forMonth ?? (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d; })();
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return {
    author,
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
    overviewText: "",
    totalTickets: 0,
    catCancellations: 0,
    catAccountQueries: 0,
    catRefunds: 0,
    catTechIssues: 0,
    catOther: 0,
    prioUrgent: 0,
    prioHigh: 0,
    prioMedium: 0,
    prioLow: 0,
    performanceText: "",
    refundRequests: 0,
    refundsProcessed: 0,
    refundTotalValue: 0,
    refundNotes: "",
    metrics: [],
    summaryText: "",
  };
}

function numInput(
  label: string,
  value: number,
  onChange: (v: number) => void,
  prefix?: string,
  trend?: number,
) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-[var(--text-3)]">
        {label}
        {trend !== undefined && trend !== 0 && <TrendBadge delta={trend} />}
      </p>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-sm text-[var(--text-3)]">{prefix}</span>}
        <input
          type="number"
          min={0}
          value={value || ""}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="h-8 w-full rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-700)] focus:bg-white"
        />
      </div>
    </div>
  );
}

function textareaInput(
  label: string,
  value: string,
  onChange: (v: string) => void,
  placeholder: string,
  rows = 4,
) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-[var(--text-3)]">{label}</p>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full resize-none rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3 text-sm text-[var(--text-1)] outline-none transition placeholder:text-[var(--text-4)] focus:border-[var(--brand-700)] focus:bg-white"
      />
    </div>
  );
}

function ReportBuilder({
  clientId,
  report,
  onSaved,
  onCancel,
}: {
  clientId: string;
  report: SupportReport | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { data: session } = useSession();
  const authorDefault = session?.user?.name ?? "";

  // Default period is previous month (May when viewing in June)
  const defaultMonthDate = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d; })();
  const [period, setPeriod] = useState(
    report?.period ?? defaultMonthDate.toLocaleString("en-GB", { month: "long", year: "numeric" }),
  );
  const [p, setP] = useState<SupportReportPayload>(
    report?.payload ?? emptyPayload(authorDefault),
  );

  // Analytics API import — driven by the client's analytics connection (token lives
  // server-side on the connection, no more localStorage).
  const { data: connectionsData } = useSupportConnections(clientId);
  const analyticsConn = useMemo(
    () => (connectionsData?.connections ?? []).find((c) => c.source === "analytics") ?? null,
    [connectionsData],
  );
  const [fetchingApi, setFetchingApi] = useState(false);
  const [apiMsg, setApiMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [writingSummary, setWritingSummary] = useState(false);

  const metrics = p.metrics ?? [];

  async function handleWriteSummary() {
    setWritingSummary(true);
    setApiMsg(null);
    try {
      const res = await fetch(`/api/support/clients/${clientId}/analytics/narrative`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metrics, periodLabel: period }),
      });
      const json = (await res.json().catch(() => ({}))) as { data?: { narrative?: string }; error?: string };
      if (!res.ok) throw new Error(json.error ?? `AI: ${res.status}`);
      if (json.data?.narrative) {
        setP((prev) => ({ ...prev, analyticsNarrative: json.data!.narrative }));
        setApiMsg({ type: "ok", text: "Trend summary written." });
      }
    } catch (err) {
      setApiMsg({ type: "err", text: err instanceof Error ? err.message : "Failed to write summary" });
    } finally {
      setWritingSummary(false);
    }
  }

  const generateNarrative = useGenerateReportNarrative(clientId);
  const { data: reportPerf } = useTicketPerformance(clientId, p.periodStart, p.periodEnd);
  const [narrativeMsg, setNarrativeMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function handleWriteNarrative() {
    setNarrativeMsg(null);
    try {
      const res = await generateNarrative.mutateAsync({
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        periodLabel: period,
      });
      setP((prev) => ({
        ...prev,
        overviewText: res.overviewText || prev.overviewText,
        performanceText: res.performanceText || prev.performanceText,
        summaryText: res.summaryText || prev.summaryText,
      }));
      setNarrativeMsg({ type: "ok", text: `Narrative drafted from ${res.ticketCount} ticket${res.ticketCount === 1 ? "" : "s"} — review and edit before saving.` });
    } catch (err) {
      setNarrativeMsg({ type: "err", text: err instanceof Error ? err.message : "Failed to generate narrative" });
    }
  }

  const createReport = useCreateSupportReport(clientId);
  const updateReport = useUpdateSupportReport(clientId);
  const saving = createReport.isPending || updateReport.isPending;

  function update<K extends keyof SupportReportPayload>(key: K, val: SupportReportPayload[K]) {
    setP((prev) => ({ ...prev, [key]: val }));
  }

  function updateMetric(index: number, patch: Partial<AnalyticsReportMetric>) {
    setP((prev) => {
      const next = [...(prev.metrics ?? [])];
      next[index] = { ...next[index], ...patch };
      return { ...prev, metrics: next };
    });
  }

  function addMetric() {
    setP((prev) => ({
      ...prev,
      metrics: [...(prev.metrics ?? []), { key: `m${Date.now()}`, label: "", value: 0, group: "Custom" }],
    }));
  }

  function removeMetric(index: number) {
    setP((prev) => ({ ...prev, metrics: (prev.metrics ?? []).filter((_, i) => i !== index) }));
  }

  function applyMonth(yyyyMm: string) {
    const [y, m] = yyyyMm.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    const label = start.toLocaleString("en-GB", { month: "long", year: "numeric" });
    setPeriod(label);
    setP((prev) => ({
      ...prev,
      periodStart: start.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10),
    }));
  }

  async function handleFetchFromApi() {
    setFetchingApi(true);
    setApiMsg(null);
    try {
      const month = p.periodStart.slice(0, 7); // YYYY-MM
      const res = await fetch(`/api/support/clients/${clientId}/analytics?month=${month}`);
      const json = await res.json().catch(() => ({})) as
        { data?: { periodLabel?: string; metrics?: AnalyticsReportMetric[] }; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Analytics API: ${res.status}`);

      const fetched = json.data?.metrics ?? [];
      if (fetched.length === 0) {
        setApiMsg({ type: "ok", text: `No metrics returned for ${month}. Check the connection in Connectors.` });
        return;
      }

      // Merge by key — keep manual overrides for keys not in the fetch, replace the rest.
      setP((prev) => {
        const existing = prev.metrics ?? [];
        const byKey = new Map(existing.map((m) => [m.key, m]));
        for (const m of fetched) byKey.set(m.key, m);
        return { ...prev, metrics: Array.from(byKey.values()) };
      });

      const changed = fetched.filter((m) => typeof m.previous === "number" && m.value !== m.previous).length;
      setApiMsg({
        type: "ok",
        text: `Fetched ${fetched.length} metric${fetched.length === 1 ? "" : "s"} for ${month}${changed > 0 ? ` · ${changed} changed vs last month` : ""}.`,
      });
    } catch (err) {
      setApiMsg({ type: "err", text: err instanceof Error ? err.message : "Failed to fetch" });
    } finally {
      setFetchingApi(false);
    }
  }

  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    setApiMsg(null);
    try {
      const month = p.periodStart.slice(0, 7);
      const [statsRes, analyticsRes] = await Promise.allSettled([
        getTicketStats(clientId, p.periodStart, p.periodEnd),
        analyticsConn
          ? fetch(`/api/support/clients/${clientId}/analytics?month=${month}`).then((r) => r.json() as Promise<{ data?: { metrics?: AnalyticsReportMetric[] }; error?: string }>)
          : Promise.resolve(null),
      ]);

      const stats = statsRes.status === "fulfilled" ? statsRes.value.stats : null;
      const analyticsMetrics = analyticsRes.status === "fulfilled" && analyticsRes.value
        ? (analyticsRes.value as { data?: { metrics?: AnalyticsReportMetric[] } }).data?.metrics ?? []
        : [];

      setP((prev) => {
        const next = { ...prev };
        if (stats) {
          next.totalTickets = stats.totalTickets;
          next.catCancellations = stats.catCancellations;
          next.catAccountQueries = stats.catAccountQueries;
          next.catRefunds = stats.catRefunds;
          next.catTechIssues = stats.catTechIssues;
          next.catOther = stats.catOther;
          next.prioUrgent = stats.prioUrgent;
          next.prioHigh = stats.prioHigh;
          next.prioMedium = stats.prioMedium;
          next.prioLow = stats.prioLow;
        }
        if (analyticsMetrics.length > 0) {
          const byKey = new Map((prev.metrics ?? []).map((m) => [m.key, m]));
          for (const m of analyticsMetrics) byKey.set(m.key, m);
          next.metrics = Array.from(byKey.values());
        }
        return next;
      });

      const parts: string[] = [];
      if (stats) parts.push(`${stats.totalTickets} ticket${stats.totalTickets === 1 ? "" : "s"}`);
      if (analyticsMetrics.length > 0) parts.push(`${analyticsMetrics.length} metric${analyticsMetrics.length === 1 ? "" : "s"}`);
      setApiMsg({ type: "ok", text: `Generated: ${parts.join(" · ")} pre-filled for ${month}.` });
    } catch (err) {
      setApiMsg({ type: "err", text: err instanceof Error ? err.message : "Failed to generate" });
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    // refundRequests / refundsProcessed are always equal to catCancellations — derive automatically
    const payload = { ...p, refundRequests: p.catCancellations, refundsProcessed: p.catCancellations };
    if (report) {
      await updateReport.mutateAsync({ reportId: report.id, data: { period, payload } });
    } else {
      await createReport.mutateAsync({ period, payload, createdBy: p.author });
    }
    onSaved();
  }

  const widgetHeader = (num: string, label: string, right?: React.ReactNode) => (
    <div className="flex h-9 items-center justify-between border-b border-black/[0.06] px-4">
      <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-stone-400">
        {num} {"//"} {label}
      </span>
      {right ?? null}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* back + save bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 text-sm text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors"
        >
          <ChevronDoubleLeftIcon className="h-4 w-4" />
          All reports
        </button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={generating}
            onClick={handleGenerate}
            title="Pre-fill ticket stats + analytics for this month"
          >
            <SparklesIcon className="h-3.5 w-3.5 mr-1" />
            {generating ? "Generating…" : "Generate"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={generateNarrative.isPending}
            onClick={() => void handleWriteNarrative()}
            title="AI-draft overview, performance, and summary narratives from triage data"
          >
            <SparklesIcon className="h-3.5 w-3.5 mr-1" />
            {generateNarrative.isPending ? "Writing…" : "Write narratives"}
          </Button>
          <Button type="button" variant="primary" size="sm" loading={saving} onClick={handleSave}>
            {report ? "Save changes" : "Save report"}
          </Button>
        </div>
      </div>

      {narrativeMsg && (
        <p className={`rounded-[6px] px-3 py-2 text-xs ${narrativeMsg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
          {narrativeMsg.type === "ok" ? "✓" : "✗"} {narrativeMsg.text}
        </p>
      )}

      {/* 01 // PERIOD & AUTHOR */}
      <div className="app-card overflow-hidden p-0">
        {widgetHeader("01", "PERIOD & AUTHOR")}
        {/* Month quick-pick */}
        <div className="flex items-center gap-3 border-b border-[var(--border-2)] bg-[var(--surface-1)] px-5 py-2.5">
          <span className="text-[11px] font-medium text-[var(--text-3)]">Quick-select month</span>
          <select
            value={`${p.periodStart.slice(0, 7)}`}
            onChange={(e) => applyMonth(e.target.value)}
            className="app-select-compact h-7 !min-h-0 w-auto bg-white text-xs"
          >
            {Array.from({ length: 12 }, (_, i) => {
              const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
              const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
              const label = d.toLocaleString("en-GB", { month: "long", year: "numeric" });
              return <option key={val} value={val}>{label}</option>;
            })}
          </select>
          <span className="text-[11px] text-[var(--text-4)]">Sets all date fields + label below</span>
        </div>
        <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-1">
            <p className="mb-1 text-[11px] font-medium text-[var(--text-3)]">Period label</p>
            <input
              type="text"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="April 2026"
              className="h-8 w-full rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-700)] focus:bg-white"
            />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-[var(--text-3)]">Period start</p>
            <input
              type="date"
              value={p.periodStart}
              onChange={(e) => update("periodStart", e.target.value)}
              className="h-8 w-full rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-700)] focus:bg-white"
            />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-[var(--text-3)]">Period end</p>
            <input
              type="date"
              value={p.periodEnd}
              onChange={(e) => update("periodEnd", e.target.value)}
              className="h-8 w-full rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-700)] focus:bg-white"
            />
          </div>
          <div className="col-span-2 sm:col-span-3">
            <p className="mb-1 text-[11px] font-medium text-[var(--text-3)]">Author</p>
            <input
              type="text"
              value={p.author}
              onChange={(e) => update("author", e.target.value)}
              placeholder="Name / Customer Support Specialist"
              className="h-8 w-full rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-700)] focus:bg-white"
            />
          </div>
        </div>
      </div>

      {/* 02 // OVERVIEW */}
      <div className="app-card overflow-hidden p-0">
        {widgetHeader("02", "OVERVIEW")}
        <div className="p-5">
          {textareaInput("Overview narrative", p.overviewText, (v) => update("overviewText", v),
            "Write 3–4 bullet points summarising the month's support activity…", 5)}
        </div>
      </div>

      {/* 03 // TICKET VOLUME BY CATEGORY */}
      <div className="app-card overflow-hidden p-0">
        {widgetHeader("03", "TICKET VOLUME BY CATEGORY")}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {numInput("Total tickets", p.totalTickets, (v) => update("totalTickets", v))}
            {numInput("Cancellations", p.catCancellations, (v) => update("catCancellations", v))}
            {numInput("Account queries", p.catAccountQueries, (v) => update("catAccountQueries", v))}
            {numInput("Refunds", p.catRefunds, (v) => update("catRefunds", v))}
            {numInput("Tech issues", p.catTechIssues, (v) => update("catTechIssues", v))}
            {numInput("Other", p.catOther, (v) => update("catOther", v))}
          </div>
        </div>
      </div>

      {/* 04 // SUPPORT PERFORMANCE */}
      <div className="app-card overflow-hidden p-0">
        {widgetHeader("04", "SUPPORT PERFORMANCE")}
        <div className="space-y-4 p-5">
          {reportPerf?.metrics && (
            <div className="space-y-2">
              <p className="text-[11px] text-[var(--text-4)]">
                Computed live from ticket timestamps for this period — graded against industry benchmarks
                (first reply &lt;1h best-in-class, resolution rate 80%+ strong).
              </p>
              <PerformanceStrip metrics={reportPerf.metrics} />
            </div>
          )}
          {textareaInput("Performance notes", p.performanceText, (v) => update("performanceText", v),
            "Comment on resolution rate, backlog, SLA adherence…", 4)}
        </div>
      </div>

      {/* 05 // REFUND REQUESTS */}
      <div className="app-card overflow-hidden p-0">
        {widgetHeader("05", "REFUND REQUESTS")}
        <div className="p-5 space-y-4">
          <p className="text-xs text-[var(--text-4)]">
            Refund count is derived from cancellations above — enter the total £ value and any notes.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {numInput("Total value (£)", p.refundTotalValue, (v) => update("refundTotalValue", v), "£")}
          </div>
          {textareaInput("Breakdown notes", p.refundNotes, (v) => update("refundNotes", v),
            "e.g. 4 × £6.99 monthly (duplicate sub), 1 × £69.99 yearly…", 3)}
        </div>
      </div>

      {/* 06 // ANALYTICS */}
      <div className="app-card overflow-hidden p-0">
        {widgetHeader("06", "ANALYTICS", (
          analyticsConn ? (
            <button
              type="button"
              onClick={() => void handleFetchFromApi()}
              disabled={fetchingApi}
              className="flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-700)] transition hover:bg-[var(--mist)] disabled:opacity-50"
            >
              {fetchingApi ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--brand-700)] border-t-transparent" />
              ) : (
                <ArrowPathIcon className="h-3 w-3" />
              )}
              {fetchingApi ? "Fetching…" : `Fetch ${p.periodStart.slice(0, 7)}`}
            </button>
          ) : null
        ))}

        {/* connection status / hint */}
        <div className="border-b border-[var(--border-2)] bg-[var(--surface-1)] px-5 py-3 space-y-1.5">
          {analyticsConn ? (
            <p className="text-[11px] text-[var(--text-3)]">
              Pulling from <span className="font-semibold text-[var(--text-1)]">{analyticsConn.label}</span> for{" "}
              <span className="font-mono">{p.periodStart.slice(0, 7)}</span>. Use the month picker above to change the period —
              trends compare against the previous month automatically.
            </p>
          ) : (
            <p className="text-[11px] text-[var(--text-4)]">
              No analytics API connected. Add an <span className="font-medium text-[var(--text-3)]">Analytics API</span> connector
              in <span className="font-medium text-[var(--text-3)]">Connectors</span> to auto-fill these figures, or add metrics manually below.
            </p>
          )}
          {apiMsg && (
            <p className={`text-[11px] ${apiMsg.type === "ok" ? "text-emerald-600" : "text-red-500"}`}>
              {apiMsg.type === "ok" ? "✓" : "✗"} {apiMsg.text}
            </p>
          )}
        </div>

        <div className="p-5 space-y-5">
          {metrics.length === 0 && (
            <p className="text-xs text-[var(--text-4)]">
              No metrics yet. {analyticsConn ? "Click “Fetch” above" : "Add one manually"} to populate this section.
            </p>
          )}

          {/* grouped metric cards */}
          {Array.from(new Set(metrics.map((m) => m.group ?? "Metrics"))).map((groupName) => (
            <div key={groupName}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-4)]">{groupName}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {metrics.map((m, i) => (m.group ?? "Metrics") !== groupName ? null : (
                  <div key={m.key} className="group relative">
                    <div className="mb-1 flex items-center gap-1">
                      <input
                        value={m.label}
                        onChange={(e) => updateMetric(i, { label: e.target.value })}
                        placeholder="Metric label"
                        className="min-w-0 flex-1 bg-transparent text-[11px] font-medium text-[var(--text-3)] outline-none focus:text-[var(--text-1)]"
                      />
                      {typeof m.previous === "number" && m.value !== m.previous && (
                        <TrendBadge delta={m.value - m.previous} previous={m.previous} />
                      )}
                      <button
                        type="button"
                        onClick={() => removeMetric(i)}
                        className="shrink-0 text-[var(--text-4)] opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                        title="Remove metric"
                      >
                        <XMarkIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      {m.unit && <span className="text-sm text-[var(--text-3)]">{m.unit}</span>}
                      <input
                        type="number"
                        value={m.value || ""}
                        onChange={(e) => updateMetric(i, { value: Number(e.target.value) || 0 })}
                        className="h-8 w-full rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-700)] focus:bg-white"
                      />
                    </div>
                    {typeof m.previous === "number" && (
                      <p className="mt-0.5 text-[10px] text-[var(--text-4)]">prev: {m.previous.toLocaleString()}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addMetric}
            className="flex items-center gap-1.5 rounded-[6px] border border-dashed border-[var(--border-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-3)] transition hover:border-[var(--brand-700)] hover:text-[var(--brand-700)]"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add metric
          </button>

          {/* AI trend narrative — "Subscribers up 12% (+142)…" */}
          {metrics.length > 0 && (
            <div className="border-t border-[var(--border-2)] pt-4">
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-[11px] font-medium text-[var(--text-3)]">Trend summary</label>
                <button
                  type="button"
                  onClick={() => void handleWriteSummary()}
                  disabled={writingSummary}
                  className="flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-700)] transition hover:bg-[var(--mist)] disabled:opacity-50"
                >
                  {writingSummary ? (
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--brand-700)] border-t-transparent" />
                  ) : (
                    <SparklesIcon className="h-3 w-3" />
                  )}
                  {writingSummary ? "Writing…" : "Write summary"}
                </button>
              </div>
              <textarea
                value={p.analyticsNarrative ?? ""}
                onChange={(e) => update("analyticsNarrative", e.target.value)}
                placeholder="One-paragraph trend summary — click “Write summary” to draft from the metrics above, or write your own."
                rows={3}
                className="w-full rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-700)] focus:bg-white"
              />
            </div>
          )}
        </div>
      </div>

      {/* 07 // SUMMARY */}
      <div className="app-card overflow-hidden p-0">
        {widgetHeader("07", "SUMMARY")}
        <div className="p-5">
          {textareaInput("Summary narrative", p.summaryText, (v) => update("summaryText", v),
            "Write the closing summary bullet points for the report…", 5)}
        </div>
      </div>

      {/* bottom save */}
      <div className="flex justify-end pb-4">
        <Button type="button" variant="primary" size="sm" loading={saving} onClick={handleSave}>
          {report ? "Save changes" : "Save report"}
        </Button>
      </div>
    </div>
  );
}

function ReportsView({ client }: { client: SupportClient }) {
  const router = useRouter();
  const { data: reportsData, isLoading } = useSupportReports(client.id);
  const deleteReport = useDeleteSupportReport(client.id);
  const generateDoc = useGenerateSupportReportDoc(client.id);
  const reports = reportsData?.reports ?? [];

  const [editing, setEditing] = useState<SupportReport | null | "new">(null);
  const [genError, setGenError] = useState<string | null>(null);

  // One-click: pull last month's live data and open a shareable Docs report.
  async function handleGenerateDoc() {
    setGenError(null);
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const periodLabel = start.toLocaleString("en-GB", { month: "long", year: "numeric" });
    try {
      const { documentId } = await generateDoc.mutateAsync({
        periodStart: start.toISOString().slice(0, 10),
        periodEnd: end.toISOString().slice(0, 10),
        periodLabel,
      });
      router.push(`/app/docs/${documentId}`);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Failed to generate report");
    }
  }

  const hasAllocation = client.supportDaysPerMonth != null;
  const used = client.supportDaysUsed ?? 0;
  const total = client.supportDaysPerMonth ?? 0;
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const month = new Date().toLocaleString("en-GB", { month: "long", year: "numeric" });

  if (editing !== null) {
    return (
      <ReportBuilder
        clientId={client.id}
        report={editing === "new" ? null : editing}
        onSaved={() => setEditing(null)}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {hasAllocation && (
        <div className="app-card overflow-hidden p-0">
          <div className="flex h-9 items-center justify-between border-b border-black/[0.06] px-4">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-stone-400">
              01 // SUPPORT DAYS
            </span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-stone-400">
              {month}
            </span>
          </div>
          <div className="p-5">
            <div className="mt-1 flex items-end gap-4">
              <p className="font-display text-[32px] leading-none text-[var(--text-1)]">
                {used}
                <span className="text-[18px] text-[var(--text-3)]">/{total}</span>
              </p>
              <p className="mb-1 text-sm text-[var(--text-4)]">{pct}% used</p>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--surface-1)]">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  pct > 90 ? "bg-red-400" : pct > 60 ? "bg-amber-400" : "bg-[var(--brand-700)]",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--text-4)]">
              {total - used} days remaining · Report due{" "}
              {client.reportDueDay ? `day ${client.reportDueDay}` : "monthly"}
              {client.reportingRecipient && ` → ${client.reportingRecipient}`}
            </p>
          </div>
        </div>
      )}

      {/* One-click customer report — pulls live data into a shareable Docs document. */}
      <div className="app-card overflow-hidden p-0">
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-1)]">Customer report</p>
            <p className="mt-0.5 text-xs text-[var(--text-4)]">
              Pulls last month&apos;s tickets &amp; analytics into a branded, shareable document in the Docs builder — edit, share a link, or export PDF.
            </p>
            {genError && <p className="mt-1.5 text-xs text-red-500">{genError}</p>}
          </div>
          <button
            type="button"
            onClick={() => void handleGenerateDoc()}
            disabled={generateDoc.isPending}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-[8px] bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-800)] disabled:opacity-60"
          >
            <DocumentTextIcon className="h-4 w-4" />
            {generateDoc.isPending ? "Generating…" : "Generate customer report"}
          </button>
        </div>
      </div>

      <div className="app-card overflow-hidden p-0">
        <div className="flex h-9 items-center justify-between border-b border-black/[0.06] px-4">
          <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-stone-400">
            02 // SAVED REPORTS (LEGACY)
          </span>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-4)] transition hover:bg-[var(--mist)] hover:text-[var(--brand-700)]"
          >
            <PlusIcon className="h-3 w-3" />
            New (old builder)
          </button>
        </div>
        {isLoading && <div className="h-20 animate-pulse bg-[var(--surface-1)]" />}
        {!isLoading && reports.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-5 py-10">
            <DocumentTextIcon className="h-8 w-8 text-[var(--text-4)]" />
            <p className="text-sm text-[var(--text-4)]">No reports yet</p>
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--mist)]"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Build first report
            </button>
          </div>
        )}
        {reports.map((r, idx) => (
          <div
            key={r.id}
            className={cn("flex items-center justify-between px-5 py-3.5", idx > 0 && "border-t border-[var(--border-2)]")}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text-1)]">{r.period}</p>
              <p className="mt-0.5 text-xs text-[var(--text-4)]">
                {r.payload.periodStart && r.payload.periodEnd
                  ? `${r.payload.periodStart} → ${r.payload.periodEnd}`
                  : `Created ${new Date(r.createdAt).toLocaleDateString("en-GB")}`}
                {r.payload.author ? ` · ${r.payload.author}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {r.payload.totalTickets > 0 && (
                <span className="rounded-md border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-3)]">
                  {r.payload.totalTickets} tickets
                </span>
              )}
              <Link
                href={`/app/support/reports/${r.id}`}
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--mist)] hover:text-[var(--brand-700)]"
                title="Preview report"
              >
                <EyeIcon className="h-3.5 w-3.5" />
              </Link>
              <button
                type="button"
                onClick={() => setEditing(r)}
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--mist)] hover:text-[var(--brand-700)]"
                title="Edit report"
              >
                <PencilSquareIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => deleteReport.mutate(r.id)}
                disabled={deleteReport.isPending}
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--danger-50)] hover:text-[var(--danger-500)]"
                title="Delete report"
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── edit connector modal ─────────────────────────────────────────────────────

function EditConnectorModal({
  clientId,
  conn,
  onClose,
}: {
  clientId: string;
  conn: Connection;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(conn.label);
  const [health, setHealth] = useState<Connection["health"]>(conn.health);
  const [error, setError] = useState<string | null>(null);
  const updateConn = useUpdateConnection(clientId);

  // Gmail
  const [gmailQuery, setGmailQuery] = useState(conn.scraperConfig?.query ?? "");
  const [gmailImpersonateEmail, setGmailImpersonateEmail] = useState(conn.scraperConfig?.impersonateEmail ?? "");

  // Discord
  const [discordToken, setDiscordToken] = useState(conn.scraperConfig?.botToken ?? "");
  const [discordGuildId, setDiscordGuildId] = useState(conn.scraperConfig?.guildId ?? "");
  const [discordGuildName, setDiscordGuildName] = useState(conn.scraperConfig?.guildName ?? "");
  const [availableChannels, setAvailableChannels] = useState<{ id: string; name: string; accessible: boolean }[]>([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(
    new Set((conn.scraperConfig?.channels ?? []).map((c) => c.id)),
  );
  const [fetchingChannels, setFetchingChannels] = useState(false);
  const [channelFetchError, setChannelFetchError] = useState<string | null>(null);
  const [tokenChecked, setTokenChecked] = useState(false);

  // Reddit
  const [redditSubreddit, setRedditSubreddit] = useState(conn.scraperConfig?.subreddit ?? "");

  // App Reviews
  const [editAppStore, setEditAppStore] = useState<"app_store" | "play_store">(
    (conn.scraperConfig?.store as "app_store" | "play_store") ?? "app_store",
  );
  const [editAppId, setEditAppId] = useState(conn.scraperConfig?.appId ?? "");
  const [editAppCountry, setEditAppCountry] = useState(conn.scraperConfig?.country ?? "us");
  const [editPlayServiceAccount, setEditPlayServiceAccount] = useState(conn.scraperConfig?.serviceAccountJson ?? "");

  // Analytics API
  const [analyticsAdapter, setAnalyticsAdapter] = useState(conn.scraperConfig?.adapter ?? ANALYTICS_ADAPTERS[0].key);
  const [analyticsBaseUrl, setAnalyticsBaseUrl] = useState(conn.scraperConfig?.baseUrl ?? "");
  const [analyticsToken, setAnalyticsToken] = useState(conn.scraperConfig?.apiToken ?? "");
  const editSelectedAdapter = ANALYTICS_ADAPTERS.find((a) => a.key === analyticsAdapter) ?? ANALYTICS_ADAPTERS[0];
  // Firebase-specific (initialise from saved scraperConfig)
  const [firebaseServiceAccount, setFirebaseServiceAccount] = useState(conn.scraperConfig?.serviceAccountJson ?? "");
  const [firebaseMetrics, setFirebaseMetrics] = useState<Array<{ label: string; collection: string; timestampField: string }>>(
    (conn.scraperConfig?.firebaseMetrics as Array<{ label: string; collection: string; timestampField: string }> | undefined)?.length
      ? (conn.scraperConfig!.firebaseMetrics as Array<{ label: string; collection: string; timestampField: string }>)
      : [{ label: "", collection: "", timestampField: "createdAt" }],
  );

  // Shared filters (keywords, exclude, lookback, max, ignore-bots)
  const [filters, setFilters] = useState<FilterState>(() => initFilterState(conn.scraperConfig));

  async function handleFetchChannels() {
    const guildId = discordGuildId.trim();
    const botToken = discordToken.trim();
    if (!guildId || !botToken) return;
    setFetchingChannels(true);
    setChannelFetchError(null);
    setAvailableChannels([]);
    try {
      const res = await fetch("/api/support/discord/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildId, botToken }),
      });
      const data = await res.json() as { channels?: { id: string; name: string; accessible: boolean }[]; guildName?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch channels");
      setAvailableChannels(data.channels ?? []);
      setDiscordGuildName(data.guildName ?? discordGuildName);
      setTokenChecked(true);
    } catch (err) {
      setChannelFetchError(err instanceof Error ? err.message : "Failed to fetch channels");
    } finally {
      setFetchingChannels(false);
    }
  }

  function toggleChannel(id: string) {
    setSelectedChannelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function buildScraperConfig(): Connection["scraperConfig"] {
    const f = buildFilterConfig(conn.source, filters);
    if (conn.source === "gmail") {
      return {
        ...conn.scraperConfig,
        query: gmailQuery.trim(),
        ...(gmailImpersonateEmail.trim() ? { impersonateEmail: gmailImpersonateEmail.trim() } : {}),
        ...f,
      };
    }
    if (conn.source === "discord") {
      // Preserve existing channel cursors for channels that were already tracked
      const existingChannels = conn.scraperConfig?.channels ?? [];
      const channelPool = availableChannels.length > 0 ? availableChannels : existingChannels;
      const channels = channelPool
        .filter((c) => selectedChannelIds.has(c.id))
        .map((c) => {
          const existing = existingChannels.find((e) => e.id === c.id);
          return { id: c.id, name: c.name, lastMessageId: existing?.lastMessageId ?? null };
        });
      return {
        ...conn.scraperConfig,
        guildId: discordGuildId.trim(),
        guildName: discordGuildName,
        botToken: discordToken.trim(),
        channels,
        ...f,
      };
    }
    if (conn.source === "reddit") {
      return {
        ...conn.scraperConfig,
        subreddit: redditSubreddit.trim(),
        ...f,
      };
    }
    if (conn.source === "analytics") {
      if (analyticsAdapter === "firebase") {
        return {
          ...conn.scraperConfig,
          adapter: "firebase",
          serviceAccountJson: firebaseServiceAccount.trim() || conn.scraperConfig?.serviceAccountJson,
          firebaseMetrics: firebaseMetrics
            .filter((m) => m.label.trim() && m.collection.trim())
            .map((m) => ({
              label: m.label.trim(),
              collection: m.collection.trim(),
              timestampField: m.timestampField.trim() || "createdAt",
            })),
        };
      }
      return {
        ...conn.scraperConfig,
        adapter: analyticsAdapter,
        baseUrl: analyticsBaseUrl.trim() || editSelectedAdapter.defaultBaseUrl,
        apiToken: analyticsToken.trim() || undefined,
      };
    }
    if (conn.source === "app_reviews") {
      return {
        ...conn.scraperConfig,
        store: editAppStore,
        appId: editAppId.trim(),
        ...(editAppStore === "app_store" ? { country: editAppCountry.trim() || "us" } : {}),
        ...(editAppStore === "play_store" && editPlayServiceAccount.trim()
          ? { serviceAccountJson: editPlayServiceAccount.trim() }
          : {}),
      };
    }
    // webhook: token is immutable after creation — return existing config unchanged
    return conn.scraperConfig;
  }

  function isSubmitDisabled() {
    if (updateConn.isPending || !label.trim()) return true;
    if (conn.source === "discord") return !discordToken.trim() || !discordGuildId.trim() || selectedChannelIds.size === 0;
    if (conn.source === "app_reviews") return !editAppId.trim();
    return false;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    updateConn.mutate(
      { connId: conn.id, data: { label: label.trim(), health, scraperConfig: buildScraperConfig() } },
      {
        onSuccess: () => onClose(),
        onError: (err) => setError(err instanceof Error ? err.message : "Failed to update connector"),
      },
    );
  }

  // Existing channels to show before a fetch is done
  const existingChannels = conn.scraperConfig?.channels ?? [];

  return (
    <CareModal title="Edit connector" onClose={onClose} wide="3xl" fixedHeight>
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        {/* scrollable 2-column body */}
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-5 overflow-y-auto pr-1">

        {/* ── Left column: connection ──────────────────────────────── */}
        <div className="space-y-4">
        <p className="text-[10px] font-semibold uppercase tracking-[1px] text-[var(--text-4)]">Connection</p>
        <label className="block space-y-1.5">
          <span className="app-field-label">Label</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            className="app-input w-full"
            placeholder="e.g. Acme Corp Discord"
          />
        </label>

        {/* Gmail config */}
        {conn.source === "gmail" && (
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="app-field-label">Inbox to read</span>
              <input
                type="email"
                value={gmailImpersonateEmail}
                onChange={(e) => setGmailImpersonateEmail(e.target.value)}
                className="app-input w-full"
                placeholder="support@gitwork.co.uk"
              />
              <p className="text-[11px] text-[var(--text-4)]">
                The Gmail inbox the service account will read via domain-wide delegation. Must be a gitwork.co.uk address.
              </p>
            </label>
            <label className="block space-y-1.5">
              <span className="app-field-label">Gmail query (optional — blank = all mail)</span>
              <input
                value={gmailQuery}
                onChange={(e) => setGmailQuery(e.target.value)}
                className="app-input w-full font-mono text-xs"
                placeholder="e.g. label:fellas-loaded"
              />
            </label>
          </div>
        )}

        {/* Discord config */}
        {conn.source === "discord" && (
          <div className="space-y-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
            <label className="block space-y-1">
              <span className="app-field-label">Bot token</span>
              <input
                type="password"
                value={discordToken}
                onChange={(e) => { setDiscordToken(e.target.value); setTokenChecked(false); setAvailableChannels([]); }}
                className="app-input w-full font-mono text-xs"
                placeholder="Paste updated bot token…"
                autoComplete="off"
              />
            </label>

            <div className="flex gap-2">
              <label className="block flex-1 space-y-1">
                <span className="app-field-label">Server (guild) ID</span>
                <input
                  value={discordGuildId}
                  onChange={(e) => { setDiscordGuildId(e.target.value); setTokenChecked(false); setAvailableChannels([]); }}
                  className="app-input w-full"
                  placeholder="Server ID"
                />
              </label>
              <div className="flex flex-col justify-end">
                <button
                  type="button"
                  onClick={() => void handleFetchChannels()}
                  disabled={!discordGuildId.trim() || !discordToken.trim() || fetchingChannels}
                  className="flex h-9 items-center gap-1.5 rounded-[8px] border border-[var(--border-2)] bg-white px-3 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
                >
                  {fetchingChannels ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--brand-700)] border-t-transparent" />
                  ) : tokenChecked ? (
                    <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <ArrowPathIcon className="h-3.5 w-3.5" />
                  )}
                  {fetchingChannels ? "Checking…" : tokenChecked ? "Re-fetch" : "Check token"}
                </button>
              </div>
            </div>

            {channelFetchError && (
              <p className="rounded-[8px] bg-[var(--danger-50)] px-2.5 py-2 text-[11px] text-[var(--danger-500)]">
                {channelFetchError}
              </p>
            )}

            {/* Show fetched channels, or fall back to existing saved channels */}
            {(availableChannels.length > 0 || existingChannels.length > 0) && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="app-field-label">
                    Channels to monitor
                    {discordGuildName && <span className="ml-1.5 font-normal text-[var(--text-4)]">in {discordGuildName}</span>}
                  </span>
                  {selectedChannelIds.size > 0 && (
                    <span className="text-[11px] font-semibold text-[var(--brand-700)]">
                      {selectedChannelIds.size} selected
                    </span>
                  )}
                </div>
                {!tokenChecked && availableChannels.length === 0 && (
                  <p className="text-[11px] text-[var(--text-4)]">
                    Check the token to load the full channel list. Currently saved channels shown below.
                  </p>
                )}
                {(() => {
                  const displayChannels = availableChannels.length > 0 ? availableChannels : existingChannels;
                  const hasInaccessible = displayChannels.some((ch) => "accessible" in ch && ch.accessible === false);
                  return (
                    <>
                      <div className="max-h-44 overflow-y-auto rounded-[8px] border border-[var(--border-2)] bg-white">
                        {displayChannels.map((ch) => {
                          const inaccessible = "accessible" in ch && ch.accessible === false;
                          return (
                            <label
                              key={ch.id}
                              className={cn(
                                "flex cursor-pointer items-center gap-2.5 border-b border-[var(--border-2)] px-3 py-2 last:border-b-0",
                                inaccessible ? "bg-amber-50 hover:bg-amber-50" : "hover:bg-[var(--surface-1)]",
                              )}
                              title={inaccessible ? "Bot lacks read access — grant View Channel + Read Message History in Discord channel settings" : undefined}
                            >
                              <input
                                type="checkbox"
                                checked={selectedChannelIds.has(ch.id)}
                                onChange={() => toggleChannel(ch.id)}
                                className="h-3.5 w-3.5 shrink-0 accent-[var(--brand-700)]"
                              />
                              <span className={cn("text-xs", inaccessible ? "text-amber-700" : "text-[var(--text-1)]")}>
                                # {ch.name}
                              </span>
                              {inaccessible && (
                                <ExclamationTriangleIcon className="ml-auto h-3 w-3 shrink-0 text-amber-500" />
                              )}
                            </label>
                          );
                        })}
                      </div>
                      {hasInaccessible && (
                        <p className="mt-1.5 text-[11px] text-amber-600">
                          Channels highlighted in amber need <strong>View Channel</strong> + <strong>Read Message History</strong> granted to the bot in Discord → channel Settings → Permissions.
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

          </div>
        )}

        {/* Reddit config */}
        {conn.source === "reddit" && (
          <div className="space-y-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
            <label className="block space-y-1">
              <span className="app-field-label">Subreddit (without r/)</span>
              <input value={redditSubreddit} onChange={(e) => setRedditSubreddit(e.target.value)} className="app-input w-full" placeholder="e.g. acmeapp" />
            </label>
          </div>
        )}

        {/* Analytics API config */}
        {conn.source === "analytics" && (
          <div className="space-y-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
            <label className="block space-y-1">
              <span className="app-field-label">Analytics source</span>
              <select
                value={analyticsAdapter}
                onChange={(e) => {
                  const next = ANALYTICS_ADAPTERS.find((a) => a.key === e.target.value) ?? ANALYTICS_ADAPTERS[0];
                  setAnalyticsAdapter(next.key);
                  if (!analyticsBaseUrl.trim()) setAnalyticsBaseUrl(next.defaultBaseUrl);
                }}
                className="app-select w-full"
              >
                {ANALYTICS_ADAPTERS.map((a) => (
                  <option key={a.key} value={a.key}>{a.label}</option>
                ))}
              </select>
            </label>

            {/* Firebase-specific fields */}
            {analyticsAdapter === "firebase" && (
              <div className="space-y-3">
                <label className="block space-y-1">
                  <span className="app-field-label">Service-account JSON</span>
                  <textarea
                    value={firebaseServiceAccount}
                    onChange={(e) => setFirebaseServiceAccount(e.target.value)}
                    rows={4}
                    className="app-input w-full resize-none font-mono text-[11px]"
                    placeholder={firebaseServiceAccount ? "● ● ● stored — paste to update" : '{"type":"service_account","project_id":"my-app",...}'}
                    autoComplete="off"
                  />
                  <p className="text-[11px] text-[var(--text-4)]">Firebase Console → Project settings → Service accounts → Generate new private key</p>
                </label>
                <div className="space-y-2">
                  <p className="app-field-label">Metric collections <span className="font-normal text-[var(--text-4)]">— each row = one monthly count</span></p>
                  <div className="grid grid-cols-[1fr_1fr_1fr_1.5rem] gap-x-1.5 gap-y-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-4)]">
                    <span>Label</span><span>Collection</span><span>Timestamp field</span><span />
                  </div>
                  {firebaseMetrics.map((m, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1.5rem] items-center gap-1.5">
                      <input value={m.label} onChange={(e) => setFirebaseMetrics((prev) => prev.map((r, j) => j === i ? { ...r, label: e.target.value } : r))} className="app-input text-xs" placeholder="e.g. Subscribers" />
                      <input value={m.collection} onChange={(e) => setFirebaseMetrics((prev) => prev.map((r, j) => j === i ? { ...r, collection: e.target.value } : r))} className="app-input text-xs" placeholder="e.g. users" />
                      <input value={m.timestampField} onChange={(e) => setFirebaseMetrics((prev) => prev.map((r, j) => j === i ? { ...r, timestampField: e.target.value } : r))} className="app-input text-xs" placeholder="createdAt" />
                      {firebaseMetrics.length > 1 ? (
                        <button type="button" onClick={() => setFirebaseMetrics((prev) => prev.filter((_, j) => j !== i))} className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-4)] hover:bg-red-50 hover:text-red-600">
                          <TrashIcon className="h-3 w-3" />
                        </button>
                      ) : <span />}
                    </div>
                  ))}
                  <button type="button" onClick={() => setFirebaseMetrics((prev) => [...prev, { label: "", collection: "", timestampField: "createdAt" }])} className="flex items-center gap-1.5 rounded-[6px] border border-dashed border-[var(--border-2)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-3)] transition hover:border-[var(--brand-700)] hover:text-[var(--brand-700)]">
                    <PlusIcon className="h-3 w-3" />Add metric
                  </button>
                </div>
              </div>
            )}

            {/* Non-Firebase fields */}
            {analyticsAdapter !== "firebase" && (
              <>
                <label className="block space-y-1">
                  <span className="app-field-label">{analyticsAdapter === "generic" ? "Endpoint URL" : "API base URL"}</span>
                  <input
                    value={analyticsBaseUrl}
                    onChange={(e) => setAnalyticsBaseUrl(e.target.value)}
                    className="app-input w-full font-mono text-xs"
                    placeholder={editSelectedAdapter.defaultBaseUrl || "https://api.example.com/v1/metrics/"}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="app-field-label">API token (bearer){editSelectedAdapter.requiresToken ? "" : " — optional"}</span>
                  <input
                    type="password"
                    value={analyticsToken}
                    onChange={(e) => setAnalyticsToken(e.target.value)}
                    className="app-input w-full font-mono text-xs"
                    placeholder="Leave blank to keep the existing token"
                    autoComplete="off"
                  />
                </label>
              </>
            )}
            {editSelectedAdapter.hint && <p className="text-[11px] text-[var(--text-4)]">{editSelectedAdapter.hint}</p>}
          </div>
        )}

        {/* App Reviews config */}
        {conn.source === "app_reviews" && (
          <div className="space-y-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
            <div className="flex gap-2">
              {(["app_store", "play_store"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setEditAppStore(s)}
                  className={cn(
                    "flex-1 rounded-[8px] border px-3 py-1.5 text-xs font-medium transition",
                    editAppStore === s
                      ? "border-[var(--brand-700)] bg-[var(--mist)] text-[var(--brand-700)]"
                      : "border-[var(--border-2)] bg-white text-[var(--text-3)] hover:bg-[var(--surface-1)]",
                  )}
                >
                  {s === "app_store" ? "App Store (iOS)" : "Play Store (Android)"}
                </button>
              ))}
            </div>
            <label className="block space-y-1">
              <span className="app-field-label">{editAppStore === "app_store" ? "App ID (numeric)" : "Package name"}</span>
              <input value={editAppId} onChange={(e) => setEditAppId(e.target.value)} className="app-input w-full font-mono text-xs" placeholder={editAppStore === "app_store" ? "e.g. 123456789" : "e.g. com.example.app"} />
            </label>
            {editAppStore === "app_store" && (
              <label className="block space-y-1">
                <span className="app-field-label">Country code</span>
                <input value={editAppCountry} onChange={(e) => setEditAppCountry(e.target.value)} className="app-input w-full" placeholder="us" maxLength={2} />
              </label>
            )}
            {editAppStore === "play_store" && (
              <label className="block space-y-1">
                <span className="app-field-label">Service account JSON</span>
                <textarea value={editPlayServiceAccount} onChange={(e) => setEditPlayServiceAccount(e.target.value)} className="app-input w-full font-mono text-xs" rows={3} placeholder={conn.scraperConfig?.serviceAccountJson ? "● ● ● stored — paste to update" : '{"type":"service_account",...}'} autoComplete="off" />
              </label>
            )}
          </div>
        )}

        {/* Webhook config — token is immutable; display read-only */}
        {conn.source === "webhook" && (
          <div className="space-y-2 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
            <span className="app-field-label">Webhook URL</span>
            <p className="select-all rounded-[6px] bg-white px-2.5 py-2 font-mono text-xs text-[var(--text-1)] break-all">
              /api/support/webhook/{conn.scraperConfig?.webhookToken ?? "—"}
            </p>
            <p className="text-[11px] text-[var(--text-4)]">Token is fixed at creation time. To change it, delete and re-create the connector.</p>
          </div>
        )}
        </div>{/* ── end left column ── */}

        {/* ── Right column: filters + status ───────────────────────── */}
        <div className="space-y-4 border-l border-[var(--border-2)] pl-5">
        <p className="text-[10px] font-semibold uppercase tracking-[1px] text-[var(--text-4)]">Filters &amp; status</p>

        {/* Shared filters — ingestion sources only (analytics + webhook have none) */}
        {LIVE_SOURCES.includes(conn.source) && conn.source !== "analytics" && conn.source !== "webhook" && (
          <ConnectorFilterFields source={conn.source} filters={filters} setFilters={setFilters} />
        )}

        <label className="block space-y-1.5">
          <span className="app-field-label">Status</span>
          <select
            value={health}
            onChange={(e) => setHealth(e.target.value as Connection["health"])}
            className="app-select w-full"
          >
            <option value="connected">Connected</option>
            <option value="needs_setup">Needs setup</option>
            <option value="error">Error</option>
          </select>
        </label>
        </div>{/* ── end right column ── */}

        </div>{/* ── end scrollable body ── */}

        {error && (
          <p className="mt-3 shrink-0 rounded-[10px] bg-[var(--danger-50)] px-3 py-2.5 text-sm text-[var(--danger-500)]">
            {error}
          </p>
        )}

        <div className="mt-3 flex shrink-0 justify-end gap-2 border-t border-[var(--border-2)] pt-3">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={isSubmitDisabled()}
            loading={updateConn.isPending}
          >
            {updateConn.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </CareModal>
  );
}

// ─── connectors view ─────────────────────────────────────────────────────────

function ConnectorsView({ clientId, clientSlug }: { clientId: string; clientSlug: string }) {
  const { canManageSupport } = usePermissions();
  const { data, isLoading } = useSupportConnections(clientId);
  // Memoise so the effect below doesn't reset its setInterval timer on every render when data is
  // a fresh undefined.
  const connections = useMemo(() => data?.connections ?? [], [data?.connections]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingConn, setEditingConn] = useState<Connection | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const deleteConn = useDeleteConnection(clientId);
  const syncConn = useSyncConnection(clientId);
  const [syncResults, setSyncResults] = useState<Record<string, { fetched?: number; ingested?: number; filtered?: number; errors: string[] }>>({});
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const { data: logsData } = useSupportAuditLogs(clientId);
  const agentLogs = (logsData?.logs ?? []).filter((l: AuditLog) => l.actor.startsWith("agent:")).slice(0, 10);

  // Auto-sync interval (minutes): 0 = manual only
  const INTERVAL_OPTIONS = [
    { label: "Manual", value: 0 },
    { label: "30 min", value: 30 },
    { label: "1 hr", value: 60 },
    { label: "6 hrs", value: 360 },
  ];
  const [autoInterval, setAutoInterval] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem(`care-sync-interval-${clientId}`) ?? 0);
  });

  function changeInterval(minutes: number) {
    setAutoInterval(minutes);
    localStorage.setItem(`care-sync-interval-${clientId}`, String(minutes));
  }

  // Fire sync on all connected connections at the chosen interval
  useEffect(() => {
    if (autoInterval === 0) return;
    const connectedIds = connections.filter((c) => c.health === "connected").map((c) => c.id);
    if (connectedIds.length === 0) return;
    const id = setInterval(() => {
      connectedIds.forEach((cid) => {
        syncConn.mutate({ connId: cid, resync: false });
      });
    }, autoInterval * 60 * 1000);
    return () => clearInterval(id);
  }, [autoInterval, connections, syncConn]);

  async function handleSync(connId: string, resync = false) {
    const result = await syncConn.mutateAsync({ connId, resync });
    setSyncResults((prev) => ({ ...prev, [connId]: result }));
  }

  async function handleSyncAll() {
    const connectedIds = connections.filter((c) => c.health === "connected").map((c) => c.id);
    for (const cid of connectedIds) {
      const result = await syncConn.mutateAsync({ connId: cid, resync: false });
      setSyncResults((prev) => ({ ...prev, [cid]: result }));
    }
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="app-card overflow-hidden p-0 flex flex-col">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-2)]">
              <div className="h-8 w-8 shrink-0 rounded-[6px] animate-pulse bg-[var(--surface-1)]" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-28 animate-pulse rounded bg-[var(--surface-1)]" />
                <div className="h-2.5 w-16 animate-pulse rounded bg-[var(--surface-1)]" />
              </div>
              <div className="h-5 w-16 shrink-0 animate-pulse rounded-md bg-[var(--surface-1)]" />
            </div>
            <div className="flex-1 space-y-2 px-4 py-3">
              <div className="h-2.5 w-3/4 animate-pulse rounded bg-[var(--surface-1)]" />
              <div className="h-2.5 w-1/2 animate-pulse rounded bg-[var(--surface-1)]" />
            </div>
            <div className="flex items-center gap-2 border-t border-[var(--border-2)] px-4 py-2.5">
              <div className="h-6 w-20 animate-pulse rounded-[6px] bg-[var(--surface-1)]" />
              <div className="ml-auto h-7 w-7 animate-pulse rounded-[6px] bg-[var(--surface-1)]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Fetch schedule ── */}
      {connections.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] px-4 py-3">
          <div className="flex items-center gap-2">
            <ArrowPathIcon className="h-4 w-4 text-[var(--text-3)]" />
            <span className="text-sm font-medium text-[var(--text-2)]">Auto-fetch</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-[6px] border border-[var(--border-2)] overflow-hidden">
              {INTERVAL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => changeInterval(opt.value)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium transition",
                    opt.value !== INTERVAL_OPTIONS[INTERVAL_OPTIONS.length - 1].value && "border-r border-[var(--border-2)]",
                    autoInterval === opt.value
                      ? "bg-[var(--brand-700)] text-white"
                      : "bg-[var(--surface-0)] text-[var(--text-2)] hover:bg-[var(--surface-1)]",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {canManageSupport ? (
              <button
                type="button"
                onClick={() => void handleSyncAll()}
                disabled={syncConn.isPending}
                className="flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
              >
                <ArrowPathIcon className={cn("h-3.5 w-3.5", syncConn.isPending && "animate-spin")} />
                {syncConn.isPending ? "Syncing…" : "Refresh now"}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* ── Cron schedule notice ── */}
      {connections.length > 0 && (
        <div className="flex items-start gap-2 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-2.5">
          <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <p className="text-[11px] leading-4 text-amber-700">
            <span className="font-semibold">Automatic background sync runs once a day, at 08:00 UTC.</span>{" "}
            The Auto-fetch options above only poll while this page is open in your browser. For an immediate pull, use{" "}
            <span className="font-medium">Refresh now</span> or a connector&apos;s <span className="font-medium">Sync now</span>.
          </p>
        </div>
      )}

      {/* ── Monitoring strip ── */}
      {connections.length > 0 && (() => {
        const nConnected = connections.filter((c) => c.health === "connected").length;
        const nError = connections.filter((c) => c.health === "error").length;
        const nSetup = connections.filter((c) => c.health === "needs_setup").length;
        const lastChecked = connections.reduce((best, c) => {
          if (!c.lastSyncedAt) return best;
          const t = new Date(c.lastSyncedAt).getTime();
          return t > best ? t : best;
        }, 0);
        return (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] px-4 py-2.5 text-[12px]">
            {nConnected > 0 && (
              <span className="flex items-center gap-1.5 font-medium text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />{nConnected} connected
              </span>
            )}
            {nError > 0 && (
              <span className="flex items-center gap-1.5 font-medium text-red-600">
                <span className="h-2 w-2 rounded-full bg-red-500" />{nError} error
              </span>
            )}
            {nSetup > 0 && (
              <span className="flex items-center gap-1.5 font-medium text-amber-700">
                <span className="h-2 w-2 rounded-full bg-amber-400" />{nSetup} needs setup
              </span>
            )}
            {lastChecked > 0 && (
              <span className="ml-auto text-[var(--text-4)]">
                Last synced {new Date(lastChecked).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        );
      })()}

      {/* ── Connector cards — 3-column responsive grid ── */}
      {connections.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {connections.map((conn) => {
            const sr = syncResults[conn.id];
            const st = !sr ? conn.lastSyncStats ?? null : null;
            const isExpanded = expandedErrors.has(conn.id);

            // Derive the error text (live result or persisted)
            const liveError = sr?.errors?.[0];
            const persistedError = st?.errors?.[0];
            const errorText = liveError ?? (st && st.errors.length > 0 ? persistedError : undefined);
            const hints: string[] = sr
              ? []
              : (st?.hints ?? []);

            // Sync stats summary line
            const syncLine = (() => {
              if (sr) {
                if (sr.errors.length > 0) return null; // shown as errorText
                if ((sr.ingested ?? 0) > 0) return `${sr.ingested} added, ${sr.filtered ?? 0} filtered`;
                if (sr.fetched !== undefined) return sr.fetched === 0 ? "0 messages found" : `${sr.fetched} found, 0 new`;
                return "No new items";
              }
              if (st && st.errors.length === 0) {
                const when = new Date(st.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
                const r = st.filterReasons;
                const breakdown = r
                  ? [r.bots ? `${r.bots} bots` : null, r.empty ? `${r.empty} empty` : null, r.duplicate ? `${r.duplicate} dupes` : null, r.excluded ? `${r.excluded} excl` : null].filter(Boolean).join(", ")
                  : "";
                return `${when} — ${st.ingested} added${st.filtered ? `, ${st.filtered} filtered` : ""}${breakdown ? ` (${breakdown})` : ""}`;
              }
              return null;
            })();

            // Source detail line (channels / subreddit / appId / webhook URL)
            const detailLine = (() => {
              const cfg = conn.scraperConfig;
              if (!cfg) return null;
              if (conn.source === "discord" && cfg.channels?.length) return cfg.channels.map((c) => `#${c.name}`).join(", ");
              if (conn.source === "reddit" && cfg.subreddit) return `r/${cfg.subreddit}`;
              if (conn.source === "app_reviews") return [cfg.store === "play_store" ? "Play Store" : "App Store", cfg.appId].filter(Boolean).join(" · ");
              if (conn.source === "webhook" && cfg.webhookToken) return `/api/support/webhook/${cfg.webhookToken.slice(0, 8)}…`;
              if (conn.source === "analytics" && cfg.adapter) return cfg.adapter;
              if (conn.source === "gmail" && cfg.intakeAddress) return cfg.intakeAddress;
              return null;
            })();

            const pendingVars = syncConn.isPending ? syncConn.variables : null;
            const pendingConnId = typeof pendingVars === "string" ? pendingVars : pendingVars?.connId;
            const pendingResync = typeof pendingVars === "string" ? false : (pendingVars?.resync ?? false);
            const isThisPending = pendingConnId === conn.id;
            const isSyncPending = isThisPending && !pendingResync;
            const isResyncPending = isThisPending && pendingResync;
            const menuOpen = openMenuId === conn.id;

            return (
              <div
                key={conn.id}
                className={cn(
                  "app-card min-w-0 overflow-visible p-0 flex flex-col",
                  conn.health === "error" && "ring-1 ring-red-200",
                )}
              >
                {/* ── Card header ── */}
                <div className="flex min-w-0 items-center gap-3 px-4 py-3 border-b border-[var(--border-2)]">
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px]",
                      conn.health === "connected"
                        ? "bg-emerald-50 text-emerald-600"
                        : conn.health === "error"
                          ? "bg-red-50 text-red-500"
                          : "bg-[var(--surface-1)] text-[var(--text-3)]",
                    )}
                  >
                    <SourceIcon source={conn.source} className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--text-1)]">{conn.label}</p>
                    <p className="text-[11px] text-[var(--text-4)]">{SOURCE_LABEL[conn.source]}</p>
                  </div>
                  {conn.health === "connected" ? (
                    <span className="shrink-0 flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      <CheckCircleIcon className="h-3 w-3" />Connected
                    </span>
                  ) : conn.health === "error" ? (
                    <span className="shrink-0 flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                      <ExclamationTriangleIcon className="h-3 w-3" />Error
                    </span>
                  ) : (
                    <span className="shrink-0 flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      <ExclamationTriangleIcon className="h-3 w-3" />Setup
                    </span>
                  )}
                </div>

                {/* ── Card body ── */}
                <div className="flex-1 space-y-1.5 px-4 py-3">
                  {/* Source detail */}
                  {detailLine && (
                    <p className="truncate font-mono text-[11px] text-[var(--text-3)]">{detailLine}</p>
                  )}
                  {conn.source === "gmail" && !conn.scraperConfig?.query?.trim() && (
                    <p className="text-[11px] text-amber-600">No filter set — ingesting all mail</p>
                  )}

                  {/* Sync result / persisted stats */}
                  {errorText ? (
                    <div>
                      <p className={cn("break-words text-[11px] text-red-500", !isExpanded && "line-clamp-2")}>
                        {errorText}
                      </p>
                      {errorText.length > 120 && (
                        <button
                          type="button"
                          onClick={() => setExpandedErrors((prev) => { const n = new Set(prev); n.has(conn.id) ? n.delete(conn.id) : n.add(conn.id); return n; })}
                          className="mt-0.5 text-[10px] font-medium text-[var(--text-4)] hover:text-[var(--text-2)]"
                        >
                          {isExpanded ? "Show less" : "Show more"}
                        </button>
                      )}
                    </div>
                  ) : syncLine ? (
                    <p className="text-[11px] text-[var(--text-4)]">{syncLine}</p>
                  ) : null}

                  {/* Hints */}
                  {hints.map((hint, i) => (
                    <p key={i} className="break-words rounded-[6px] border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
                      {hint}
                    </p>
                  ))}
                </div>

                {/* ── Card footer ── */}
                <div className="flex items-center border-t border-[var(--border-2)] px-4 py-2.5 gap-2">
                  {canManageSupport ? (
                    <button
                      type="button"
                      onClick={() => handleSync(conn.id)}
                      disabled={isThisPending}
                      className="flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
                    >
                      <BoltIcon className={cn("h-3 w-3", isSyncPending && "animate-spin")} />
                      {isSyncPending ? "Syncing…" : isResyncPending ? "Re-syncing…" : "Sync now"}
                    </button>
                  ) : null}
                  <div className="ml-auto">
                    {canManageSupport ? (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenMenuId(menuOpen ? null : conn.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-[6px] border border-[var(--border-2)] text-[var(--text-3)] transition hover:bg-[var(--surface-1)]"
                      >
                        <EllipsisVerticalIcon className="h-4 w-4" />
                      </button>
                      {menuOpen && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                          <div className="absolute right-0 bottom-full z-50 mb-1 w-44 overflow-hidden rounded-[8px] border border-[var(--border-2)] bg-white shadow-lg">
                            <button
                              type="button"
                              onClick={() => { setOpenMenuId(null); void handleSync(conn.id, true); }}
                              disabled={isThisPending}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
                            >
                              <ArrowPathIcon className="h-3.5 w-3.5 shrink-0" />
                              Re-sync history
                            </button>
                            <button
                              type="button"
                              onClick={() => { setOpenMenuId(null); setEditingConn(conn); }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                            >
                              <PencilSquareIcon className="h-3.5 w-3.5 shrink-0" />
                              Edit connector
                            </button>
                            <div className="border-t border-[var(--border-2)]" />
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                if (window.confirm(`Delete "${conn.label}"? This cannot be undone.`)) {
                                  deleteConn.mutate(conn.id);
                                  }
                                }}
                                disabled={deleteConn.isPending}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-500 transition hover:bg-red-50 disabled:opacity-50"
                              >
                                <TrashIcon className="h-3.5 w-3.5 shrink-0" />
                                Delete connector
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                      ) : null}
                    </div>
                  </div>
              </div>
            );
          })}
        </div>
      )}

      {canManageSupport ? (
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-2)] py-3 text-sm font-medium text-[var(--text-3)] transition hover:border-[var(--brand-700)] hover:text-[var(--brand-700)]"
        >
          <PlusIcon className="h-4 w-4" />
          Add connector
        </button>
      ) : null}

      {agentLogs.length > 0 && (
        <div className="app-card overflow-hidden p-0">
          <div className="flex h-9 items-center justify-between border-b border-black/[0.06] px-4">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-stone-400">
              02 // AGENT ACTIVITY
            </span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-emerald-600">
              LIVE
            </span>
          </div>
          <div className="space-y-2 p-4">
            {agentLogs.map((log: AuditLog) => {
              const agentName = log.actor.replace("agent:", "");
              const agentLabel =
                agentName === "orchestrator"
                  ? "Sync complete"
                  : agentName === "triage"
                    ? "Triage"
                    : agentName === "ingest"
                      ? "Ingest"
                      : agentName === "draft"
                        ? "Draft"
                        : agentName;
              const actionLabel = log.action
                .replace(/_/g, " ")
                .replace(/\b\w/g, (c: string) => c.toUpperCase());
              return (
                <div key={log.id} className="flex items-start justify-between gap-3 text-[12px]">
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="mt-0.5 shrink-0 rounded-md bg-[var(--mist)] px-2 py-0.5 text-[10px] font-semibold text-[var(--brand-700)]">
                      {agentLabel}
                    </span>
                    <span className="text-[var(--text-2)] truncate">{actionLabel}</span>
                  </div>
                  <span className="shrink-0 text-[var(--text-4)]">{formatShort(log.createdAt)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showAddModal && (
        <AddConnectorModal clientId={clientId} clientSlug={clientSlug} onClose={() => setShowAddModal(false)} />
      )}
      {editingConn && (
        <EditConnectorModal clientId={clientId} conn={editingConn} onClose={() => setEditingConn(null)} />
      )}
    </div>
  );
}

// ─── agent edit modal ─────────────────────────────────────────────────────────

function EditAgentModal({
  clientId,
  agentKey,
  agentLabel,
  defaultDescription,
  onClose,
}: {
  clientId: string;
  agentKey: string;
  agentLabel: string;
  defaultDescription: string;
  onClose: () => void;
}) {
  const storageKey = `care.agent.instructions.${clientId}.${agentKey}`;
  const [value, setValue] = useState(() => {
    try { return localStorage.getItem(storageKey) ?? defaultDescription; } catch { return defaultDescription; }
  });

  function handleSave() {
    try { localStorage.setItem(storageKey, value); } catch { /* ignore */ }
    onClose();
  }

  return (
    <CareModal title={`Edit — ${agentLabel}`} onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-[var(--text-3)]">
          Describe what this agent should do. The orchestrator passes these instructions when running the pipeline.
        </p>
        <label className="block space-y-1.5">
          <span className="app-field-label">Instructions</span>
          <textarea
            rows={6}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full resize-none rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-700)] focus:bg-white"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="primary" size="sm" onClick={handleSave}>Save</Button>
        </div>
      </div>
    </CareModal>
  );
}

// ─── agents view ─────────────────────────────────────────────────────────────

type AgentToggles = { ingest: boolean; triage: boolean; draft: boolean };

interface AgentCardDef {
  key: keyof AgentToggles;
  label: string;
  description: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}

const AGENT_CARDS: AgentCardDef[] = [
  {
    key: "ingest",
    label: "Ingest Filter",
    description: "AI reviews raw items from all sources and filters noise — only genuine support signals create conversations.",
    icon: SparklesIcon,
    iconBg: "bg-[var(--mist)]",
    iconColor: "text-[var(--brand-700)]",
  },
  {
    key: "triage",
    label: "Triage",
    description: "Classifies each conversation, sets priority and sentiment, and creates tickets for trackable issues.",
    icon: ClipboardDocumentListIcon,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-700",
  },
  {
    key: "draft",
    label: "Draft",
    description: "Generates pending-approval reply drafts for ticketed conversations, ready for your review.",
    icon: DocumentTextIcon,
    iconBg: "bg-purple-50",
    iconColor: "text-purple-700",
  },
];

function AgentsView({ clientId }: { clientId: string }) {
  const [toggles, setToggles] = useState<AgentToggles>({ ingest: true, triage: true, draft: true });
  const [editingAgent, setEditingAgent] = useState<AgentCardDef | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`care.agents.${clientId}`);
      if (stored) {
        setToggles(JSON.parse(stored) as AgentToggles);
      }
    } catch {
      // ignore parse errors
    }
  }, [clientId]);

  function toggle(key: keyof AgentToggles) {
    setToggles((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(`care.agents.${clientId}`, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }

  const { data: connectionsData } = useSupportConnections(clientId);
  const connections = connectionsData?.connections ?? [];
  const syncConn = useSyncConnection(clientId);
  const [syncResults, setSyncResults] = useState<
    Record<string, { ingested?: number; filtered?: number; errors: string[] } | null>
  >({});

  async function handleSync(connId: string) {
    setSyncResults((prev) => ({ ...prev, [connId]: null }));
    const result = await syncConn.mutateAsync({ connId, resync: false });
    setSyncResults((prev) => ({ ...prev, [connId]: result }));
  }

  const { data: logsData } = useSupportAuditLogs(clientId);
  const agentLogs = (logsData?.logs ?? []).filter((l: AuditLog) => l.actor.startsWith("agent:"));

  const AGENT_BADGE: Record<string, string> = {
    ingest: "bg-[var(--mist)] text-[var(--brand-700)]",
    triage: "bg-amber-50 text-amber-700",
    draft: "bg-purple-50 text-purple-700",
    orchestrator: "bg-[var(--mist)] text-[var(--brand-700)]",
  };

  return (
    <div className="space-y-6">
      {/* agent cards */}
      <section>
        <div className="app-card mb-4 overflow-hidden p-0">
          <div className="flex h-9 items-center justify-between border-b border-black/[0.06] px-4">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-stone-400">
              01 // AGENT PIPELINE
            </span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-emerald-600">
              LIVE
            </span>
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-3">
          {AGENT_CARDS.map((agent) => {
            const enabled = toggles[agent.key];
            return (
              <div key={agent.key} className="rounded-lg border border-[var(--border-2)] bg-[var(--surface-1)] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]",
                      agent.iconBg,
                      agent.iconColor,
                    )}
                  >
                    <agent.icon className="h-5 w-5" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditingAgent(agent)}
                      title="Edit instructions"
                      className="flex h-6 w-6 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-2)]"
                    >
                      <PencilSquareIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(agent.key)}
                      className={cn(
                        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                        enabled ? "bg-[var(--brand-700)]" : "bg-[var(--border-2)]",
                      )}
                      aria-checked={enabled}
                      role="switch"
                    >
                      <span
                        className={cn(
                          "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform",
                          enabled ? "translate-x-4" : "translate-x-0",
                        )}
                      />
                    </button>
                  </div>
                </div>
                <p className="mt-3 text-sm font-semibold text-[var(--text-1)]">{agent.label}</p>
                <p className="mt-1 text-xs text-[var(--text-3)]">
                  {(() => {
                    try {
                      return localStorage.getItem(`care.agent.instructions.${clientId}.${agent.key}`) ?? agent.description;
                    } catch {
                      return agent.description;
                    }
                  })()}
                </p>
              </div>
            );
          })}
          </div>
        </div>
      </section>

      {/* manual sync */}
      {connections.length > 0 && (
        <section>
          <div className="app-card overflow-hidden p-0">
            {/* widget header */}
            <div className="flex h-9 items-center justify-between border-b border-black/[0.06] px-4">
              <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-stone-400">
                02 // MANUAL SYNC
              </span>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-stone-400">
                {connections.length}
              </span>
            </div>
            {connections.map((conn, idx) => {
              const pending = syncConn.isPending && syncConn.variables === conn.id;
              const sr = syncResults[conn.id];
              return (
                <div
                  key={conn.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-4 px-5 py-4",
                    idx > 0 && "border-t border-[var(--border-2)]",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px]",
                        conn.health === "connected"
                          ? "bg-emerald-50 text-emerald-600"
                          : conn.health === "error"
                            ? "bg-red-50 text-red-500"
                            : "bg-[var(--surface-1)] text-[var(--text-3)]",
                      )}
                    >
                      <SourceIcon source={conn.source} className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--text-1)]">{conn.label}</span>
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-[10px] font-semibold",
                            conn.health === "connected"
                              ? "bg-emerald-50 text-emerald-700"
                              : conn.health === "error"
                                ? "bg-red-50 text-red-600"
                                : "bg-amber-50 text-amber-700",
                          )}
                        >
                          {conn.health === "connected" ? "Connected" : conn.health === "error" ? "Error" : "Needs setup"}
                        </span>
                      </div>
                      {sr !== undefined && sr !== null && (
                        <p className={cn("mt-0.5 text-[11px]", sr.errors.length > 0 ? "text-red-500" : "text-emerald-600")}>
                          {sr.errors.length > 0
                            ? `Error: ${sr.errors[0]}`
                            : `${sr.ingested ?? 0} ingested, ${sr.filtered ?? 0} filtered`}
                        </p>
                      )}
                      {pending && (
                        <p className="mt-0.5 text-[11px] text-[var(--text-4)]">Running agents…</p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSync(conn.id)}
                    disabled={syncConn.isPending}
                    className="flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
                  >
                    {pending ? (
                      <>
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--brand-700)] border-t-transparent" />
                        Running…
                      </>
                    ) : (
                      <>
                        <SparklesIcon className="h-3.5 w-3.5 text-[var(--brand-700)]" />
                        Run agents now
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* agent activity feed */}
      <section>
        {agentLogs.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--text-4)]">
            No agent activity yet — run a sync to get started.
          </p>
        ) : (
          <div className="app-card overflow-hidden p-0">
            {/* widget header */}
            <div className="flex h-9 items-center justify-between border-b border-black/[0.06] px-4">
              <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-stone-400">
                03 // AGENT ACTIVITY
              </span>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-emerald-600">
                LIVE
              </span>
            </div>
            {agentLogs.map((log: AuditLog, idx: number) => {
              const agentName = log.actor.replace("agent:", "");
              const badgeCls = AGENT_BADGE[agentName] ?? "bg-[var(--surface-1)] text-[var(--text-3)]";
              const actionLabel = log.action
                .replace(/_/g, " ")
                .replace(/\b\w/g, (c: string) => c.toUpperCase());
              return (
                <div
                  key={log.id}
                  className={cn(
                    "flex items-start justify-between gap-3 px-5 py-3.5",
                    idx > 0 && "border-t border-[var(--border-2)]",
                  )}
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold",
                        badgeCls,
                      )}
                    >
                      {agentName}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[var(--text-2)]">{actionLabel}</p>
                      {log.target && (
                        <p className="mt-0.5 truncate text-xs text-[var(--text-3)]">{log.target}</p>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-[var(--text-4)]">
                    {formatShort(log.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {editingAgent && (
        <EditAgentModal
          clientId={clientId}
          agentKey={editingAgent.key}
          agentLabel={editingAgent.label}
          defaultDescription={editingAgent.description}
          onClose={() => setEditingAgent(null)}
        />
      )}
    </div>
  );
}

// ─── settings view ───────────────────────────────────────────────────────────

function SettingsView({ clientId }: { clientId: string }) {
  const { canManageSupport } = usePermissions();
  const { data: rulesData, isLoading: rulesLoading } = useSupportWorkflowRules(clientId);
  const { data: clientData } = useSupportClients();
  const deleteRule = useDeleteWorkflowRule(clientId);
  const seedRules = useSeedDefaultRules(clientId);
  const updateClient = useUpdateSupportClient(clientId);
  const { data: portalClientsData } = useClientList();

  const thisClient = (clientData?.clients ?? []).find((c) => c.id === clientId);
  const [linkedPortalId, setLinkedPortalId] = useState(thisClient?.workspaceClientId ?? "");

  // Keep dropdown in sync if client data loads after mount
  useEffect(() => {
    setLinkedPortalId(thisClient?.workspaceClientId ?? "");
  }, [thisClient?.workspaceClientId]);

  const portalClients = portalClientsData?.clients ?? [];

  const [showAddRule, setShowAddRule] = useState(false);
  const [editingRule, setEditingRule] = useState<WorkflowRule | null>(null);

  const rules = rulesData?.rules ?? [];

  return (
    <div className="space-y-6">
      {/* agents */}
      <AgentsView clientId={clientId} />

      {/* portal link */}
      <section>
        <div className="app-card overflow-hidden p-0">
          <div className="flex h-9 items-center justify-between border-b border-black/[0.06] px-4">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-stone-400">
              00 // PORTAL LINK
            </span>
            {thisClient?.workspaceClientId && (
              <span className="rounded-[4px] border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                Linked
              </span>
            )}
          </div>
          <div className="p-5">
            <p className="mb-3 text-sm text-[var(--text-3)]">
              Link this Care account to a client record in Portal. This surfaces a Care badge on the Portal client card and lets both views stay in sync.
            </p>
            <div className="flex items-center gap-3">
              <select
                value={linkedPortalId}
                onChange={(e) => setLinkedPortalId(e.target.value)}
                className="app-select flex-1"
              >
                <option value="">— Not linked —</option>
                {portalClients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <Button
                type="button"
                variant="primary"
                size="sm"
                loading={updateClient.isPending}
                disabled={linkedPortalId === (thisClient?.workspaceClientId ?? "")}
                onClick={() => updateClient.mutate({ workspaceClientId: (linkedPortalId || null) as string | undefined })}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* workflow rules */}
      <section>
        <div className="app-card overflow-hidden p-0">
          <div className="flex h-9 items-center justify-between border-b border-black/[0.06] px-4">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-stone-400">
              01 // WORKFLOW RULES
            </span>
            {canManageSupport ? (
              <button
                type="button"
                onClick={() => setShowAddRule(true)}
                className="flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-700)] transition hover:bg-[var(--mist)]"
              >
                <PlusIcon className="h-3 w-3" />
                Add rule
              </button>
            ) : null}
          </div>
          {rulesLoading && <div className="h-20 animate-pulse bg-[var(--surface-1)]" />}
          {!rulesLoading && rules.length === 0 && (
            <div className="flex items-center justify-between px-5 py-4">
              <p className="text-sm text-[var(--text-4)]">No rules configured yet.</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={seedRules.isPending}
                onClick={() => seedRules.mutate()}
              >
                Restore defaults
              </Button>
            </div>
          )}
          {rules.map((rule, idx) => (
            <div
              key={rule.id}
              className={cn("px-5 py-4", idx > 0 && "border-t border-[var(--border-2)]")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--text-1)]">{rule.name}</p>
                  <p className="mt-1 text-xs text-[var(--text-3)]">
                    <span className="font-medium">When:</span> {rule.when}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-3)]">
                    <span className="font-medium">Then:</span> {rule.then}
                  </p>
                  {rule.requiresApproval && (
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-amber-600">
                      Requires approval
                    </p>
                  )}
                </div>
                {canManageSupport ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingRule(rule)}
                      className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--mist)] hover:text-[var(--brand-700)]"
                      title="Edit rule"
                    >
                      <PencilSquareIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteRule.mutate(rule.id)}
                      disabled={deleteRule.isPending}
                      className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--danger-50)] hover:text-[var(--danger-500)]"
                      title="Delete rule"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        {showAddRule && (
          <RuleModal clientId={clientId} onClose={() => setShowAddRule(false)} />
        )}
        {editingRule && (
          <RuleModal clientId={clientId} rule={editingRule} onClose={() => setEditingRule(null)} />
        )}
      </section>
    </div>
  );
}

// ─── tab bar ─────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "inbox", label: "Inbox", icon: InboxIcon },
  { id: "tickets", label: "Tickets", icon: ClipboardDocumentListIcon },
  { id: "reports", label: "Reports", icon: DocumentTextIcon },
];

// ─── main dashboard ──────────────────────────────────────────────────────────

export function SupportDashboard() {
  const { data: clientsData, isLoading: clientsLoading } = useSupportClients();
  const clients = useMemo(() => clientsData?.clients ?? [], [clientsData]);

  const [activeClientId, setActiveClientId] = useState<string>(() => {
    try { return localStorage.getItem("care-active-client") ?? ""; } catch { return ""; }
  });
  const [activeTab, setActiveTab] = useState<Tab>("inbox");
  const [activePanel, setActivePanel] = useState<"settings" | "connectors" | null>(null);
  const [showAddClient, setShowAddClient] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  function togglePanel(panel: "settings" | "connectors") {
    setActivePanel((prev) => (prev === panel ? null : panel));
  }

  function selectClient(id: string) {
    setActiveClientId(id);
    try { localStorage.setItem("care-active-client", id); } catch { /* ignore */ }
  }

  // Set first client when data loads (or if stored ID no longer exists)
  useEffect(() => {
    if (clients.length > 0 && (!activeClientId || !clients.find((c) => c.id === activeClientId))) {
      selectClient(clients[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients]);

  const client = clients.find((c) => c.id === activeClientId);
  const { data: healthData } = useClientHealth(activeClientId || null);
  const health = healthData?.health ?? null;

  const { data: convoData } = useSupportConversations(activeClientId || null);
  const inboxUnread = (convoData?.conversations ?? []).filter((c) => c.unread).length;

  if (clientsLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-full bg-[var(--surface-1)]" />
          <div className="h-3 w-32 animate-pulse rounded-full bg-[var(--surface-1)]" />
        </div>
      </div>
    );
  }

  if (!clientsLoading && clients.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)]">
          <UsersIcon className="h-7 w-7 text-[var(--text-4)]" />
        </div>
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-[var(--text-1)]">No clients yet</h2>
          <p className="max-w-[26rem] text-sm leading-6 text-[var(--text-3)]">
            Add your first support client to start monitoring their channels, inbox, and tickets.
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={() => setShowAddClient(true)}
          leadingIcon={<PlusIcon className="h-4 w-4" />}
        >
          Add client
        </Button>
        {showAddClient && <AddClientModal onClose={() => setShowAddClient(false)} />}
      </div>
    );
  }

  if (!client) return null;

  return (
    <div className="flex min-h-0 w-full gap-0">
      {/* client sub-sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 border-r border-[var(--border-2)] lg:flex lg:flex-col transition-all duration-200",
          sidebarCollapsed ? "w-14" : "w-56",
        )}
      >
        {/* collapse / expand toggle */}
        <div className={cn("flex items-center border-b border-[var(--border-2)] py-3", sidebarCollapsed ? "justify-center px-0" : "justify-end px-3")}>
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-2)]"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <ChevronDoubleRightIcon className="h-3.5 w-3.5" /> : <ChevronDoubleLeftIcon className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* client list */}
        <div className={cn("flex-1 overflow-y-auto py-3", sidebarCollapsed ? "px-1.5 space-y-1.5" : "px-2 space-y-0.5")}>
          {clients.map((c) => {
            const initial = c.name.charAt(0).toUpperCase();
            const isActive = c.id === activeClientId;
            return sidebarCollapsed ? (
              <button
                key={c.id}
                type="button"
                title={c.name}
                onClick={() => { selectClient(c.id); setActiveTab("inbox"); }}
                className={cn(
                  "relative flex w-full items-center justify-center rounded-[10px] py-1.5 transition",
                  isActive ? "bg-[var(--mist)]" : "hover:bg-[var(--surface-1)]",
                )}
              >
                <span className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-bold transition",
                  isActive
                    ? "bg-[var(--brand-700)] text-white"
                    : "bg-[var(--brand-50)] text-[var(--brand-700)]",
                )}>
                  {initial}
                </span>
                {(c.unreadCount ?? 0) > 0 && (
                  <span className="absolute right-1.5 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                    {(c.unreadCount ?? 0) > 9 ? "9+" : c.unreadCount}
                  </span>
                )}
              </button>
            ) : (
              <button
                key={c.id}
                type="button"
                onClick={() => { selectClient(c.id); setActiveTab("inbox"); }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-left text-sm transition",
                  isActive
                    ? "bg-[var(--mist)] text-[var(--brand-700)]"
                    : "text-[var(--text-2)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]",
                )}
              >
                <span className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                  isActive ? "bg-[var(--brand-700)] text-white" : "bg-[var(--brand-50)] text-[var(--brand-700)]",
                )}>
                  {initial}
                </span>
                <span className="flex-1 truncate font-medium">{c.name}</span>
                {isActive && health && (
                  <span
                    className={cn("h-1.5 w-1.5 shrink-0 rounded-full", HEALTH_TIER_DOT[health.tier])}
                    title={`${HEALTH_TIER_LABEL[health.tier]} — ${health.score}/100`}
                  />
                )}
                {(c.unreadCount ?? 0) > 0 && (
                  <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {(c.unreadCount ?? 0) > 9 ? "9+" : c.unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* add client button */}
        {!sidebarCollapsed ? (
          <div className="border-t border-[var(--border-2)] px-2 py-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => setShowAddClient(true)}
              leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
            >
              Add client
            </Button>
          </div>
        ) : (
          <div className="border-t border-[var(--border-2)] py-3 flex justify-center">
            <button
              type="button"
              title="Add client"
              onClick={() => setShowAddClient(true)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-dashed border-[var(--border-2)] text-[var(--text-4)] transition hover:border-[var(--brand-700)] hover:text-[var(--brand-700)]"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </aside>

      {/* main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* client name + tab bar */}
        <div className="border-b border-[var(--border-2)] px-6 sm:px-8">
          <div className="flex items-center gap-3 pt-5 pb-0">
            <h2 className="text-base font-semibold text-[var(--text-1)]">{client.name}</h2>
            <span className="text-[var(--text-4)]">·</span>
            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              Live
            </span>
            {health && <HealthBadge health={health} />}
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => togglePanel("connectors")}
                title="Connectors — connect Gmail, analytics & other sources"
                className={cn(
                  "flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1.5 text-xs font-medium transition",
                  activePanel === "connectors"
                    ? "border-[var(--brand-700)] bg-[var(--mist)] text-[var(--brand-700)]"
                    : "border-[var(--border-2)] text-[var(--text-2)] hover:bg-[var(--surface-1)]",
                )}
              >
                <BoltIcon className="h-4 w-4" />
                Connectors
              </button>
              <button
                type="button"
                onClick={() => togglePanel("settings")}
                title="Settings — agents, workflow rules & portal link"
                className={cn(
                  "flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1.5 text-xs font-medium transition",
                  activePanel === "settings"
                    ? "border-[var(--brand-700)] bg-[var(--mist)] text-[var(--brand-700)]"
                    : "border-[var(--border-2)] text-[var(--text-2)] hover:bg-[var(--surface-1)]",
                )}
              >
                <Cog8ToothIcon className="h-4 w-4" />
                Settings
              </button>
            </div>
          </div>

          <nav className="mt-3 flex gap-0 overflow-x-auto">
            {TABS.map((tab) => {
              const badge = tab.id === "inbox" ? inboxUnread : undefined;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => { setActiveTab(tab.id); setActivePanel(null); }}
                  className={cn(
                    "flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition",
                    activeTab === tab.id
                      ? "border-[var(--brand-700)] text-[var(--brand-700)]"
                      : "border-transparent text-[var(--text-3)] hover:border-[var(--border-2)] hover:text-[var(--text-2)]",
                  )}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                  {badge != null && badge > 0 && (
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                        activeTab === tab.id
                          ? "bg-[var(--mist)] text-[var(--brand-700)]"
                          : "bg-[var(--surface-1)] text-[var(--text-4)]",
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* tab content / panel — pb clears the fixed 48px "On Your Desk" dock */}
        <div className="flex-1 overflow-auto px-6 pb-20 pt-5 sm:px-8">
          {activePanel === "connectors" && <ConnectorsView clientId={activeClientId} clientSlug={client?.slug ?? ""} />}
          {activePanel === "settings" && <SettingsView clientId={activeClientId} />}
          {!activePanel && activeTab === "inbox" && <InboxView clientId={activeClientId} />}
          {!activePanel && activeTab === "tickets" && <TicketsTableView clientId={activeClientId} />}
          {!activePanel && activeTab === "reports" && <ReportsView client={client} />}
        </div>
      </div>

      {showAddClient && <AddClientModal onClose={() => setShowAddClient(false)} />}
    </div>
  );
}
