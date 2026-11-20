"use client";

import { ArrowPathIcon, BoltIcon, CheckCircleIcon, EllipsisVerticalIcon, ExclamationTriangleIcon, PencilSquareIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/motion/spinner";
import type { AuditLog, Connection, SupportSource } from "@/types/support";
import { DatePicker } from "@/components/ui/date-picker";
import { useCreateSupportConnection, useDeleteConnection, useSupportAuditLogs, useSupportConnections, useSyncConnection, useUpdateConnection } from "@/hooks/use-support";
import { usePermissions } from "@/hooks/use-permissions";
import { Skeleton } from "@/components/ui/motion/skeleton";
import { ANALYTICS_ADAPTERS, CareModal, IMAP_PRESETS, LIVE_SOURCES, SOURCE_TAGLINE, formatShort } from "./care-shared";
import { SOURCE_LABEL, SourceIcon } from "./care-constants";

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

/**
 * "Only read mail from" — the connector's ingest floor.
 *
 * Its own control rather than one of the scraperConfig filters, because it is a column: it is
 * cross-adapter policy that the sync core and this panel both read without decrypting anything.
 * Blank means "read whatever the mailbox still holds", which is every connector that predates it.
 *
 * New connectors default it to today. Connecting a mailbox used to pull whatever the adapter's
 * rolling lookback reached — 30 days by default — which is why Fellas' Care queue was 324
 * conversations deep on the day it was connected and has never been cleared.
 */
function IngestFromField({
  value,
  onChange,
  isNew,
}: {
  value: string;
  onChange: (next: string) => void;
  isNew: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="app-field-label">Only read mail from</span>
      <DatePicker value={value} onChange={onChange} className="w-full" />
      <span className="block text-[11px] leading-snug text-[var(--text-4)]">
        {isNew
          ? "Defaults to today, so a new client starts with a clear desk. Clear it to read whatever the mailbox still holds."
          : "Mail older than this is never read, however far back a re-sync reaches. Clear it to read whatever the mailbox still holds."}
      </span>
    </label>
  );
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
  // Today by default: a new client starts with a clear desk rather than a month of history.
  const [ingestFrom, setIngestFrom] = useState(() => new Date().toISOString().slice(0, 10));
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

  // IMAP/SMTP mailbox fields
  const [imapProvider, setImapProvider] = useState<"gmail" | "outlook" | "custom">("gmail");
  const [imapEmail, setImapEmail] = useState("");
  const [imapPassword, setImapPassword] = useState("");
  const [imapFromName, setImapFromName] = useState("");
  const [imapHostField, setImapHostField] = useState("");
  const [imapPortField, setImapPortField] = useState("993");
  const [smtpHostField, setSmtpHostField] = useState("");
  const [smtpPortField, setSmtpPortField] = useState("465");
  const [imapTest, setImapTest] = useState<{ imap?: { ok: boolean; error?: string }; smtp?: { ok: boolean; error?: string } } | null>(null);
  const [imapTesting, setImapTesting] = useState(false);

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
      const res = await fetch(`/api/support/clients/${clientId}/discord/channels`, {
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
    if (source === "imap") {
      const preset = IMAP_PRESETS[imapProvider];
      const custom = imapProvider === "custom";
      return {
        imapHost: custom ? imapHostField.trim() : preset.imapHost,
        imapPort: custom ? Number(imapPortField) || 993 : preset.imapPort,
        imapSecure: preset.imapSecure,
        smtpHost: custom ? smtpHostField.trim() : preset.smtpHost,
        smtpPort: custom ? Number(smtpPortField) || 465 : preset.smtpPort,
        smtpSecure: custom ? (Number(smtpPortField) || 465) === 465 : preset.smtpSecure,
        username: imapEmail.trim(),
        password: imapPassword,
        fromAddress: imapEmail.trim(),
        fromName: imapFromName.trim() || undefined,
        // ...f was missing here too, so the shared filter fields (lookback, keywords, max items)
        // rendered for an Email connector and were silently dropped on create.
        ...f,
      } as Connection["scraperConfig"];
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
    if (source === "imap") {
      const hasHosts = imapProvider !== "custom" || (imapHostField.trim() && smtpHostField.trim());
      return imapEmail.trim() && imapPassword && hasHosts ? "connected" : "needs_setup";
    }
    return source === "gmail" || source === "reddit" ? "connected" : "needs_setup";
  }

  async function handleTestImap() {
    setImapTesting(true);
    setImapTest(null);
    try {
      const res = await fetch(`/api/support/clients/${clientId}/connections/test-imap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: buildScraperConfig() }),
      });
      // The route returns { imap, smtp } at the top level (apiOk payload) — or
      // { error } on a 4xx. Read those directly; the old code looked for json.data,
      // which never exists, so every test reported a false "No response".
      const json = (await res.json().catch(() => ({}))) as {
        imap?: { ok: boolean; error?: string };
        smtp?: { ok: boolean; error?: string };
        error?: string;
      };
      setImapTest(
        json.imap || json.smtp
          ? { imap: json.imap ?? { ok: false }, smtp: json.smtp ?? { ok: false } }
          : { imap: { ok: false, error: json.error ?? "No response" }, smtp: { ok: false } },
      );
    } catch (err) {
      setImapTest({ imap: { ok: false, error: err instanceof Error ? err.message : String(err) }, smtp: { ok: false } });
    } finally {
      setImapTesting(false);
    }
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
    if (source === "imap") {
      const hasHosts = imapProvider !== "custom" || (imapHostField.trim() && smtpHostField.trim());
      return !imapEmail.trim() || !imapPassword || !hasHosts;
    }
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
        ingestFrom: ingestFrom || null,
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
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-[200px_1fr]">

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

            {/* IMAP/SMTP config */}
            {source === "imap" && (
              <div className="space-y-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
                <p className="text-[11px] text-[var(--text-4)]">
                  Connect any mailbox directly — read over IMAP and reply over SMTP as that address. No Google admin or domain-wide delegation needed.
                </p>
                <label className="block space-y-1">
                  <span className="app-field-label">Provider</span>
                  <select
                    value={imapProvider}
                    onChange={(e) => setImapProvider(e.target.value as "gmail" | "outlook" | "custom")}
                    className="app-input w-full"
                  >
                    <option value="gmail">Gmail / Google Workspace</option>
                    <option value="outlook">Outlook / Microsoft 365</option>
                    <option value="custom">Custom (other provider)</option>
                  </select>
                  {IMAP_PRESETS[imapProvider].hint && (
                    <span className="text-[11px] text-amber-600">{IMAP_PRESETS[imapProvider].hint}</span>
                  )}
                </label>
                <label className="block space-y-1">
                  <span className="app-field-label">Email address</span>
                  <input
                    value={imapEmail}
                    onChange={(e) => setImapEmail(e.target.value)}
                    className="app-input w-full"
                    placeholder="app@bigwedgegolf.com"
                    autoComplete="off"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="app-field-label">App password</span>
                  <input
                    type="password"
                    value={imapPassword}
                    onChange={(e) => setImapPassword(e.target.value)}
                    className="app-input w-full font-mono text-xs"
                    placeholder="app-specific password"
                    autoComplete="new-password"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="app-field-label">From name (optional)</span>
                  <input
                    value={imapFromName}
                    onChange={(e) => setImapFromName(e.target.value)}
                    className="app-input w-full"
                    placeholder="e.g. Big Wedge Golf Support"
                  />
                </label>
                {imapProvider === "custom" && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="block space-y-1">
                      <span className="app-field-label">IMAP host</span>
                      <input value={imapHostField} onChange={(e) => setImapHostField(e.target.value)} className="app-input w-full font-mono text-xs" placeholder="imap.example.com" />
                    </label>
                    <label className="block space-y-1">
                      <span className="app-field-label">IMAP port</span>
                      <input value={imapPortField} onChange={(e) => setImapPortField(e.target.value)} className="app-input w-full font-mono text-xs" placeholder="993" />
                    </label>
                    <label className="block space-y-1">
                      <span className="app-field-label">SMTP host</span>
                      <input value={smtpHostField} onChange={(e) => setSmtpHostField(e.target.value)} className="app-input w-full font-mono text-xs" placeholder="smtp.example.com" />
                    </label>
                    <label className="block space-y-1">
                      <span className="app-field-label">SMTP port</span>
                      <input value={smtpPortField} onChange={(e) => setSmtpPortField(e.target.value)} className="app-input w-full font-mono text-xs" placeholder="465" />
                    </label>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleTestImap()}
                    disabled={imapTesting || !imapEmail.trim() || !imapPassword}
                    className="rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
                  >
                    {imapTesting ? "Testing…" : "Test connection"}
                  </button>
                  {imapTest && (
                    <span className="text-[11px]">
                      <span className={imapTest.imap?.ok ? "text-emerald-600" : "text-red-500"}>
                        IMAP {imapTest.imap?.ok ? "✓" : "✕"}
                      </span>
                      {" · "}
                      <span className={imapTest.smtp?.ok ? "text-emerald-600" : "text-red-500"}>
                        SMTP {imapTest.smtp?.ok ? "✓" : "✕"}
                      </span>
                    </span>
                  )}
                </div>
                {imapTest && (!imapTest.imap?.ok || !imapTest.smtp?.ok) && (
                  <p className="break-words text-[11px] text-red-500">
                    {imapTest.imap?.error || imapTest.smtp?.error}
                  </p>
                )}
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
                        <Spinner tone="brand" />
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

            {LIVE_SOURCES.includes(source) && source !== "analytics" && source !== "webhook" && (
              <IngestFromField value={ingestFrom} onChange={setIngestFrom} isNew />
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
  const [ingestFrom, setIngestFrom] = useState(conn.ingestFrom ? conn.ingestFrom.slice(0, 10) : "");
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

  // IMAP/SMTP mailbox. This block was missing entirely, so an Email connector could not be edited
  // at all: the shared filter fields rendered but were dropped on save (buildScraperConfig had no
  // imap branch and fell through to `return conn.scraperConfig`), and an app password could only be
  // changed by deleting and re-adding the connector.
  const editImapCustomHosts =
    !!conn.scraperConfig?.imapHost &&
    !Object.values(IMAP_PRESETS).some((p) => p.imapHost === conn.scraperConfig?.imapHost);
  const [editImapProvider, setEditImapProvider] = useState<"gmail" | "outlook" | "custom">(
    editImapCustomHosts
      ? "custom"
      : conn.scraperConfig?.imapHost === IMAP_PRESETS.outlook.imapHost
        ? "outlook"
        : "gmail",
  );
  const [editImapEmail, setEditImapEmail] = useState(conn.scraperConfig?.username ?? "");
  // Always starts blank — the stored secret is never sent to the browser. Blank means "unchanged".
  const [editImapPassword, setEditImapPassword] = useState("");
  const [editImapFromName, setEditImapFromName] = useState(conn.scraperConfig?.fromName ?? "");
  const [editImapHost, setEditImapHost] = useState(conn.scraperConfig?.imapHost ?? "");
  const [editImapPort, setEditImapPort] = useState(String(conn.scraperConfig?.imapPort ?? 993));
  const [editSmtpHost, setEditSmtpHost] = useState(conn.scraperConfig?.smtpHost ?? "");
  const [editSmtpPort, setEditSmtpPort] = useState(String(conn.scraperConfig?.smtpPort ?? 465));
  const [editSentFolder, setEditSentFolder] = useState(conn.scraperConfig?.sentFolder ?? "");
  const [editReadSent, setEditReadSent] = useState(conn.scraperConfig?.readSentFolder !== false);
  const [editImapTest, setEditImapTest] = useState<{ imap?: { ok: boolean; error?: string }; smtp?: { ok: boolean; error?: string } } | null>(null);
  const [editImapTesting, setEditImapTesting] = useState(false);

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
      const res = await fetch(`/api/support/clients/${clientId}/discord/channels`, {
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

  /**
   * Test the mailbox before saving. The stored password is never sent to the browser, so when the
   * field is left blank there is nothing to test with — say so rather than reporting a failure the
   * operator can't act on.
   */
  async function handleEditTestImap() {
    if (!editImapPassword.trim()) {
      setEditImapTest({
        imap: { ok: false, error: "Enter the app password to test. Leaving it blank keeps the saved one." },
        smtp: { ok: false },
      });
      return;
    }
    setEditImapTesting(true);
    setEditImapTest(null);
    try {
      const preset = IMAP_PRESETS[editImapProvider];
      const custom = editImapProvider === "custom";
      const res = await fetch(`/api/support/clients/${clientId}/connections/test-imap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            imapHost: custom ? editImapHost.trim() : preset.imapHost,
            imapPort: custom ? Number(editImapPort) || 993 : preset.imapPort,
            imapSecure: preset.imapSecure,
            smtpHost: custom ? editSmtpHost.trim() : preset.smtpHost,
            smtpPort: custom ? Number(editSmtpPort) || 465 : preset.smtpPort,
            smtpSecure: custom ? (Number(editSmtpPort) || 465) === 465 : preset.smtpSecure,
            username: editImapEmail.trim(),
            password: editImapPassword,
          },
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        imap?: { ok: boolean; error?: string };
        smtp?: { ok: boolean; error?: string };
        error?: string;
      };
      setEditImapTest(
        json.imap || json.smtp
          ? { imap: json.imap ?? { ok: false }, smtp: json.smtp ?? { ok: false } }
          : { imap: { ok: false, error: json.error ?? "No response" }, smtp: { ok: false } },
      );
    } catch (err) {
      setEditImapTest({
        imap: { ok: false, error: err instanceof Error ? err.message : String(err) },
        smtp: { ok: false },
      });
    } finally {
      setEditImapTesting(false);
    }
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
    if (conn.source === "imap") {
      const preset = IMAP_PRESETS[editImapProvider];
      const custom = editImapProvider === "custom";
      const email = editImapEmail.trim();
      return {
        ...conn.scraperConfig,
        imapHost: custom ? editImapHost.trim() : preset.imapHost,
        imapPort: custom ? Number(editImapPort) || 993 : preset.imapPort,
        imapSecure: preset.imapSecure,
        smtpHost: custom ? editSmtpHost.trim() : preset.smtpHost,
        smtpPort: custom ? Number(editSmtpPort) || 465 : preset.smtpPort,
        smtpSecure: custom ? (Number(editSmtpPort) || 465) === 465 : preset.smtpSecure,
        username: email,
        fromAddress: email,
        fromName: editImapFromName.trim() || undefined,
        // Blank means "leave the stored secret alone". The password is never sent to the browser,
        // so writing the empty field through would wipe it and break the connector on next sync —
        // the same reason the Play service-account field below is conditional.
        ...(editImapPassword.trim() ? { password: editImapPassword } : {}),
        ...(editSentFolder.trim() ? { sentFolder: editSentFolder.trim() } : { sentFolder: undefined }),
        readSentFolder: editReadSent,
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
      {
        connId: conn.id,
        data: {
          label: label.trim(),
          health,
          scraperConfig: buildScraperConfig(),
          ingestFrom: ingestFrom || null,
        },
      },
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
                    <Spinner tone="brand" />
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

        {/* IMAP/SMTP mailbox config */}
        {conn.source === "imap" && (
          <div className="space-y-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
            <label className="block space-y-1">
              <span className="app-field-label">Provider</span>
              <select
                value={editImapProvider}
                onChange={(e) => setEditImapProvider(e.target.value as "gmail" | "outlook" | "custom")}
                className="app-select w-full"
              >
                <option value="gmail">Gmail / Google Workspace</option>
                <option value="outlook">Outlook / Microsoft 365</option>
                <option value="custom">Custom (enter hosts)</option>
              </select>
            </label>
            {IMAP_PRESETS[editImapProvider].hint && (
              <p className="text-[11px] text-amber-600">{IMAP_PRESETS[editImapProvider].hint}</p>
            )}
            <label className="block space-y-1">
              <span className="app-field-label">Email address</span>
              <input
                value={editImapEmail}
                onChange={(e) => setEditImapEmail(e.target.value)}
                className="app-input w-full"
                placeholder="support@client.com"
              />
            </label>
            <label className="block space-y-1">
              <span className="app-field-label">App password</span>
              <input
                type="password"
                value={editImapPassword}
                onChange={(e) => setEditImapPassword(e.target.value)}
                className="app-input w-full"
                placeholder="Leave blank to keep the current password"
              />
              <span className="app-field-hint">
                Stored encrypted and never shown. Paste a new one only to rotate it.
              </span>
            </label>
            <label className="block space-y-1">
              <span className="app-field-label">From name (optional)</span>
              <input
                value={editImapFromName}
                onChange={(e) => setEditImapFromName(e.target.value)}
                className="app-input w-full"
                placeholder="e.g. Acme Support"
              />
            </label>
            {editImapProvider === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="app-field-label">IMAP host</span>
                  <input value={editImapHost} onChange={(e) => setEditImapHost(e.target.value)} className="app-input w-full font-mono text-xs" placeholder="imap.example.com" />
                </label>
                <label className="block space-y-1">
                  <span className="app-field-label">IMAP port</span>
                  <input value={editImapPort} onChange={(e) => setEditImapPort(e.target.value)} className="app-input w-full font-mono text-xs" placeholder="993" />
                </label>
                <label className="block space-y-1">
                  <span className="app-field-label">SMTP host</span>
                  <input value={editSmtpHost} onChange={(e) => setEditSmtpHost(e.target.value)} className="app-input w-full font-mono text-xs" placeholder="smtp.example.com" />
                </label>
                <label className="block space-y-1">
                  <span className="app-field-label">SMTP port</span>
                  <input value={editSmtpPort} onChange={(e) => setEditSmtpPort(e.target.value)} className="app-input w-full font-mono text-xs" placeholder="465" />
                </label>
              </div>
            )}

            {/* Sent folder — reading it is what lets Care see replies sent outside Care. */}
            <div className="space-y-2 border-t border-[var(--border-2)] pt-3">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={editReadSent}
                  onChange={(e) => setEditReadSent(e.target.checked)}
                  className="app-checkbox mt-0.5"
                />
                <span className="text-[13px] text-[var(--text-2)]">
                  Read the Sent folder
                  <span className="block text-[11px] text-[var(--text-4)]">
                    Detects replies sent from Gmail, Outlook or a phone, so those threads stop showing
                    as awaiting a reply. Turn this off and they will look unanswered forever.
                  </span>
                </span>
              </label>
              <label className="block space-y-1">
                <span className="app-field-label">Sent folder name (optional)</span>
                <input
                  value={editSentFolder}
                  onChange={(e) => setEditSentFolder(e.target.value)}
                  className="app-input w-full font-mono text-xs"
                  placeholder="Auto-detected — e.g. [Gmail]/Sent Mail"
                />
                <span className="app-field-hint">
                  Only needed if the connector reports it could not find a Sent mailbox.
                </span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleEditTestImap()}
                disabled={editImapTesting || !editImapEmail.trim()}
                className="app-button app-button-secondary app-button-sm"
              >
                {editImapTesting ? "Testing…" : "Test connection"}
              </button>
              {editImapTest && (
                <span className="font-mono text-xs">
                  <span className={editImapTest.imap?.ok ? "text-emerald-600" : "text-red-500"}>
                    IMAP {editImapTest.imap?.ok ? "✓" : "✕"}
                  </span>
                  {" · "}
                  <span className={editImapTest.smtp?.ok ? "text-emerald-600" : "text-red-500"}>
                    SMTP {editImapTest.smtp?.ok ? "✓" : "✕"}
                  </span>
                </span>
              )}
            </div>
            {editImapTest && (!editImapTest.imap?.ok || !editImapTest.smtp?.ok) && (
              <p className="text-[11px] text-red-600">
                {editImapTest.imap?.error || editImapTest.smtp?.error}
              </p>
            )}
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

        {LIVE_SOURCES.includes(conn.source) && conn.source !== "analytics" && conn.source !== "webhook" && (
          <IngestFromField value={ingestFrom} onChange={setIngestFrom} isNew={false} />
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

export function ConnectorsView({ clientId, clientSlug, showAgentLogs = true }: { clientId: string; clientSlug: string; showAgentLogs?: boolean }) {
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
  const updateConn = useUpdateConnection(clientId);
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
              <Skeleton className="h-8 w-8 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-28 rounded" />
                <Skeleton className="h-2.5 w-16 rounded" />
              </div>
              <Skeleton className="h-5 w-16 shrink-0 rounded-md" />
            </div>
            <div className="flex-1 space-y-2 px-4 py-3">
              <Skeleton className="h-2.5 w-3/4 rounded" />
              <Skeleton className="h-2.5 w-1/2 rounded" />
            </div>
            <div className="flex items-center gap-2 border-t border-[var(--border-2)] px-4 py-2.5">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="ml-auto h-7 w-7" />
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
              if (conn.source === "imap" && cfg.username) return `${cfg.username}${cfg.imapHost ? ` · ${cfg.imapHost}` : ""}`;
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
                <div className="flex flex-wrap items-center border-t border-[var(--border-2)] px-4 py-2.5 gap-2">
                  {canManageSupport ? (
                    <button
                      type="button"
                      onClick={() => handleSync(conn.id)}
                      disabled={isThisPending}
                      className="flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
                    >
                      {isSyncPending ? <Spinner /> : <BoltIcon className="h-3 w-3" />}
                      {isSyncPending ? "Syncing…" : isResyncPending ? "Re-syncing…" : "Sync now"}
                    </button>
                  ) : null}
                  {canManageSupport ? (
                    <select
                      value={String((conn.scraperConfig as { syncIntervalMinutes?: number } | null)?.syncIntervalMinutes ?? 60)}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        // Server merges into the existing config, so send just this key.
                        updateConn.mutate({
                          connId: conn.id,
                          data: { scraperConfig: { syncIntervalMinutes: next } as Connection["scraperConfig"] },
                        });
                      }}
                      title="How often this connector auto-fetches on the background sync"
                      className="app-select-chevron rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] py-1 pl-2 pr-6 text-[11px] text-[var(--text-2)]"
                    >
                      <option value="60">Hourly</option>
                      <option value="360">Every 6h</option>
                      <option value="1440">Daily</option>
                      <option value="0">Manual only</option>
                    </select>
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

      {showAgentLogs && agentLogs.length > 0 && (
        <div className="app-card overflow-hidden p-0">
          <div className="flex h-9 items-center justify-between border-b border-black/[0.06] px-4">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)]">
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
