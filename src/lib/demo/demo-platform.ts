/**
 * Demo data for the Platform console (/demo/platform). Reads and writes go through the
 * SAME pure rules the server uses (parsePlatformWorkspaceQuery, applyPlatformQuery,
 * planWorkspaceUpdate), so a bad query or a refused save behaves exactly as in the app.
 * A demo where every write succeeds and changes nothing verifies the CSS and nothing else.
 *
 * There are enough businesses (45) to show paging, search and the filters working.
 */

import type { PlatformAuditItem, PlatformWorkspace, PlatformWorkspaceUpdate } from "@/lib/platform-types";
import { DEFAULT_BUSINESS_MODULES } from "@/lib/workspace-modules";
import {
  PlatformConflictError,
  PlatformInputError,
  applyPlatformQuery,
  parsePlatformAuditQuery,
  parsePlatformWorkspaceQuery,
  planWorkspaceUpdate,
} from "@/lib/platform-rules";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const NAMES = [
  "Northwind Studio", "Fairway Nine Ltd", "Harbour & Hale", "Brightwater Digital", "Oakmere Consulting",
  "Pennine Joinery", "Copperleaf Design", "Lantern Health", "Saltmarsh Media", "Kestrel Logistics",
  "Bramble & Birch", "Quayside Legal", "Ironbridge Engineering", "Meadowlark Events", "Thistle Analytics",
  "Riverbank Dental", "Cobalt Robotics", "Wren Architecture", "Highgate Lettings", "Mosswood Coffee",
  "Northgate Accountants", "Silverline Fitness", "Ashdown Builders", "Bluebell Nurseries", "Granite Security",
  "Larkspur Marketing", "Pebble & Pine", "Foxglove Interiors", "Summit Outdoor", "Tidewater Charters",
  "Heron Software", "Elmstead Vets", "Juniper Payroll", "Marlow Print Co", "Orchard Learning",
  "Rookery Games", "Sable Recruitment", "Tamar Solar", "Umber Studio", "Vale Property Group",
  "Willow Care", "Yarrow Botanics", "Zephyr Travel", "Anvil Fabrication",
];

const slugify = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const workspaces: PlatformWorkspace[] = [
  {
    id: "ws-gitwork",
    name: "Foundry by Gitwork",
    slug: "gitwork",
    createdAt: daysAgo(400),
    updatedAt: daysAgo(30),
    isHome: true,
    activeMembers: 28,
    modulesRestricted: false,
    enabledModules: [],
    platformAiKeysAllowed: true,
  },
  // Deterministic, so the demo looks the same on every load and screenshots compare.
  ...NAMES.map((name, i): PlatformWorkspace => {
    const restricted = i % 5 !== 3;
    return {
      id: `ws-${slugify(name)}`,
      name,
      slug: slugify(name),
      createdAt: daysAgo(2 + i * 6),
      updatedAt: daysAgo(1 + i * 3),
      isHome: false,
      activeMembers: 1 + ((i * 7) % 23),
      modulesRestricted: restricted,
      enabledModules: restricted
        ? i % 4 === 1
          ? ["clients", "proposals", "codeclear", "backstage"]
          : [...DEFAULT_BUSINESS_MODULES]
        : [],
      platformAiKeysAllowed: i % 6 === 2,
    };
  }),
];

type DemoAudit = PlatformAuditItem & { workspaceId: string };

const audit: DemoAudit[] = [
  {
    id: "pa-2",
    workspaceId: "ws-fairway-nine-ltd",
    action: "platform.workspace.settings_changed",
    workspaceName: "Fairway Nine Ltd",
    actorName: "Dan Lindsay",
    createdAt: daysAgo(2),
    before: { modulesRestricted: true, enabledModules: ["clients", "proposals", "codeclear", "backstage", "handbook"], platformAiKeysAllowed: false },
    after: { modulesRestricted: true, enabledModules: ["clients", "proposals", "codeclear", "backstage"], platformAiKeysAllowed: false },
  },
  {
    id: "pa-1",
    workspaceId: "ws-northwind-studio",
    action: "platform.workspace.settings_changed",
    workspaceName: "Northwind Studio",
    actorName: "Harry Brown",
    createdAt: daysAgo(9),
    before: { modulesRestricted: true, enabledModules: [...DEFAULT_BUSINESS_MODULES], platformAiKeysAllowed: true },
    after: { modulesRestricted: true, enabledModules: [...DEFAULT_BUSINESS_MODULES], platformAiKeysAllowed: false },
  },
];

const refuse = (err: unknown) => {
  // The interceptor answers 200 for anything returned, so surface a refusal the way
  // the hook reads it: an error field plus the status the server would send.
  if (err instanceof PlatformConflictError) return { error: err.message, __status: 409 };
  if (err instanceof PlatformInputError) return { error: err.message, __status: 400 };
  throw err;
};

export function resolveDemoPlatform(
  pathname: string,
  init?: { method?: string; body?: unknown },
  search?: URLSearchParams,
): unknown {
  const params = search ?? new URLSearchParams();
  const method = init?.method ?? "GET";

  if (pathname === "/api/platform/workspaces" && method === "GET") {
    try {
      return applyPlatformQuery(workspaces, parsePlatformWorkspaceQuery(params));
    } catch (err) {
      return refuse(err);
    }
  }

  if (pathname === "/api/platform/audit" && method === "GET") {
    let q: ReturnType<typeof parsePlatformAuditQuery>;
    try {
      q = parsePlatformAuditQuery(params);
    } catch (err) {
      return refuse(err);
    }
    const matched = q.workspaceId ? audit.filter((a) => a.workspaceId === q.workspaceId) : audit;
    const pages = Math.max(1, Math.ceil(matched.length / q.pageSize));
    const page = Math.min(q.page, pages - 1);
    return {
      entries: matched.slice(page * q.pageSize, (page + 1) * q.pageSize).map(({ workspaceId: _w, ...e }) => e),
      total: matched.length,
      page,
      pageSize: q.pageSize,
    };
  }

  const match = pathname.match(/^\/api\/platform\/workspaces\/([^/]+)$/);
  if (!match) return undefined;
  const ws = workspaces.find((w) => w.id === decodeURIComponent(match[1]));
  if (!ws) return { error: "Business not found", __status: 404 };
  if (method === "GET") return { workspace: { ...ws } };
  if (method !== "PATCH") return undefined;

  const input = (typeof init?.body === "string" ? JSON.parse(init.body) : {}) as PlatformWorkspaceUpdate;
  let plan: ReturnType<typeof planWorkspaceUpdate>;
  try {
    plan = planWorkspaceUpdate(ws, input);
  } catch (err) {
    return refuse(err);
  }
  const { before, next, changed } = plan;
  if (!changed) return { workspace: { ...ws } };
  Object.assign(ws, next, { updatedAt: new Date().toISOString() });
  audit.unshift({
    id: `pa-${audit.length + 1}`,
    workspaceId: ws.id,
    action: "platform.workspace.settings_changed",
    workspaceName: ws.name,
    actorName: "You (demo)",
    createdAt: new Date().toISOString(),
    before,
    after: next,
  });
  return { workspace: { ...ws } };
}
