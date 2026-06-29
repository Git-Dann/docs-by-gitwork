// MCP JSON-RPC handler for the in-app Streamable HTTP route at /api/mcp.
//
// Hand-rolled (no MCP SDK dep) because:
//   • Tools-only servers need just three methods: initialize, tools/list, tools/call.
//   • Stateless POST-per-call fits Vercel serverless perfectly — no sessions,
//     no SSE, no long-lived connections.
//   • Calling server modules directly (listDerivedClients, createTask, …)
//     keeps the user's EffectiveUser in scope so per-user permissions
//     (ClientAssignment / canManageClients / canSeeAllClients) apply
//     automatically — same path the Foundry UI uses.
//
// Each tool returns {content: [{type:"text", text:...}], isError?: boolean}
// per MCP spec; we serialise structured data as JSON in the text block, which
// Claude reads natively.

import { z, ZodError } from "zod";
import { DocumentType, type Prisma as PrismaTypes } from "@prisma/client";
import type { EffectiveUser } from "@/server/auth/effective-user";
import {
  assertCan,
  canManageClients,
  canManageDocs,
  canManagePulse,
  canSeeAllClients,
  ForbiddenError,
  UnauthorizedError,
} from "@/server/auth/effective-user";
import { runAgentScan, buildAgentVerdict } from "@/server/pulse-agent";
import { getPulseScan } from "@/server/pulse";
import { listDerivedClients, createClientRecord } from "@/server/clients";
import { assignedClientIds, listTasks, createTask, updateTask } from "@/server/tasks";
import { listMembers } from "@/server/team";
import { listClientMeetings } from "@/server/meetings";
import { allocateDocumentNumber } from "@/server/documents";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { applyClientNameToSections } from "@/lib/apply-client-name";
import { DEFAULT_PROPOSAL_METADATA } from "@/lib/default-template";
import { TEMPLATE_SLUG_BY_TYPE, getTemplateBlueprintsForType } from "@/lib/templates";
import {
  getDefaultAssetPayload,
  getDefaultCostsPayload,
  getDefaultCtaPayload,
  getDefaultLinkPayload,
  getDefaultSectionPayload,
  getDefaultTimelinePayload,
} from "@/server/proposals";

// ── JSON-RPC envelope ──────────────────────────────────────────────────────

type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
};

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: { code: number; message: string; data?: unknown } };

const ERR_INVALID_REQUEST = -32600;
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_INVALID_PARAMS = -32602;
const ERR_INTERNAL = -32603;

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "foundry", version: "0.1.0" };

// ── tool shapes ────────────────────────────────────────────────────────────

type ToolDef = {
  name: string;
  description: string;
  /** Hand-written JSON Schema served at tools/list (matches what zod validates). */
  inputSchema: Record<string, unknown>;
  /** Runtime arg validation; throws ZodError on mismatch (handled as a tool error). */
  handler: (user: EffectiveUser, args: unknown) => Promise<ToolCallResult>;
};

type ToolCallResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

// ── helpers ────────────────────────────────────────────────────────────────

function textResult(payload: unknown, summary?: string): ToolCallResult {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  const text = summary ? `${summary}\n\n${body}` : body;
  return { content: [{ type: "text", text }] };
}

function errorResult(err: unknown): ToolCallResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text", text: `Error: ${message}` }],
  };
}

/** Resolve a client by id, slug, or fuzzy name against the user's visible scope. */
async function resolveClient(
  user: EffectiveUser,
  input: string,
): Promise<{ id: string; slug: string; name: string }> {
  const needle = input.trim();
  if (!needle) throw new Error("Client identifier is required.");

  const result = await listDerivedClients({ search: undefined });
  let clients = result.clients;
  if (!canSeeAllClients(user)) {
    const allowed = new Set(await assignedClientIds(user));
    clients = clients.filter((c) => allowed.has(c.id));
  }

  // cuid → exact id match against the visible scope. Falls through to name
  // matching if it doesn't hit (e.g. a stale id from a previous session).
  if (/^c[a-z0-9]{20,}$/i.test(needle)) {
    const byId = clients.find((c) => c.id === needle);
    if (byId) return { id: byId.id, slug: byId.slug, name: byId.name };
  }

  const slugMatch = clients.find((c) => c.slug === needle.toLowerCase());
  if (slugMatch) return { id: slugMatch.id, slug: slugMatch.slug, name: slugMatch.name };

  const exactName = clients.find((c) => c.name.toLowerCase() === needle.toLowerCase());
  if (exactName) return { id: exactName.id, slug: exactName.slug, name: exactName.name };

  const partial = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(needle.toLowerCase()) ||
      c.slug.includes(needle.toLowerCase()),
  );
  if (partial.length === 1) {
    return { id: partial[0].id, slug: partial[0].slug, name: partial[0].name };
  }
  if (partial.length > 1) {
    throw new Error(
      `"${input}" matched ${partial.length} clients (${partial.map((p) => p.slug).join(", ")}). Pass an exact slug.`,
    );
  }
  throw new Error(`No client matches "${input}". Use list_clients to see what's visible.`);
}

// ── tool definitions ───────────────────────────────────────────────────────

const TASK_STATUS = z.enum(["BACKLOG", "TODO", "DOING", "IN_REVIEW", "DONE"]);
const TASK_PRIORITY = z.enum(["LOW", "MEDIUM", "HIGH"]);

// Zod schemas — runtime validation only. JSON Schema for tools/list is
// hand-written below to keep tooling output stable across zod versions.

const listClientsSchema = z.object({ search: z.string().optional() });

const createClientSchema = z.object({
  name: z.string().min(1),
  website: z.string().optional(),
  primaryContactName: z.string().optional(),
  primaryContactEmail: z.string().optional(),
  primaryContactPhone: z.string().optional(),
  notes: z.string().optional(),
});

const listTasksSchema = z.object({
  client: z.string().optional(),
  status: TASK_STATUS.optional(),
  assigneeId: z.string().optional(),
});

const createTaskSchema = z.object({
  client: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().max(10000).optional(),
  acceptanceCriteria: z.string().max(10000).optional(),
  status: TASK_STATUS.optional(),
  priority: TASK_PRIORITY.optional(),
  assigneeIds: z.array(z.string()).optional(),
  dueDate: z.string().optional(),
  featureBlockId: z.string().optional(),
});

const updateTaskSchema = z.object({
  taskId: z.string(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(10000).optional(),
  acceptanceCriteria: z.string().max(10000).optional(),
  status: TASK_STATUS.optional(),
  priority: TASK_PRIORITY.optional(),
  assigneeIds: z.array(z.string()).optional(),
  featureBlockId: z.string().optional(),
  dueDate: z.string().optional(),
});

const findMeetingsSchema = z.object({
  client: z.string(),
  q: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const DOCUMENT_TYPE = z.enum([
  "PROPOSAL",
  "SLA",
  "SOW",
  "MSA",
  "NDA",
  "CO",
  "DSA",
  "HANDOVER",
  "REPORT",
  "BRIEF",
  "OTHER",
]);

const createDocumentSchema = z.object({
  title: z.string().min(1).max(200),
  client: z.string().optional(),
  documentType: DOCUMENT_TYPE.optional(),
  productName: z.string().optional(),
});

const pulseScanToolSchema = z.object({
  url: z.string().url(),
  targetMarkets: z.array(z.string().trim().min(1).max(16)).max(30).optional(),
});
const pulseResultToolSchema = z.object({ scanId: z.string().min(1) });

const TASK_STATUS_VALUES = ["BACKLOG", "TODO", "DOING", "IN_REVIEW", "DONE"];
const TASK_PRIORITY_VALUES = ["LOW", "MEDIUM", "HIGH"];

const TOOLS: ToolDef[] = [
  {
    name: "list_clients",
    description:
      "List clients visible to you. Optional `search` filters by name (substring). " +
      "Honors your Foundry client-scoping (developers only see clients they're assigned to).",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Optional case-insensitive name substring." },
      },
      additionalProperties: false,
    },
    handler: async (user, args) => {
      const parsed = listClientsSchema.parse(args);
      const result = await listDerivedClients({ search: parsed.search });
      let clients = result.clients;
      if (!canSeeAllClients(user)) {
        const allowed = new Set(await assignedClientIds(user));
        clients = clients.filter((c) => allowed.has(c.id));
      }
      const projected = clients.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        status: c.status,
        devCount: c.devCount,
      }));
      const summary = `${projected.length} client${projected.length === 1 ? "" : "s"}${
        parsed.search ? ` matching "${parsed.search}"` : ""
      }.`;
      return textResult(projected, summary);
    },
  },
  {
    name: "create_client",
    description:
      "Create a new client. Requires the 'Manage clients' permission. Only name is required.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Client display name (e.g. 'Speakify')." },
        website: { type: "string", description: "Public website URL." },
        primaryContactName: { type: "string" },
        primaryContactEmail: { type: "string" },
        primaryContactPhone: { type: "string" },
        notes: { type: "string", description: "Free-text notes about the client." },
      },
      required: ["name"],
      additionalProperties: false,
    },
    handler: async (user, args) => {
      assertCan(user, canManageClients, "create clients");
      const input = createClientSchema.parse(args);
      const client = await createClientRecord(input);
      return textResult(
        { id: client.id, slug: client.slug, name: client.name },
        `Created client "${client.name}" (slug: ${client.slug}).`,
      );
    },
  },
  {
    name: "list_tasks",
    description:
      "List tasks. Filter by client (slug/name/cuid), status, or assignee id. " +
      "Use to answer 'what's in progress?' or 'what's on Speakify's board?'.",
    inputSchema: {
      type: "object",
      properties: {
        client: {
          type: "string",
          description: "Client slug, name, or cuid. Pass to scope to one client.",
        },
        status: { type: "string", enum: TASK_STATUS_VALUES, description: "Filter by board column." },
        assigneeId: { type: "string", description: "User cuid (from list_members), or 'me'." },
      },
      additionalProperties: false,
    },
    handler: async (user, args) => {
      const parsed = listTasksSchema.parse(args);
      let clientId: string | undefined;
      let clientLabel = "";
      if (parsed.client) {
        const c = await resolveClient(user, parsed.client);
        clientId = c.id;
        clientLabel = ` on ${c.name}`;
      }
      const tasks = await listTasks(user, {
        clientId,
        status: parsed.status,
        assigneeId: parsed.assigneeId,
      });
      const summary = `${tasks.length} task${tasks.length === 1 ? "" : "s"}${clientLabel}${
        parsed.status ? ` (${parsed.status})` : ""
      }.`;
      return textResult(tasks, summary);
    },
  },
  {
    name: "create_task",
    description:
      "Create a task on a client's board. Defaults: status BACKLOG, priority MEDIUM. " +
      "Pass `client` as a slug, name, or cuid — resolved against your visible clients. " +
      "For assignees, pass cuids from list_members.",
    inputSchema: {
      type: "object",
      properties: {
        client: { type: "string", description: "Client slug, name, or cuid." },
        title: { type: "string", description: "Task title (1–200 chars)." },
        description: { type: "string", description: "Longer-form details (markdown)." },
        acceptanceCriteria: { type: "string", description: "What 'done' looks like." },
        status: { type: "string", enum: TASK_STATUS_VALUES },
        priority: { type: "string", enum: TASK_PRIORITY_VALUES },
        assigneeIds: {
          type: "array",
          items: { type: "string" },
          description: "User cuids from list_members.",
        },
        dueDate: { type: "string", description: "ISO date, e.g. '2026-07-01'." },
        featureBlockId: { type: "string", description: "Cuid of feature block to attach to." },
      },
      required: ["client", "title"],
      additionalProperties: false,
    },
    handler: async (user, args) => {
      const parsed = createTaskSchema.parse(args);
      const c = await resolveClient(user, parsed.client);
      const created = await createTask(user, {
        clientId: c.id,
        title: parsed.title,
        description: parsed.description,
        acceptanceCriteria: parsed.acceptanceCriteria ?? null,
        status: parsed.status,
        priority: parsed.priority,
        assigneeIds: parsed.assigneeIds,
        featureBlockId: parsed.featureBlockId ?? null,
        dueDate: parsed.dueDate ?? null,
      });
      return textResult(
        created,
        `Created task "${created.title}" on ${c.name} (id: ${created.id}, status: ${created.status}).`,
      );
    },
  },
  {
    name: "update_task",
    description:
      "Update an existing task by id. Any subset of fields may be supplied. " +
      "Pass featureBlockId: '' to detach. Honors your client-scoping.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Cuid of the task to update." },
        title: { type: "string" },
        description: { type: "string" },
        acceptanceCriteria: { type: "string" },
        status: { type: "string", enum: TASK_STATUS_VALUES },
        priority: { type: "string", enum: TASK_PRIORITY_VALUES },
        assigneeIds: { type: "array", items: { type: "string" } },
        featureBlockId: {
          type: "string",
          description: "Cuid, or empty string to detach.",
        },
        dueDate: { type: "string", description: "ISO date." },
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    handler: async (user, args) => {
      const parsed = updateTaskSchema.parse(args);
      const { taskId, featureBlockId, ...rest } = parsed;
      const updated = await updateTask(user, taskId, {
        ...rest,
        featureBlockId: featureBlockId === "" ? null : featureBlockId,
      });
      return textResult(updated, `Updated task "${updated.title}" (status: ${updated.status}).`);
    },
  },
  {
    name: "list_members",
    description:
      "List workspace members. Returns id, name, email, role. Use to find " +
      "assigneeIds for create_task / update_task.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: async () => {
      const members = await listMembers();
      const projected = members.map((m) => ({
        id: m.user.id,
        memberId: m.id,
        name: m.user.name ?? null,
        email: m.user.email,
        role: m.role,
      }));
      return textResult(projected, `${projected.length} workspace member${projected.length === 1 ? "" : "s"}.`);
    },
  },
  {
    name: "find_meetings",
    description:
      "Search Scribe meeting notes for a client. Returns meeting title, date, " +
      "AI summary, decisions, and action items. Use to answer 'what did we agree " +
      "with X last week?' or 'show me the kickoff call decisions for Y'. " +
      "Honors your client scoping.",
    inputSchema: {
      type: "object",
      properties: {
        client: { type: "string", description: "Client slug, name, or cuid — required." },
        q: { type: "string", description: "Optional case-insensitive substring of meeting title / summary / transcript." },
        limit: { type: "integer", description: "Max meetings to return (default 20, max 50)." },
      },
      required: ["client"],
      additionalProperties: false,
    },
    handler: async (user, args) => {
      const parsed = findMeetingsSchema.parse(args);
      const c = await resolveClient(user, parsed.client);
      const rows = await listClientMeetings(user.workspaceId, c.id, parsed.q);
      const cap = parsed.limit ?? 20;
      const trimmed = rows.slice(0, cap);
      const projected = trimmed.map((m) => ({
        id: m.id,
        title: m.title,
        startedAt: m.startedAt ? m.startedAt.toISOString() : null,
        endedAt: m.endedAt ? m.endedAt.toISOString() : null,
        status: m.status,
        summary: m.summary,
        decisions: m.decisions,
        actionItems: m.actionItems.map((a) => ({
          id: a.id,
          text: a.text,
          owner: a.owner,
          done: a.done,
        })),
      }));
      return textResult(
        projected,
        `${projected.length} meeting${projected.length === 1 ? "" : "s"} on ${c.name}${
          parsed.q ? ` matching "${parsed.q}"` : ""
        }${rows.length > cap ? ` (of ${rows.length} total — pass a larger limit to see more)` : ""}.`,
      );
    },
  },
  {
    name: "create_document",
    description:
      "Create a new document (proposal / SOW / SLA / NDA / MSA / CO / DSA / OTHER). " +
      "Defaults to PROPOSAL — that's what you want unless asked otherwise. The doc " +
      "is created as DRAFT with default sections, ready to edit in Foundry. Requires " +
      "the 'Manage documents' permission.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Document title (1–200 chars)." },
        client: { type: "string", description: "Optional client slug, name, or cuid to attach the doc to." },
        documentType: {
          type: "string",
          enum: ["PROPOSAL", "SLA", "SOW", "MSA", "NDA", "CO", "DSA", "HANDOVER", "REPORT", "BRIEF", "OTHER"],
          description: "Document type. Defaults to PROPOSAL.",
        },
        productName: {
          type: "string",
          description: "Optional product / project name shown on the proposal cover.",
        },
      },
      required: ["title"],
      additionalProperties: false,
    },
    handler: async (user, args) => {
      assertCan(user, canManageDocs, "create documents");
      const parsed = createDocumentSchema.parse(args);
      const documentType: DocumentType = (parsed.documentType as DocumentType) ?? "PROPOSAL";

      // Resolve client (if given) so we capture both id and name correctly.
      let clientId: string | null = null;
      let clientName: string | undefined;
      if (parsed.client) {
        const resolved = await resolveClient(user, parsed.client);
        clientId = resolved.id;
        clientName = resolved.name;
      }

      // Mirror the route handler logic — pick template, pick sections,
      // allocate doc number, create. Kept inline rather than extracted because
      // the route is the only other caller and we want low coupling between
      // the MCP path and the web path until both demonstrably need the same
      // helper. If a third caller shows up, extract into src/server/documents.ts.
      const { workspace, user: defaultUser, template } = await ensureBaseRecords();
      const selectedTemplate =
        (await prisma.documentTemplate.findFirst({
          where: { slug: TEMPLATE_SLUG_BY_TYPE[documentType] },
        })) ?? template;

      const templateSections =
        selectedTemplate?.sections && Array.isArray(selectedTemplate.sections)
          ? (selectedTemplate.sections as Array<{
              key: string;
              title: string;
              description?: string | null;
              sortOrder?: number;
              isVisible?: boolean;
              data: unknown;
            }>)
          : null;

      let sectionsCreate: PrismaTypes.DocumentSectionCreateWithoutDocumentInput[];
      if (templateSections && templateSections.length > 0) {
        sectionsCreate = templateSections.map((section, index) => ({
          key: section.key,
          title: section.title,
          description: section.description ?? null,
          sortOrder: section.sortOrder ?? index,
          isVisible: section.isVisible ?? true,
          data: (section.data ?? {}) as PrismaTypes.InputJsonValue,
        }));
      } else if (documentType === "PROPOSAL") {
        sectionsCreate = getDefaultSectionPayload();
      } else {
        const blueprints = getTemplateBlueprintsForType(documentType);
        sectionsCreate = blueprints.map((blueprint, index) => ({
          key: blueprint.key,
          title: blueprint.title,
          description: blueprint.description,
          sortOrder: index,
          isVisible: blueprint.visible ?? true,
          data: blueprint.data as unknown as PrismaTypes.InputJsonValue,
        }));
      }
      sectionsCreate = applyClientNameToSections(sectionsCreate, clientName) as typeof sectionsCreate;

      const isProposal = documentType === "PROPOSAL";
      const documentNumber = await allocateDocumentNumber(workspace.id, documentType);

      const document = await prisma.document.create({
        data: {
          workspaceId: workspace.id,
          // Ownership traces to the MCP user — not the default bootstrap user —
          // so audit trails attribute correctly. Falls back to default only if
          // the user row vanished mid-flight (defensive; shouldn't happen).
          ownerId: user.id ?? defaultUser.id,
          templateId: selectedTemplate?.id,
          documentType,
          documentNumber,
          status: "DRAFT",
          title: parsed.title,
          productName: parsed.productName,
          clientName,
          clientId,
          summary: "",
          version: "v1.0",
          metadata: {
            ...DEFAULT_PROPOSAL_METADATA,
            client: clientName ?? DEFAULT_PROPOSAL_METADATA.client,
            owner: user.name ?? DEFAULT_PROPOSAL_METADATA.owner,
          },
          sections: { create: sectionsCreate },
          costLineItems: isProposal ? { create: getDefaultCostsPayload() } : undefined,
          timelinePhases: isProposal ? { create: getDefaultTimelinePayload() } : undefined,
          links: isProposal ? { create: getDefaultLinkPayload() } : undefined,
          ctas: isProposal ? { create: getDefaultCtaPayload() } : undefined,
          assets: isProposal ? { create: getDefaultAssetPayload() } : undefined,
        },
        select: { id: true, title: true, documentNumber: true, documentType: true, status: true },
      });

      return textResult(
        {
          id: document.id,
          title: document.title,
          documentNumber: document.documentNumber,
          documentType: document.documentType,
          status: document.status,
          editUrl: `/app/docs/${document.id}`,
        },
        `Created ${document.documentType} ${document.documentNumber}: "${document.title}"${
          clientName ? ` for ${clientName}` : ""
        }. Open it in Foundry to edit.`,
      );
    },
  },
  {
    name: "pulse_scan",
    description:
      "Run a Pulse production-readiness + security scan on a URL and return a compact verdict: " +
      "health score, confirmed issues, live Supabase RLS check, security/TLS/accessibility grades, " +
      "compliance gaps for target markets, and top fixes. Ideal to validate an AI-built app before shipping. " +
      "Synchronous (~15–30s). Requires the 'Manage Pulse' permission.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The https:// URL to scan." },
        targetMarkets: { type: "array", items: { type: "string" }, description: "Optional jurisdiction codes the product serves (e.g. EU, UK, US, US-CA)." },
      },
      required: ["url"],
      additionalProperties: false,
    },
    handler: async (user, args) => {
      assertCan(user, canManagePulse, "run Pulse scans");
      const parsed = pulseScanToolSchema.parse(args);
      const verdict = await runAgentScan({ url: parsed.url, targetMarkets: parsed.targetMarkets });
      return textResult(verdict, verdict.summary);
    },
  },
  {
    name: "pulse_scan_result",
    description: "Fetch the compact verdict for an existing Pulse scan by its scanId (e.g. a full in-app scan).",
    inputSchema: {
      type: "object",
      properties: { scanId: { type: "string", description: "The Pulse scan id." } },
      required: ["scanId"],
      additionalProperties: false,
    },
    handler: async (user, args) => {
      assertCan(user, canManagePulse, "read Pulse scans");
      const parsed = pulseResultToolSchema.parse(args);
      const scan = await getPulseScan(parsed.scanId);
      if (!scan) return textResult({ error: "Scan not found." }, "Scan not found.");
      const verdict = buildAgentVerdict({
        url: scan.inputUrl ?? scan.inputGithubRepo ?? scan.projectName,
        status: scan.status === "COMPLETED" ? "COMPLETED" : "FAILED",
        healthScore: scan.healthScore ?? 0,
        techStack: scan.techStack ?? [],
        checks: scan.checks.map((c) => ({ ...c, detail: c.detail ?? undefined, evidence: c.evidence ?? undefined, confidence: c.confidence ?? undefined, confidenceReason: c.confidenceReason ?? undefined, trustBucket: c.trustBucket ?? undefined })),
        targetMarkets: scan.targetMarkets ?? undefined,
        detectedMarkets: (scan.detectedMarkets ?? undefined) as undefined | import("@/server/pulse-checks/jurisdictions").JurisdictionCode[],
      });
      return textResult(verdict, verdict.summary);
    },
  },
];

const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

// ── dispatcher ─────────────────────────────────────────────────────────────

/**
 * Process a single JSON-RPC request. Notifications (no `id`) return null so
 * the HTTP route can answer with 202/empty per MCP spec.
 */
export async function dispatch(
  user: EffectiveUser,
  body: unknown,
): Promise<JsonRpcResponse | null> {
  if (!isJsonRpcRequest(body)) {
    return rpcError(null, ERR_INVALID_REQUEST, "Invalid JSON-RPC request.");
  }
  const id = body.id ?? null;
  const isNotification = body.id === undefined;

  try {
    switch (body.method) {
      case "initialize":
        return rpcResult(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
        });
      case "notifications/initialized":
      case "notifications/cancelled":
        // Spec says these are notifications — no response.
        return null;
      case "tools/list":
        return rpcResult(id, {
          tools: TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        });
      case "tools/call":
        return await handleToolCall(user, id, body.params);
      case "ping":
        return rpcResult(id, {});
      default:
        if (isNotification) return null;
        return rpcError(id, ERR_METHOD_NOT_FOUND, `Method not found: ${body.method}`);
    }
  } catch (err) {
    if (err instanceof UnauthorizedError || err instanceof ForbiddenError) {
      const status = (err as { status?: number }).status ?? 403;
      return rpcError(id, status === 401 ? -32001 : -32002, err.message);
    }
    return rpcError(
      id,
      ERR_INTERNAL,
      err instanceof Error ? err.message : "Internal error.",
    );
  }
}

async function handleToolCall(
  user: EffectiveUser,
  id: JsonRpcId,
  params: unknown,
): Promise<JsonRpcResponse> {
  const callParams = params as { name?: string; arguments?: unknown } | null | undefined;
  const name = callParams?.name;
  if (!name || typeof name !== "string") {
    return rpcError(id, ERR_INVALID_PARAMS, "Missing tool name.");
  }
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) {
    return rpcError(id, ERR_METHOD_NOT_FOUND, `Unknown tool: ${name}`);
  }
  try {
    const args = callParams?.arguments ?? {};
    const result = await tool.handler(user, args);
    return rpcResult(id, result);
  } catch (err) {
    if (err instanceof ZodError) {
      return rpcResult(id, {
        isError: true,
        content: [
          {
            type: "text",
            text: `Invalid arguments: ${err.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; ")}`,
          },
        ],
      });
    }
    if (err instanceof UnauthorizedError || err instanceof ForbiddenError) {
      // Surface as a tool-level error (isError) so Claude can read it,
      // rather than a protocol-level error that aborts the whole call.
      return rpcResult(id, errorResult(err));
    }
    return rpcResult(id, errorResult(err));
  }
}

// ── envelope helpers ───────────────────────────────────────────────────────

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.jsonrpc === "2.0" && typeof v.method === "string";
}

function rpcResult(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

// Surfaced for the smoke test (and any future internal caller).
export const _testing = { TOOLS };
