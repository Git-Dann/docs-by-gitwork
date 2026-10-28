/**
 * Which modules a BUSINESS (workspace) has — the layer above roles and permissions.
 *
 * Roles answer "what may this person do inside their workspace". This answers "what
 * did this workspace get at all": a business on Foundry without Pulse must not reach
 * Pulse even as its own Super Admin, so this check runs BEFORE the role bypass in the
 * middleware. See docs/multi-tenant-roadmap.md, Phase 0.
 *
 * Framework-free on purpose: the edge middleware, server routes and client components
 * all import it, so they can never disagree about what a module covers.
 *
 * The workspace stores `modulesRestricted` + `enabledModules`. Unrestricted (the
 * default, and Gitwork) means everything — so adding this changed nothing for any
 * existing workspace. The resolved value travels as `string[] | null`: null means
 * "no restriction", never "no modules".
 */

export interface WorkspaceModuleDef {
  id: string;
  label: string;
  /** One line for the Platform console. */
  description: string;
  /** Page prefixes (anchored on a path segment) this module owns. */
  pagePrefixes: string[];
  /** API prefixes (anchored on a path segment) this module owns. */
  apiPrefixes: string[];
}

/**
 * The catalogue. Ids reuse the permission ids where one exists (`pulse`, `clients`,
 * `proposals` …) so a module and the permission that gates it inside a workspace are
 * the same word.
 *
 * ⚠️ A prefix listed here is refused to EVERY member of a workspace without the module,
 * admins included. Only list paths that belong to the module alone — a shared route
 * (settings, account, notifications) must never appear here.
 */
export const WORKSPACE_MODULES: WorkspaceModuleDef[] = [
  {
    id: "pulse",
    label: "Pulse",
    description: "Project health checks, monitors and the code portfolio",
    pagePrefixes: ["/app/pulse", "/app/study", "/app/settings/checks"],
    apiPrefixes: ["/api/pulse", "/api/study"],
  },
  {
    id: "provenance",
    label: "Provenance",
    description: "Countermark attestations struck from Pulse scans",
    pagePrefixes: ["/app/provenance"],
    apiPrefixes: ["/api/provenance"],
  },
  {
    id: "codeclear",
    label: "Staff",
    description: "The people roster: profiles, placements, rates and availability",
    pagePrefixes: ["/app/code", "/app/codeclear"],
    // Not /api/rate-card: Docs costing reads it too, so it is shared ground.
    apiPrefixes: ["/api/codeclear"],
  },
  {
    id: "devsignal",
    label: "Hiring",
    description: "Developer vetting: GitHub analysis, scores, DevSignal and the pipeline",
    pagePrefixes: ["/app/codeclear/devsignal", "/app/codeclear/pipeline"],
    apiPrefixes: ["/api/devsignal"],
  },
  {
    id: "proposals",
    label: "Docs",
    description: "Proposals, contracts and documents",
    pagePrefixes: ["/app/docs", "/app/proposals", "/app/templates", "/app/proof"],
    apiPrefixes: ["/api/proposals", "/api/documents", "/api/templates", "/api/proof", "/api/snippets"],
  },
  {
    id: "clients",
    label: "Portal",
    description: "Clients, projects, tasks and client wikis",
    pagePrefixes: ["/app/portal", "/app/clients", "/app/projects"],
    apiPrefixes: [],
  },
  {
    id: "support",
    label: "Care",
    description: "Client support inbox and reports",
    pagePrefixes: ["/app/care", "/app/support"],
    apiPrefixes: ["/api/support"],
  },
  {
    id: "backstage",
    label: "Backstage",
    description: "Leave, expenses and staffing",
    pagePrefixes: ["/app/backstage"],
    apiPrefixes: ["/api/backstage"],
  },
  {
    id: "handbook",
    label: "Handbook",
    description: "The internal knowledgebase",
    pagePrefixes: ["/app/handbook"],
    apiPrefixes: ["/api/handbook"],
  },
  {
    id: "starters",
    label: "Starters",
    description: "Prompt and skill library",
    pagePrefixes: ["/app/starters", "/app/settings/curator"],
    apiPrefixes: ["/api/starters", "/api/starter-recipes"],
  },
  {
    id: "analytics",
    label: "Analytics",
    description: "Delivery, output and AI usage",
    pagePrefixes: ["/app/analytics"],
    apiPrefixes: ["/api/analytics"],
  },
  {
    id: "labs",
    label: "Labs",
    description: "Experiments: Studio, Deck, Canvas and the Edge board",
    pagePrefixes: ["/app/studio", "/app/settings/labs", "/deck", "/canvas", "/edge"],
    apiPrefixes: [],
  },
  {
    id: "mcp",
    label: "MCP",
    description: "Connect Claude and other AI tools to the workspace",
    pagePrefixes: ["/app/settings/mcp"],
    apiPrefixes: ["/api/mcp"],
  },
];

export const WORKSPACE_MODULE_IDS = WORKSPACE_MODULES.map((m) => m.id);

/**
 * What a new business gets (docs/multi-tenant-roadmap.md, "Default module bundle").
 * Care is out until it is fixed; Pulse, Provenance, Hiring, Labs, Starters and
 * Analytics are Gitwork's. One list, so changing the bundle is one edit.
 */
export const DEFAULT_BUSINESS_MODULES = [
  "clients",
  "proposals",
  "codeclear",
  "backstage",
  "handbook",
  "mcp",
] as const;

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

/**
 * The module that owns a path, or null for shared ground (HQ, settings, account …).
 * Longest prefix wins, so `/app/codeclear/devsignal` belongs to Hiring, not Staff,
 * whatever order the catalogue is in.
 */
export function workspaceModuleForPath(pathname: string): string | null {
  let best: { id: string; length: number } | null = null;
  for (const m of WORKSPACE_MODULES) {
    for (const p of [...m.pagePrefixes, ...m.apiPrefixes]) {
      if (matchesPrefix(pathname, p) && (!best || p.length > best.length)) {
        best = { id: m.id, length: p.length };
      }
    }
  }
  return best?.id ?? null;
}

/**
 * Does this workspace have the module that owns `pathname`?
 *
 * `modules` is the resolved list: null = unrestricted. `undefined` (a session token
 * minted before this field existed) is also treated as unrestricted — it is refreshed
 * within five minutes by the session recheck in src/auth.ts, and every workspace that
 * existed before this was written is unrestricted anyway.
 */
export function workspaceAllowsPath(pathname: string, modules: readonly string[] | null | undefined): boolean {
  if (modules == null) return true;
  const owner = workspaceModuleForPath(pathname);
  return owner === null || modules.includes(owner);
}

/** Does this workspace have the module? Same null rule as workspaceAllowsPath. */
export function workspaceHasModule(moduleId: string, modules: readonly string[] | null | undefined): boolean {
  return modules == null || modules.includes(moduleId);
}

/** The value carried on the session: null when unrestricted, else the known ids only. */
export function resolveWorkspaceModules(ws: { modulesRestricted: boolean; enabledModules: string[] } | null | undefined): string[] | null {
  if (!ws || !ws.modulesRestricted) return null;
  return ws.enabledModules.filter((id) => WORKSPACE_MODULE_IDS.includes(id));
}
