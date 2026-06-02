"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AdjustmentsHorizontalIcon,
  BellAlertIcon,
  BuildingOffice2Icon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  CpuChipIcon,
  DocumentDuplicateIcon,
  LockClosedIcon,
  PaintBrushIcon,
  PencilSquareIcon,
  ShieldCheckIcon,
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
  // Workspace
  | "general"
  | "branding"
  | "templates"
  | "content"
  | "rate-card"
  | "team"
  | "roles"
  | "integrations"
  | "agents-checks"
  // System
  | "audit"
  | "developer"
  | "privacy"
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
        label: "General",
        description: "Proposal defaults.",
        icon: AdjustmentsHorizontalIcon,
        permission: "settings.general",
      },
      {
        id: "branding",
        label: "Branding",
        description: "Logo and cover accents.",
        icon: PaintBrushIcon,
        permission: "settings.branding",
      },
      {
        id: "content",
        label: "Content",
        description: "Confidentiality + objective snippets.",
        icon: PencilSquareIcon,
        permission: "settings.content",
      },
      {
        id: "templates",
        label: "Templates",
        description: "Document section templates.",
        icon: DocumentDuplicateIcon,
        permission: "settings.templates",
      },
      // Rate card management isn't surfaced in the Settings nav anymore — it belongs alongside
      // the proposal builder where it's actually consumed. The route at
      // /app/settings/rate-card still resolves for legacy bookmarks.
      {
        id: "team",
        label: "Team",
        description: "Invite teammates.",
        icon: UserGroupIcon,
        adminOnly: true,
      },
      {
        id: "roles",
        label: "Roles & permissions",
        description: "Define what each role can do.",
        icon: LockClosedIcon,
        superAdminOnly: true,
      },
      {
        id: "integrations",
        label: "Integrations",
        description: "AI, Google, Slack, email.",
        icon: Squares2X2Icon,
        permission: "settings.integrations",
      },
      {
        id: "agents-checks",
        label: "Agents & checks",
        description: "AI agent prompts and Pulse checks.",
        icon: CpuChipIcon,
        permission: "settings.agents",
      },
    ],
  },
  {
    id: "system",
    label: "System",
    sections: [
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
        description: "API keys, demo cleanup.",
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
  // Read role + permissions DB-fresh (via /api/account) so the rail reflects matrix
  // edits to a Settings section without waiting for the member to re-log in.
  const { data: account } = useAccount();
  const role = account?.role ?? "";
  const permissions = account?.permissions ?? [];
  const isAdmin = isAtLeast(role, "ADMIN");
  const isSuper = isSuperAdmin(role);

  return (
    <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="space-y-4">
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
                  const href = `/app/settings/${section.id}`;
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
