/**
 * MCP tools for uptime monitors beyond add_monitor / list_monitors: a summary of every client's
 * monitors, editing (environment included), Check now, removing, and the incidents.
 *
 * Every write goes through the same server functions the wiki and the Monitors page use, so a
 * change made by Claude is the change a person would have made. Monitors are addressed by id or
 * by exact name; two monitors sharing a name (an "API" in production and one in staging) are
 * told apart with `environment`. Ambiguity is an error, never a guess.
 *
 * Who may do what mirrors the app:
 * - summarise_monitors / list_monitor_incidents read every client, like the Monitors page, so
 *   they need the `monitors` permission (and are never for external roles).
 * - Writers need 'Manage clients', like add_monitor, and `resolveClient` limits them to the
 *   clients the caller can see.
 * - update_monitor_incident needs someone on the team who can see the client, like the
 *   incident route.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  ForbiddenError,
  assertCan,
  canManageClients,
  canViewMonitors,
  type EffectiveUser,
} from "@/server/auth/effective-user";
import { isExternalRole } from "@/types/auth";
import {
  acknowledgeIncident,
  addIncidentUpdate,
  checkMonitorNow,
  deleteMonitor,
  loadWikiMonitors,
  updateMonitor,
  type MonitorInput,
} from "@/server/wiki-monitors";
import { loadMonitorBoard } from "@/server/wiki-monitor-board";
import {
  filterBoardByEnvironment,
  monitorState,
  orderBoard,
  summariseBoard,
  worstState,
  type BoardMonitorState,
} from "@/lib/monitor-board";
import {
  MONITOR_ENVIRONMENT_VALUES,
  environmentLabel,
  isClientVisibleEnvironment,
} from "@/lib/monitor-environment";
import { INCIDENT_STATUSES, MAX_UPDATE_LENGTH } from "@/lib/monitor-incidents";

type Result = { content: { type: "text"; text: string }[]; isError?: boolean };

export interface MonitorToolDeps {
  resolveClient: (user: EffectiveUser, input: string) => Promise<{ id: string; slug: string; name: string }>;
  textResult: (payload: unknown, summary?: string) => Result;
}

export interface MonitorToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (user: EffectiveUser, args: unknown) => Promise<Result>;
}

/** The every-client tools read what the Monitors page reads, so they need what it needs. */
function assertMonitorsReader(user: EffectiveUser): void {
  if (isExternalRole(user.role) || !canViewMonitors(user)) {
    throw new ForbiddenError("You don't have access to Monitors. An admin can grant it in Settings → People & access.");
  }
}

function assertTeam(user: EffectiveUser): void {
  if (isExternalRole(user.role)) throw new ForbiddenError("Only the Gitwork team can act on incidents.");
}

/** A monitor on this client's wiki, by id or exact name (case-insensitive), narrowed by environment. */
async function findMonitor(
  clientId: string,
  clientName: string,
  ref: string,
  environment?: string,
): Promise<{ id: string; name: string; environment: string }> {
  const monitors = await prisma.wikiMonitor.findMany({
    where: { wiki: { clientId } },
    select: { id: true, name: true, environment: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const byId = monitors.find((m) => m.id === ref.trim());
  if (byId) return byId;
  const named = monitors.filter(
    (m) => m.name.toLowerCase() === ref.trim().toLowerCase() && (!environment || m.environment === environment),
  );
  if (named.length === 1) return named[0];
  if (named.length > 1) {
    throw new Error(
      `${clientName} has ${named.length} monitors called "${ref}" (${named.map((m) => environmentLabel(m.environment)).join(", ")}). ` +
        "Pass `environment`, or the monitor's id from list_monitors.",
    );
  }
  const names = monitors.map((m) => `${m.name}${isClientVisibleEnvironment(m.environment) ? "" : ` (${environmentLabel(m.environment)})`}`);
  throw new Error(
    `No monitor "${ref}"${environment ? ` in ${environmentLabel(environment)}` : ""} on ${clientName}. ` +
      (names.length ? `Its monitors: ${names.join(", ")}.` : "It has no monitors yet."),
  );
}

const STATE_WORDS: Record<BoardMonitorState, string> = {
  up: "up",
  slow: "slow",
  flaky: "failing on and off",
  down: "down",
  stale: "not being checked",
  pending: "not checked yet",
};

const summariseSchema = z.object({
  environment: z.enum(["all", ...MONITOR_ENVIRONMENT_VALUES]).optional(),
  onlyProblems: z.boolean().optional(),
});

const monitorRefSchema = z.object({
  client: z.string().min(1),
  monitor: z.string().min(1),
  environment: z.enum(MONITOR_ENVIRONMENT_VALUES).optional(),
});

const updateSchema = monitorRefSchema.extend({
  name: z.string().min(1).max(120).optional(),
  target: z.string().min(1).optional(),
  setEnvironment: z.enum(MONITOR_ENVIRONMENT_VALUES).optional(),
  enabled: z.boolean().optional(),
  intervalMinutes: z.number().int().min(1).max(1440).optional(),
  method: z.enum(["GET", "HEAD", "POST"]).optional(),
  expectedStatus: z.number().int().min(100).max(599).nullable().optional(),
  keyword: z.string().max(200).nullable().optional(),
  degradedMs: z.number().int().min(1).max(120000).nullable().optional(),
  maintenanceMinutes: z.number().int().min(0).max(60 * 24 * 14).optional(),
  maintenanceNote: z.string().max(200).nullable().optional(),
});

const incidentsSchema = z.object({
  client: z.string().min(1).optional(),
  includeResolved: z.boolean().optional(),
});

const incidentActionSchema = z.object({
  client: z.string().min(1),
  incidentId: z.string().min(1),
  action: z.enum(["acknowledge", "update"]),
  status: z.enum(INCIDENT_STATUSES).optional(),
  message: z.string().max(MAX_UPDATE_LENGTH).optional(),
  showToClient: z.boolean().optional(),
});

export function buildMonitorTools({ resolveClient, textResult }: MonitorToolDeps): MonitorToolDef[] {
  return [
    {
      name: "summarise_monitors",
      description:
        "Summarise every client's uptime monitors in one go: the headline (e.g. 'All systems operational' " +
        "or '1 service down — Fellas Loaded'), counts up / down / slow / not checking, each client's worst " +
        "state, every monitor with a problem and why, open incidents, and active clients with no monitors. " +
        "Each monitor carries its environment; only production is shown to clients. Filter with " +
        "`environment`, or `onlyProblems` to leave healthy clients out. Needs the 'Monitors' permission.",
      inputSchema: {
        type: "object",
        properties: {
          environment: {
            type: "string",
            enum: ["all", ...MONITOR_ENVIRONMENT_VALUES],
            description: "Only this environment (default all).",
          },
          onlyProblems: { type: "boolean", description: "Leave out clients whose monitors are all up." },
        },
        additionalProperties: false,
      },
      handler: async (user, args) => {
        assertMonitorsReader(user);
        const parsed = summariseSchema.parse(args ?? {});
        const env = parsed.environment ?? "all";
        const board = await loadMonitorBoard(user.workspaceId, null);
        const clients = filterBoardByEnvironment(board.clients, env);
        const summary = summariseBoard(clients);
        const { monitored } = orderBoard(clients);
        const { unmonitored } = orderBoard(board.clients);
        const perClient = monitored
          .map((c) => {
            const worst = worstState(c.monitors.map(monitorState)) ?? "pending";
            return {
              client: c.name,
              slug: c.slug,
              state: STATE_WORDS[worst],
              up: c.monitors.filter((m) => monitorState(m) === "up").length,
              total: c.monitors.length,
              problems: c.monitors
                .filter((m) => monitorState(m) !== "up")
                .map((m) => ({
                  id: m.id,
                  name: m.name,
                  environment: m.environment,
                  state: STATE_WORDS[monitorState(m)],
                  why: m.statusCode ? `HTTP ${m.statusCode}` : m.error,
                  downSince: m.downSince,
                  lastChecked: m.checkedAt,
                  uptime24h: m.uptime24h,
                })),
            };
          })
          .filter((c) => !parsed.onlyProblems || c.problems.length > 0);
        const ids = new Set(clients.flatMap((c) => c.monitors.map((m) => m.id)));
        const incidents = board.incidents
          .filter((i) => ids.has(i.monitorId))
          .map((i) => ({
            id: i.id,
            client: i.clientName,
            clientSlug: i.clientSlug,
            title: i.title,
            status: i.status,
            startedAt: i.startedAt,
            acknowledgedBy: i.acknowledgedByName,
          }));
        const lines = [
          summary.headline + (env === "all" ? "" : ` (${environmentLabel(env)} only)`),
          `${summary.up}/${summary.total} up · ${summary.down} down · ${summary.degraded} slow or unstable · ${summary.unchecked} not checking.`,
          ...perClient
            .flatMap((c) => c.problems.map((p) => `- ${c.client} — ${p.name}${isClientVisibleEnvironment(p.environment) ? "" : ` (${environmentLabel(p.environment)})`}: ${p.state}${p.why ? `, ${p.why}` : ""}`)),
          incidents.length ? `${incidents.length} open incident${incidents.length === 1 ? "" : "s"}.` : "No open incidents.",
          unmonitored.length ? `Not monitored: ${unmonitored.map((c) => c.name).join(", ")}.` : "",
        ].filter(Boolean);
        return textResult(
          {
            headline: summary.headline,
            level: summary.level,
            counts: { total: summary.total, up: summary.up, down: summary.down, degraded: summary.degraded, unchecked: summary.unchecked },
            environment: env,
            clients: perClient,
            openIncidents: incidents,
            notMonitored: unmonitored.map((c) => ({ client: c.name, slug: c.slug })),
            readAt: board.readAt,
          },
          lines.join("\n"),
        );
      },
    },
    {
      name: "update_monitor",
      description:
        "Change a client's uptime monitor: name, address, environment (setEnvironment — only production " +
        "shows on the client's status board), pause/resume (enabled), check interval, HTTP method, expected " +
        "status, keyword, slow-after threshold, or maintenance (maintenanceMinutes pauses alerts for that " +
        "long; 0 ends it). Address the monitor by id or exact name; pass `environment` to tell apart two " +
        "monitors with the same name. Requires 'Manage clients'.",
      inputSchema: {
        type: "object",
        properties: {
          client: { type: "string", description: "Client slug, name, or cuid (see list_clients)." },
          monitor: { type: "string", description: "The monitor's id or exact name (see list_monitors)." },
          environment: {
            type: "string",
            enum: [...MONITOR_ENVIRONMENT_VALUES],
            description: "Which monitor, when two share a name. Not a change — use setEnvironment for that.",
          },
          name: { type: "string" },
          target: { type: "string", description: "For HTTP: the URL. For TCP: 'host:port'. Heartbeats keep their ping URL." },
          setEnvironment: {
            type: "string",
            enum: [...MONITOR_ENVIRONMENT_VALUES],
            description: "Move the monitor to this environment.",
          },
          enabled: { type: "boolean", description: "false pauses checks and alerts; true resumes them." },
          intervalMinutes: { type: "integer", description: "How often to check (1–1440)." },
          method: { type: "string", enum: ["GET", "HEAD", "POST"] },
          expectedStatus: { type: ["integer", "null"], description: "Exact HTTP status, or null for any 2xx/3xx." },
          keyword: { type: ["string", "null"], description: "Text the response must contain, or null for none." },
          degradedMs: { type: ["integer", "null"], description: "Slower than this (ms) counts as slow, or null for off." },
          maintenanceMinutes: { type: "integer", description: "Pause alerts for this many minutes (checks still run). 0 ends maintenance." },
          maintenanceNote: { type: ["string", "null"], description: "Why, shown with the maintenance window." },
        },
        required: ["client", "monitor"],
        additionalProperties: false,
      },
      handler: async (user, args) => {
        assertCan(user, canManageClients, "change monitors");
        const p = updateSchema.parse(args);
        const client = await resolveClient(user, p.client);
        const found = await findMonitor(client.id, client.name, p.monitor, p.environment);
        const input: Partial<MonitorInput> = {
          ...(p.name !== undefined ? { name: p.name } : {}),
          ...(p.target !== undefined ? { target: p.target } : {}),
          ...(p.setEnvironment !== undefined ? { environment: p.setEnvironment } : {}),
          ...(p.enabled !== undefined ? { enabled: p.enabled } : {}),
          ...(p.intervalMinutes !== undefined ? { intervalMinutes: p.intervalMinutes } : {}),
          ...(p.method !== undefined ? { method: p.method } : {}),
          ...(p.expectedStatus !== undefined ? { expectedStatus: p.expectedStatus } : {}),
          ...(p.keyword !== undefined ? { keyword: p.keyword } : {}),
          ...(p.degradedMs !== undefined ? { degradedMs: p.degradedMs } : {}),
          ...(p.maintenanceMinutes !== undefined
            ? { maintenanceUntil: p.maintenanceMinutes === 0 ? null : new Date(Date.now() + p.maintenanceMinutes * 60_000) }
            : {}),
          ...(p.maintenanceNote !== undefined ? { maintenanceNote: p.maintenanceNote } : {}),
        };
        if (Object.keys(input).length === 0) throw new Error("Nothing to change. Pass at least one field to update.");
        const updated = await updateMonitor(client.id, found.id, input);
        if (!updated) throw new Error(`Monitor "${p.monitor}" not found on ${client.name}.`);
        return textResult(
          updated,
          `Updated "${updated.name}" on ${client.name} (${environmentLabel(updated.environment)}` +
            `${isClientVisibleEnvironment(updated.environment) ? ", shown to the client" : ", Gitwork only"}` +
            `${updated.enabled ? "" : ", paused"}${updated.maintenance ? `, in maintenance until ${updated.maintenance.until}` : ""}).`,
        );
      },
    },
    {
      name: "check_monitor",
      description:
        "Check one of a client's monitors right now (as 'Check now' does) and return the fresh status, " +
        "latency and error. Address it by id or exact name. Requires 'Manage clients'.",
      inputSchema: {
        type: "object",
        properties: {
          client: { type: "string", description: "Client slug, name, or cuid (see list_clients)." },
          monitor: { type: "string", description: "The monitor's id or exact name." },
          environment: { type: "string", enum: [...MONITOR_ENVIRONMENT_VALUES], description: "Which monitor, when two share a name." },
        },
        required: ["client", "monitor"],
        additionalProperties: false,
      },
      handler: async (user, args) => {
        assertCan(user, canManageClients, "check monitors");
        const p = monitorRefSchema.parse(args);
        const client = await resolveClient(user, p.client);
        const found = await findMonitor(client.id, client.name, p.monitor, p.environment);
        const fresh = await checkMonitorNow(client.id, found.id);
        if (!fresh) throw new Error(`Monitor "${p.monitor}" not found on ${client.name}.`);
        return textResult(
          fresh,
          `${fresh.name} (${client.name}) is ${fresh.status}` +
            `${fresh.latencyMs != null ? ` · ${fresh.latencyMs}ms` : ""}${fresh.statusCode ? ` · HTTP ${fresh.statusCode}` : ""}` +
            `${fresh.error ? ` · ${fresh.error}` : ""}.`,
        );
      },
    },
    {
      name: "delete_monitor",
      description:
        "Remove one of a client's monitors, with its check history and incidents. This cannot be undone: to " +
        "stop checks for a while, use update_monitor with enabled=false instead. Address it by id or exact " +
        "name. Requires 'Manage clients'.",
      inputSchema: {
        type: "object",
        properties: {
          client: { type: "string", description: "Client slug, name, or cuid (see list_clients)." },
          monitor: { type: "string", description: "The monitor's id or exact name." },
          environment: { type: "string", enum: [...MONITOR_ENVIRONMENT_VALUES], description: "Which monitor, when two share a name." },
        },
        required: ["client", "monitor"],
        additionalProperties: false,
      },
      handler: async (user, args) => {
        assertCan(user, canManageClients, "remove monitors");
        const p = monitorRefSchema.parse(args);
        const client = await resolveClient(user, p.client);
        const found = await findMonitor(client.id, client.name, p.monitor, p.environment);
        const ok = await deleteMonitor(client.id, found.id);
        if (!ok) throw new Error(`Monitor "${p.monitor}" not found on ${client.name}.`);
        return textResult(
          { deleted: true, id: found.id },
          `Removed "${found.name}" (${environmentLabel(found.environment)}) from ${client.name}.`,
        );
      },
    },
    {
      name: "list_monitor_incidents",
      description:
        "List uptime incidents: every client's open ones by default (needs the 'Monitors' permission), or " +
        "one client's, including those resolved in the last 30 days with includeResolved. Each carries its " +
        "updates and who acknowledged it.",
      inputSchema: {
        type: "object",
        properties: {
          client: { type: "string", description: "Only this client (slug, name, or cuid). Omit for every client." },
          includeResolved: { type: "boolean", description: "With client: also incidents resolved in the last 30 days." },
        },
        additionalProperties: false,
      },
      handler: async (user, args) => {
        const p = incidentsSchema.parse(args ?? {});
        if (p.client) {
          assertTeam(user);
          const client = await resolveClient(user, p.client);
          const section = await loadWikiMonitors(client.id);
          const incidents = p.includeResolved ? section.incidents : section.incidents.filter((i) => !i.resolvedAt);
          return textResult(
            incidents,
            `${client.name}: ${incidents.length} ${p.includeResolved ? "" : "open "}incident${incidents.length === 1 ? "" : "s"}.`,
          );
        }
        assertMonitorsReader(user);
        const board = await loadMonitorBoard(user.workspaceId, null);
        return textResult(
          board.incidents,
          board.incidents.length
            ? `${board.incidents.length} open incident${board.incidents.length === 1 ? "" : "s"}: ` +
                board.incidents.map((i) => `${i.clientName} — ${i.title}`).join("; ") + "."
            : "No open incidents.",
        );
      },
    },
    {
      name: "update_monitor_incident",
      description:
        "Act on an uptime incident (ids from list_monitor_incidents): action 'acknowledge' records that you've " +
        "picked it up; action 'update' posts a status (investigating, identified, monitoring, resolved) and a " +
        "message. Updates show on the client's status board unless showToClient is false, and only incidents " +
        "on production monitors reach the client at all. 'resolved' closes it.",
      inputSchema: {
        type: "object",
        properties: {
          client: { type: "string", description: "Client slug, name, or cuid." },
          incidentId: { type: "string" },
          action: { type: "string", enum: ["acknowledge", "update"] },
          status: { type: "string", enum: [...INCIDENT_STATUSES], description: "For 'update'." },
          message: { type: "string", description: `For 'update'. Up to ${MAX_UPDATE_LENGTH} characters.` },
          showToClient: { type: "boolean", description: "For 'update' (default true). false keeps it internal." },
        },
        required: ["client", "incidentId", "action"],
        additionalProperties: false,
      },
      handler: async (user, args) => {
        assertTeam(user);
        const p = incidentActionSchema.parse(args);
        const client = await resolveClient(user, p.client);
        const by = { userId: user.id, name: user.name ?? user.email };
        let incident;
        if (p.action === "acknowledge") {
          incident = await acknowledgeIncident(client.id, p.incidentId, by);
        } else {
          if (!p.status || !p.message?.trim()) throw new Error("An update needs a status and a message.");
          incident = await addIncidentUpdate(
            client.id,
            p.incidentId,
            { status: p.status, message: p.message, isPublic: p.showToClient ?? true },
            by,
          );
        }
        if (!incident) throw new Error(`No incident ${p.incidentId} on ${client.name}.`);
        return textResult(
          incident,
          p.action === "acknowledge"
            ? `Acknowledged "${incident.title}" (${client.name}).`
            : `Posted ${p.status} on "${incident.title}" (${client.name})${p.showToClient === false ? ", internal only" : ""}.`,
        );
      },
    },
  ];
}
