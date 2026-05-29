"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  BellAlertIcon,
  BuildingOffice2Icon,
  ClipboardDocumentListIcon,
  ShieldCheckIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";

export type SettingsSectionId =
  | "account"
  | "notifications"
  | "workspace"
  | "audit"
  | "privacy";

interface SectionDef {
  id: SettingsSectionId;
  label: string;
  description: string;
  icon: (props: React.ComponentProps<"svg">) => React.ReactNode;
  adminOnly?: boolean;
}

const SECTIONS: SectionDef[] = [
  {
    id: "account",
    label: "My account",
    description: "Profile, sign-in, devices.",
    icon: UserCircleIcon,
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Where and when you get pinged.",
    icon: BellAlertIcon,
  },
  {
    id: "workspace",
    label: "Workspace",
    description: "Branding, content, integrations, team.",
    icon: BuildingOffice2Icon,
    adminOnly: true,
  },
  {
    id: "audit",
    label: "Audit log",
    description: "Workspace settings & access history.",
    icon: ClipboardDocumentListIcon,
    adminOnly: true,
  },
  {
    id: "privacy",
    label: "Privacy & data",
    description: "Exports, retention, deletion.",
    icon: ShieldCheckIcon,
    adminOnly: true,
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
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const visible = SECTIONS.filter((section) => !section.adminOnly || isAdmin);

  return (
    <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="space-y-1">
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
                  "flex items-start gap-3 rounded-[8px] px-3 py-2.5 text-left text-sm transition",
                  active
                    ? "bg-[var(--surface-brand)] text-[var(--brand-700)]"
                    : "text-[var(--text-2)] hover:bg-[var(--surface-1)]",
                )}
              >
                <Icon
                  className={cn(
                    "mt-0.5 h-5 w-5 shrink-0",
                    active ? "text-[var(--brand-700)]" : "text-[var(--text-4)]",
                  )}
                />
                <span className="min-w-0">
                  <span className="block font-semibold">{section.label}</span>
                  <span className="mt-0.5 block text-xs font-normal text-[var(--text-4)]">
                    {section.description}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>

        {!isAdmin ? (
          <p className="px-3 text-xs text-[var(--text-4)]">
            Workspace settings are admin-only. Ping a workspace admin if you need something
            changed.
          </p>
        ) : null}
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
