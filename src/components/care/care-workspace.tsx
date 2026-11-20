"use client";

import { useEffect, useState } from "react";
import type { SupportClient } from "@/types/support";
import { useSupportClients } from "@/hooks/use-support";
import { careHref, isCareSection, type CareSection } from "@/lib/care-links";
import { isSupportDesk } from "@/lib/care-mode";
import { CareHome } from "./care-home";
import { ClientCockpit } from "./client-cockpit";

const ACTIVE_CLIENT_KEY = "care-active-client";

/**
 * Care shell — the one Care. Per-client first: a cross-client landing (CareHome) until a client
 * is picked, then that client's Care (ClientCockpit): conversations, tickets, reports, automation
 * and channels.
 *
 * Deep links: `?client=<id>&section=<section>` opens a client on a section. Every retired
 * `/app/support?…` link redirects into exactly that shape (src/lib/care-links.ts). Without a link,
 * the last-opened client is restored from localStorage so a refresh lands you back where you were.
 */
export function CareWorkspace() {
  const clientsQ = useSupportClients();
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [initialSection, setInitialSection] = useState<CareSection>("conversations");
  /**
   * A conversation to open on arrival. Two ways in, one piece of state: Care home's
   * "Needs you first" passes it to `select()`, and a `?conversation=` deep link (⌘K search)
   * is read on mount.
   */
  const [initialConversationId, setInitialConversationId] = useState<string | null>(null);

  // Read once on mount. window.location rather than useSearchParams, which would force a
  // Suspense boundary onto the page for a value only needed at start-up.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const linked = params.get("client");
    const section = params.get("section");
    if (linked) {
      setActiveClientId(linked);
      setInitialConversationId(params.get("conversation"));
      if (isCareSection(section)) setInitialSection(section);
      return;
    }
    const saved = window.localStorage.getItem(ACTIVE_CLIENT_KEY);
    if (saved) setActiveClientId(saved);
  }, []);

  /** Keep the address bar a shareable link to what is on screen, without adding history. */
  function syncUrl(clientId: string | null, section: CareSection | null) {
    if (typeof window === "undefined") return;
    // Only rewrite on the real page; the demo mounts this under /demo/care.
    if (!window.location.pathname.startsWith("/app/care")) return;
    window.history.replaceState(window.history.state, "", careHref({ clientId, section }));
  }

  function select(client: SupportClient | null, conversationId?: string) {
    setActiveClientId(client?.id ?? null);
    // Null when nothing was named, so picking a client from the rail does not reopen whatever
    // the last deep link pointed at.
    setInitialConversationId(conversationId ?? null);
    // An ingest-only client has no queue to open. Land on its Settings, which is the only thing
    // anyone goes there for — the connector that keeps its mail flowing.
    setInitialSection(client && !isSupportDesk(client) ? "settings" : "conversations");
    syncUrl(client?.id ?? null, null);
    if (typeof window !== "undefined") {
      if (client) window.localStorage.setItem(ACTIVE_CLIENT_KEY, client.id);
      else window.localStorage.removeItem(ACTIVE_CLIENT_KEY);
    }
  }

  const activeClient = clientsQ.data?.clients.find((c) => c.id === activeClientId) ?? null;

  // ⚠️ A remembered client that has since become ingest-only would otherwise reopen a desk with
  // no queues on it. Fall back to Care home and forget it, rather than restoring a dead end.
  useEffect(() => {
    if (!activeClient || isSupportDesk(activeClient)) return;
    if (initialSection === "conversations") setInitialSection("settings");
  }, [activeClient, initialSection]);

  if (activeClient) {
    return (
      <ClientCockpit
        key={activeClient.id}
        client={activeClient}
        initialSection={initialSection}
        initialConversationId={initialConversationId}
        onSectionChange={(section) => syncUrl(activeClient.id, section)}
        onBack={() => select(null)}
      />
    );
  }

  return <CareHome onSelectClient={select} />;
}
