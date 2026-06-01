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

/**
 * Module-level access flags — each grants visibility of one top-level area in `/app/*`.
 * Enforced by middleware via `hasModuleAccess()` (see src/middleware.ts).
 * Admins implicitly have all modules; STAFF must opt-in per module.
 */
export const MODULE_PERMISSIONS = [
  { id: "pulse", label: "Pulse", description: "Health and delivery tracking" },
  { id: "codeclear", label: "Code", description: "Dev review and validation" },
  { id: "proposals", label: "Docs", description: "Documentation and client outputs" },
  { id: "clients", label: "Portal", description: "Client management" },
  { id: "support", label: "Care", description: "Support and aftercare" },
  { id: "study", label: "Study", description: "AI-powered user research" },
  { id: "backstage", label: "Backstage", description: "Internal team ops — leave, expenses" },
] as const;

export type ModuleId = (typeof MODULE_PERMISSIONS)[number]["id"];

/**
 * Cross-cutting feature flags — orthogonal to modules. A STAFF user might have access to
 * Portal + Care but be restricted to "only their assigned clients" via `seeAllClients`,
 * or have access to Docs but with rate fields blanked out via `seeRates`.
 *
 * Enforcement varies — module flags gate routes; these gate data and UI components within
 * those routes. Add the matching `hasFeature()` check in the relevant query/component
 * when wiring up a feature flag end-to-end.
 */
export const FEATURE_PERMISSIONS = [
  {
    id: "seeRates",
    label: "See rates",
    description:
      "Rate card, day rates on Costing, dev tier defaults. Off for developer accounts.",
    defaultOn: true,
  },
  {
    id: "seeAllClients",
    label: "See all clients",
    description:
      "Off scopes Portal/Pulse/Care/Study to clients this user is explicitly linked to.",
    defaultOn: true,
  },
  {
    id: "backstage.approve",
    label: "Approve Backstage requests",
    description:
      "Approve/reject staff leave requests and review expenses. Grants HR-style access without making the user a workspace Admin.",
    defaultOn: false,
  },
  {
    id: "backstage.expenses",
    label: "Access Expenses",
    description:
      "See and submit the Backstage Expenses tab. Off by default — switch on per person (e.g. HR, finance) without making them an Admin. Devs don't get this.",
    defaultOn: false,
  },
  {
    id: "tasks.publish",
    label: "Publish task roll-up",
    description:
      "Publish the consolidated end-of-day task roll-up across all clients (the DevOps lead). Sees who has pushed their standup.",
    defaultOn: false,
  },
] as const;

export type FeatureId = (typeof FEATURE_PERMISSIONS)[number]["id"];

/** Default permission set for a fresh STAFF member — full module access + default-on features. */
export const DEFAULT_STAFF_PERMISSIONS: string[] = [
  ...MODULE_PERMISSIONS.map((m) => m.id),
  ...FEATURE_PERMISSIONS.filter((f) => f.defaultOn).map((f) => f.id),
];

/**
 * Built-in role presets — admins use these as quick starting points when onboarding.
 * Each preset specifies the role and the permission set to apply in one click.
 */
export const PERMISSION_PRESETS = [
  {
    id: "admin",
    label: "Admin",
    role: "ADMIN" as const,
    description: "Full workspace access including team management and Developer tools.",
    permissions: DEFAULT_STAFF_PERMISSIONS,
  },
  {
    id: "staff",
    label: "Staff (full)",
    role: "STAFF" as const,
    description: "Every module visible, sees rates, sees all clients. Default for new hires.",
    permissions: DEFAULT_STAFF_PERMISSIONS,
  },
  {
    id: "developer",
    label: "Developer",
    role: "STAFF" as const,
    description:
      "Restricted: only their linked Portal client(s), no Code or rate visibility. For Gitwork devs we onboard onto the platform.",
    permissions: [
      "clients", // Portal — see only assigned clients (seeAllClients off)
      "support", // Care — for client-related comms
      "pulse", // Pulse — for their project's scans
      "backstage", // Backstage — devs file their own leave (Expenses gated separately by backstage.expenses)
      // Notably no: codeclear, proposals, study, seeRates, seeAllClients, backstage.approve, backstage.expenses
    ],
  },
] as const;

export type PermissionPresetId = (typeof PERMISSION_PRESETS)[number]["id"];

/** Does this permissions array grant the given feature? Admin role bypasses checks. */
export function hasFeature(role: string, permissions: string[], feature: FeatureId): boolean {
  if (role === "ADMIN") return true;
  return permissions.includes(feature);
}
