"use client";

// People & Access — one area, two tabs: Members (everyone + invites) and Roles &
// permissions (the matrix). The Roles tab is Super-Admin-only, matching the matrix gate.
// Reuses the existing TeamSection + RolesSection unchanged.

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { UserGroupIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { useAccount } from "@/hooks/use-account";
import { isSuperAdmin } from "@/types/auth";
import { TeamSection } from "@/components/settings/team-section";
import { RolesSection } from "@/components/settings/roles-section";

type Tab = "members" | "roles";

export function PeopleAccess() {
  const { data: account } = useAccount();
  const isSuper = isSuperAdmin(account?.role ?? "");
  const searchParams = useSearchParams();
  const initial: Tab = searchParams.get("tab") === "roles" ? "roles" : "members";
  const [tab, setTab] = useState<Tab>(initial);

  // Non-super-admins never see the Roles tab.
  const activeTab: Tab = tab === "roles" && !isSuper ? "members" : tab;

  return (
    <div className="space-y-5">
      <div className="inline-flex overflow-hidden rounded-[8px] border border-[var(--border-2)]">
        <TabButton
          active={activeTab === "members"}
          onClick={() => setTab("members")}
          icon={<UserGroupIcon className="h-4 w-4" />}
        >
          Members
        </TabButton>
        {isSuper ? (
          <TabButton
            active={activeTab === "roles"}
            onClick={() => setTab("roles")}
            icon={<LockClosedIcon className="h-4 w-4" />}
            borderLeft
          >
            Roles &amp; permissions
          </TabButton>
        ) : null}
      </div>

      {activeTab === "members" ? <TeamSection /> : <RolesSection />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  borderLeft,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  borderLeft?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition",
        borderLeft && "border-l border-[var(--border-2)]",
        active
          ? "bg-[var(--surface-brand)] text-[var(--brand-700)]"
          : "text-[var(--text-2)] hover:bg-[var(--surface-1)]",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
