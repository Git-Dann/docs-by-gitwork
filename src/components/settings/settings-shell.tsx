"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  AdjustmentsHorizontalIcon,
  BellAlertIcon,
  BuildingOffice2Icon,
  ChartBarIcon,
  ChevronDownIcon,
  ClipboardDocumentCheckIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  CpuChipIcon,
  DocumentDuplicateIcon,
  ShieldCheckIcon,
  SparklesIcon,
  Squares2X2Icon,
  UserCircleIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { useAccount } from "@/hooks/use-account";
import { isAtLeast, isSuperAdmin } from "@/types/auth";

export type SettingsSectionId =
  // My account
  | "account"
  | "notifications"
  | "connected-apps"
  // Workspace
  | "general"
  | "branding"
  | "templates"
  | "onboarding"
  | "content"
  | "rate-card"
  | "people"
  | "team"
  | "roles"
  | "integrations"
  | "agents"
  | "checks"
  | "curator"
  | "foreman"
  | "mcp"
  | "agents-checks" // legacy — redirects to "agents"
  // System
  | "analytics"
  | "audit"
  | "developer"
  | "privacy"
  | "demo"
  // Back-compat: the old "workspace" mega-section
  | "workspace";

interface SectionDef {
  id: SettingsSectionId;
  label: string;
  description: string;
  icon: (props: React.ComponentProps<"svg">) => React.ReactNode;
  adminOnly?: boolean;
  /** Visible only to Super Admins (e.g. the role matrix editor). */
  superAdminOnly?: boolean;
  /** Matrix permission id that gates this section (per-role). Super Admins bypass. */
  permission?: string;
  /** Optional external href — for rail entries that link out to a full-page surface
   *  (e.g. Analytics → /app/analytics) rather than rendering inside the settings column. */
  href?: string;
}

interface SectionGroup {
  id: string;
  label: string;
  sections: SectionDef[];
}

const GROUPS: SectionGroup[] = [
  {
    id: "you",
    label: "My account",
    sections: [
      {
        id: "account",
        label: "Profile",
        description: "Name, avatar, sign-in.",
        icon: UserCircleIcon,
      },
      {
        id: "notifications",
        label: "Notifications",
        description: "Channels, digests, quiet hours.",
        icon: BellAlertIcon,
      },
    ],
  },
  {
    id: "workspace",
    label: "Workspace",
    sections: [
      {
        id: "general",
        label: "Document defaults",
        description: "Identity, logo, confidentiality, snippets.",
        icon: AdjustmentsHorizontalIcon,
        permission: "settings.general",
      },
      // "branding" and "content" are now stacked as cards inside the Document defaults
      // section above — separate rail entries removed. Routes still resolve (the page
      // dispatcher redirects /settings/branding and /settings/content to /general) so
      // any external links / bookmarks survive.
      {
        id: "templates",
        label: "Templates",
        description: "Document section templates.",
        icon: DocumentDuplicateIcon,
        permission: "settings.templates",
      },
      {
        id: "onboarding",
        label: "Onboarding",
        description: "Client onboarding forms.",
        icon: ClipboardDocumentCheckIcon,
        adminOnly: true,
      },
      // Rate card management isn't surfaced in the Settings nav anymore — it belongs alongside
      // the proposal builder where it's actually consumed. The route at
      // /app/settings/rate-card still resolves for legacy bookmarks.
      {
        id: "people",
        label: "People & access",
        description: "Members, roles & permissions.",
        icon: UserGroupIcon,
        adminOnly: true,
      },
      {
        id: "integrations",
        label: "Integrations",
        description: "AI, Google, Slack, email.",
        icon: Squares2X2Icon,
        permission: "settings.integrations",
      },
      {
        id: "agents",
        label: "AI agents",
        description: "Per-agent prompt + model overrides.",
        icon: CpuChipIcon,
        permission: "settings.agents",
      },
      {
        id: "checks",
        label: "Pulse checks",
        description: "Enable, downgrade, or add custom checks.",
        icon: CpuChipIcon,
        permission: "settings.agents",
      },
      {
        id: "curator",
        label: "Curator",
        description: "Weekly upkeep of Starters + Pulse checks.",
        icon: SparklesIcon,
        superAdminOnly: true,
      },
      {
        id: "foreman",
        label: "Foreman",
        description: "Daily delivery-risk audit pushed to your Desk.",
        icon: ShieldCheckIcon,
        adminOnly: true,
      },
      {
        id: "mcp",
        label: "MCP",
        description: "Connect Claude, plus the workspace-wide toggle for Super Admins.",
        icon: CommandLineIcon,
        permission: "mcp.connect",
      },
    ],
  },
  {
    id: "system",
    label: "System",
    sections: [
      {
        id: "analytics",
        label: "Analytics",
        description: "Delivery, output & AI usage across the workspace.",
        icon: ChartBarIcon,
        superAdminOnly: true,
        href: "/app/analytics",
      },
      {
        id: "audit",
        label: "Audit log",
        description: "Workspace activity history.",
        icon: ClipboardDocumentListIcon,
        permission: "settings.audit",
      },
      {
        id: "developer",
        label: "Developer",
        description: "API key, REST reference.",
        icon: CommandLineIcon,
        permission: "settings.developer",
      },
      {
        id: "privacy",
        label: "Privacy & data",
        description: "Exports, retention, deletion.",
        icon: ShieldCheckIcon,
        permission: "settings.privacy",
      },
      {
        id: "demo",
        label: "Demo builder",
        description: "White-label a shareable demo link.",
        icon: Squares2X2Icon,
        adminOnly: true,
      },
    ],
  },
];

export function SettingsShell({
  activeSection,
  children,
}: {
  activeSection: SettingsSectionId;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Read role + permissions DB-fresh (via /api/account) so the rail reflects matrix
  // edits to a Settings section without waiting for the member to re-log in.
  const { data: account } = useAccount();
  const role = account?.role ?? "";
  const permissions = account?.permissions ?? [];
  const isAdmin = isAtLeast(role, "ADMIN");
  const isSuper = isSuperAdmin(role);

  const currentSection = GROUPS.flatMap((g) => g.sections).find((s) => s.id === activeSection);
  const CurrentIcon = currentSection?.icon;

  const navGroups = GROUPS.map((group) => ({
    ...group,
    visible: group.sections.filter((section) => {
      if (section.superAdminOnly) return isSuper;
      if (section.permission) return isSuper || permissions.includes(section.permission);
      if (section.adminOnly) return isAdmin;
      return true;
    }),
  })).filter((g) => g.visible.length > 0);

  return (
    <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
      {/* Mobile: collapsible settings nav (hidden on xl+). The expanded panel is
          absolutely positioned so it floats OVER the page content instead of
          pushing everything below it down. */}
      <div className="relative xl:hidden">
        <button
          type="button"
          onClick={() => setMobileNavOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-3 text-sm font-medium text-[var(--text-1)] shadow-[var(--shadow-xs)]"
        >
          <span className="flex items-center gap-2.5">
            {CurrentIcon && (
              <CurrentIcon className="h-4 w-4 shrink-0 text-[var(--brand-700)]" />
            )}
            <span>{currentSection?.label ?? "Settings"}</span>
          </span>
          <ChevronDownIcon
            className={cn(
              "h-4 w-4 shrink-0 text-[var(--text-3)] transition-transform duration-200",
              mobileNavOpen && "rotate-180",
            )}
          />
        </button>
        {mobileNavOpen && (
          <>
            {/* Tap-away backdrop — closes the menu without shifting layout. */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setMobileNavOpen(false)}
              aria-hidden
            />
            <div className="absolute inset-x-0 top-[calc(100%+8px)] z-50 max-h-[70vh] space-y-3 overflow-y-auto rounded-[10px] border border-[var(--border-2)] bg-white p-2 shadow-[var(--shadow-lg)]">
              {navGroups.map((group) => (
              <div key={group.id}>
                <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                  {group.label}
                </p>
                <nav className="space-y-0.5">
                  {group.visible.map((section) => {
                    const href = section.href ?? `/app/settings/${section.id}`;
                    const active = activeSection === section.id || pathname === href;
                    const Icon = section.icon;
                    return (
                      <Link
                        key={section.id}
                        href={href}
                        onClick={() => setMobileNavOpen(false)}
                        className={cn(
                          "flex items-center gap-2.5 rounded-[6px] px-2 py-2 text-sm transition",
                          active
                            ? "bg-[var(--surface-brand)] font-medium text-[var(--brand-700)]"
                            : "text-[var(--text-2)] hover:bg-[var(--surface-1)]",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            active ? "text-[var(--brand-700)]" : "text-[var(--text-4)]",
                          )}
                        />
                        <span>{section.label}</span>
                      </Link>
                    );
                  })}
                </nav>
              </div>
              ))}
            </div>
          </>
        )}
      </div>

      <aside className="hidden space-y-4 xl:block">
        {GROUPS.map((group) => {
          const visible = group.sections.filter((section) => {
            if (section.superAdminOnly) return isSuper;
            if (section.permission) return isSuper || permissions.includes(section.permission);
            if (section.adminOnly) return isAdmin;
            return true;
          });
          if (visible.length === 0) return null;
          return (
            <div key={group.id}>
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                {group.label}
              </p>
              <nav className="app-card overflow-hidden p-1.5">
                {visible.map((section) => {
                  const href = section.href ?? `/app/settings/${section.id}`;
                  const active = activeSection === section.id || pathname === href;
                  const Icon = section.icon;
                  return (
                    <Link
                      key={section.id}
                      href={href}
                      className={cn(
                        "flex items-start gap-3 rounded-[8px] px-3 py-2 text-left text-sm transition",
                        active
                          ? "bg-[var(--surface-brand)] text-[var(--brand-700)]"
                          : "text-[var(--text-2)] hover:bg-[var(--surface-1)]",
                      )}
                    >
                      <Icon
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          active ? "text-[var(--brand-700)]" : "text-[var(--text-4)]",
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block font-semibold leading-tight">{section.label}</span>
                        <span className="mt-0.5 block text-[11px] font-normal leading-tight text-[var(--text-4)]">
                          {section.description}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          );
        })}

        {!isAdmin && !permissions.some((p) => p.startsWith("settings.")) ? (
          <p className="px-3 text-xs text-[var(--text-4)]">
            Workspace settings are managed by your admins. Ping one if you need access to a
            section.
          </p>
        ) : null}
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}

// Re-export so callers can import the icon name without importing from heroicons separately.
export { BuildingOffice2Icon, Cog6ToothIcon };
