/**
 * Who may reach a Care client, and the rows under it (Phase 2.2b, Care; permissions Nov 2026).
 *
 * Every `/api/support/clients/[clientId]/**` route used to load its client (and any
 * conversation, ticket, connection, report, draft or rule it named) by id alone, so another
 * business's id answered. Each route now resolves the client here first, and any row it names
 * is checked to belong to that client. A row elsewhere reads as a 404, the same as an id that
 * doesn't exist.
 *
 * ⚠️ The PERMISSION check lives here too, deliberately, rather than being repeated at the top of
 * forty handlers. `/api/support/**` is NOT covered by the module gate — that only reads `/app`
 * paths — so per-route asserts were the whole enforcement, and an audit found eleven routes with
 * none at all: a destructive connector purge, a full history re-pull, an outbound IMAP login with
 * caller-supplied credentials, a rule seeder, a ticket batch, the report writes, and a semantic
 * search that spends embedding tokens. Folding the check into the one function every handler
 * already has to call makes forgetting it impossible rather than merely unlikely.
 *
 * `need` says which of Care's two grants the caller must hold: `"use"` (open, read, reply,
 * triage) or `"manage"` (connect a channel, edit a rule, add a client, clear a backlog). A
 * trusted API-key caller has no per-user identity, so `assertCan(null, …)` passes it and server
 * integrations keep working.
 */

import { prisma } from "@/lib/prisma";
import { workspaceIdForRequest } from "@/server/workspaces/scope";
import {
  assertCan,
  canManageSupport,
  canUseSupport,
  getEffectiveUserOrNull,
} from "@/server/auth/effective-user";

function notFound(what: string): Error {
  return Object.assign(new Error(`${what} not found`), { status: 404 });
}

/** True when `clientId` is a Care client in `workspaceId`. */
export async function supportClientInWorkspace(clientId: string, workspaceId: string): Promise<boolean> {
  const count = await prisma.supportClient.count({ where: { id: clientId, workspaceId } });
  return count > 0;
}

/** Which of Care's two grants a handler needs. */
export type SupportNeed = "use" | "manage";

const NEED_LABEL: Record<SupportNeed, string> = {
  use: "open Care",
  manage: "set up Care",
};

/** Refuse a caller who does not hold the Care grant this handler needs. */
export async function assertSupportPermission(req: Request, need: SupportNeed): Promise<void> {
  const user = await getEffectiveUserOrNull(req);
  assertCan(user, need === "manage" ? canManageSupport : canUseSupport, NEED_LABEL[need]);
}

/**
 * The caller's workspace id, once they are proven to hold Care and `clientId` is proven to be a
 * Care client in their workspace. A 403 for the first, a 404 for the second. Call this before
 * anything else in a `[clientId]` handler.
 *
 * The permission is checked BEFORE the lookup on purpose: someone with no Care grant at all
 * should be told so, not told whether a client id exists.
 */
export async function requireSupportClient(
  req: Request,
  clientId: string,
  need: SupportNeed = "use",
): Promise<string> {
  await assertSupportPermission(req, need);
  const workspaceId = await workspaceIdForRequest(req);
  if (!(await supportClientInWorkspace(clientId, workspaceId))) throw notFound("Care client");
  return workspaceId;
}

/**
 * The caller's workspace id for a Care route that names no client — the workspace-wide roll-ups
 * and the client list. Same two grants, same API-key passthrough.
 */
export async function requireSupportWorkspace(req: Request, need: SupportNeed = "use"): Promise<string> {
  await assertSupportPermission(req, need);
  return workspaceIdForRequest(req);
}

export type SupportRowKind =
  | "conversation"
  | "ticket"
  | "connection"
  | "report"
  | "draftAction"
  | "workflowRule";

const ROW_LABEL: Record<SupportRowKind, string> = {
  conversation: "Conversation",
  ticket: "Ticket",
  connection: "Connection",
  report: "Report",
  draftAction: "Draft action",
  workflowRule: "Workflow rule",
};

/**
 * For routes that name a row under the client (`conversations/[convId]`, `tickets/[ticketId]`,
 * …): the row must belong to that client, which `requireSupportClient` already placed in the
 * caller's workspace. Otherwise a 404.
 */
export async function requireSupportRow(kind: SupportRowKind, rowId: string, clientId: string): Promise<void> {
  const where = { id: rowId, clientId };
  const count =
    kind === "conversation"
      ? await prisma.supportConversation.count({ where })
      : kind === "ticket"
        ? await prisma.supportTicket.count({ where })
        : kind === "connection"
          ? await prisma.accountConnection.count({ where })
          : kind === "report"
            ? await prisma.supportReport.count({ where })
            : kind === "draftAction"
              ? await prisma.draftSupportAction.count({ where })
              : await prisma.supportWorkflowRule.count({ where });
  if (count === 0) throw notFound(ROW_LABEL[kind]);
}

/** Batch form: every id must be a row of that client, or a 404 naming nothing in particular. */
export async function requireSupportRows(kind: "conversation" | "ticket", rowIds: string[], clientId: string): Promise<void> {
  const ids = [...new Set(rowIds)];
  if (ids.length === 0) return;
  const where = { id: { in: ids }, clientId };
  const count =
    kind === "conversation"
      ? await prisma.supportConversation.count({ where })
      : await prisma.supportTicket.count({ where });
  if (count !== ids.length) throw notFound(ROW_LABEL[kind]);
}

/** The Care report by id, inside the caller's workspace, or a 404. Returns its client id. */
export async function requireSupportReportInWorkspace(req: Request, reportId: string): Promise<string> {
  await assertSupportPermission(req, "use");
  const workspaceId = await workspaceIdForRequest(req);
  const row = await prisma.supportReport.findFirst({
    where: { id: reportId, client: { workspaceId } },
    select: { clientId: true },
  });
  if (!row) throw notFound("Report");
  return row.clientId;
}

/** A Portal client being linked to a Care client must be in the same workspace, or a 404. */
export async function requireWorkspaceClientInWorkspace(workspaceClientId: string, workspaceId: string): Promise<void> {
  const count = await prisma.workspaceClient.count({ where: { id: workspaceClientId, workspaceId } });
  if (count === 0) throw notFound("Client");
}
