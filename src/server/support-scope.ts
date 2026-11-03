/**
 * Finding a Care client, and the rows under it, inside the caller's workspace (Phase 2.2b, Care).
 *
 * Every `/api/support/clients/[clientId]/**` route used to load its client (and any
 * conversation, ticket, connection, report, draft or rule it named) by id alone, so another
 * business's id answered. Each route now resolves the client here first, and any row it names
 * is checked to belong to that client. A row elsewhere reads as a 404, the same as an id that
 * doesn't exist.
 */

import { prisma } from "@/lib/prisma";
import { workspaceIdForRequest } from "@/server/workspaces/scope";

function notFound(what: string): Error {
  return Object.assign(new Error(`${what} not found`), { status: 404 });
}

/** True when `clientId` is a Care client in `workspaceId`. */
export async function supportClientInWorkspace(clientId: string, workspaceId: string): Promise<boolean> {
  const count = await prisma.supportClient.count({ where: { id: clientId, workspaceId } });
  return count > 0;
}

/**
 * The caller's workspace id, once `clientId` is proven to be a Care client in it. A 404
 * otherwise. Call this before anything else in a `[clientId]` handler.
 */
export async function requireSupportClient(req: Request, clientId: string): Promise<string> {
  const workspaceId = await workspaceIdForRequest(req);
  if (!(await supportClientInWorkspace(clientId, workspaceId))) throw notFound("Care client");
  return workspaceId;
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
