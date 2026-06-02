import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { AccountSettingsPanel } from "@/components/account-settings-panel";
import dynamic from "next/dynamic";
import { SettingsShell, type SettingsSectionId } from "@/components/settings/settings-shell";
import { NotificationsSection } from "@/components/settings/notifications-section";
import { AuditLogSection } from "@/components/settings/audit-log-section";
import { PrivacySection } from "@/components/settings/privacy-section";
import { TeamSection } from "@/components/settings/team-section";
import { RolesSection } from "@/components/settings/roles-section";
import { isAtLeast, isSuperAdmin } from "@/types/auth";

// Code-split the heavy (~2.3k-line) settings-panel module: each tab ships as its own
// chunk, loaded only when that section is opened — so the default Account landing no
// longer downloads the JS for every other tab.
const GeneralTab = dynamic(() => import("@/components/settings-panel").then((m) => ({ default: m.GeneralTab })));
const BrandingTab = dynamic(() => import("@/components/settings-panel").then((m) => ({ default: m.BrandingTab })));
const ContentTab = dynamic(() => import("@/components/settings-panel").then((m) => ({ default: m.ContentTab })));
const TemplatesTab = dynamic(() => import("@/components/settings-panel").then((m) => ({ default: m.TemplatesTab })));
const RateCardTab = dynamic(() => import("@/components/settings-panel").then((m) => ({ default: m.RateCardTab })));
const IntegrationsTab = dynamic(() => import("@/components/settings-panel").then((m) => ({ default: m.IntegrationsTab })));
const AgentsAndChecksTab = dynamic(() => import("@/components/settings-panel").then((m) => ({ default: m.AgentsAndChecksTab })));
const DeveloperTab = dynamic<{ apiKeyConfigured: boolean }>(() =>
  import("@/components/settings-panel").then((m) => ({ default: m.DeveloperTab })),
);

const VALID_SECTIONS: SettingsSectionId[] = [
  "account",
  "notifications",
  "general",
  "branding",
  "templates",
  "content",
  "rate-card",
  "team",
  "roles",
  "integrations",
  "agents-checks",
  "audit",
  "developer",
  "privacy",
  "workspace", // legacy
];

// Sections only Super Admins may open (the role matrix editor).
const SUPER_ADMIN_SECTIONS = new Set<SettingsSectionId>(["roles"]);

const ADMIN_SECTIONS = new Set<SettingsSectionId>([
  "general",
  "branding",
  "templates",
  "content",
  "rate-card",
  "team",
  "roles",
  "integrations",
  "agents-checks",
  "audit",
  "developer",
  "privacy",
  "workspace",
]);

const SECTION_META: Record<SettingsSectionId, { title: string; subtitle: string }> = {
  account: {
    title: "Profile",
    subtitle: "Identity, avatar, and sign-in.",
  },
  notifications: {
    title: "Notifications",
    subtitle: "Where and when Foundry pings you.",
  },
  general: {
    title: "General",
    subtitle: "Workspace proposal defaults.",
  },
  branding: {
    title: "Branding",
    subtitle: "Cover assets for every document.",
  },
  templates: {
    title: "Templates",
    subtitle: "Document templates and section editing.",
  },
  content: {
    title: "Content",
    subtitle: "Confidentiality copy and reusable objective snippets.",
  },
  "rate-card": {
    title: "Rate card",
    subtitle: "Team members and day rates used in proposal costing.",
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
  "agents-checks": {
    title: "Agents & checks",
    subtitle: "Per-agent prompts and Pulse check configuration.",
  },
  audit: {
    title: "Audit log",
    subtitle: "Workspace settings and access history.",
  },
  developer: {
    title: "Developer",
    subtitle: "External API key, demo cleanup, REST reference.",
  },
  privacy: {
    title: "Privacy & data",
    subtitle: "Data exports, retention, workspace deletion.",
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
  const meta = SECTION_META[sectionId];

  const session = await auth();
  const role = session?.user?.role ?? "";
  const isAdmin = isAtLeast(role, "ADMIN");
  const isSuper = isSuperAdmin(role);

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

  if (ADMIN_SECTIONS.has(sectionId) && !isAdmin) {
    return (
      <AppShell title={meta.title} subtitle="Admin access required.">
        <SettingsShell activeSection={sectionId}>
          <div className="app-card p-6">
            <h2 className="text-lg font-semibold text-[var(--text-1)]">Admins only</h2>
            <p className="mt-2 text-sm text-[var(--text-3)]">
              This section is restricted to workspace admins. If you need access, ask a workspace
              admin to update your role on the Team tab.
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
        {sectionId === "general" ? <GeneralTab /> : null}
        {sectionId === "branding" ? <BrandingTab /> : null}
        {sectionId === "content" ? <ContentTab /> : null}
        {sectionId === "templates" ? <TemplatesTab /> : null}
        {sectionId === "rate-card" ? <RateCardTab /> : null}
        {sectionId === "team" ? <TeamSection /> : null}
        {sectionId === "roles" ? <RolesSection /> : null}
        {sectionId === "integrations" ? <IntegrationsTab /> : null}
        {sectionId === "agents-checks" ? <AgentsAndChecksTab /> : null}
        {sectionId === "audit" ? <AuditLogSection /> : null}
        {sectionId === "developer" ? <DeveloperTab apiKeyConfigured={apiKeyConfigured} /> : null}
        {sectionId === "privacy" ? <PrivacySection /> : null}
        {sectionId === "workspace" ? <LegacyWorkspaceRedirect /> : null}
      </SettingsShell>
    </AppShell>
  );
}

// The old "workspace" mega-section is now broken up into individual entries in the left rail.
// We keep the route alive so external bookmarks don't 404, but immediately point users to General.
function LegacyWorkspaceRedirect() {
  return (
    <div className="app-card p-6">
      <h2 className="text-lg font-semibold text-[var(--text-1)]">Pick a section</h2>
      <p className="mt-2 text-sm text-[var(--text-3)]">
        Workspace settings have been split into individual sections in the left rail — General,
        Branding, Templates, Content, Rate card, Team, Integrations, and Agents &amp; checks.
      </p>
    </div>
  );
}
