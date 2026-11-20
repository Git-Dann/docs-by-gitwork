/**
 * Every Care handler under `api/support/` finds its client (and any row it names) in the
 * caller's workspace (multi-tenant Phase 2.2b, Care).
 *
 * These routes used to load a Care client, conversation or ticket by id alone, so another
 * business's id answered. The isolation suite only proves the reads it can see, so a new route
 * here has to say how it is scoped, and this test fails until it does.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const CLIENT_ROOT = join(ROOT, "clients", "[clientId]");

/**
 * `webhook/[token]` resolves its connection by the token in the URL: the token IS the credential,
 * which is the whole posture of a push endpoint.
 *
 * ⚠️ This list used to also hold `discord/channels`, with a note saying what the route does
 * ("lists a Discord guild with the bot token the caller supplies") rather than why that made it
 * safe — and it was not safe: it had no permission check, no workspace scope and no client in its
 * path, so any authenticated account in any workspace could have Foundry call Discord with a
 * guild id and a bot token of their choosing. An exemption must say why the route is safe
 * WITHOUT the gate, not describe its job. The route now lives under `clients/[clientId]/`.
 */
const EXEMPT = new Set(["webhook/[token]/route.ts"]);

/**
 * Care has two grants and both are checked in one place, `requireSupportClient` /
 * `requireSupportWorkspace`, whose `need` argument says which. `"use"` (the default) is open,
 * read, reply and triage; `"manage"` is setup — connectors, rules, clients, reports, the
 * destructive ones.
 *
 * ⚠️ `/api/support/**` is NOT covered by the module gate, which only reads `/app` paths, so these
 * asserts are the whole enforcement. An audit found ELEVEN handlers with none at all, including a
 * connector purge, a full history re-pull, an outbound IMAP login with caller-supplied
 * credentials, and `POST …/messages` — which sends real mail to a client's customer, in the
 * client's name, from the client's mailbox. Hence the table below rather than trust.
 */
const MANAGE: Record<string, string[]> = {
  "clients/[clientId]/route.ts": ["PATCH", "DELETE"],
  "clients/[clientId]/connections/route.ts": ["POST"],
  "clients/[clientId]/connections/[connId]/route.ts": ["PATCH", "DELETE"],
  "clients/[clientId]/connections/[connId]/sync/route.ts": ["POST"],
  "clients/[clientId]/connections/[connId]/purge/route.ts": ["DELETE"],
  "clients/[clientId]/connections/test-imap/route.ts": ["POST"],
  "clients/[clientId]/conversations/route.ts": ["POST"],
  "clients/[clientId]/discord/channels/route.ts": ["POST"],
  "clients/[clientId]/draft-actions/route.ts": ["POST"],
  "clients/[clientId]/draft-actions/[draftId]/route.ts": ["PATCH"],
  "clients/[clientId]/reports/route.ts": ["POST"],
  "clients/[clientId]/reports/[reportId]/route.ts": ["PATCH", "DELETE"],
  "clients/[clientId]/reports/generate-doc/route.ts": ["POST"],
  "clients/[clientId]/seed-rules/route.ts": ["POST"],
  "clients/[clientId]/sync/route.ts": ["POST"],
  "clients/[clientId]/tickets/route.ts": ["POST"],
  "clients/[clientId]/tickets/[ticketId]/route.ts": ["PATCH", "DELETE"],
  "clients/[clientId]/tickets/batch/route.ts": ["PATCH"],
  "clients/[clientId]/workflow-rules/route.ts": ["POST"],
  "clients/[clientId]/workflow-rules/[ruleId]/route.ts": ["PATCH", "DELETE"],
};

/** Any of these, inside a handler outside `[clientId]`, means it reads the caller's workspace. */
const WORKSPACE_SCOPED_BY = [
  "requireSupportWorkspace(",
  "workspaceIdForRequest(",
  "requestWorkspaceId(",
  "user.workspaceId",
  "requireSupportReportInWorkspace(",
];

/** The row a `[segment]` names, and the kind `requireSupportRow` checks it as. */
const ROW_KIND: Record<string, string> = {
  convId: "conversation",
  ticketId: "ticket",
  connId: "connection",
  reportId: "report",
  draftId: "draftAction",
  ruleId: "workflowRule",
};

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : routes(path);
    return name === "route.ts" ? [path] : [];
  });
}

function handlers(file: string): Array<{ method: string; body: string }> {
  return readFileSync(file, "utf8")
    .split(/(?=export async function (?:GET|POST|PUT|PATCH|DELETE)\b)/)
    .slice(1)
    .map((body) => ({ method: body.match(/export async function (\w+)/)?.[1] ?? "?", body }));
}

describe("Care routes are scoped to the caller's workspace", () => {
  const files = routes(ROOT).filter((f) => !EXEMPT.has(relative(ROOT, f)));
  const clientFiles = files.filter((f) => f.startsWith(CLIENT_ROOT));

  it("finds the routes (a broken walker would pass everything)", () => {
    expect(clientFiles.length).toBeGreaterThan(35);
  });

  it("every [clientId] handler proves the client is in the caller's workspace", () => {
    const unscoped: string[] = [];
    for (const file of clientFiles) {
      for (const { method, body } of handlers(file)) {
        if (!body.includes("requireSupportClient(")) unscoped.push(`${method} ${relative(ROOT, file)}`);
      }
    }
    expect(unscoped, "Call requireSupportClient(request, clientId) in these handlers").toEqual([]);
  });

  it("every handler that names a row under the client checks it belongs to that client", () => {
    const missing: string[] = [];
    for (const file of clientFiles) {
      const rel = relative(CLIENT_ROOT, file);
      const segments = [...rel.matchAll(/\[(\w+)\]/g)].map((m) => m[1]).filter((s) => s in ROW_KIND);
      for (const { method, body } of handlers(file)) {
        for (const seg of segments) {
          if (!body.includes(`requireSupportRow("${ROW_KIND[seg]}", ${seg}, clientId)`)) missing.push(`${method} ${rel} (${seg})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("every other Care handler reads the caller's workspace", () => {
    const unscoped: string[] = [];
    for (const file of files.filter((f) => !f.startsWith(CLIENT_ROOT))) {
      for (const { method, body } of handlers(file)) {
        if (!WORKSPACE_SCOPED_BY.some((n) => body.includes(n))) unscoped.push(`${method} ${relative(ROOT, file)}`);
      }
    }
    expect(unscoped).toEqual([]);
  });

  it("setup and destructive handlers need the manage grant", () => {
    const wrong: string[] = [];
    for (const file of clientFiles) {
      const rel = relative(ROOT, file);
      const needsManage = new Set(MANAGE[rel] ?? []);
      for (const { method, body } of handlers(file)) {
        const asksManage = body.includes('requireSupportClient(request, clientId, "manage")')
          || body.includes('requireSupportClient(req, clientId, "manage")');
        if (needsManage.has(method) && !asksManage) wrong.push(`${method} ${rel} should ask for "manage"`);
        if (!needsManage.has(method) && asksManage) wrong.push(`${method} ${rel} asks for "manage" but is not in MANAGE`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("the table names routes that exist (a renamed file must not silently drop its gate)", () => {
    const present = new Set(clientFiles.map((f) => relative(ROOT, f)));
    expect(Object.keys(MANAGE).filter((k) => !present.has(k))).toEqual([]);
  });

  it("no Care route looks anything up in Gitwork's workspace", () => {
    const offenders = routes(ROOT).filter((file) => {
      const src = readFileSync(file, "utf8");
      return src.includes("ensureBaseRecords(") || src.includes("DEFAULT_WORKSPACE_SLUG");
    });
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });
});
