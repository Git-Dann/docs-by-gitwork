"use client";

// People & Access — one area, two tabs: Members (everyone + invites) and Roles &
// permissions (the matrix). The Roles tab is Super-Admin-only, matching the matrix gate.
// Reuses the existing TeamSection + RolesSection unchanged.

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { segmentedTabClass, segmentedTabsClass } from "@/components/ui/segmented-tabs";
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
      <nav aria-label="People & access sections" className={segmentedTabsClass}>
        <TabButton active={activeTab === "members"} onClick={() => setTab("members")}>
          Members
        </TabButton>
        {isSuper ? (
          <TabButton active={activeTab === "roles"} onClick={() => setTab("roles")}>
            Roles &amp; permissions
          </TabButton>
        ) : null}
      </nav>

      {activeTab === "members" ? <TeamSection /> : <RolesSection />}
    </div>
  );
}

/** Same tabs as the consolidated settings pages (`segmented-tabs.ts`). */
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={segmentedTabClass(active)}>
      {children}
    </button>
  );
}
