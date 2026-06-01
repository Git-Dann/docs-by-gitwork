"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/format";
import { ClientManagement } from "@/components/clients/client-management";
import { TasksWorkspace } from "@/components/tasks/tasks-workspace";

type Tab = "clients" | "tasks";

/**
 * Portal shell: a light Clients | Tasks tab switch. Defaults to Clients so the
 * existing experience is unchanged; deep links (`?tab=tasks&client=<id>`) from
 * the client-detail Tasks card open straight into the filtered board.
 */
export function PortalWorkspace() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get("tab") === "tasks" ? "tasks" : "clients");
  const initialClient = params.get("client") ?? "";

  return (
    <div className="space-y-5">
      <div className="inline-flex overflow-hidden rounded-[8px] border border-[var(--border-2)]">
        <TabButton active={tab === "clients"} onClick={() => setTab("clients")}>
          Clients
        </TabButton>
        <TabButton active={tab === "tasks"} onClick={() => setTab("tasks")} borderLeft>
          Tasks
        </TabButton>
      </div>

      {tab === "clients" ? <ClientManagement /> : <TasksWorkspace initialClientId={initialClient} />}
    </div>
  );
}

function TabButton({
  active,
  borderLeft,
  onClick,
  children,
}: {
  active: boolean;
  borderLeft?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-4 py-2 text-sm font-medium transition",
        borderLeft && "border-l border-[var(--border-2)]",
        active
          ? "bg-[var(--surface-brand)] text-[var(--brand-800)]"
          : "bg-white text-[var(--text-3)] hover:bg-[var(--surface-1)]",
      )}
    >
      {children}
    </button>
  );
}
