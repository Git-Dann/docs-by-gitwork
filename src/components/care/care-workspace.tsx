"use client";

import { useEffect, useState } from "react";
import type { SupportClient } from "@/types/support";
import { useAccount } from "@/hooks/use-account";
import { useSupportClients } from "@/hooks/use-support";
import { CareHome } from "./care-home";
import { ClientCockpit } from "./client-cockpit";

const ACTIVE_CLIENT_KEY = "care-active-client";

/**
 * Care shell — the Front/Missive-style triage cockpit. Per-client first: a cross-client
 * landing (CareHome) until a client is picked, then a three-pane cockpit (ClientCockpit).
 * The selected client persists in localStorage so a refresh lands you back where you were.
 */
export function CareWorkspace() {
  const account = useAccount();
  const clientsQ = useSupportClients();
  const [activeClientId, setActiveClientId] = useState<string | null>(null);

  // Restore last-opened client once.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_CLIENT_KEY) : null;
    if (saved) setActiveClientId(saved);
  }, []);

  function select(client: SupportClient | null) {
    setActiveClientId(client?.id ?? null);
    if (typeof window !== "undefined") {
      if (client) window.localStorage.setItem(ACTIVE_CLIENT_KEY, client.id);
      else window.localStorage.removeItem(ACTIVE_CLIENT_KEY);
    }
  }

  const activeClient = clientsQ.data?.clients.find((c) => c.id === activeClientId) ?? null;

  if (activeClient) {
    return (
      <ClientCockpit
        client={activeClient}
        currentUserId={account.data?.id}
        onBack={() => select(null)}
      />
    );
  }

  return <CareHome onSelectClient={select} />;
}
