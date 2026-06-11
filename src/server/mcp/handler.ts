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
import type { EffectiveUser } from "@/server/auth/effective-user";
import {
  assertCan,
  canManageClients,
  canSeeAllClients,
  ForbiddenError,
  UnauthorizedError,
} from "@/server/auth/effective-user";
import { listDerivedClients, createClientRecord } from "@/server/clients";
import { assignedClientIds, listTasks, createTask, updateTask } from "@/server/tasks";
import { listMembers } from "@/server/team";

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
