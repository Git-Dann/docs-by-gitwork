import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      permissions: string[];
      /** The modules the user's business has; null = every module. See src/lib/workspace-modules.ts. */
      workspaceModules?: string[] | null;
      /** The workspace this session is in. Undefined on sessions from before it was carried. */
      workspaceId?: string | null;
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

/**
 * Every role id, in one place, as a tuple the API schemas can build a `z.enum` from.
 *
 * It lives here rather than being written out again in each route because the three
 * `/api/team*` schemas each carried their own copy, and adding GUEST to the platform
 * without adding it to those three made the role real everywhere except the one place
 * that can assign it. `RoleId` is derived from this list, so the type cannot drift
 * from it, and `role-ids.test.ts` holds ROLES and the schemas to it as well.
 */
/**
 * The only roles a password may authenticate.
 *
 * ⚠️ Read the note at the top of `server/auth/password-login.ts` before widening this.
 * `POST /api/auth/forgot-password` is public and sets ANY user's password on a shared
 * recovery key, so a password that authenticates an admin is an account takeover. The
 * pairing is what keeps that route harmless.
 *
 * It lives HERE rather than beside the bcrypt code because client components need the
 * predicate to decide whether to render a "change your password" field, and importing
 * it from the server module would pull Prisma and bcrypt into the browser bundle.
 */
/**
 * Roles that are NOT Gitwork staff. Everything here is external by definition.
 *
 * Used to decide both what a page may show (the gate in server/auth/module-gate.ts)
 * and what the UI should bother rendering — a guest has no Google account, no
 * standup and no colleagues, so several surfaces are noise rather than a leak.
 */
const EXTERNAL_ROLES = new Set<string>(["GUEST"]);

export function isExternalRole(role: string | null | undefined): boolean {
  return !!role && EXTERNAL_ROLES.has(role);
}

export const PASSWORD_LOGIN_ROLES = ["GUEST"] as const;

export function isPasswordLoginAllowed(role: string | null | undefined): boolean {
  return !!role && (PASSWORD_LOGIN_ROLES as readonly string[]).includes(role);
}

export const ROLE_IDS = ["SUPER_ADMIN", "ADMIN", "STAFF", "DEVELOPER", "GUEST"] as const;

export type RoleId = (typeof ROLE_IDS)[number];

/**
 * The role a person gets when Foundry creates their membership for them — a first
 * Google sign-in on web, iOS or desktop, or accepting an invite link.
 *
 * ⚠️ DEVELOPER, not STAFF (Dan, Oct 2026). STAFF's default is every module,
 * `seeAllClients`, `code.viewRates`, `docs.viewCosts` and `rateCard.view`, so any new
 * `@gitwork.co.uk` account used to see commercial rates and every client on day one,
 * before anyone had decided it should. DEVELOPER is the minimal internal role; an
 * Admin raises it in Settings → Team. The first-admin bootstrap and the known owner
 * emails still become Super Admin — that is a separate, deliberate rule.
 *
 * Every provisioning path reads this one constant; `provisioned-role.test.ts` fails
 * if any of them hardcodes a role again.
 */
export const DEFAULT_PROVISIONED_ROLE = "DEVELOPER" as const satisfies RoleId;

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
  {
    // The only role a password can authenticate (see server/auth/password-login.ts),
    // and the only one whose default grant is NOTHING. Every other role's default is a
    // list of things it can reach; a guest starts with none and a Super Admin turns on
    // exactly what they should see. That asymmetry is the point: forgetting to restrict
    // a guest leaves them with nothing, not with everything. (A new Google sign-in
    // used to auto-provision as STAFF, which inherits every module id; it is now
    // DEFAULT_PROVISIONED_ROLE.)
    id: "GUEST",
    label: "Guest",
    rank: 10,
    configurable: true,
    description:
      "Outside collaborator. No access at all by default — a Super Admin switches on the individual products they should see. Signs in with an email and password rather than a Gitwork Google account.",
  },
] as const;

const ROLE_BY_ID = new Map<string, RoleDef>(ROLES.map((r) => [r.id, r]));

/** The roles a Super Admin can configure in the matrix (everyone except SUPER_ADMIN). */
export const CONFIGURABLE_ROLES: readonly RoleDef[] = ROLES.filter((r) => r.configurable);
export type ConfigurableRoleId = "ADMIN" | "STAFF" | "DEVELOPER" | "GUEST";

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
  // Grouped as the sidebar is, one group per product. Each group leads with the
  // product itself, then what someone can do in it. Labels say what the person gets,
  // in a few words; the description is one sentence.
  //
  // Some products are deliberately `feature`s, not `module`s (Provenance, Study, Hiring,
  // Studio): STAFF inherits every module id by default (…MODULE_IDS in
  // DEFAULT_ROLE_PERMISSIONS), and these are meant to stay off until someone grants them.
  //
  // ⚠️ Ids are stored in every role matrix and per-person override. Never rename one;
  // change its label. Removing one silently drops it from stored matrices.
  {
    product: "Pulse",
    permissions: [
      { id: "pulse", category: "module", label: "Pulse", description: "Open Pulse and read its scans." },
      { id: "pulse.manage", category: "action", label: "Run and delete scans", description: "Without it, Pulse is read-only." },
      {
        id: "pulse.fixAgent",
        category: "action",
        label: "Open fix pull requests",
        description: "Let Pulse's fix agent open pull requests on a client's GitHub repo.",
        highRisk: true,
      },
      { id: "provenance", category: "feature", label: "Provenance", description: "Read the register of countermarks." },
      {
        id: "provenance.issue",
        category: "action",
        label: "Issue countermarks",
        description: "Strike or withdraw a certificate that clients and insurers rely on. The issuer's name goes on it.",
        highRisk: true,
      },
      { id: "study", category: "feature", label: "Study", description: "Run AI user-research studies from Pulse." },
    ],
  },
  {
    product: "Staff",
    permissions: [
      { id: "codeclear", category: "module", label: "Staff", description: "Open the team roster and developer profiles." },
      {
        id: "code.manage",
        category: "action",
        label: "Edit staff records",
        description: "Add, edit, archive and delete people on the roster, and run developer analysis.",
      },
      { id: "code.viewRates", category: "field", label: "See day rates", description: "Developers' day rates on Staff." },
      { id: "devsignal", category: "feature", label: "Hiring", description: "Vet new developers with DevSignal." },
      {
        id: "hr.manage",
        category: "feature",
        label: "Manage HR records",
        description: "Employment details, suppliers and the HR access log. Granted per person, never by role.",
        highRisk: true,
      },
      {
        id: "hr.viewSensitive",
        category: "field",
        label: "See personal details",
        description: "Date of birth, address, NI number, ID and emergency contacts. Every look is logged.",
        highRisk: true,
      },
    ],
  },
  {
    product: "Docs",
    permissions: [
      { id: "proposals", category: "module", label: "Docs", description: "Open Docs and read documents." },
      { id: "docs.manage", category: "action", label: "Create and edit documents", description: "Without it, Docs is read-only." },
      {
        id: "docs.viewAdminTypes",
        category: "feature",
        label: "Proposals and contracts",
        description: "Without it, Docs shows only handovers, briefs and reports.",
      },
      { id: "docs.viewCosts", category: "field", label: "See costs and margins", description: "Costing on proposals." },
      { id: "rateCard.view", category: "field", label: "See the rate card", description: "People's rates used in proposal costing." },
      {
        id: "docs.share",
        category: "action",
        label: "Share documents publicly",
        description: "Send a document to a client by link.",
        highRisk: true,
      },
    ],
  },
  {
    product: "Portal",
    permissions: [
      { id: "clients", category: "module", label: "Portal", description: "Open clients, their boards and wikis." },
      { id: "clients.manage", category: "action", label: "Edit clients", description: "Without it, Portal is read-only." },
      {
        id: "seeAllClients",
        category: "feature",
        label: "Every client",
        description: "Without it, people see only the clients they're assigned to.",
      },
      {
        id: "clients.viewFinancials",
        category: "field",
        label: "See client costs",
        description: "Monthly developer cost and working days on client cards.",
      },
      {
        id: "tasks.publish",
        category: "feature",
        label: "Publish the daily roll-up",
        description: "Post the end-of-day roll-up and team broadcasts to Slack.",
      },
      {
        id: "clients.shareTimeline",
        category: "action",
        label: "Share client timelines",
        description: "Publish a client's timeline at a link anyone can open.",
        highRisk: true,
      },
    ],
  },
  {
    product: "Care",
    permissions: [
      { id: "support", category: "module", label: "Care", description: "Open Care and answer conversations." },
      { id: "support.manage", category: "action", label: "Set up Care", description: "Connect channels and edit workflow rules." },
    ],
  },
  {
    product: "Backstage",
    permissions: [
      { id: "backstage", category: "module", label: "Backstage", description: "Book leave, claim expenses, see the team calendar." },
      { id: "backstage.approve", category: "feature", label: "Approve leave", description: "Approve and decline leave requests. Expenses stay with Super Admins." },
    ],
  },
  {
    product: "Platform",
    permissions: [
      {
        id: "ai.generate",
        category: "feature",
        label: "Use AI",
        description: "Generate new AI output, which costs money. Without it, people still read saved results.",
      },
      {
        id: "mcp.connect",
        category: "feature",
        label: "Connect Claude",
        description: "Let their own Claude act in Foundry, never with more access than they have.",
      },
      { id: "studio", category: "feature", label: "Studio", description: "Make branded social posts and store screenshots." },
    ],
  },
  // Starters has no entry: it is Super-Admin-only by a role check, not a grantable permission.
  {
    // One per Settings section. People & access and this matrix are role-gated, so they
    // aren't here. Branding and Content were retired (Oct 2026): those pages redirect to
    // Document defaults, so their permissions controlled nothing.
    product: "Settings",
    permissions: [
      { id: "settings.general", category: "settings", label: "Document defaults", description: "Defaults, branding and copy for documents." },
      { id: "settings.templates", category: "settings", label: "Templates", description: "Document templates." },
      { id: "settings.integrations", category: "settings", label: "Integrations", description: "AI, Google, Slack and email, including their keys." },
      { id: "settings.agents", category: "settings", label: "AI agents and checks", description: "Agent prompts and Pulse check settings." },
      { id: "settings.audit", category: "settings", label: "Audit log", description: "Who changed what in the workspace." },
      { id: "settings.developer", category: "settings", label: "Developer", description: "The external API key and REST reference." },
      { id: "settings.privacy", category: "settings", label: "Privacy and data", description: "Exports, retention and deleting the workspace." },
    ],
  },
] as const;

/** Flat list of every permission def, in catalog order. */
export const ALL_PERMISSIONS: readonly PermissionDef[] = PERMISSION_CATALOG.flatMap(
  (p) => p.permissions,
);

/** Every permission id — the resolved set for SUPER_ADMIN. */
export const ALL_PERMISSION_IDS: string[] = ALL_PERMISSIONS.map((p) => p.id);

/** HR permissions: never part of a role's defaults, only granted to a named person. */
export const HR_PERMISSION_IDS: readonly string[] = ["hr.manage", "hr.viewSensitive"];

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
 *  • DEVELOPER: very little — their clients (Portal), Care, Pulse, personal Backstage. No Code/Docs,
 *    no Study (admin-only feature perm), no rate or cost visibility, no seeAllClients.
 */
export const DEFAULT_ROLE_PERMISSIONS: RoleMatrix = {
  // Everything except HR: personal and health data is granted per person, never by role.
  ADMIN: ALL_PERMISSION_IDS.filter((id) => !HR_PERMISSION_IDS.includes(id)),
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
  ],
  // DEVELOPER also gets the Docs module + manage, but WITHOUT docs.viewAdminTypes — so they can
  // create/edit the lightweight docs (handover, status report, brief, blank) and never see or open
  // proposals/contracts. The type boundary is enforced server-side (allowedDocTypesForUser).
  DEVELOPER: ["clients", "support", "pulse", "backstage", "proposals", "docs.manage"],
  // Deliberately empty. A guest sees nothing until a Super Admin grants it per person
  // in Settings → Team, which is what makes "give this person Pulse and nothing else"
  // a decision someone made rather than a default nobody checked.
  GUEST: [],
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
/**
 * What a guest needs to run a Pulse scan and read the result — all three, not one.
 *
 * ⚠️ Granting the `pulse` MODULE alone gets them the page and a "New scan" button that
 * 403s on submit: `POST /api/pulse/scans` asserts `pulse.manage` (create a scan) and
 * `canGenerateAi` (spend tokens). Three separate grants is not obvious from the Access
 * matrix, which is why this preset exists rather than a note in a doc.
 *
 * ⚠️ `ai.generate` is a COST decision. It is admin-gated everywhere else precisely
 * because it spends tokens, so handing it to someone outside the company means they can
 * run scans on our account. That is the intended trade for a Pulse guest — but it is a
 * trade, and it should be made on purpose.
 */
export const PULSE_GUEST_PERMISSIONS: readonly string[] = ["pulse", "pulse.manage", "ai.generate"];

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
    id: "pulse-guest",
    label: "Pulse guest",
    role: "GUEST" as const,
    description:
      "Outside collaborator who can run Pulse scans and read the results — and nothing else. Includes AI generation, which spends tokens on our account.",
    permissions: PULSE_GUEST_PERMISSIONS,
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
  return {
    ADMIN: pick("ADMIN"),
    STAFF: pick("STAFF"),
    DEVELOPER: pick("DEVELOPER"),
    GUEST: pick("GUEST"),
  };
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
