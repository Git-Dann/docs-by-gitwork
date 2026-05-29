"use client";

import {
  ArrowPathIcon,
  BoltIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ClipboardDocumentListIcon,
  Cog8ToothIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  InboxIcon,
  KeyIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
  UsersIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useState, useDeferredValue, useEffect, useMemo, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/format";
import { Button } from "@/components/ui/button";
import type {
  AuditLog,
  Connection,
  Conversation,
  SupportClient,
  SupportSource,
  Ticket,
  TicketPriority,
  TicketStatus,
} from "@/types/support";
import {
  useCreateSupportClient,
  useCreateSupportConnection,
  useCreateWorkflowRule,
  useDeleteConnection,
  useDeleteWorkflowRule,
  useGenerateAiDraft,
  useSeedDefaultRules,
  useSupportClients,
  useSupportConversations,
  useSupportMessages,
  useUpdateConversation,
  useUpdateConnection,
  useSendMessage,
  useSupportTickets,
  useUpdateTicket,
  useSupportConnections,
  useSupportWorkflowRules,
  useSupportAuditLogs,
  useSyncConnection,
} from "@/hooks/use-support";
import { useClientList } from "@/hooks/use-proposals";

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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
};

const LIVE_SOURCES: SupportSource[] = ["gmail", "discord", "reddit", "youtube"];
const COMING_SOON_SOURCES: SupportSource[] = ["instagram", "clickup", "stripe"];

const SOURCE_TAGLINE: Partial<Record<SupportSource, string>> = {
  gmail: "Email forwarding via your support inbox",
  discord: "Monitor channels on a client's server",
  reddit: "Watch public subreddits for mentions",
  youtube: "Ingest comments from videos or channel",
  instagram: "DMs & comments — coming soon",
  clickup: "Sync tasks and comments",
  stripe: "Disputes & payment events via webhook",
};

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

type Tab = "inbox" | "tickets" | "reports" | "connectors" | "agents" | "settings";

// ─── shared modal wrapper ─────────────────────────────────────────────────────

function CareModal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className={cn(
          "app-dialog-panel relative z-10 w-full p-6",
          wide ? "max-w-xl" : "max-w-md",
        )}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-4)] hover:bg-[var(--surface-1)]"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        {children}
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
  if (s === "reddit" || s === "gmail") return "manual";
  return "api_key";
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
  const [gmailQuery, setGmailQuery] = useState(`deliveredto:${defaultIntake}`);

  // Discord fields
  const [discordToken, setDiscordToken] = useState("");
  const [discordGuildId, setDiscordGuildId] = useState("");
  const [discordGuildName, setDiscordGuildName] = useState("");
  const [discordKeywords, setDiscordKeywords] = useState("");
  const [availableChannels, setAvailableChannels] = useState<{ id: string; name: string }[]>([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(new Set());
  const [fetchingChannels, setFetchingChannels] = useState(false);
  const [channelFetchError, setChannelFetchError] = useState<string | null>(null);
  const [tokenChecked, setTokenChecked] = useState(false);

  // Reddit fields
  const [redditSubreddit, setRedditSubreddit] = useState("");
  const [redditKeywords, setRedditKeywords] = useState("");

  // YouTube fields
  const [ytChannelId, setYtChannelId] = useState("");
  const [ytVideoIds, setYtVideoIds] = useState("");

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
      const data = await res.json() as { channels?: { id: string; name: string }[]; guildName?: string; error?: string };
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
    if (source === "gmail") {
      return { query: gmailQuery.trim(), intakeAddress: defaultIntake };
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
        keywords: discordKeywords.split(",").map((s) => s.trim()).filter(Boolean),
      };
    }
    if (source === "reddit") {
      return {
        subreddit: redditSubreddit.trim(),
        keywords: redditKeywords.split(",").map((s) => s.trim()).filter(Boolean),
      };
    }
    if (source === "youtube") {
      return {
        youtubeChannelId: ytChannelId.trim() || undefined,
        videoIds: ytVideoIds.split(",").map((s) => s.trim()).filter(Boolean),
      };
    }
    return undefined;
  }

  function initialHealth(): "connected" | "needs_setup" {
    if (source === "discord") return selectedChannelIds.size > 0 ? "connected" : "needs_setup";
    return source === "gmail" || source === "reddit" ? "connected" : "needs_setup";
  }

  function isSubmitDisabled() {
    if (createConnection.isPending) return true;
    if (source === "discord") return !discordToken.trim() || !discordGuildId.trim() || selectedChannelIds.size === 0;
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
    <CareModal title="Connect a channel" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* live source tiles */}
        <div>
          <div className="grid grid-cols-2 gap-2.5">
            {LIVE_SOURCES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSource(s)}
                className={cn(
                  "flex items-start gap-3 rounded-[12px] border p-3.5 text-left transition",
                  source === s
                    ? "border-[var(--brand-700)] bg-[var(--mist)] shadow-sm"
                    : "border-[var(--border-2)] bg-white hover:border-[var(--border-1)] hover:bg-[var(--surface-1)]",
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]",
                    source === s ? "bg-white text-[var(--brand-700)]" : "bg-[var(--surface-1)] text-[var(--text-3)]",
                  )}
                >
                  <SourceIcon source={s} className="h-5 w-5" />
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

          {/* coming soon */}
          <p className="mt-4 mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-4)]">
            <span className="h-px flex-1 bg-[var(--border-2)]" />
            Coming soon
            <span className="h-px flex-1 bg-[var(--border-2)]" />
          </p>
          <div className="grid grid-cols-3 gap-2">
            {COMING_SOON_SOURCES.map((s) => (
              <div
                key={s}
                className="flex flex-col items-center gap-2 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-3 opacity-50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-white text-[var(--text-4)]">
                  <SourceIcon source={s} className="h-4 w-4" />
                </div>
                <p className="text-xs font-medium text-[var(--text-3)]">{SOURCE_LABEL[s]}</p>
              </div>
            ))}
          </div>
        </div>

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
            <div className="space-y-1">
              <p className="text-xs font-medium text-[var(--text-2)]">Client intake address</p>
              <p className="select-all rounded-[6px] bg-white px-2.5 py-2 font-mono text-xs text-[var(--text-1)]">
                {defaultIntake}
              </p>
              <p className="text-[11px] text-[var(--text-4)]">
                Ask your client to add a forward rule to this address. Emails received here appear as conversations in Care.
              </p>
            </div>
            <label className="block space-y-1">
              <span className="app-field-label">Gmail query (optional)</span>
              <input
                value={gmailQuery}
                onChange={(e) => setGmailQuery(e.target.value)}
                className="app-input w-full font-mono text-xs"
                placeholder={`deliveredto:${defaultIntake}`}
              />
            </label>
          </div>
        )}

        {/* Discord config */}
        {source === "discord" && (
          <div className="space-y-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
            <p className="text-[11px] text-[var(--text-4)]">
              Invite <span className="font-medium text-[var(--text-2)]">gitwork_support_bot</span> to the client&apos;s server with Read Messages and Send Messages permissions, then enter the bot token and Server ID below.
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
                      className="flex cursor-pointer items-center gap-2.5 border-b border-[var(--border-2)] px-3 py-2 last:border-b-0 hover:bg-[var(--surface-1)]"
                    >
                      <input
                        type="checkbox"
                        checked={selectedChannelIds.has(ch.id)}
                        onChange={() => toggleChannel(ch.id)}
                        className="h-3.5 w-3.5 shrink-0 accent-[var(--brand-700)]"
                      />
                      <span className="text-xs text-[var(--text-1)]"># {ch.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <label className="block space-y-1">
              <span className="app-field-label">
                Keywords <span className="font-normal text-[var(--text-4)]">(optional — leave blank to ingest all messages)</span>
              </span>
              <input
                value={discordKeywords}
                onChange={(e) => setDiscordKeywords(e.target.value)}
                className="app-input w-full"
                placeholder="e.g. bug, help, issue, broken"
              />
            </label>
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
            <label className="block space-y-1">
              <span className="app-field-label">Keywords (optional, comma-separated)</span>
              <input
                value={redditKeywords}
                onChange={(e) => setRedditKeywords(e.target.value)}
                className="app-input w-full"
                placeholder="e.g. bug report, acme help"
              />
            </label>
          </div>
        )}

        {/* YouTube config */}
        {source === "youtube" && (
          <div className="space-y-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
            <p className="text-[11px] text-[var(--text-4)]">
              Uses the Google service account from Settings → Integrations. Enter a channel ID or specific video IDs.
            </p>
            <label className="block space-y-1">
              <span className="app-field-label">YouTube channel ID (optional)</span>
              <input
                value={ytChannelId}
                onChange={(e) => setYtChannelId(e.target.value)}
                className="app-input w-full font-mono text-xs"
                placeholder="UCxxxxxxxxxxxxxxxxxxxx"
              />
            </label>
            <label className="block space-y-1">
              <span className="app-field-label">Video IDs (comma-separated, optional)</span>
              <input
                value={ytVideoIds}
                onChange={(e) => setYtVideoIds(e.target.value)}
                className="app-input w-full font-mono text-xs"
                placeholder="dQw4w9WgXcQ, abc123"
              />
            </label>
          </div>
        )}

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
            disabled={isSubmitDisabled()}
            loading={createConnection.isPending}
          >
            {createConnection.isPending ? "Saving…" : "Add connector"}
          </Button>
        </div>
      </form>
    </CareModal>
  );
}

// ─── add rule modal ───────────────────────────────────────────────────────────

function AddRuleModal({
  clientId,
  onClose,
}: {
  clientId: string;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [when, setWhen] = useState("");
  const [then, setThen] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createRule = useCreateWorkflowRule(clientId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    createRule.mutate(
      { name: name.trim(), when: when.trim(), then: then.trim(), requiresApproval },
      {
        onSuccess: () => onClose(),
        onError: (err) => setError(err instanceof Error ? err.message : "Failed to create rule"),
      },
    );
  }

  return (
    <CareModal title="Add workflow rule" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-[var(--text-3)]">
          Rules describe conditions and actions in plain language. The AI reads these when processing
          inbound messages and applies them automatically.
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
              The AI will draft the action but wait for a team member to approve it.
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
            disabled={createRule.isPending || !name.trim() || !when.trim() || !then.trim()}
            loading={createRule.isPending}
          >
            {createRule.isPending ? "Saving…" : "Save rule"}
          </Button>
        </div>
      </form>
    </CareModal>
  );
}

// ─── inbox view ──────────────────────────────────────────────────────────────

type DraftState = { text: string; status: "draft" | "approved" } | null;

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
  filterSource,
  filterSentiment,
  filterUnread,
  presentSources,
  onSourceChange,
  onSentimentChange,
  onUnreadChange,
  onClear,
}: {
  filterSource: SupportSource | "all";
  filterSentiment: "all" | "positive" | "neutral" | "negative";
  filterUnread: boolean;
  presentSources: SupportSource[];
  onSourceChange: (v: SupportSource | "all") => void;
  onSentimentChange: (v: "all" | "positive" | "neutral" | "negative") => void;
  onUnreadChange: (v: boolean) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const activeCount = [
    filterSource !== "all",
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

          {presentSources.length > 1 && (
            <>
              <div className="my-2 border-t border-[var(--border-2)]" />
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-4)]">Source</p>
              <FilterOption value={"all" as const} active={filterSource === "all"} onClick={onSourceChange}>All sources</FilterOption>
              {presentSources.map((s) => (
                <FilterOption key={s} value={s} active={filterSource === s} onClick={onSourceChange}>
                  <span className="flex items-center gap-1.5">
                    <SourceIcon source={s} className="h-3.5 w-3.5" />
                    {SOURCE_LABEL[s]}
                  </span>
                </FilterOption>
              ))}
            </>
          )}

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

  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search);
  const [filterSource, setFilterSource] = useState<SupportSource | "all">("all");
  const [filterSentiment, setFilterSentiment] = useState<"all" | "positive" | "neutral" | "negative">("all");
  const [filterUnread, setFilterUnread] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;
  const [replyText, setReplyText] = useState("");
  const [draft, setDraft] = useState<DraftState>(null);

  // Set first conversation when data loads
  useEffect(() => {
    if (convos.length > 0 && selectedConvId === null) {
      setSelectedConvId(convos[0].id);
    }
  }, [convos, selectedConvId]);

  const { data: msgData, isLoading: msgsLoading } = useSupportMessages(clientId, selectedConvId);
  const messages = msgData?.messages ?? [];

  const updateConversation = useUpdateConversation(clientId);
  const sendMessage = useSendMessage(clientId, selectedConvId);
  const generateDraft = useGenerateAiDraft(clientId);

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

  // Clear draft when switching conversations
  useEffect(() => {
    setDraft(null);
    setReplyText("");
  }, [selectedConvId]);

  // Derive which sources are present so we only show relevant chips
  const presentSources = useMemo(
    () => [...new Set(convos.map((c) => c.source))],
    [convos],
  );

  const filtered = convos.filter((c) => {
    if (deferred && !c.subject.toLowerCase().includes(deferred.toLowerCase()) && !c.tags.some((t) => t.includes(deferred.toLowerCase()))) return false;
    if (filterSource !== "all" && c.source !== filterSource) return false;
    if (filterSentiment !== "all" && c.sentiment !== filterSentiment) return false;
    if (filterUnread && !c.unread) return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset to first page when filters or search changes
  useEffect(() => { setPage(0); }, [deferred, filterSource, filterSentiment, filterUnread]);

  const activeConvo = convos.find((c) => c.id === selectedConvId) ?? null;

  function handleSend() {
    const body = (draft?.status === "approved" ? draft.text : replyText).trim();
    if (!body || !selectedConvId) return;
    sendMessage.mutate(
      { direction: "outbound", authorLabel: "Support", body },
      {
        onSuccess: () => {
          setReplyText("");
          setDraft(null);
        },
      },
    );
  }

  function handleGenerateDraft() {
    if (!selectedConvId) return;
    generateDraft.mutate(selectedConvId, {
      onSuccess: (res) => setDraft({ text: res.draft, status: "draft" }),
    });
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {/* search + filter bar — full width above columns */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-[14rem] flex-1 sm:max-w-xs">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-4)]" />
          <input
            className="h-9 w-full rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] pl-9 pr-3 text-sm text-[var(--text-1)] outline-none transition placeholder:text-[var(--text-4)] focus:border-[var(--brand-700)] focus:bg-white"
            placeholder="Search inbox…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <InboxFiltersDropdown
          filterSource={filterSource}
          filterSentiment={filterSentiment}
          filterUnread={filterUnread}
          presentSources={presentSources}
          onSourceChange={setFilterSource}
          onSentimentChange={setFilterSentiment}
          onUnreadChange={setFilterUnread}
          onClear={() => { setFilterSource("all"); setFilterSentiment("all"); setFilterUnread(false); }}
        />
      </div>

      {/* two-column layout */}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        {/* conversation list */}
        <div className="space-y-2">
          <div className="max-h-[calc(100vh-18rem)] space-y-2 overflow-y-auto pr-0.5">
          {convosLoading && (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />
              ))}
            </div>
          )}
          {!convosLoading && filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--text-4)]">No conversations found.</p>
          )}
          {paginated.map((c) => (
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

        {/* detail pane */}
      <div className="app-card flex min-w-0 flex-col overflow-hidden">
        {!activeConvo ? (
          <div className="flex h-40 items-center justify-center text-sm text-[var(--text-4)]">
            Select a conversation
          </div>
        ) : (
          <>
            {/* header */}
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-2)] px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]">
                  <SourceIcon source={activeConvo.source} />
                  <span>{SOURCE_LABEL[activeConvo.source]}</span>
                  <span className="text-[var(--text-4)]">·</span>
                  <span>{activeConvo.customerLabel}</span>
                </div>
                <h2 className="mt-1 truncate text-base font-semibold text-[var(--text-1)]">
                  {activeConvo.subject}
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-[11px] text-[var(--text-4)]">
                  {formatShort(activeConvo.receivedAt)}
                </span>
                <button
                  type="button"
                  onClick={handleGenerateDraft}
                  disabled={generateDraft.isPending}
                  className="flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--mist)] hover:border-[var(--mist-border)] hover:text-[var(--brand-700)] disabled:opacity-50"
                >
                  <SparklesIcon className="h-3.5 w-3.5 text-[var(--brand-700)]" />
                  {generateDraft.isPending ? "Generating…" : "Draft AI reply"}
                </button>
              </div>
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
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "rounded-[10px] border p-3.5 text-sm leading-6",
                    msg.direction === "inbound"
                      ? "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-2)]"
                      : "border-[var(--mist-border)] bg-[var(--mist)] text-[var(--text-1)]",
                  )}
                >
                  <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--text-3)]">
                    <span>{msg.authorLabel}</span>
                    <span>{formatShort(msg.createdAt)}</span>
                  </div>
                  {msg.body}
                </div>
              ))}
            </div>

            {/* AI draft panel */}
            {draft && (
              <div className="border-t border-[var(--mist-border)] bg-[var(--mist)] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <SparklesIcon className="h-4 w-4 text-[var(--brand-700)]" />
                    <span className="text-xs font-semibold text-[var(--brand-700)]">AI draft</span>
                    {draft.status === "approved" && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        Approved
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDraft(null)}
                    className="text-[var(--text-4)] hover:text-[var(--text-2)]"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
                <textarea
                  rows={5}
                  value={draft.text}
                  onChange={(e) => setDraft({ text: e.target.value, status: "draft" })}
                  className="w-full resize-none rounded-[6px] border border-[var(--mist-border)] bg-white p-3 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-700)]"
                />
                <div className="mt-2 flex items-center justify-end gap-2">
                  {draft.status === "draft" ? (
                    <button
                      type="button"
                      onClick={() => setDraft({ text: draft.text, status: "approved" })}
                      className="flex items-center gap-1.5 rounded-[6px] border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                    >
                      <CheckCircleIcon className="h-4 w-4" />
                      Approve draft
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={sendMessage.isPending}
                      className="flex items-center gap-1.5 rounded-[6px] bg-[var(--brand-700)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--brand-800)] disabled:opacity-50"
                    >
                      {sendMessage.isPending ? "Sending…" : "Send reply"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* manual reply box (only when no draft) */}
            {!draft && (
              <div className="border-t border-[var(--border-2)] p-4">
                <textarea
                  rows={3}
                  className="w-full resize-none rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3 text-sm text-[var(--text-1)] outline-none transition placeholder:text-[var(--text-4)] focus:border-[var(--brand-700)] focus:bg-white"
                  placeholder="Write a reply…"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sendMessage.isPending || !replyText.trim()}
                    className="rounded-[6px] bg-[var(--brand-700)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    {sendMessage.isPending ? "Sending…" : "Send reply"}
                  </button>
                </div>
              </div>
            )}
          </>
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
        "w-full rounded-[10px] border p-3.5 text-left transition",
        active
          ? "border-[var(--mist-border)] bg-[var(--mist)] shadow-sm"
          : "border-[var(--border-2)] bg-white hover:border-[var(--mist-border)] hover:bg-[var(--surface-1)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]">
            <SourceIcon source={convo.source} />
            <span>{SOURCE_LABEL[convo.source]}</span>
            {convo.sentiment === "negative" && (
              <span className="h-2 w-2 rounded-full bg-red-400" title="Negative sentiment" />
            )}
            {convo.unread && (
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-700)]" title="Unread" />
            )}
          </div>
          <h3 className="mt-1.5 truncate text-sm font-semibold text-[var(--text-1)]">
            {convo.subject}
          </h3>
        </div>
        <span className="shrink-0 whitespace-nowrap text-[11px] text-[var(--text-4)]">
          {formatShort(convo.receivedAt)}
        </span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[var(--text-3)]">{convo.preview}</p>
      {convo.tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {[...new Set(convo.tags)].map((tag) => (
            <span
              key={tag}
              className="rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-3)]"
            >
              {tag.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// ─── tickets view ────────────────────────────────────────────────────────────

function TicketsView({ clientId }: { clientId: string }) {
  const { data, isLoading } = useSupportTickets(clientId);
  const tickets = data?.tickets ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const updateTicket = useUpdateTicket(clientId);

  if (isLoading) {
    return (
      <div className="app-card overflow-hidden p-0">
        {[...Array(4)].map((_, i) => (
          <div key={i} className={cn("h-12 animate-pulse bg-[var(--surface-1)]", i > 0 && "border-t border-[var(--border-2)]")} />
        ))}
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="app-card flex h-40 items-center justify-center text-sm text-[var(--text-4)]">
        No tickets for this client yet.
      </div>
    );
  }

  const open = tickets.filter((t) => t.status !== "resolved");
  const resolved = tickets.filter((t) => t.status === "resolved");

  function TicketTable({ rows }: { rows: Ticket[] }) {
    return (
      <div className="app-card overflow-hidden p-0">
        {/* header */}
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 border-b border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-4)]">
          <span>Title</span>
          <span className="w-20 text-center">Priority</span>
          <span className="w-24 text-right">Updated</span>
          <span className="w-8" />
          <span className="w-36 text-right">Status</span>
        </div>
        {rows.map((ticket) => {
          const isExpanded = expandedId === ticket.id;
          return (
            <div key={ticket.id} className="border-b border-[var(--border-2)] last:border-b-0">
              {/* main row */}
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : ticket.id)}
                className="grid w-full grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 px-4 py-3 text-left transition hover:bg-[var(--surface-1)]"
              >
                <div className="min-w-0">
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
                </div>
                <span className={cn("inline-flex w-20 items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold", PRIORITY_TONE[ticket.priority])}>
                  {ticket.priority}
                </span>
                <span className="w-24 text-right text-[11px] text-[var(--text-4)]">{formatShort(ticket.updatedAt)}</span>
                {/* chevron */}
                <span className="flex w-8 justify-center text-[var(--text-4)]">
                  <svg className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                {/* status dropdown */}
                <div className="flex w-36 justify-end" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={ticket.status}
                    onChange={(e) => updateTicket.mutate({ ticketId: ticket.id, data: { status: e.target.value as TicketStatus } })}
                    className={cn(
                      "cursor-pointer rounded-full border px-2 py-0.5 text-[10px] font-semibold outline-none transition",
                      STATUS_TONE[ticket.status],
                    )}
                  >
                    {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((s) => (
                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                </div>
              </button>

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
    </div>
  );
}

// ─── reports view ────────────────────────────────────────────────────────────

function ReportsView({ client }: { client: SupportClient }) {
  const hasAllocation = client.supportDaysPerMonth != null;
  const used = client.supportDaysUsed ?? 0;
  const total = client.supportDaysPerMonth ?? 0;
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;

  const [reportText, setReportText] = useState("");
  const [generating, setGenerating] = useState(false);

  const month = new Date().toLocaleString("en-GB", { month: "long", year: "numeric" });

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    await new Promise((r) => setTimeout(r, 800));
    setReportText(
      `# Care Report — ${client.name}\n**${month}**\n\n` +
        `## Summary\n_Add a 2–3 sentence overview of the month's support activity here._\n\n` +
        (hasAllocation
          ? `## Support days\n- Allocated: ${total} days\n- Used: ${used} days (${pct}%)\n- Remaining: ${total - used} days\n\n`
          : "") +
        `## Conversations & tickets\n- _Total conversations opened: —_\n- _Tickets resolved: —_\n- _Avg. first response time: —_\n\n` +
        `## Top issues this month\n1. \n2. \n3. \n\n` +
        `## Actions for next month\n- \n- \n`,
    );
    setGenerating(false);
  }, [client.name, month, hasAllocation, total, used, pct]);

  return (
    <div className="space-y-4">
      {hasAllocation && (
        <div className="app-card p-5">
          <p className="text-sm font-medium text-[var(--text-3)]">
            Support days — {month}
          </p>
          <div className="mt-4 flex items-end gap-4">
            <p className="text-[32px] font-semibold leading-none tracking-[-0.03em] text-[var(--text-1)]">
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
      )}

      <div className="app-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-[var(--text-3)]">Monthly report draft</p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 rounded-[8px] border border-[var(--mist-border)] bg-[var(--mist)] px-3 py-1.5 text-xs font-medium text-[var(--brand-700)] transition hover:opacity-80 disabled:opacity-50"
          >
            {generating ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--brand-700)] border-t-transparent" />
            ) : (
              <SparklesIcon className="h-3.5 w-3.5" />
            )}
            {generating ? "Generating…" : "Generate report"}
          </button>
        </div>
        <textarea
          rows={12}
          value={reportText}
          onChange={(e) => setReportText(e.target.value)}
          className="w-full resize-none rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3 text-sm text-[var(--text-1)] outline-none transition placeholder:text-[var(--text-4)] focus:border-[var(--brand-700)] focus:bg-white"
          placeholder="Write the monthly support report here… or click Generate to scaffold one."
        />
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-[var(--text-4)]">Markdown supported</p>
          <Button type="button" variant="primary" size="sm">
            Save draft
          </Button>
        </div>
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

  // Discord
  const [discordToken, setDiscordToken] = useState(conn.scraperConfig?.botToken ?? "");
  const [discordGuildId, setDiscordGuildId] = useState(conn.scraperConfig?.guildId ?? "");
  const [discordGuildName, setDiscordGuildName] = useState(conn.scraperConfig?.guildName ?? "");
  const [discordKeywords, setDiscordKeywords] = useState(
    (conn.scraperConfig?.keywords ?? []).join(", "),
  );
  const [availableChannels, setAvailableChannels] = useState<{ id: string; name: string }[]>([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(
    new Set((conn.scraperConfig?.channels ?? []).map((c) => c.id)),
  );
  const [fetchingChannels, setFetchingChannels] = useState(false);
  const [channelFetchError, setChannelFetchError] = useState<string | null>(null);
  const [tokenChecked, setTokenChecked] = useState(false);

  // Reddit
  const [redditSubreddit, setRedditSubreddit] = useState(conn.scraperConfig?.subreddit ?? "");
  const [redditKeywords, setRedditKeywords] = useState(
    (conn.scraperConfig?.keywords ?? []).join(", "),
  );

  // YouTube
  const [ytChannelId, setYtChannelId] = useState(conn.scraperConfig?.youtubeChannelId ?? "");
  const [ytVideoIds, setYtVideoIds] = useState(
    (conn.scraperConfig?.videoIds ?? []).join(", "),
  );

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
      const data = await res.json() as { channels?: { id: string; name: string }[]; guildName?: string; error?: string };
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
    if (conn.source === "gmail") {
      return { ...conn.scraperConfig, query: gmailQuery.trim() };
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
        keywords: discordKeywords.split(",").map((s) => s.trim()).filter(Boolean),
      };
    }
    if (conn.source === "reddit") {
      return {
        ...conn.scraperConfig,
        subreddit: redditSubreddit.trim(),
        keywords: redditKeywords.split(",").map((s) => s.trim()).filter(Boolean),
      };
    }
    if (conn.source === "youtube") {
      return {
        ...conn.scraperConfig,
        youtubeChannelId: ytChannelId.trim() || undefined,
        videoIds: ytVideoIds.split(",").map((s) => s.trim()).filter(Boolean),
      };
    }
    return conn.scraperConfig;
  }

  function isSubmitDisabled() {
    if (updateConn.isPending || !label.trim()) return true;
    if (conn.source === "discord") return !discordToken.trim() || !discordGuildId.trim() || selectedChannelIds.size === 0;
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
    <CareModal title="Edit connector" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
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
          <label className="block space-y-1.5">
            <span className="app-field-label">Gmail query</span>
            <input
              value={gmailQuery}
              onChange={(e) => setGmailQuery(e.target.value)}
              className="app-input w-full font-mono text-xs"
              placeholder="deliveredto:support@..."
            />
          </label>
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
                <div className="max-h-44 overflow-y-auto rounded-[8px] border border-[var(--border-2)] bg-white">
                  {(availableChannels.length > 0 ? availableChannels : existingChannels).map((ch) => (
                    <label
                      key={ch.id}
                      className="flex cursor-pointer items-center gap-2.5 border-b border-[var(--border-2)] px-3 py-2 last:border-b-0 hover:bg-[var(--surface-1)]"
                    >
                      <input
                        type="checkbox"
                        checked={selectedChannelIds.has(ch.id)}
                        onChange={() => toggleChannel(ch.id)}
                        className="h-3.5 w-3.5 shrink-0 accent-[var(--brand-700)]"
                      />
                      <span className="text-xs text-[var(--text-1)]"># {ch.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <label className="block space-y-1">
              <span className="app-field-label">
                Keywords <span className="font-normal text-[var(--text-4)]">(optional — leave blank to ingest all messages)</span>
              </span>
              <input
                value={discordKeywords}
                onChange={(e) => setDiscordKeywords(e.target.value)}
                className="app-input w-full"
                placeholder="e.g. bug, help, issue, broken"
              />
            </label>
          </div>
        )}

        {/* Reddit config */}
        {conn.source === "reddit" && (
          <div className="space-y-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
            <label className="block space-y-1">
              <span className="app-field-label">Subreddit (without r/)</span>
              <input value={redditSubreddit} onChange={(e) => setRedditSubreddit(e.target.value)} className="app-input w-full" placeholder="e.g. acmeapp" />
            </label>
            <label className="block space-y-1">
              <span className="app-field-label">Keywords (comma-separated)</span>
              <input value={redditKeywords} onChange={(e) => setRedditKeywords(e.target.value)} className="app-input w-full" placeholder="e.g. bug, help" />
            </label>
          </div>
        )}

        {/* YouTube config */}
        {conn.source === "youtube" && (
          <div className="space-y-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
            <label className="block space-y-1">
              <span className="app-field-label">YouTube channel ID</span>
              <input value={ytChannelId} onChange={(e) => setYtChannelId(e.target.value)} className="app-input w-full font-mono text-xs" placeholder="UCxxxxxxxxxxxxxxxxxxxx" />
            </label>
            <label className="block space-y-1">
              <span className="app-field-label">Video IDs (comma-separated)</span>
              <input value={ytVideoIds} onChange={(e) => setYtVideoIds(e.target.value)} className="app-input w-full font-mono text-xs" placeholder="dQw4w9WgXcQ, abc123" />
            </label>
          </div>
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
  const { data, isLoading } = useSupportConnections(clientId);
  const connections = data?.connections ?? [];
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingConn, setEditingConn] = useState<Connection | null>(null);
  const deleteConn = useDeleteConnection(clientId);
  const syncConn = useSyncConnection(clientId);
  const [syncResults, setSyncResults] = useState<Record<string, { fetched?: number; ingested?: number; filtered?: number; errors: string[] }>>({});
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
      <div className="app-card overflow-hidden p-0">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-20 animate-pulse bg-[var(--surface-1)]",
              i > 0 && "border-t border-[var(--border-2)]",
            )}
          />
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
            <button
              type="button"
              onClick={() => void handleSyncAll()}
              disabled={syncConn.isPending}
              className="flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
            >
              <ArrowPathIcon className={cn("h-3.5 w-3.5", syncConn.isPending && "animate-spin")} />
              {syncConn.isPending ? "Syncing…" : "Refresh now"}
            </button>
          </div>
        </div>
      )}

      {connections.length > 0 && (
        <div className="app-card overflow-hidden p-0">
          {connections.map((conn, idx) => {
            const sr = syncResults[conn.id];
            return (
              <div
                key={conn.id}
                className={cn(
                  "flex flex-wrap items-start justify-between gap-4 px-5 py-4",
                  idx > 0 && "border-t border-[var(--border-2)]",
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px]",
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
                      <span className="text-xs text-[var(--text-4)]">{SOURCE_LABEL[conn.source]}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--text-3)]">{AUTH_MODE_LABEL[conn.authMode]}</p>
                    {conn.scraperConfig?.intakeAddress && (
                      <p className="mt-1 select-all font-mono text-[11px] text-[var(--brand-700)]">
                        {conn.scraperConfig.intakeAddress}
                      </p>
                    )}
                    {conn.scraperConfig?.channels && conn.scraperConfig.channels.length > 0 && (
                      <p className="mt-1 text-[11px] text-[var(--text-4)]">
                        {conn.scraperConfig.channels.map((c) => `#${c.name}`).join(", ")}
                      </p>
                    )}
                    {conn.scraperConfig?.subreddit && (
                      <p className="mt-1 text-[11px] text-[var(--text-4)]">
                        r/{conn.scraperConfig.subreddit}
                        {conn.scraperConfig.keywords?.length ? ` · keywords: ${conn.scraperConfig.keywords.join(", ")}` : ""}
                      </p>
                    )}
                    {sr && (
                      <p className={cn("mt-1 text-[11px]", sr.errors.length > 0 ? "text-red-500" : "text-emerald-600")}>
                        {sr.errors.length > 0
                          ? `Error: ${sr.errors[0]}`
                          : sr.fetched === 0
                            ? "Synced — no new emails since last sync"
                            : `Synced — ${sr.fetched} fetched, ${sr.ingested ?? 0} added, ${sr.filtered ?? 0} filtered by AI`}
                      </p>
                    )}
                  </div>
                </div>

                {(() => {
                  const pendingConnId = syncConn.isPending
                    ? typeof syncConn.variables === "string"
                      ? syncConn.variables
                      : syncConn.variables?.connId
                    : null;
                  const isThisPending = pendingConnId === conn.id;
                  return (
                    <div className="flex items-center gap-2">
                      {conn.health === "connected" ? (
                        <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                          <CheckCircleIcon className="h-3.5 w-3.5" />
                          Connected
                        </span>
                      ) : conn.health === "error" ? (
                        <span className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600">
                          <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                          Error
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                          <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                          Needs setup
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSync(conn.id)}
                        disabled={isThisPending}
                        className="flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
                      >
                        <BoltIcon className={cn("h-3 w-3", isThisPending && "animate-spin")} />
                        {isThisPending ? "Syncing…" : "Sync now"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm("Re-sync 30 days of history? This may take a moment.")) {
                            void handleSync(conn.id, true);
                          }
                        }}
                        disabled={isThisPending}
                        className="flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
                        title="Clear last-synced timestamp and pull the last 30 days of history"
                      >
                        <ArrowPathIcon className={cn("h-3 w-3", isThisPending && "animate-spin")} />
                        Re-sync history
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingConn(conn)}
                        className="flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                      >
                        <PencilSquareIcon className="h-3 w-3" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete "${conn.label}"? This cannot be undone.`)) {
                            deleteConn.mutate(conn.id);
                          }
                        }}
                        disabled={deleteConn.isPending}
                        className="flex items-center gap-1 rounded-[6px] border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-500 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        <TrashIcon className="h-3 w-3" />
                        Delete
                      </button>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowAddModal(true)}
        className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-2)] py-3 text-sm font-medium text-[var(--text-3)] transition hover:border-[var(--brand-700)] hover:text-[var(--brand-700)]"
      >
        <PlusIcon className="h-4 w-4" />
        Add connector
      </button>

      {agentLogs.length > 0 && (
        <div className="app-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <SparklesIcon className="h-4 w-4 text-[var(--brand-700)]" />
            <span className="text-sm font-semibold text-[var(--text-1)]">Agent activity</span>
          </div>
          <div className="space-y-2">
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
                    <span className="mt-0.5 shrink-0 rounded-full bg-[var(--mist)] px-2 py-0.5 text-[10px] font-semibold text-[var(--brand-700)]">
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
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-2)]">Agent pipeline</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {AGENT_CARDS.map((agent) => {
            const enabled = toggles[agent.key];
            return (
              <div key={agent.key} className="app-card p-5">
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
      </section>

      {/* manual sync */}
      {connections.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-[var(--text-2)]">Manual sync</h3>
          <div className="app-card overflow-hidden p-0">
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
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
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
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-2)]">Agent activity</h3>
        {agentLogs.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--text-4)]">
            No agent activity yet — run a sync to get started.
          </p>
        ) : (
          <div className="app-card overflow-hidden p-0">
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
                        "mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
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
  const { data: rulesData, isLoading: rulesLoading } = useSupportWorkflowRules(clientId);
  const { data: logsData, isLoading: logsLoading } = useSupportAuditLogs(clientId);
  const deleteRule = useDeleteWorkflowRule(clientId);
  const seedRules = useSeedDefaultRules(clientId);
  const { data: session } = useSession();
  const userName = session?.user?.name ?? "You";
  const userEmail = session?.user?.email ?? "";

  const [showAddRule, setShowAddRule] = useState(false);

  const rules = rulesData?.rules ?? [];
  const logs = logsData?.logs ?? [];

  return (
    <div className="space-y-6">
      {/* workflow rules */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-2)]">Workflow rules</h3>
        <div className="app-card overflow-hidden p-0">
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
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {rule.requiresApproval && (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                      Requires approval
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteRule.mutate(rule.id)}
                    disabled={deleteRule.isPending}
                    className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--danger-50)] hover:text-[var(--danger-500)]"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowAddRule(true)}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-2)] py-3 text-sm font-medium text-[var(--text-3)] transition hover:border-[var(--brand-700)] hover:text-[var(--brand-700)]"
        >
          <PlusIcon className="h-4 w-4" />
          Add rule
        </button>
        {showAddRule && (
          <AddRuleModal clientId={clientId} onClose={() => setShowAddRule(false)} />
        )}
      </section>

      {/* team */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-2)]">Team access</h3>
          <span className="rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 text-[11px] text-[var(--text-4)]">
            Full team management coming with auth
          </span>
        </div>
        <div className="app-card overflow-hidden p-0">
          <div className="flex items-center justify-between px-5 py-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--mist)] text-sm font-semibold text-[var(--brand-700)]">
                {userName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--text-1)]">
                  {userName}
                  <span className="ml-1.5 text-[11px] text-[var(--text-4)]">(you)</span>
                </p>
                <p className="text-xs text-[var(--text-4)]">{userEmail}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="rounded-full border border-[var(--mist-border)] bg-[var(--mist)] px-2.5 py-1 text-[11px] font-semibold text-[var(--brand-700)]">
                Admin
              </span>
              <span className="rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-3)]">
                Owner
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* audit log */}
      {(logsLoading || logs.length > 0) && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-[var(--text-2)]">Audit log</h3>
          <div className="app-card overflow-hidden p-0">
            {logsLoading && <div className="h-16 animate-pulse bg-[var(--surface-1)]" />}
            {logs.map((log, idx) => (
              <div
                key={log.id}
                className={cn("px-5 py-3.5", idx > 0 && "border-t border-[var(--border-2)]")}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-[var(--text-2)]">
                    <span className="font-medium">{log.actor}</span> {log.action}
                  </p>
                  <span className="shrink-0 text-[11px] text-[var(--text-4)]">
                    {formatShort(log.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-4)]">{log.target}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── tab bar ─────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "inbox", label: "Inbox", icon: InboxIcon },
  { id: "tickets", label: "Tickets", icon: ClipboardDocumentListIcon },
  { id: "reports", label: "Reports", icon: DocumentTextIcon },
  { id: "connectors", label: "Connectors", icon: BoltIcon },
  { id: "agents", label: "Agents", icon: SparklesIcon },
  { id: "settings", label: "Settings", icon: Cog8ToothIcon },
];

// ─── main dashboard ──────────────────────────────────────────────────────────

export function SupportDashboard() {
  const { data: clientsData, isLoading: clientsLoading } = useSupportClients();
  const clients = useMemo(() => clientsData?.clients ?? [], [clientsData]);

  const [activeClientId, setActiveClientId] = useState<string>(() => {
    try { return localStorage.getItem("care-active-client") ?? ""; } catch { return ""; }
  });
  const [activeTab, setActiveTab] = useState<Tab>("inbox");
  const [showAddClient, setShowAddClient] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
                {inboxUnread > 0 && isActive && (
                  <span className="absolute right-1.5 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                    {inboxUnread > 9 ? "9+" : inboxUnread}
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
                {inboxUnread > 0 && isActive && (
                  <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {inboxUnread}
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
              className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-[var(--border-2)] text-[var(--text-4)] transition hover:border-[var(--brand-700)] hover:text-[var(--brand-700)]"
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
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              Live
            </span>
          </div>

          <nav className="mt-3 flex gap-0 overflow-x-auto">
            {TABS.map((tab) => {
              const badge = tab.id === "inbox" ? inboxUnread : undefined;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
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
                        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
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

        {/* tab content */}
        <div className="flex-1 overflow-auto px-6 pb-8 pt-5 sm:px-8">
          {activeTab === "inbox" && <InboxView clientId={activeClientId} />}
          {activeTab === "tickets" && <TicketsView clientId={activeClientId} />}
          {activeTab === "reports" && <ReportsView client={client} />}
          {activeTab === "connectors" && <ConnectorsView clientId={activeClientId} clientSlug={client?.slug ?? ""} />}
          {activeTab === "agents" && <AgentsView clientId={activeClientId} />}
          {activeTab === "settings" && <SettingsView clientId={activeClientId} />}
        </div>
      </div>

      {showAddClient && <AddClientModal onClose={() => setShowAddClient(false)} />}
    </div>
  );
}
