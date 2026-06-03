// Adaptive HQ dashboard composition — which "needs attention" cards a person sees,
// driven by their role + permissions (mirrors the server `can*` helpers).

import type { ComponentType } from "react";
import { isAtLeast } from "@/types/auth";
import { ApprovalsCard } from "@/components/dashboard/approvals-card";
import { ProposalsSignoffCard } from "@/components/dashboard/proposals-signoff-card";
import { OverdueTasksCard } from "@/components/dashboard/overdue-tasks-card";
import { DailyRollup } from "@/components/tasks/daily-rollup";

export type DashAccount = { role: string; permissions: string[] };

const isAdmin = (a: DashAccount) => isAtLeast(a.role, "ADMIN");
/** Admins/Super Admins bypass; everyone else needs the permission. */
export const can = (a: DashAccount, perm: string) => isAdmin(a) || a.permissions.includes(perm);

export type AttentionCard = {
  id: string;
  when: (a: DashAccount) => boolean;
  Component: ComponentType;
};

/** Cards in the top "needs attention" row — only those whose `when` passes render. */
export const ATTENTION_CARDS: AttentionCard[] = [
  {
    id: "approvals",
    when: (a) => can(a, "backstage.approve") || can(a, "backstage.expenses"),
    Component: ApprovalsCard,
  },
  { id: "rollup", when: (a) => can(a, "tasks.publish"), Component: DailyRollup },
  { id: "overdue", when: (a) => can(a, "clients"), Component: OverdueTasksCard },
  { id: "signoff", when: (a) => can(a, "proposals"), Component: ProposalsSignoffCard },
];
