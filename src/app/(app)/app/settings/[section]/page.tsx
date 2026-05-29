import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { AccountSettingsPanel } from "@/components/account-settings-panel";
import { SettingsPanel } from "@/components/settings-panel";
import { SettingsShell, type SettingsSectionId } from "@/components/settings/settings-shell";
import { NotificationsSection } from "@/components/settings/notifications-section";
import { AuditLogSection } from "@/components/settings/audit-log-section";
import { PrivacySection } from "@/components/settings/privacy-section";

const VALID_SECTIONS: SettingsSectionId[] = [
  "account",
  "notifications",
  "workspace",
  "audit",
  "privacy",
];

const ADMIN_SECTIONS: SettingsSectionId[] = ["workspace", "audit", "privacy"];

const SECTION_META: Record<SettingsSectionId, { title: string; subtitle: string }> = {
  account: {
    title: "My account",
    subtitle: "Profile, sign-in, and personal preferences.",
  },
  notifications: {
    title: "Notifications",
    subtitle: "Where and when Foundry pings you.",
  },
  workspace: {
    title: "Workspace settings",
    subtitle: "Branding, content, rate card, integrations, team.",
  },
  audit: {
    title: "Audit log",
    subtitle: "Workspace settings, access, and security history.",
  },
  privacy: {
    title: "Privacy & data",
    subtitle: "Data exports, retention, and workspace deletion.",
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
  const isAdmin = session?.user?.role === "ADMIN";

  if (ADMIN_SECTIONS.includes(sectionId) && !isAdmin) {
    return (
      <AppShell title={meta.title} subtitle="Admin access required.">
        <SettingsShell activeSection={sectionId}>
          <div className="app-card p-6">
            <h2 className="text-lg font-semibold text-[var(--text-1)]">
              Admins only
            </h2>
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
        {sectionId === "workspace" ? (
          <SettingsPanel apiKeyConfigured={apiKeyConfigured} />
        ) : null}
        {sectionId === "audit" ? <AuditLogSection /> : null}
        {sectionId === "privacy" ? <PrivacySection /> : null}
      </SettingsShell>
    </AppShell>
  );
}
