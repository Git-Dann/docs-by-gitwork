import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      permissions: string[];
      /** Bumped to force re-auth — see SESSION_VERSION in auth.config.ts. */
      sessionVersion?: number;
    } & DefaultSession["user"];
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Roles & Permissions
//
// The model: a workspace-level role matrix (Workspace.rolePermissions) is the
// source of truth for what each *configurable* role (ADMIN / STAFF / DEVELOPER)
// can do. SUPER_ADMIN is implicit-all and never stored. Each member may carry a
// per-person delta (WorkspaceMember.permissionOverrides). Their resolved
// effective list is cached on WorkspaceMember.permissions and recomputed whenever
// the matrix, their role, or their overrides change — so every existing consumer
// (middleware JWT, requireAuthedUser, the can* helpers) keeps reading one field.
// ════════════════════════════════════════════════════════════════════════════

// ── Roles ────────────────────────────────────────────────────────────────────
export type RoleId = "SUPER_ADMIN" | "ADMIN" | "STAFF" | "DEVELOPER";

export interface RoleDef {
  id: RoleId;
  label: string;
  /** Higher = more powerful. Used for ">=" comparisons (isAtLeast). */
  rank: number;
  /** SUPER_ADMIN is implicit-all and not editable in the matrix. */
  configurable: boolean;
  description: string;
}

export const ROLES: readonly RoleDef[] = [
  {
    id: "SUPER_ADMIN",
    label: "Super Admin",
    rank: 100,
    configurable: false,
    description:
      "Full, unrestricted access — including the Roles & Permissions matrix itself. Cannot be limited.",
  },
  {
    id: "ADMIN",
    label: "Admin",
    rank: 80,
    configurable: true,
    description:
      "Broad workspace access. Limited only by the role matrix and the Super-Admin-only controls.",
  },
  {
    id: "STAFF",
    label: "Staff",
    rank: 40,
    configurable: true,
    description: "Module and field access defined by the role matrix. For HR and operational staff.",
  },
  {
    id: "DEVELOPER",
    label: "Developer",
    rank: 20,
    configurable: true,
    description:
      "Minimal access — typically their own clients and project tooling, no rates or costs.",
  },
] as const;

const ROLE_BY_ID = new Map<string, RoleDef>(ROLES.map((r) => [r.id, r]));

/** The roles a Super Admin can configure in the matrix (everyone except SUPER_ADMIN). */
export const CONFIGURABLE_ROLES: readonly RoleDef[] = ROLES.filter((r) => r.configurable);
export type ConfigurableRoleId = "ADMIN" | "STAFF" | "DEVELOPER";

export function roleLabel(role: string): string {
  return ROLE_BY_ID.get(role)?.label ?? role;
}

/** Numeric power of a role; unknown roles rank lowest (0). */
export function roleRank(role: string): number {
  return ROLE_BY_ID.get(role)?.rank ?? 0;
}

export function isSuperAdmin(role: string): boolean {
  return role === "SUPER_ADMIN";
}

/** True if `role` is at least as powerful as `min` (SUPER_ADMIN satisfies "ADMIN"). */
export function isAtLeast(role: string, min: RoleId): boolean {
  return roleRank(role) >= roleRank(min);
}

/**
 * Guardrail: can an actor with `actorRole` assign / edit / remove a member who
 * currently has (or is being moved to) `targetRole`? You can never act on a role
 * at or above your own — so only a Super Admin can touch Admins and Super Admins,
 * and an Admin manages only Staff and Developers. (Prevents self-escalation, which
 * would otherwise defeat the Super-Admin-only matrix lock.)
 */
export function canManageRole(actorRole: string, targetRole: string): boolean {
  if (isSuperAdmin(actorRole)) return true;
  return roleRank(actorRole) > roleRank(targetRole);
}

// ── Permission catalog ─────────────────────────────────────────────────────────
export type PermissionCategory = "module" | "feature" | "field" | "settings" | "action";

export interface PermissionDef {
  id: string;
  label: string;
  description: string;
  category: PermissionCategory;
  /** Dangerous/irreversible or externally-visible action — flagged in the matrix UI
   *  and defaulted to Admin-only (never granted to STAFF/DEVELOPER out of the box). */
  highRisk?: boolean;
}

export interface ProductPermissions {
  product: string;
  permissions: readonly PermissionDef[];
}

/**
 * The full catalog, grouped by product. This is the single source of truth for
 * every permission id in the system. `module` ids gate /app/* routes (sidebar
 * items); `feature` ids are cross-cutting flags; `field` ids gate buried data
 * (rates, costs) within a product.
 */
export const PERMISSION_CATALOG: readonly ProductPermissions[] = [
  {
    product: "Pulse",
    permissions: [
      { id: "pulse", category: "module", label: "Pulse", description: "Health and delivery tracking." },
      {
        id: "pulse.manage",
        category: "action",
        label: "Manage scans",
        description: "Create and delete Pulse scans. Without it, Pulse is view-only.",
      },
      {
        id: "pulse.fixAgent",
        category: "action",
        label: "Run fix-agent",
        description: "Trigger the auto-fix agent, which opens pull requests on the client's GitHub repo.",
        highRisk: true,
      },
    ],
  },
  {
    product: "Code",
    permissions: [
      { id: "codeclear", category: "module", label: "Code", description: "Developer review and validation." },
      {
        id: "code.manage",
        category: "action",
        label: "Manage candidates",
        description: "Add, edit and delete candidates and run analysis. Without it, Code is view-only.",
      },
      {
        id: "code.viewRates",
        category: "field",
        label: "View candidate rates",
        description:
          "Candidate hourly rate and tier rate defaults inside Code. Off for developer accounts.",
      },
    ],
  },
  {
    product: "Docs",
    permissions: [
      { id: "proposals", category: "module", label: "Docs", description: "Proposals and client documents." },
      {
        id: "docs.manage",
        category: "action",
        label: "Manage documents",
        description: "Create, edit and delete documents. Without it, Docs is view-only.",
      },
      {
        id: "docs.share",
        category: "action",
        label: "Share documents publicly",
        description: "Generate public share links for documents (anyone with the link can view).",
        highRisk: true,
      },
      {
        id: "docs.viewCosts",
        category: "field",
        label: "View costs & margins",
        description: "Cost line-item totals and margins on the proposal Costing breakdown.",
      },
      {
        id: "docs.viewAdminTypes",
        category: "feature",
        label: "See proposals & contracts",
        description:
          "Access the admin document types (proposals, SLA/SOW/MSA/NDA/CO/DSA). Off scopes Docs to the lightweight types (handover, status report, brief, blank) — the default for developers.",
      },
      {
        id: "rateCard.view",
        category: "field",
        label: "View rate card",
        description: "The Rate Card (people + day rates) and the day rates pulled into proposal costing.",
      },
    ],
  },
  {
    product: "Portal",
    permissions: [
      { id: "clients", category: "module", label: "Portal", description: "Client management." },
      {
        id: "clients.manage",
        category: "action",
        label: "Manage clients",
        description: "Create, edit and delete clients and their details. Without it, Portal is view-only.",
      },
      {
        id: "clients.shareTimeline",
        category: "action",
        label: "Share client timelines",
        description: "Publish a public, no-login timeline link for a client.",
        highRisk: true,
      },
      {
        id: "seeAllClients",
        category: "feature",
        label: "See all clients",
        description:
          "Off scopes Portal/Pulse/Care/Study and the task board to clients this user is explicitly assigned.",
      },
      {
        id: "clients.viewFinancials",
        category: "field",
        label: "View client cost & working days",
        description:
          "The monthly dev cost and working-days figures on Portal client cards. Sensitive — Super Admins always have it; toggle per person.",
      },
    ],
  },
  {
    product: "Care",
    permissions: [
      { id: "support", category: "module", label: "Care", description: "Support and aftercare." },
      {
        id: "support.manage",
        category: "action",
        label: "Manage Care setup",
        description: "Connect/disconnect channels and edit workflow rules. Without it, Care is view-only.",
      },
    ],
  },
  {
    product: "Study",
    permissions: [
      { id: "study", category: "module", label: "Study", description: "AI-powered user research." },
      {
        id: "study.manage",
        category: "action",
        label: "Create & run studies",
        description: "Create studies and launch interview runs. Without it, Study is view-only.",
      },
    ],
  },
  {
    product: "Backstage",
    permissions: [
      {
        id: "backstage",
        category: "module",
        label: "Backstage",
        description: "Internal team ops — leave booking and the personal Backstage area.",
      },
      {
        id: "backstage.approve",
        category: "feature",
        label: "Approve Backstage requests",
        description:
          "Approve/reject leave requests. HR-style access without making the user an Admin. (Expenses are Super Admin only.)",
      },
    ],
  },
  {
    product: "Tasks",
    permissions: [
      {
        id: "tasks.publish",
        category: "feature",
        label: "Publish task roll-up",
        description:
          "Publish the consolidated end-of-day task roll-up across all clients (the DevOps lead).",
      },
    ],
  },
  {
    product: "Integrations",
    permissions: [
      {
        id: "mcp.connect",
        category: "feature",
        label: "Connect Claude (MCP)",
        description:
          "Authorize Claude (or any MCP-compatible client) to act on your behalf in Foundry. " +
          "Each connection is per-user and bound by your existing permissions — Claude can't do " +
          "more than you can. Admins and Super Admins hold this by default; grant it to Staff or " +
          "Developers here to let them connect their own Claude. Enforced on the consent screen, " +
          "the OAuth authorize endpoint, and the Connected apps settings.",
      },
    ],
  },
  {
    product: "Studio",
    permissions: [
      {
        // Deliberately a `feature`, not a `module`: STAFF auto-inherits every module id
        // (…MODULE_IDS in DEFAULT_ROLE_PERMISSIONS), which would leak Studio to Staff.
        // As a feature it defaults OFF for everyone except ADMIN (all ids) + SUPER_ADMIN,
        // yet the nav item / middleware still gate on the string "studio". Grantable to
        // Staff later via the matrix if wanted.
        id: "studio",
        category: "feature",
        label: "Studio",
        description:
          "Create branded social assets — carousels, banners, posts and avatars — and batch-export them. Admin/Super Admin only by default.",
      },
    ],
  },
  {
    // Settings sub-sections — each gates one area of Settings. (Team is gated by role,
    // and the Roles & Permissions editor is always Super-Admin-only, so neither appears
    // here.) Default: ADMIN gets all of these, STAFF/DEVELOPER none — matching the old
    // single "Admin" gate — but a Super Admin can now grant or remove them per role.
    product: "Settings",
    permissions: [
      {
        id: "settings.general",
        category: "settings",
        label: "General settings",
        description: "Workspace proposal defaults.",
      },
      {
        id: "settings.branding",
        category: "settings",
        label: "Branding",
        description: "Cover assets and accents applied to every document.",
      },
      {
        id: "settings.content",
        category: "settings",
        label: "Content",
        description: "Confidentiality copy and reusable objective snippets.",
      },
      {
        id: "settings.templates",
        category: "settings",
        label: "Templates",
        description: "Document section templates.",
      },
      {
        id: "settings.integrations",
        category: "settings",
        label: "Integrations & keys",
        description: "AI providers, Google, Slack and email — including their API keys.",
      },
      {
        id: "settings.agents",
        category: "settings",
        label: "Agents & checks",
        description: "Per-agent AI prompts and Pulse check configuration.",
      },
      {
        id: "settings.audit",
        category: "settings",
        label: "Audit log",
        description: "Workspace settings and access history.",
      },
      {
        id: "settings.developer",
        category: "settings",
        label: "Developer settings",
        description: "External API key, demo cleanup, REST reference.",
      },
      {
        id: "settings.privacy",
        category: "settings",
        label: "Privacy & data",
        description: "Data exports, retention and workspace deletion.",
      },
    ],
  },
] as const;

/** Flat list of every permission def, in catalog order. */
export const ALL_PERMISSIONS: readonly PermissionDef[] = PERMISSION_CATALOG.flatMap(
  (p) => p.permissions,
);

/** Every permission id — the resolved set for SUPER_ADMIN. */
export const ALL_PERMISSION_IDS: string[] = ALL_PERMISSIONS.map((p) => p.id);

const PERMISSION_BY_ID = new Map<string, PermissionDef>(ALL_PERMISSIONS.map((p) => [p.id, p]));

export function isValidPermissionId(id: string): boolean {
  return PERMISSION_BY_ID.has(id);
}

// ── Back-compat views over the catalog ──────────────────────────────────────────
// Existing importers (settings-panel.tsx, team-section.tsx) rely on these shapes.
// Derive them from the catalog so there is one source of truth.
export const MODULE_PERMISSIONS = ALL_PERMISSIONS.filter((p) => p.category === "module").map(
  ({ id, label, description }) => ({ id, label, description }),
);
export type ModuleId = string;

// Default-on feature ids — granted automatically to fresh roles + new auto-provisioned
// members so the capability ships usable. Opt-in features (Backstage approve, task roll-up
// publish, MCP connect) stay off by default and require an explicit Super Admin grant per role.
const DEFAULT_ON_FEATURE_IDS = new Set<string>(["seeAllClients", "docs.viewAdminTypes"]);

export const FEATURE_PERMISSIONS = ALL_PERMISSIONS.filter((p) => p.category === "feature").map(
  ({ id, label, description }) => ({
    id,
    label,
    description,
    defaultOn: DEFAULT_ON_FEATURE_IDS.has(id),
  }),
);
export type FeatureId = string;

export const FIELD_PERMISSIONS = ALL_PERMISSIONS.filter((p) => p.category === "field");

// ── Role matrix ─────────────────────────────────────────────────────────────────
export type RoleMatrix = Record<ConfigurableRoleId, string[]>;

const MODULE_IDS = MODULE_PERMISSIONS.map((m) => m.id);

/**
 * Default matrix — mirrors the historical presets so migration is a no-op for
 * effective access until a Super Admin edits it.
 *  • ADMIN: everything (the "most" tier — only the matrix editor itself is reserved to Super Admin).
 *  • STAFF: every module, sees rates/costs/rate-card, sees all clients. No approve/expenses/publish.
 *  • DEVELOPER: very little — their clients (Portal), Care, Pulse, personal Backstage. No Code/Docs/Study,
 *    no rate or cost visibility, no seeAllClients.
 */
export const DEFAULT_ROLE_PERMISSIONS: RoleMatrix = {
  ADMIN: [...ALL_PERMISSION_IDS],
  STAFF: [
    ...MODULE_IDS,
    "seeAllClients",
    "code.viewRates",
    "docs.viewCosts",
    "docs.viewAdminTypes",
    "rateCard.view",
    // Staff can manage (create/edit/delete) within their products by default — but NOT
    // the high-risk actions (fix-agent PRs, public sharing), which stay Admin-only.
    "pulse.manage",
    "code.manage",
    "docs.manage",
    "clients.manage",
    "support.manage",
    "study.manage",
  ],
  // DEVELOPER also gets the Docs module + manage, but WITHOUT docs.viewAdminTypes — so they can
  // create/edit the lightweight docs (handover, status report, brief, blank) and never see or open
  // proposals/contracts. The type boundary is enforced server-side (allowedDocTypesForUser).
  DEVELOPER: ["clients", "support", "pulse", "backstage", "proposals", "docs.manage"],
};

/**
 * Legacy aliases. The old bundled `seeRates` flag mapped to "rate card, day rates
 * on Costing, dev tier defaults" — expand it to the three granular field ids so
 * historical per-member arrays still resolve correctly during migration.
 */
export const LEGACY_PERMISSION_ALIASES: Record<string, string[]> = {
  seeRates: ["code.viewRates", "docs.viewCosts", "rateCard.view"],
};

/** Default permission set for a fresh STAFF member (back-compat export). */
export const DEFAULT_STAFF_PERMISSIONS: string[] = [...DEFAULT_ROLE_PERMISSIONS.STAFF];

// ── Presets (back-compat for the existing Team modal quick buttons) ─────────────
export const PERMISSION_PRESETS = [
  {
    id: "admin",
    label: "Admin",
    role: "ADMIN" as const,
    description: "Broad workspace access; everything except the Super-Admin-only matrix editor.",
    permissions: DEFAULT_ROLE_PERMISSIONS.ADMIN,
  },
  {
    id: "staff",
    label: "Staff (full)",
    role: "STAFF" as const,
    description: "Every module, sees rates and all clients. Default for new hires.",
    permissions: DEFAULT_ROLE_PERMISSIONS.STAFF,
  },
  {
    id: "developer",
    label: "Developer",
    role: "DEVELOPER" as const,
    description: "Restricted: only their assigned clients, no Code or rate visibility.",
    permissions: DEFAULT_ROLE_PERMISSIONS.DEVELOPER,
  },
] as const;

export type PermissionPresetId = (typeof PERMISSION_PRESETS)[number]["id"];

// ── Per-member overrides + resolution ────────────────────────────────────────────
export interface PermissionOverrides {
  grant: string[];
  revoke: string[];
}

export const EMPTY_OVERRIDES: PermissionOverrides = { grant: [], revoke: [] };

/** Coerce an unknown JSON value into a well-formed PermissionOverrides. */
export function normalizeOverrides(raw: unknown): PermissionOverrides {
  const o = (raw ?? {}) as Record<string, unknown>;
  const asStrings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return { grant: asStrings(o.grant), revoke: asStrings(o.revoke) };
}

/** Coerce an unknown JSON value into a well-formed RoleMatrix (falling back to defaults). */
export function normalizeMatrix(raw: unknown): RoleMatrix {
  const m = (raw ?? {}) as Record<string, unknown>;
  const pick = (role: ConfigurableRoleId): string[] => {
    const v = m[role];
    if (!Array.isArray(v)) return [...DEFAULT_ROLE_PERMISSIONS[role]];
    return v.filter((x): x is string => typeof x === "string" && isValidPermissionId(x));
  };
  return { ADMIN: pick("ADMIN"), STAFF: pick("STAFF"), DEVELOPER: pick("DEVELOPER") };
}

function expandAliases(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const alias = LEGACY_PERMISSION_ALIASES[id];
    if (alias) out.push(...alias);
    else out.push(id);
  }
  return out;
}

/**
 * Resolve a member's effective permission ids.
 *   • SUPER_ADMIN → everything.
 *   • otherwise   → (matrix[role] ∪ grant) \ revoke, expanding legacy aliases,
 *                   filtered to ids that still exist in the catalog, in catalog order.
 * Pure and dependency-free so it can run anywhere (edge included).
 */
export function resolveEffectivePermissions(
  role: string,
  matrix: RoleMatrix,
  overrides: PermissionOverrides,
): string[] {
  if (isSuperAdmin(role)) return [...ALL_PERMISSION_IDS];
  const base = matrix[role as ConfigurableRoleId] ?? [];
  const set = new Set<string>(expandAliases(base));
  for (const g of expandAliases(overrides.grant)) set.add(g);
  for (const r of expandAliases(overrides.revoke)) set.delete(r);
  return ALL_PERMISSION_IDS.filter((id) => set.has(id));
}

/** Convenience membership test against an already-resolved permission list. */
export function hasPermission(permissions: string[], id: string): boolean {
  return permissions.includes(id);
}

/**
 * Back-compat: does this resolved list grant the feature? SUPER_ADMIN bypasses.
 * (No external callers today, but kept stable.)
 */
export function hasFeature(role: string, permissions: string[], feature: string): boolean {
  if (isSuperAdmin(role)) return true;
  return permissions.includes(feature);
}
