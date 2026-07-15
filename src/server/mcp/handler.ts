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
import {
  DocumentType,
  DocumentStatus,
  type WorkspaceClientStatus,
  type Prisma as PrismaTypes,
} from "@prisma/client";
import type { EffectiveUser } from "@/server/auth/effective-user";
import {
  assertCan,
  allowedDocTypesForUser,
  canManageClients,
  canManageDocs,
  canManagePulse,
  canManageStarters,
  canManageSupport,
  canSeeAllClients,
  canViewClientFinancials,
  ForbiddenError,
  UnauthorizedError,
} from "@/server/auth/effective-user";
import { listStarters, getStarterBySlug, recordStarterUsage } from "@/server/starters";
import { buildSkillMarkdown } from "@/server/starters-package";
import { runAgentScan, buildAgentVerdict } from "@/server/pulse-agent";
import { getPulseScan, listPulseScans } from "@/server/pulse";
import type { CheckCategory } from "@/server/pulse-checks/categories";
import {
  listDerivedClients,
  createClientRecord,
  updateClientRecord,
  setClientStatus,
  createClientPlatform,
  createClientDesign,
  getDerivedClientDetail,
} from "@/server/clients";
import { listConversations, listSupportClients } from "@/server/support";
import {
  assignedClientIds,
  listTasks,
  getTask,
  createTask,
  updateTask,
  addTaskComment,
} from "@/server/tasks";
import { listMembers } from "@/server/team";
import { proposalListSelect, serializeProposalListItem } from "@/server/proposals";
import { listClientMeetings } from "@/server/meetings";
import { allocateDocumentNumber, updateDocument } from "@/server/documents";
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
// `name` is the stable machine id; `title` is the human-facing connector name Claude shows.
const SERVER_INFO = { name: "foundry", title: "Foundry by Gitwork", version: "0.2.0" };

// Server-level guidance Claude reads on connect (MCP `instructions`) — orients it to what the
// Foundry connector offers so it reaches for the right tool/prompt without prompting.
const SERVER_INSTRUCTIONS =
  "Foundry by Gitwork — Gitwork's design-and-build agency platform. Use these tools to work with " +
  "the workspace on the signed-in user's behalf (their permissions apply): list/create clients, " +
  "list/create/update tasks, list members, search Scribe meeting notes, create documents " +
  "(proposals/SOW/SLA/HANDOVER/…) and then fill in their content with update_document, and run " +
  "or fetch Pulse production-readiness scans. Foundry Starters " +
  "(reusable prompts/skills/kits) are exposed as MCP prompts — list them with prompts/list and " +
  "pull one in with prompts/get. Prefer resolving a client by slug; use list_members for assignee ids.";

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

// Avatars/logos are stored as base64 `data:` URL strings on some users, and a
// task carries one per assignee + creator — so a single list_tasks response
// ballooned to ~12.6M chars of embedded images. Claude has no use for image
// data, so strip it from EVERY tool payload here rather than per-tool: drop
// avatar/logo fields entirely and null out any stray `data:` URL string.
const HEAVY_MEDIA_KEYS = new Set(["avatarUrl", "logoUri", "clientLogoUri"]);

function stripHeavyMedia(value: unknown): unknown {
  if (typeof value === "string") {
    return value.startsWith("data:") ? null : value;
  }
  if (Array.isArray(value)) return value.map(stripHeavyMedia);
  if (value && typeof value === "object") {
    // Leave non-plain objects (Date, Buffer, class instances) untouched so
    // JSON.stringify still serialises them correctly (e.g. Date → ISO string).
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (HEAVY_MEDIA_KEYS.has(k)) continue; // drop avatar/logo fields entirely
      out[k] = stripHeavyMedia(v);
    }
    return out;
  }
  return value;
}

function textResult(payload: unknown, summary?: string): ToolCallResult {
  const body =
    typeof payload === "string" ? payload : JSON.stringify(stripHeavyMedia(payload), null, 2);
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

/** Resolve a Care client (SupportClient — distinct from the Portal WorkspaceClient) by id,
 *  slug, or fuzzy name against the user's visible Care scope. */
async function resolveSupportClient(
  user: EffectiveUser,
  input: string,
): Promise<{ id: string; name: string }> {
  const needle = input.trim();
  if (!needle) throw new Error("Care client identifier is required.");
  const clients = await listSupportClients(user);
  const lower = needle.toLowerCase();

  const byId = clients.find((c) => c.id === needle);
  if (byId) return { id: byId.id, name: byId.name };
  const bySlug = clients.find((c) => c.slug === lower);
  if (bySlug) return { id: bySlug.id, name: bySlug.name };
  const exactName = clients.find((c) => c.name.toLowerCase() === lower);
  if (exactName) return { id: exactName.id, name: exactName.name };

  const partial = clients.filter(
    (c) => c.name.toLowerCase().includes(lower) || c.slug.includes(lower),
  );
  if (partial.length === 1) return { id: partial[0].id, name: partial[0].name };
  if (partial.length > 1) {
    throw new Error(
      `"${input}" matched ${partial.length} Care clients (${partial.map((p) => p.slug).join(", ")}). Pass an exact slug.`,
    );
  }
  throw new Error(`No Care client matches "${input}".`);
}

// ── tool definitions ───────────────────────────────────────────────────────

const TASK_STATUS = z.enum(["BACKLOG", "TODO", "DOING", "IN_REVIEW", "DONE"]);
const TASK_PRIORITY = z.enum(["LOW", "MEDIUM", "HIGH"]);

// Zod schemas — runtime validation only. JSON Schema for tools/list is
// hand-written below to keep tooling output stable across zod versions.

const listClientsSchema = z.object({ search: z.string().optional() });

const WORKSPACE_CLIENT_STATUS_VALUES = [
  "ACTIVE",
  "LEAD",
  "PENDING_REVIEW",
  "INACTIVE",
  "ARCHIVED",
] as const;
const LEAD_STAGE_VALUES = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "WON", "LOST"] as const;

// Full editable client field set — mirrors buildContactData in src/server/clients.ts so anything
// the Portal Edit-client modal can set is settable via MCP. Shared by create + update.
const clientContactShape = {
  website: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  county: z.string().optional(),
  postcode: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
  primaryContactName: z.string().optional(),
  primaryContactEmail: z.string().optional(),
  primaryContactPhone: z.string().optional(),
  invoiceEmail: z.string().optional(),
  legalCompanyName: z.string().optional(),
  companyNumber: z.string().optional(),
  vatNumber: z.string().optional(),
  googleDriveFolderUrl: z.string().optional(),
  clickupUrl: z.string().optional(),
  retainerDays: z.coerce.number().int().min(0).max(31).nullable().optional(),
  retainerDaysUsed: z.coerce.number().int().min(0).max(31).nullable().optional(),
  // Lead fields (client is a LEAD) + paused-client fields (INACTIVE).
  leadSource: z.string().nullable().optional(),
  leadStage: z.enum(LEAD_STAGE_VALUES).nullable().optional(),
  leadValue: z.coerce.number().int().min(0).max(100_000_000).nullable().optional(),
  leadValueCurrency: z.string().max(3).nullable().optional(),
  leadFollowUpAt: z.string().nullable().optional(),
  resumeAt: z.string().nullable().optional(),
  pauseNote: z.string().nullable().optional(),
} as const;

const createClientSchema = z.object({
  name: z.string().min(1),
  status: z.enum(WORKSPACE_CLIENT_STATUS_VALUES).optional(),
  ...clientContactShape,
});

const updateClientSchema = z.object({
  client: z.string().min(1),
  name: z.string().min(1).optional(),
  ...clientContactShape,
});

const setClientStatusSchema = z.object({
  client: z.string().min(1),
  status: z.enum(WORKSPACE_CLIENT_STATUS_VALUES),
  resumeAt: z.string().optional(),
  pauseNote: z.string().optional(),
});

const addDesignSchema = z.object({
  client: z.string().min(1),
  name: z.string().min(1),
  url: z.string().optional(),
  notes: z.string().optional(),
});

const addPlatformSchema = z.object({
  client: z.string().min(1),
  name: z.string().min(1),
  platformType: z.string().optional(),
  url: z.string().optional(),
  stagingUrl: z.string().optional(),
  repoUrl: z.string().optional(),
  notes: z.string().optional(),
  featuredInWiki: z.boolean().optional(),
});

const listPlatformsSchema = z.object({ client: z.string().min(1) });

const listTasksSchema = z.object({
  client: z.string().optional(),
  status: TASK_STATUS.optional(),
  assigneeId: z.string().optional(),
  q: z.string().trim().min(1).max(200).optional(),
  includeArchived: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const getTaskSchema = z.object({ taskId: z.string().min(1) });

const commentTaskSchema = z.object({
  taskId: z.string().min(1),
  body: z.string().min(1).max(10000),
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

const DOCUMENT_STATUS = z.enum([
  "DRAFT",
  "PRODUCT_SIGN_OFF",
  "TECH_SIGN_OFF",
  "IN_REVIEW",
  "APPROVED",
  "SENT",
  "ACCEPTED",
  "DECLINED",
  "ARCHIVED",
]);

// Looser than the editor's own `sectionSchema` (src/server/validators.ts): sortOrder/isVisible
// are derived here (array order / default-visible) rather than demanded from the caller, since a
// tool caller shouldn't need to know Foundry's internal ordering/visibility bookkeeping.
const updateDocumentSectionSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  isVisible: z.boolean().optional(),
  data: z.record(z.string(), z.unknown()).or(z.array(z.unknown())),
  speakerNotes: z.string().optional(),
});

const updateDocumentSchema = z.object({
  documentId: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  status: DOCUMENT_STATUS.optional(),
  summary: z.string().optional(),
  productName: z.string().optional(),
  clientName: z.string().optional(),
  sections: z.array(updateDocumentSectionSchema).min(1).optional(),
  labels: z.array(z.string().min(1).max(40)).max(20).optional(),
});

const listDocumentsSchema = z.object({
  client: z.string().optional(),
  documentType: DOCUMENT_TYPE.optional(),
  status: DOCUMENT_STATUS.optional(),
  search: z.string().trim().min(1).max(200).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const getClientSchema = z.object({ client: z.string().min(1) });

const CONVERSATION_STATUS = z.enum(["new", "open", "snoozed", "closed", "ignored"]);
const listConversationsSchema = z.object({
  client: z.string().min(1),
  status: CONVERSATION_STATUS.optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const pulseScanToolSchema = z.object({
  url: z.string().url(),
  targetMarkets: z.array(z.string().trim().min(1).max(16)).max(30).optional(),
});
const pulseResultToolSchema = z.object({ scanId: z.string().min(1) });
const listPulseScansSchema = z.object({
  client: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const TASK_STATUS_VALUES = ["BACKLOG", "TODO", "DOING", "IN_REVIEW", "DONE"];
const TASK_PRIORITY_VALUES = ["LOW", "MEDIUM", "HIGH"];

// JSON-schema properties for the full editable client field set — shared by the create_client and
// update_client inputSchemas so both advertise every field (kept in step with clientContactShape).
const CLIENT_FIELD_PROPERTIES: Record<string, Record<string, unknown>> = {
  website: { type: "string", description: "Public website URL." },
  addressLine1: { type: "string", description: "Address line 1." },
  addressLine2: { type: "string", description: "Address line 2." },
  city: { type: "string" },
  county: { type: "string" },
  postcode: { type: "string" },
  country: { type: "string" },
  notes: { type: "string", description: "Free-text notes about the client." },
  primaryContactName: { type: "string" },
  primaryContactEmail: { type: "string" },
  primaryContactPhone: { type: "string" },
  invoiceEmail: { type: "string", description: "Where invoices are sent (if different)." },
  legalCompanyName: { type: "string" },
  companyNumber: { type: "string", description: "Companies House number." },
  vatNumber: { type: "string" },
  googleDriveFolderUrl: { type: "string", description: "Google Drive folder URL." },
  clickupUrl: { type: "string", description: "ClickUp space/list URL." },
  retainerDays: { type: "number", description: "Monthly retainer-day allowance (0–31)." },
  retainerDaysUsed: { type: "number", description: "Retainer days used this month (0–31)." },
  leadSource: { type: "string", description: "Where the lead came from (LEAD clients)." },
  leadStage: { type: "string", enum: ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "WON", "LOST"] },
  leadValue: { type: "number", description: "Estimated deal value (LEAD clients)." },
  leadValueCurrency: { type: "string", description: "3-letter currency code, e.g. GBP." },
  leadFollowUpAt: { type: "string", description: "ISO date to follow up (LEAD clients)." },
  resumeAt: { type: "string", description: "ISO date to pick back up (INACTIVE clients)." },
  pauseNote: { type: "string", description: "Why the client is paused (INACTIVE)." },
};

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
      "Create a new client with any of its fields — contact, full address, legal/company, links, " +
      "retainer, and (for prospects) lead fields. Requires the 'Manage clients' permission. Only " +
      "name is required. Pass status ('LEAD' for a prospect, 'PENDING_REVIEW', etc.; default ACTIVE). " +
      "Retainer is structured — use retainerDays, don't note it in text. Add platforms with " +
      "add_platform, design links with add_design; edit anything later with update_client.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Client display name (e.g. 'Speakify')." },
        status: {
          type: "string",
          enum: [...WORKSPACE_CLIENT_STATUS_VALUES],
          description: "Lifecycle status. Default ACTIVE (current client); LEAD for a prospect.",
        },
        ...CLIENT_FIELD_PROPERTIES,
      },
      required: ["name"],
      additionalProperties: false,
    },
    handler: async (user, args) => {
      assertCan(user, canManageClients, "create clients");
      const input = createClientSchema.parse(args);
      const client = await createClientRecord(input);
      return textResult(
        { id: client.id, slug: client.slug, name: client.name, status: client.status },
        `Created client "${client.name}" (slug: ${client.slug}, ${client.status}).`,
      );
    },
  },
  {
    name: "update_client",
    description:
      "Update any of an existing client's fields — name, contact, full address, legal/company, " +
      "links, retainer, and lead fields. Requires the 'Manage clients' permission. Resolve the " +
      "client by slug, name, or cuid (see list_clients). Only the fields you pass are changed. " +
      "Bank details and platform credentials are NOT editable here (secrets stay UI-only); to move " +
      "a client between current/lead/pending/inactive use set_client_status; add design links with add_design.",
    inputSchema: {
      type: "object",
      properties: {
        client: { type: "string", description: "Client slug, name, or cuid (see list_clients)." },
        name: { type: "string", description: "New display name." },
        ...CLIENT_FIELD_PROPERTIES,
      },
      required: ["client"],
      additionalProperties: false,
    },
    handler: async (user, args) => {
      assertCan(user, canManageClients, "update clients");
      const { client, ...fields } = updateClientSchema.parse(args);
      const resolved = await resolveClient(user, client);
      const updated = await updateClientRecord(resolved.slug, fields);
      if (!updated) return textResult({ error: "Client not found." }, "Client not found.");
      return textResult(
        { id: updated.id, slug: updated.slug, name: updated.name },
        `Updated ${updated.name}.`,
      );
    },
  },
  {
    name: "add_platform",
    description:
      "Add a platform entry to a client's Platforms block (e.g. WordPress, hosting provider, repo). " +
      "Requires the 'Manage clients' permission. Resolve the client by slug, name, or cuid. Only 'name' " +
      "is required. Credentials (username/password) are intentionally NOT accepted here — add those in " +
      "the Foundry UI where they're encrypted and permission-gated. Use list_platforms to see existing entries.",
    inputSchema: {
      type: "object",
      properties: {
        client: { type: "string", description: "Client slug, name, or cuid (see list_clients)." },
        name: { type: "string", description: "Platform name (e.g. 'WordPress', 'Fasthosts')." },
        platformType: { type: "string", description: "Category, e.g. 'CMS', 'Hosting', 'Repo', 'Analytics'." },
        url: { type: "string", description: "Production URL." },
        stagingUrl: { type: "string", description: "Staging/preview URL." },
        repoUrl: { type: "string", description: "Source repository URL." },
        notes: { type: "string", description: "Access notes (no secrets — those go in the UI)." },
        featuredInWiki: {
          type: "boolean",
          description: "Surface this platform's prod + staging URLs as buttons in the client wiki header.",
        },
      },
      required: ["client", "name"],
      additionalProperties: false,
    },
    handler: async (user, args) => {
      assertCan(user, canManageClients, "add platforms");
      const parsed = addPlatformSchema.parse(args);
      const resolved = await resolveClient(user, parsed.client);
      const platform = await createClientPlatform(resolved.id, {
        name: parsed.name,
        platformType: parsed.platformType,
        url: parsed.url,
        stagingUrl: parsed.stagingUrl,
        repoUrl: parsed.repoUrl,
        notes: parsed.notes,
        featuredInWiki: parsed.featuredInWiki,
      });
      return textResult(
        { id: platform.id, name: platform.name, platformType: platform.platformType, url: platform.url },
        `Added platform "${platform.name}" to ${resolved.name}.`,
      );
    },
  },
  {
    name: "list_platforms",
    description:
      "List a client's platform entries (name, type, URLs, and whether credentials are on file — " +
      "never the secrets themselves). Resolve the client by slug, name, or cuid.",
    inputSchema: {
      type: "object",
      properties: {
        client: { type: "string", description: "Client slug, name, or cuid (see list_clients)." },
      },
      required: ["client"],
      additionalProperties: false,
    },
    handler: async (user, args) => {
      const parsed = listPlatformsSchema.parse(args);
      const resolved = await resolveClient(user, parsed.client);
      const detail = await getDerivedClientDetail(resolved.slug);
      if (!detail) return textResult({ error: "Client not found." }, "Client not found.");
      const platforms = detail.platforms.map((p) => ({
        id: p.id,
        name: p.name,
        platformType: p.platformType,
        url: p.url,
        stagingUrl: p.stagingUrl,
        repoUrl: p.repoUrl,
        featuredInWiki: p.featuredInWiki,
        hasCredentials: p.hasUsername || p.hasPassword || p.logins.length > 0,
      }));
      return textResult(
        { platforms },
        `${resolved.name} — ${platforms.length} platform${platforms.length === 1 ? "" : "s"}.`,
      );
    },
  },
  {
    name: "set_client_status",
    description:
      "Move a client through its lifecycle — ACTIVE (current), LEAD (prospect), PENDING_REVIEW, " +
      "INACTIVE (paused), or ARCHIVED. This is how you convert a lead to a current client, park one, " +
      "or bring it back. Requires the 'Manage clients' permission. For INACTIVE you can pass resumeAt " +
      "(ISO date to pick back up) + pauseNote; those clear on any other transition. Set lead detail " +
      "(source/stage/value) with update_client.",
    inputSchema: {
      type: "object",
      properties: {
        client: { type: "string", description: "Client slug, name, or cuid (see list_clients)." },
        status: {
          type: "string",
          enum: [...WORKSPACE_CLIENT_STATUS_VALUES],
          description: "ACTIVE · LEAD · PENDING_REVIEW · INACTIVE · ARCHIVED.",
        },
        resumeAt: { type: "string", description: "INACTIVE only — ISO date to pick back up." },
        pauseNote: { type: "string", description: "INACTIVE only — why it's paused." },
      },
      required: ["client", "status"],
      additionalProperties: false,
    },
    handler: async (user, args) => {
      assertCan(user, canManageClients, "change client status");
      const parsed = setClientStatusSchema.parse(args);
      const resolved = await resolveClient(user, parsed.client);
      const updated = await setClientStatus(
        resolved.slug,
        parsed.status as WorkspaceClientStatus,
        user,
        { resumeAt: parsed.resumeAt ?? null, pauseNote: parsed.pauseNote ?? null },
      );
      if (!updated) return textResult({ error: "Client not found." }, "Client not found.");
      return textResult(
        { id: updated.id, slug: updated.slug, name: updated.name, status: updated.status },
        `${updated.name} is now ${updated.status}.`,
      );
    },
  },
  {
    name: "add_design",
    description:
      "Add a design link to a client's Designs block (e.g. a Figma file, mockup, or moodboard). " +
      "Requires the 'Manage clients' permission. Resolve the client by slug, name, or cuid. Only " +
      "'name' is required; pass the Figma/design URL as `url`. This is the Designs card — distinct " +
      "from add_platform (hosting/repos/tools).",
    inputSchema: {
      type: "object",
      properties: {
        client: { type: "string", description: "Client slug, name, or cuid (see list_clients)." },
        name: { type: "string", description: "Design name (e.g. 'Homepage v2', 'Brand kit')." },
        url: { type: "string", description: "Design URL (Figma, etc.)." },
        notes: { type: "string", description: "Optional notes." },
      },
      required: ["client", "name"],
      additionalProperties: false,
    },
    handler: async (user, args) => {
      assertCan(user, canManageClients, "add client designs");
      const parsed = addDesignSchema.parse(args);
      const resolved = await resolveClient(user, parsed.client);
      const design = await createClientDesign(resolved.id, {
        name: parsed.name,
        url: parsed.url,
        notes: parsed.notes,
      });
      return textResult(
        { id: design.id, name: design.name, url: design.url },
        `Added design "${design.name}" to ${resolved.name}.`,
      );
    },
  },
  {
    name: "list_tasks",
    description:
      "List tasks. Filter by client (slug/name/cuid), status, assignee id ('me' works), " +
      "or a text query `q` (matches title/description). Returns active tasks by default; pass " +
      "includeArchived to include archived. Capped at `limit` (default 100) to stay lean. " +
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
        q: { type: "string", description: "Case-insensitive substring of task title / description." },
        includeArchived: { type: "boolean", description: "Include archived tasks (default false)." },
        limit: { type: "integer", description: "Max tasks to return (default 100, max 200)." },
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
      let tasks = await listTasks(user, {
        clientId,
        status: parsed.status,
        assigneeId: parsed.assigneeId,
        archived: parsed.includeArchived ?? false,
      });
      if (parsed.q) {
        const needle = parsed.q.toLowerCase();
        tasks = tasks.filter(
          (t) =>
            t.title.toLowerCase().includes(needle) ||
            (t.description ?? "").toLowerCase().includes(needle),
        );
      }
      const total = tasks.length;
      const cap = parsed.limit ?? 100;
      const trimmed = tasks.slice(0, cap);
      const summary = `${trimmed.length} task${trimmed.length === 1 ? "" : "s"}${clientLabel}${
        parsed.status ? ` (${parsed.status})` : ""
      }${parsed.q ? ` matching "${parsed.q}"` : ""}${
        total > cap ? ` (of ${total} — raise limit to see more)` : ""
      }.`;
      return textResult(trimmed, summary);
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
    name: "update_document",
    description:
      "Update an existing document's content (title, status, summary, sections, labels) by its " +
      "documentId — e.g. filling in the sections of a HANDOVER/REPORT/PROPOSAL doc created with " +
      "create_document. `sections`, if provided, REPLACES the document's current sections " +
      "wholesale (pass the full set you want, not just the ones changing). Each section's `data` " +
      "shape depends on its `key` (e.g. \"prose\" → {content}, \"checklist\" → {intro, items}, " +
      "\"data_table\" → {caption, columns, rows}, \"callout\" → {tone, headline, body}) — read the " +
      "document's existing sections (via Foundry's editor, or ask for them) to match the shapes " +
      "already in use. Omitted fields are left untouched. Requires the 'Manage documents' permission.",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "The document's id (from create_document's response, or the /app/docs/{id} URL)." },
        title: { type: "string", description: "New title (1–200 chars)." },
        status: {
          type: "string",
          enum: ["DRAFT", "PRODUCT_SIGN_OFF", "TECH_SIGN_OFF", "IN_REVIEW", "APPROVED", "SENT", "ACCEPTED", "DECLINED", "ARCHIVED"],
          description: "New document status.",
        },
        summary: { type: "string", description: "Short summary shown in document lists." },
        productName: { type: "string", description: "Product / project name shown on the cover." },
        clientName: { type: "string", description: "Display name of the client shown on the cover." },
        sections: {
          type: "array",
          description: "Full replacement list of sections, in order. Omit to leave sections untouched.",
          items: {
            type: "object",
            properties: {
              key: { type: "string", description: "Section type, e.g. \"prose\", \"checklist\", \"data_table\", \"callout\", \"cover\"." },
              title: { type: "string", description: "Section heading shown in the editor/preview." },
              description: { type: "string" },
              isVisible: { type: "boolean", description: "Defaults to true." },
              data: { type: "object", description: "Shape depends on `key` — see tool description." },
              speakerNotes: { type: "string" },
            },
            required: ["key", "title", "data"],
            additionalProperties: false,
          },
        },
        labels: { type: "array", items: { type: "string" }, description: "Up to 20 short tag labels." },
      },
      required: ["documentId"],
      additionalProperties: false,
    },
    handler: async (user, args) => {
      const parsed = updateDocumentSchema.parse(args);
      const { documentId, sections, ...rest } = parsed;
      const proposal = await updateDocument(user, documentId, {
        ...rest,
        sections: sections?.map((section, index) => ({
          key: section.key,
          title: section.title,
          description: section.description,
          sortOrder: index,
          isVisible: section.isVisible ?? true,
          data: section.data,
          speakerNotes: section.speakerNotes,
        })),
      });
      return textResult(
        {
          id: proposal.id,
          title: proposal.title,
          documentNumber: proposal.documentNumber,
          documentType: proposal.documentType,
          status: proposal.status,
          editUrl: `/app/docs/${proposal.id}`,
        },
        `Updated ${proposal.documentType} ${proposal.documentNumber}: "${proposal.title}".`,
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
        checks: scan.checks.map((c) => ({ ...c, category: c.category as CheckCategory, detail: c.detail ?? undefined, evidence: c.evidence ?? undefined, confidence: c.confidence ?? undefined, confidenceReason: c.confidenceReason ?? undefined, trustBucket: c.trustBucket ?? undefined })),
        targetMarkets: scan.targetMarkets ?? undefined,
        detectedMarkets: (scan.detectedMarkets ?? undefined) as undefined | import("@/server/pulse-checks/jurisdictions").JurisdictionCode[],
      });
      return textResult(verdict, verdict.summary);
    },
  },
  {
    name: "whoami",
    description:
      "Return the Foundry user Claude is acting as — id, name, email, role, and key " +
      "capabilities. Zero args. Use it to resolve 'me' (e.g. for list_tasks assigneeId) and to " +
      "know what you're allowed to do before calling other tools.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (user) => {
      const me = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        workspaceId: user.workspaceId,
        capabilities: {
          manageClients: canManageClients(user),
          manageDocs: canManageDocs(user),
          managePulse: canManagePulse(user),
          seeAllClients: canSeeAllClients(user),
        },
      };
      return textResult(me, `You are ${user.name ?? user.email} (${user.role}).`);
    },
  },
  {
    name: "get_task",
    description:
      "Get one task in full — description, acceptance criteria, assignees, subtasks, and the " +
      "comment thread. Pass the task cuid (from list_tasks). Honors your client-scoping.",
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string", description: "Cuid of the task." } },
      required: ["taskId"],
      additionalProperties: false,
    },
    handler: async (user, args) => {
      const parsed = getTaskSchema.parse(args);
      const task = await getTask(user, parsed.taskId);
      return textResult(task, `Task "${task.title}" (${task.status}) on ${task.client.name}.`);
    },
  },
  {
    name: "comment_task",
    description:
      "Add a comment / note to a task's thread (supports @mentions of workspace members). " +
      "Use to leave an update, ask a question, or record a decision on a task.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Cuid of the task to comment on." },
        body: { type: "string", description: "Comment text (markdown; @name to mention)." },
      },
      required: ["taskId", "body"],
      additionalProperties: false,
    },
    handler: async (user, args) => {
      const parsed = commentTaskSchema.parse(args);
      const comment = await addTaskComment(user, parsed.taskId, parsed.body);
      return textResult(comment, `Added comment to task ${parsed.taskId}.`);
    },
  },
  {
    name: "list_documents",
    description:
      "List documents (proposals / SOW / SLA / NDA / …). Filter by client, documentType, status, " +
      "or a text `search` (title / client / product). Only shows document types your role may see. " +
      "Capped at `limit` (default 50). Use create_document to make one, update_document to edit it.",
    inputSchema: {
      type: "object",
      properties: {
        client: { type: "string", description: "Client slug, name, or cuid to scope to." },
        documentType: {
          type: "string",
          enum: ["PROPOSAL", "SLA", "SOW", "MSA", "NDA", "CO", "DSA", "HANDOVER", "REPORT", "BRIEF", "OTHER"],
        },
        status: {
          type: "string",
          enum: ["DRAFT", "PRODUCT_SIGN_OFF", "TECH_SIGN_OFF", "IN_REVIEW", "APPROVED", "SENT", "ACCEPTED", "DECLINED", "ARCHIVED"],
        },
        search: { type: "string", description: "Case-insensitive substring of title / client / product name." },
        limit: { type: "integer", description: "Max documents to return (default 50, max 100)." },
      },
      additionalProperties: false,
    },
    handler: async (user, args) => {
      const parsed = listDocumentsSchema.parse(args);
      const allowed = allowedDocTypesForUser(user);
      const allowedSet = new Set<string>(allowed);
      // Intersect the requested type with what the role may see — never leak admin doc types.
      let documentType: PrismaTypes.DocumentWhereInput["documentType"] = { in: allowed };
      if (parsed.documentType) {
        documentType = allowedSet.has(parsed.documentType)
          ? (parsed.documentType as DocumentType)
          : { in: [] as DocumentType[] };
      }
      let clientId: string | undefined;
      let clientLabel = "";
      if (parsed.client) {
        const c = await resolveClient(user, parsed.client);
        clientId = c.id;
        clientLabel = ` for ${c.name}`;
      }
      const where: PrismaTypes.DocumentWhereInput = {
        workspaceId: user.workspaceId,
        documentType,
        ...(parsed.status ? { status: parsed.status as DocumentStatus } : {}),
        ...(clientId ? { clientId } : {}),
        ...(parsed.search
          ? {
              OR: [
                { title: { contains: parsed.search, mode: "insensitive" } },
                { clientName: { contains: parsed.search, mode: "insensitive" } },
                { productName: { contains: parsed.search, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const cap = parsed.limit ?? 50;
      const rows = await prisma.document.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: cap + 1,
        select: proposalListSelect,
      });
      const hasMore = rows.length > cap;
      const docs = rows.slice(0, cap).map((d) => serializeProposalListItem(d));
      const summary = `${docs.length} document${docs.length === 1 ? "" : "s"}${clientLabel}${
        parsed.documentType ? ` (${parsed.documentType})` : ""
      }${hasMore ? " (more available — raise limit)" : ""}.`;
      return textResult(docs, summary);
    },
  },
  {
    name: "list_pulse_scans",
    description:
      "List recent Pulse scans (id, project, url/repo, health score, status, date). Optionally " +
      "scope to a client. Pass a returned scanId to pulse_scan_result for the full verdict. " +
      "Requires the 'Manage Pulse' permission.",
    inputSchema: {
      type: "object",
      properties: {
        client: { type: "string", description: "Client slug, name, or cuid to scope to." },
        limit: { type: "integer", description: "Max scans to return (default 50, max 100)." },
      },
      additionalProperties: false,
    },
    handler: async (user, args) => {
      assertCan(user, canManagePulse, "read Pulse scans");
      const parsed = listPulseScansSchema.parse(args);
      let clientId: string | undefined;
      let clientLabel = "";
      if (parsed.client) {
        const c = await resolveClient(user, parsed.client);
        clientId = c.id;
        clientLabel = ` for ${c.name}`;
      }
      const scans = await listPulseScans(clientId ? { clientId } : undefined);
      const cap = parsed.limit ?? 50;
      const trimmed = scans.slice(0, cap).map((s) => ({
        id: s.id,
        projectName: s.projectName,
        clientName: s.clientName,
        target: s.inputUrl ?? s.inputGithubRepo,
        status: s.status,
        healthScore: s.healthScore,
        createdAt: s.createdAt,
      }));
      const summary = `${trimmed.length} Pulse scan${trimmed.length === 1 ? "" : "s"}${clientLabel}${
        scans.length > cap ? ` (of ${scans.length} — raise limit)` : ""
      }. Pass a scanId to pulse_scan_result for the full verdict.`;
      return textResult(trimmed, summary);
    },
  },
  {
    name: "get_client",
    description:
      "Get one client's profile — primary contact, website, notes, active developers, useful " +
      "links (Drive / ClickUp / repos), and counts (proposals, Pulse scans). Financials (monthly " +
      "cost, working days, retainer) are included only if you can view client financials. Never " +
      "returns bank details or platform credentials. Honors your client-scoping.",
    inputSchema: {
      type: "object",
      properties: { client: { type: "string", description: "Client slug, name, or cuid." } },
      required: ["client"],
      additionalProperties: false,
    },
    handler: async (user, args) => {
      const parsed = getClientSchema.parse(args);
      const resolved = await resolveClient(user, parsed.client);
      const detail = await getDerivedClientDetail(resolved.slug);
      if (!detail) return textResult({ error: "Client not found." }, "Client not found.");
      const c = detail.client;
      const activeDevs = detail.placements
        .filter((p) => !p.endDate)
        .map((p) => ({ name: p.candidateName, project: p.projectName }));
      // Explicit allow-list — never spread the raw record (it carries bank + platform creds).
      const safe: Record<string, unknown> = {
        id: c.id,
        slug: c.slug,
        name: c.name,
        status: c.status,
        website: c.website,
        notes: c.notes,
        primaryContact: {
          name: c.primaryContactName,
          email: c.primaryContactEmail,
          phone: c.primaryContactPhone,
        },
        devCount: c.devCount,
        activeDevs,
        links: {
          googleDrive: c.googleDriveFolderUrl,
          repos: c.repoUrls,
        },
        counts: { proposals: detail.proposals.length, pulseScans: detail.pulseScans.length },
        latestPulseScore: c.pulseHealthScore ?? null,
        careConnected: Boolean(detail.supportClient),
      };
      if (canViewClientFinancials(user)) {
        safe.financials = {
          monthlyCost: c.monthlyCost ?? null,
          workingDays: c.workingDays ?? null,
          retainerDays: c.retainerDays ?? null,
          retainerDaysUsed: c.retainerDaysUsed ?? null,
        };
      }
      return textResult(safe, `${c.name} — ${activeDevs.length} active dev${activeDevs.length === 1 ? "" : "s"}, ${detail.proposals.length} doc${detail.proposals.length === 1 ? "" : "s"}.`);
    },
  },
  {
    name: "list_conversations",
    description:
      "List a Care client's support conversations (subject, customer, source, status, priority, " +
      "sentiment). Filter by status. Newest first, capped at `limit` (default 50). Requires the " +
      "'Manage Care' permission. `client` is the Care client — resolve by name/slug.",
    inputSchema: {
      type: "object",
      properties: {
        client: { type: "string", description: "Care client name, slug, or id." },
        status: {
          type: "string",
          enum: ["new", "open", "snoozed", "closed", "ignored"],
          description: "Filter by triage status.",
        },
        limit: { type: "integer", description: "Max conversations (default 50, max 100)." },
      },
      required: ["client"],
      additionalProperties: false,
    },
    handler: async (user, args) => {
      assertCan(user, canManageSupport, "read Care conversations");
      const parsed = listConversationsSchema.parse(args);
      const c = await resolveSupportClient(user, parsed.client);
      const { conversations, nextCursor } = await listConversations(c.id, {
        status: parsed.status,
        limit: parsed.limit ?? 50,
      });
      const projected = conversations.map((conv) => ({
        id: conv.id,
        subject: conv.subject,
        customer: conv.customerLabel,
        source: conv.source,
        status: conv.status,
        priority: conv.priority,
        sentiment: conv.sentiment,
        unread: conv.unread,
        issueType: conv.issueType ?? null,
        receivedAt: conv.receivedAt,
        preview: conv.preview,
      }));
      const summary = `${projected.length} conversation${projected.length === 1 ? "" : "s"} on ${c.name}${
        parsed.status ? ` (${parsed.status})` : ""
      }${nextCursor ? " (more available — raise limit)" : ""}.`;
      return textResult(projected, summary);
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
          capabilities: {
            tools: { listChanged: false },
            prompts: { listChanged: false },
          },
          serverInfo: SERVER_INFO,
          instructions: SERVER_INSTRUCTIONS,
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
      case "prompts/list":
        return rpcResult(id, { prompts: await listStarterPrompts(user) });
      case "prompts/get":
        return await handlePromptGet(user, id, body.params);
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

// ── prompts (Starters) ───────────────────────────────────────────────────────
// Starters are Super-Admin-only, so non-admins see an empty prompt list and cannot fetch one.
// Each starter's prompt body is the exact SKILL.md text served by the download route — a chat gets
// identical content whether it installs the skill or invokes the prompt.

async function listStarterPrompts(
  user: EffectiveUser,
): Promise<Array<{ name: string; title: string; description: string; arguments: [] }>> {
  if (!canManageStarters(user)) return [];
  const starters = await listStarters();
  // `name` stays the slug (handlePromptGet looks starters up by it); `title` is the human-readable
  // display name — without it, clients that render `name` directly show raw slugs like
  // "prompt-cd2-animation" instead of "Chat Digest".
  return starters.map((s) => ({ name: s.slug, title: s.name, description: s.summary, arguments: [] }));
}

async function handlePromptGet(
  user: EffectiveUser,
  id: JsonRpcId,
  params: unknown,
): Promise<JsonRpcResponse> {
  if (!canManageStarters(user)) {
    return rpcError(id, -32002, "You don't have permission to use starters.");
  }
  const name = (params as { name?: string } | null | undefined)?.name;
  if (!name || typeof name !== "string") {
    return rpcError(id, ERR_INVALID_PARAMS, "Missing prompt name.");
  }
  const starter = await getStarterBySlug(name);
  if (!starter) {
    return rpcError(id, ERR_METHOD_NOT_FOUND, `Unknown prompt: ${name}`);
  }
  await recordStarterUsage(starter.id);
  return rpcResult(id, {
    description: starter.summary,
    messages: [
      {
        role: "user",
        content: { type: "text", text: buildSkillMarkdown(starter) },
      },
    ],
  });
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
export const _testing = { TOOLS, stripHeavyMedia };
