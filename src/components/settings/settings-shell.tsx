"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BuildingOffice2Icon,
  ChevronDownIcon,
  ClipboardDocumentCheckIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  CpuChipIcon,
  DocumentDuplicateIcon,
  BeakerIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  UserCircleIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { segmentedTabClass, segmentedTabsClass } from "@/components/ui/segmented-tabs";
import { workspaceHasModule } from "@/lib/workspace-modules";
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
  | "launchpad"
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
  | "labs"
  | "analytics"
  | "audit"
  | "developer"
  | "privacy"
  // Back-compat: the old "workspace" mega-section
  | "workspace";

interface SectionDef {
  id: SettingsSectionId;
  /** Tab label inside its rail entry. */
  label: string;
  adminOnly?: boolean;
  /** Visible only to Super Admins (e.g. the role matrix editor). */
  superAdminOnly?: boolean;
  /** Matrix permission id that gates this section (per-role). Super Admins bypass. */
  permission?: string;
  /**
   * The workspace module this section belongs to (src/lib/workspace-modules.ts). A
   * business without the module never sees it, Super Admins included.
   */
  module?: string;
}

/**
 * One row in the settings rail. Related sections share a row and become tabs
 * on its page (Oct 2026: 19 rows became 9). Each section keeps its own URL,
 * permission and gate, so every existing link, bookmark and matrix permission
 * still works; merging is presentation only. A row shows when at least one of
 * its sections is visible to you, and links to the first one you can open.
 */
interface RailEntry {
  id: string;
  label: string;
  /** Two or three words. A longer one wraps and makes the rail uneven. */
  description: string;
  icon: (props: React.ComponentProps<"svg">) => React.ReactNode;
  sections: SectionDef[];
}

interface SectionGroup {
  id: string;
  label: string;
  entries: RailEntry[];
}

const GROUPS: SectionGroup[] = [
  {
    id: "you",
    label: "My account",
    entries: [
      {
        id: "account",
        label: "Account",
        description: "Profile and notifications.",
        icon: UserCircleIcon,
        sections: [
          { id: "account", label: "Profile" },
          { id: "notifications", label: "Notifications" },
        ],
      },
    ],
  },
  {
    id: "workspace",
    label: "Workspace",
    entries: [
      {
        id: "documents",
        label: "Documents",
        description: "Defaults and templates.",
        icon: DocumentDuplicateIcon,
        sections: [
          // "branding" and "content" are cards inside Document defaults; their
          // URLs redirect to /general.
          { id: "general", label: "Document defaults", permission: "settings.general" },
          { id: "templates", label: "Templates", permission: "settings.templates" },
        ],
      },
      {
        id: "client-forms",
        label: "Client forms",
        description: "Onboarding and Launchpad.",
        icon: ClipboardDocumentCheckIcon,
        sections: [
          { id: "onboarding", label: "Onboarding", adminOnly: true },
          { id: "launchpad", label: "Launchpad", adminOnly: true },
        ],
      },
      {
        id: "people",
        label: "People & access",
        description: "Members, roles, permissions.",
        icon: UserGroupIcon,
        sections: [{ id: "people", label: "People & access", adminOnly: true }],
      },
      {
        id: "integrations",
        label: "Integrations",
        description: "AI, Google, Slack, MCP.",
        icon: Squares2X2Icon,
        sections: [
          { id: "integrations", label: "Integrations", permission: "settings.integrations" },
          { id: "mcp", label: "MCP", permission: "mcp.connect", module: "mcp" },
        ],
      },
      {
        id: "automation",
        label: "Automation",
        description: "Agents, checks, Curator, Foreman.",
        icon: CpuChipIcon,
        sections: [
          { id: "agents", label: "AI agents", permission: "settings.agents" },
          { id: "checks", label: "Pulse checks", permission: "settings.agents", module: "pulse" },
          { id: "curator", label: "Curator", superAdminOnly: true, module: "starters" },
          { id: "foreman", label: "Foreman", adminOnly: true },
        ],
      },
    ],
  },
  {
    id: "system",
    label: "System",
    entries: [
      {
        id: "labs",
        label: "Labs",
        description: "Internal tools.",
        icon: BeakerIcon,
        sections: [{ id: "labs", label: "Labs", superAdminOnly: true, module: "labs" }],
      },
      // Analytics is not here: it is a full page, reached from the HQ context
      // strip. /app/settings/analytics still redirects to it.
      {
        id: "developer",
        label: "Developer",
        description: "API key, REST reference.",
        icon: CommandLineIcon,
        sections: [{ id: "developer", label: "Developer", permission: "settings.developer" }],
      },
      {
        id: "records",
        label: "Audit & privacy",
        description: "Activity, exports, retention.",
        icon: ShieldCheckIcon,
        sections: [
          { id: "audit", label: "Audit log", permission: "settings.audit" },
          { id: "privacy", label: "Privacy & data", permission: "settings.privacy" },
        ],
      },
    ],
  },
];

/** Every section the rail knows about, flattened. Exported for tests. */
export const RAIL_SECTION_IDS: SettingsSectionId[] = GROUPS.flatMap((g) =>
  g.entries.flatMap((e) => e.sections.map((s) => s.id)),
);

/** Number of rows the rail can show. Exported for tests. */
export const RAIL_ENTRY_COUNT = GROUPS.reduce((n, g) => n + g.entries.length, 0);

export function SettingsShell({
  activeSection,
  children,
}: {
  activeSection: SettingsSectionId;
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Read role + permissions DB-fresh (via /api/account) so the rail reflects matrix
  // edits to a Settings section without waiting for the member to re-log in.
  const { data: account } = useAccount();
  const role = account?.role ?? "";
  const permissions = account?.permissions ?? [];
  const isAdmin = isAtLeast(role, "ADMIN");
  const isSuper = isSuperAdmin(role);

  const workspaceModules = account?.workspaceModules ?? null;

  const canSee = (section: SectionDef) => {
    if (section.module && !workspaceHasModule(section.module, workspaceModules)) return false;
    if (section.superAdminOnly) return isSuper;
    if (section.permission) return isSuper || permissions.includes(section.permission);
    if (section.adminOnly) return isAdmin;
    return true;
  };

  const navGroups = GROUPS.map((group) => ({
    ...group,
    visible: group.entries
      .map((entry) => ({ ...entry, visibleSections: entry.sections.filter(canSee) }))
      .filter((entry) => entry.visibleSections.length > 0),
  })).filter((g) => g.visible.length > 0);

  const activeEntry = GROUPS.flatMap((g) => g.entries).find((e) =>
    e.sections.some((s) => s.id === activeSection),
  );
  const tabs = activeEntry ? activeEntry.sections.filter(canSee) : [];
  const CurrentIcon = activeEntry?.icon;
  const entryHref = (e: { visibleSections: SectionDef[] }) => `/app/settings/${e.visibleSections[0].id}`;

  return (
    <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
      {/* Mobile: collapsible settings nav (hidden on xl+). The expanded panel is
          absolutely positioned so it floats OVER the page content instead of
          pushing everything below it down. */}
      <div className="relative xl:hidden">
        <button
          type="button"
          onClick={() => setMobileNavOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] px-4 py-3 text-sm font-medium text-[var(--text-1)] shadow-[var(--shadow-xs)]"
        >
          <span className="flex items-center gap-2.5">
            {CurrentIcon && <CurrentIcon className="h-4 w-4 shrink-0 text-[var(--brand-700)]" />}
            <span>{activeEntry?.label ?? "Settings"}</span>
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
            <div className="fixed inset-0 z-40" onClick={() => setMobileNavOpen(false)} aria-hidden />
            <div className="absolute inset-x-0 top-[calc(100%+8px)] z-50 max-h-[70vh] space-y-3 overflow-y-auto rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-2 shadow-[var(--shadow-lg)]">
              {navGroups.map((group) => (
                <div key={group.id}>
                  <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                    {group.label}
                  </p>
                  <nav className="space-y-0.5">
                    {group.visible.map((entry) => {
                      const active = entry.id === activeEntry?.id;
                      const Icon = entry.icon;
                      return (
                        <Link
                          key={entry.id}
                          href={entryHref(entry)}
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
                          <span>{entry.label}</span>
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
        {navGroups.map((group) => (
          <div key={group.id}>
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
              {group.label}
            </p>
            <nav className="app-card overflow-hidden p-1.5">
              {group.visible.map((entry) => {
                const active = entry.id === activeEntry?.id;
                const Icon = entry.icon;
                return (
                  <Link
                    key={entry.id}
                    href={entryHref(entry)}
                    aria-current={active ? "page" : undefined}
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
                      <span className="block font-semibold leading-tight">{entry.label}</span>
                      <span className="mt-0.5 block text-[11px] font-normal leading-tight text-[var(--text-4)]">
                        {entry.description}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}

        {!isAdmin && !permissions.some((p) => p.startsWith("settings.")) ? (
          <p className="px-3 text-xs text-[var(--text-4)]">
            Workspace settings are managed by your admins. Ping one if you need access to a
            section.
          </p>
        ) : null}
      </aside>

      <div className="min-w-0">
        {tabs.length > 1 ? (
          // Sections that share a rail row. A segmented control (DESIGN.md's
          // pick-one grammar), wrapping rather than scrolling on a phone.
          <nav
            aria-label={`${activeEntry?.label} sections`}
            className={cn("mb-4", segmentedTabsClass)}
          >
            {tabs.map((tab) => {
              const active = tab.id === activeSection;
              return (
                <Link
                  key={tab.id}
                  href={`/app/settings/${tab.id}`}
                  aria-current={active ? "page" : undefined}
                  className={segmentedTabClass(active)}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
        {children}
      </div>
    </div>
  );
}

// Re-export so callers can import the icon name without importing from heroicons separately.
export { BuildingOffice2Icon, Cog6ToothIcon };
