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
export type PermissionCategory = "module" | "feature" | "field";

export interface PermissionDef {
  id: string;
  label: string;
  description: string;
  category: PermissionCategory;
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
    ],
  },
  {
    product: "Code",
    permissions: [
      { id: "codeclear", category: "module", label: "Code", description: "Developer review and validation." },
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
        id: "docs.viewCosts",
        category: "field",
        label: "View costs & margins",
        description: "Cost line-item totals and margins on the proposal Costing breakdown.",
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
        id: "seeAllClients",
        category: "feature",
        label: "See all clients",
        description:
          "Off scopes Portal/Pulse/Care/Study and the task board to clients this user is explicitly assigned.",
      },
    ],
  },
  {
    product: "Care",
    permissions: [
      { id: "support", category: "module", label: "Care", description: "Support and aftercare." },
    ],
  },
  {
    product: "Study",
    permissions: [
      { id: "study", category: "module", label: "Study", description: "AI-powered user research." },
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
        id: "backstage.expenses",
        category: "feature",
        label: "Access Expenses",
        description:
          "See and submit the Expenses tab. Off by default — switch on per person (HR, finance).",
      },
      {
        id: "backstage.approve",
        category: "feature",
        label: "Approve Backstage requests",
        description:
          "Approve/reject leave and review expenses. HR-style access without making the user an Admin.",
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

export const FEATURE_PERMISSIONS = ALL_PERMISSIONS.filter((p) => p.category === "feature").map(
  ({ id, label, description }) => ({ id, label, description, defaultOn: id === "seeAllClients" }),
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
  STAFF: [...MODULE_IDS, "seeAllClients", "code.viewRates", "docs.viewCosts", "rateCard.view"],
  DEVELOPER: ["clients", "support", "pulse", "backstage"],
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
