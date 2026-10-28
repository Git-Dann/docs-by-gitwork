/**
 * Demo data for the Platform console (/demo/platform). Writes are applied to this
 * in-memory copy through the SAME rules the server uses (planWorkspaceUpdate is pure),
 * so a save on the demo can be refused exactly as it would be in the app — a demo
 * where every write succeeds and changes nothing verifies the CSS and nothing else.
 */

import type { PlatformAuditItem, PlatformWorkspace, PlatformWorkspaceUpdate } from "@/lib/platform-types";
import { DEFAULT_BUSINESS_MODULES } from "@/lib/workspace-modules";
import { PlatformInputError, planWorkspaceUpdate } from "@/lib/platform-rules";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const workspaces: PlatformWorkspace[] = [
  {
    id: "ws-gitwork",
    name: "Foundry by Gitwork",
    slug: "gitwork",
    createdAt: daysAgo(400),
    isHome: true,
    activeMembers: 28,
    modulesRestricted: false,
    enabledModules: [],
    platformAiKeysAllowed: true,
  },
  {
    id: "ws-northwind",
    name: "Northwind Studio",
    slug: "northwind",
    createdAt: daysAgo(12),
    isHome: false,
    activeMembers: 6,
    modulesRestricted: true,
    enabledModules: [...DEFAULT_BUSINESS_MODULES],
    platformAiKeysAllowed: false,
  },
  {
    id: "ws-fairway",
    name: "Fairway Nine Ltd",
    slug: "fairway-nine",
    createdAt: daysAgo(3),
    isHome: false,
    activeMembers: 2,
    modulesRestricted: true,
    enabledModules: ["clients", "proposals", "codeclear", "backstage"],
    platformAiKeysAllowed: false,
  },
];

const audit: PlatformAuditItem[] = [
  {
    id: "pa-1",
    action: "platform.workspace.settings_changed",
    workspaceName: "Fairway Nine Ltd",
    actorName: "Dan Lindsay",
    createdAt: daysAgo(2),
    before: { modulesRestricted: true, enabledModules: ["clients", "proposals", "codeclear", "backstage", "handbook"], platformAiKeysAllowed: false },
    after: { modulesRestricted: true, enabledModules: ["clients", "proposals", "codeclear", "backstage"], platformAiKeysAllowed: false },
  },
];

export function resolveDemoPlatform(pathname: string, init?: { method?: string; body?: unknown }): unknown {
  if (pathname === "/api/platform/workspaces") return { workspaces };
  if (pathname === "/api/platform/audit") return { entries: audit };
  const match = pathname.match(/^\/api\/platform\/workspaces\/([^/]+)$/);
  if (match && init?.method === "PATCH") {
    const ws = workspaces.find((w) => w.id === decodeURIComponent(match[1]));
    if (!ws) return { error: "Workspace not found" };
    const input = (typeof init.body === "string" ? JSON.parse(init.body) : {}) as PlatformWorkspaceUpdate;
    let plan: ReturnType<typeof planWorkspaceUpdate>;
    try {
      plan = planWorkspaceUpdate(ws, input);
    } catch (err) {
      // The interceptor answers 200 for anything returned, so surface the refusal the
      // way the hook reads it: an error field it will throw on.
      if (err instanceof PlatformInputError) return { error: err.message, __status: 400 };
      throw err;
    }
    const { before, next, changed } = plan;
    Object.assign(ws, next);
    if (!changed) return { workspace: { ...ws } };
    audit.unshift({
      id: `pa-${audit.length + 1}`,
      action: "platform.workspace.settings_changed",
      workspaceName: ws.name,
      actorName: "You (demo)",
      createdAt: new Date().toISOString(),
      before,
      after: next,
    });
    return { workspace: { ...ws } };
  }
  return undefined;
}
