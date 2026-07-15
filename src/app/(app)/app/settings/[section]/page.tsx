import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { AppShell } from "@/components/app-shell";
import { AccountSettingsPanel } from "@/components/account-settings-panel";
import dynamic from "next/dynamic";
import { SettingsShell, type SettingsSectionId } from "@/components/settings/settings-shell";
import { NotificationsSection } from "@/components/settings/notifications-section";
import { AuditLogSection } from "@/components/settings/audit-log-section";
import { PrivacySection } from "@/components/settings/privacy-section";
import { PeopleAccess } from "@/components/settings/people-shell";
import { isAtLeast, isSuperAdmin } from "@/types/auth";

// Code-split the heavy (~2.3k-line) settings-panel module: each tab ships as its own
// chunk, loaded only when that section is opened — so the default Account landing no
// longer downloads the JS for every other tab.
const GeneralTab = dynamic(() => import("@/components/settings-panel").then((m) => ({ default: m.GeneralTab })));
const TemplatesTab = dynamic(() => import("@/components/settings-panel").then((m) => ({ default: m.TemplatesTab })));
const RateCardTab = dynamic(() => import("@/components/settings-panel").then((m) => ({ default: m.RateCardTab })));
const IntegrationsTab = dynamic(() => import("@/components/settings-panel").then((m) => ({ default: m.IntegrationsTab })));
const AgentsPanel = dynamic(() => import("@/components/settings/agents-panel").then((m) => ({ default: m.AgentsPanel })));
const ChecksPanel = dynamic(() => import("@/components/settings/checks-panel").then((m) => ({ default: m.ChecksPanel })));
const CuratorPanel = dynamic(() => import("@/components/settings/curator/curator-panel").then((m) => ({ default: m.CuratorPanel })));
const DeveloperTab = dynamic<{ apiKeyConfigured: boolean }>(() =>
  import("@/components/settings-panel").then((m) => ({ default: m.DeveloperTab })),
);
const OnboardingFormsTab = dynamic(() =>
  import("@/components/settings/onboarding/forms-tab").then((m) => ({ default: m.OnboardingFormsTab })),
);
const McpAdminPanel = dynamic(() =>
  import("@/components/settings/mcp-admin-panel").then((m) => ({ default: m.McpAdminPanel })),
);
const DemoConfigurator = dynamic(() =>
  import("@/components/settings/demo-configurator").then((m) => ({ default: m.DemoConfigurator })),
);

const VALID_SECTIONS: SettingsSectionId[] = [
  "account",
  "notifications",
  "connected-apps",
  "general",
  "branding",
  "templates",
  "onboarding",
  "content",
  "rate-card",
  "people",
  "team",
  "roles",
  "integrations",
  "agents",
  "checks",
  "curator",
  "mcp",
  "agents-checks", // legacy — redirects to "agents"
  "audit",
  "developer",
  "privacy",
  "demo",
  "workspace", // legacy
];

// Sections only Super Admins may open (the role matrix editor). MCP is no longer
// here — the page itself is permission-gated (mcp.connect) and self-gates its
// workspace-toggle section to Super Admins internally.
const SUPER_ADMIN_SECTIONS = new Set<SettingsSectionId>(["roles", "curator"]);

// Admin-or-above sections that are NOT per-role toggles (member management + legacy).
// "people" (Members + the Roles tab) is admin-or-above; the Roles tab self-gates to Super Admin.
// "connected-apps" is now permission-driven via mcp.connect (see SETTINGS_SECTION_PERMISSION)
// so Staff/Developers granted it can self-connect Claude.
const ADMIN_ONLY_SECTIONS = new Set<SettingsSectionId>([
  "people",
  "team",
  "rate-card",
  "workspace",
  "onboarding",
  "demo",
]);

// Old standalone routes now live in different sections — redirect for back-compat.
const PEOPLE_REDIRECTS: Partial<Record<SettingsSectionId, string>> = {
  team: "/app/settings/people",
  roles: "/app/settings/people?tab=roles",
  // Old combined "agents-checks" page split into two separate sections in the rail.
  // Land legacy bookmarks on the AI agents page; users wanting checks just click across.
  "agents-checks": "/app/settings/agents",
  // Branding + Content folded into Document defaults (the merged "general" section).
  // Any bookmark to the old URLs lands on the merged page — same content, one URL.
  branding: "/app/settings/general",
  content: "/app/settings/general",
  // Connected apps folded into MCP — one page for self-connect + (for Super Admins)
  // the workspace toggle. Same content, one URL.
  "connected-apps": "/app/settings/mcp",
};

// Settings sub-sections gated by an individual matrix permission. A Super Admin can
// grant/remove each per role; ADMIN holds them all by default (see DEFAULT_ROLE_PERMISSIONS).
const SETTINGS_SECTION_PERMISSION: Partial<Record<SettingsSectionId, string>> = {
  general: "settings.general",
  branding: "settings.branding",
  content: "settings.content",
  templates: "settings.templates",
  integrations: "settings.integrations",
  agents: "settings.agents",
  checks: "settings.agents",
  audit: "settings.audit",
  developer: "settings.developer",
  privacy: "settings.privacy",
  // Anyone holding mcp.connect (Admins by default; Staff/Developers via the
  // matrix) can open the page to self-connect Claude. The workspace-toggle
  // section inside is additionally gated to Super Admins (page-level, not here).
  mcp: "mcp.connect",
};

const SECTION_META: Record<SettingsSectionId, { title: string; subtitle: string }> = {
  account: {
    title: "Profile",
    subtitle: "Identity, avatar, and sign-in.",
  },
  notifications: {
    title: "Notifications",
    subtitle: "Where and when Foundry pings you.",
  },
  // Legacy URL — present in the meta so the type stays exhaustive; the page-level
  // redirect (PEOPLE_REDIRECTS) catches this slug before this meta is ever read.
  "connected-apps": {
    title: "Connected apps",
    subtitle: "Merged into MCP — connect Claude from Settings → MCP.",
  },
  mcp: {
    title: "MCP",
    subtitle: "Connect Claude to Foundry, plus (for Super Admins) the workspace toggle and connections.",
  },
  general: {
    title: "Document defaults",
    subtitle: "Prepared by, team, contact details — pre-filled on every new document.",
  },
  branding: {
    title: "Branding",
    subtitle: "Workspace logo — fallback for documents without their own.",
  },
  templates: {
    title: "Templates",
    subtitle: "Document templates and section editing.",
  },
  onboarding: {
    title: "Onboarding",
    subtitle: "Customise the client onboarding forms sent at /onboarding.",
  },
  content: {
    title: "Boilerplate copy",
    subtitle: "Confidentiality statements and reusable objective snippets for proposals.",
  },
  "rate-card": {
    title: "Rate card",
    subtitle: "Team members and day rates used in proposal costing.",
  },
  people: {
    title: "People & access",
    subtitle: "Members, roles and what each role can do.",
  },
  team: {
    title: "Team",
    subtitle: "Invite members and manage workspace access.",
  },
  roles: {
    title: "Roles & permissions",
    subtitle: "Define what each role can see and do across every product.",
  },
  integrations: {
    title: "Integrations",
    subtitle: "AI providers, Google, Slack, email.",
  },
  agents: {
    title: "AI agents",
    subtitle: "Per-agent prompt and model overrides for Pulse and Study.",
  },
  checks: {
    title: "Pulse checks",
    subtitle: "Enable, downgrade severity, label or add custom checks per workspace.",
  },
  curator: {
    title: "Curator",
    subtitle: "Weekly background maintenance for the Starters library and Pulse checks.",
  },
  // Legacy URL — present in the meta so the type stays exhaustive; the page-level
  // redirect (PEOPLE_REDIRECTS) catches this slug before this meta is ever read.
  "agents-checks": {
    title: "Agents & checks",
    subtitle: "Split into AI agents and Pulse checks in the left rail.",
  },
  audit: {
    title: "Audit log",
    subtitle: "Workspace settings and access history.",
  },
  developer: {
    title: "Developer",
    subtitle: "External API key, bulk dev import, REST reference.",
  },
  privacy: {
    title: "Privacy & data",
    subtitle: "Data exports, retention, workspace deletion.",
  },
  demo: {
    title: "Demo builder",
    subtitle: "White-label a shareable demo link and choose which modules it shows.",
  },
  workspace: {
    title: "Workspace",
    subtitle: "Workspace-level settings (legacy view — pick a specific section).",
  },
};

export default async function SettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!VALID_SECTIONS.includes(section as SettingsSectionId)) notFound();

  const sectionId = section as SettingsSectionId;

  // Old standalone Team / Roles routes now live under People & Access.
  const redirectTo = PEOPLE_REDIRECTS[sectionId];
  if (redirectTo) redirect(redirectTo);

  const meta = SECTION_META[sectionId];

  const session = await auth();
  // Resolve role + effective permissions LIVE from the DB (the cache that reconcile +
  // recompute keep current) rather than the JWT — so matrix edits to a Settings section
  // take effect without forcing a re-login. ensureBaseRecords also runs the catalog
  // reconcile so newly-added settings permissions are granted before we gate on them.
  await ensureBaseRecords();
  const sessionUser = session?.user;
  const member =
    sessionUser?.id || sessionUser?.email
      ? await prisma.workspaceMember.findFirst({
          where: {
            user: sessionUser.id ? { id: sessionUser.id } : { email: sessionUser.email! },
            workspace: { slug: DEFAULT_WORKSPACE_SLUG },
          },
          select: { role: true, permissions: true },
        })
      : null;
  const role = member?.role ?? sessionUser?.role ?? "";
  const permissions = Array.isArray(member?.permissions)
    ? (member!.permissions as string[])
    : (sessionUser?.permissions ?? []);
  const isAdmin = isAtLeast(role, "ADMIN");
  const isSuper = isSuperAdmin(role);
  const canSetting = (id: string) => isSuper || permissions.includes(id);

  if (SUPER_ADMIN_SECTIONS.has(sectionId) && !isSuper) {
    return (
      <AppShell title={meta.title} subtitle="Super Admin access required.">
        <SettingsShell activeSection={sectionId}>
          <div className="app-card p-6">
            <h2 className="text-lg font-semibold text-[var(--text-1)]">Super Admins only</h2>
            <p className="mt-2 text-sm text-[var(--text-3)]">
              Editing the role matrix is restricted to Super Admins. Ask a Super Admin if you need
              a role or permission changed.
            </p>
          </div>
        </SettingsShell>
      </AppShell>
    );
  }

  const sectionPermission = SETTINGS_SECTION_PERMISSION[sectionId];
  if (sectionPermission && !canSetting(sectionPermission)) {
    return (
      <AppShell title={meta.title} subtitle="Access required.">
        <SettingsShell activeSection={sectionId}>
          <div className="app-card p-6">
            <h2 className="text-lg font-semibold text-[var(--text-1)]">No access to this setting</h2>
            <p className="mt-2 text-sm text-[var(--text-3)]">
              Your role doesn&apos;t include this Settings area. A Super Admin can grant it under
              Settings → People &amp; access → Roles &amp; permissions.
            </p>
          </div>
        </SettingsShell>
      </AppShell>
    );
  }

  if (ADMIN_ONLY_SECTIONS.has(sectionId) && !isAdmin) {
    return (
      <AppShell title={meta.title} subtitle="Admin access required.">
        <SettingsShell activeSection={sectionId}>
          <div className="app-card p-6">
            <h2 className="text-lg font-semibold text-[var(--text-1)]">Admins only</h2>
            <p className="mt-2 text-sm text-[var(--text-3)]">
              This section is restricted to workspace admins. If you need access, ask a workspace
              admin to update your role under Settings → People &amp; access.
            </p>
          </div>
        </SettingsShell>
      </AppShell>
    );
  }

  const apiKeyConfigured = Boolean(process.env.API_KEY ?? process.env.NEXT_PUBLIC_API_KEY);

  return (
    <AppShell title={meta.title} subtitle={meta.subtitle}>
      <SettingsShell activeSection={sectionId}>
        {sectionId === "account" ? <AccountSettingsPanel /> : null}
        {sectionId === "notifications" ? <NotificationsSection /> : null}
        {sectionId === "mcp" ? <McpAdminPanel /> : null}
        {sectionId === "general" ? <GeneralTab /> : null}
        {/* branding + content slugs redirect to /general before render (PEOPLE_REDIRECTS) */}
        {sectionId === "templates" ? <TemplatesTab /> : null}
        {sectionId === "onboarding" ? <OnboardingFormsTab /> : null}
        {sectionId === "rate-card" ? <RateCardTab /> : null}
        {sectionId === "people" ? <PeopleAccess /> : null}
        {sectionId === "integrations" ? <IntegrationsTab /> : null}
        {sectionId === "agents" ? <AgentsPanel /> : null}
        {sectionId === "checks" ? <ChecksPanel /> : null}
        {sectionId === "curator" ? <CuratorPanel /> : null}
        {sectionId === "audit" ? <AuditLogSection /> : null}
        {sectionId === "developer" ? <DeveloperTab apiKeyConfigured={apiKeyConfigured} /> : null}
        {sectionId === "privacy" ? <PrivacySection /> : null}
        {sectionId === "demo" ? <DemoConfigurator /> : null}
        {sectionId === "workspace" ? <LegacyWorkspaceRedirect /> : null}
      </SettingsShell>
    </AppShell>
  );
}

// The old "workspace" mega-section is now broken up into individual entries in the left rail.
// We keep the route alive so external bookmarks don't 404, but immediately point users to one of
// the new sections. Keep the listed names in sync with the rail in `settings-shell.tsx`.
function LegacyWorkspaceRedirect() {
  return (
    <div className="app-card p-6">
      <h2 className="text-lg font-semibold text-[var(--text-1)]">Pick a section</h2>
      <p className="mt-2 text-sm text-[var(--text-3)]">
        Workspace settings have been split into individual sections in the left rail — Document
        defaults, Templates, Onboarding, People &amp; access, Integrations, AI agents, and Pulse
        checks.
      </p>
    </div>
  );
}
