"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { buttonStyles } from "@/components/ui/button";
import { useSupportClients } from "@/hooks/use-support";
import { getProposal } from "@/lib/api";
import type { ProposalDocument } from "@/types/proposal";

/**
 * "Pull in client data" for a REPORT document. Picks a Care support client + month, calls
 * the pull endpoint (which fills the report's data sections from live ticket/analytics data
 * while leaving the narrative untouched), then hands the refreshed document back to the editor.
 */
export function PullSupportDataModal({
  open,
  onClose,
  documentId,
  defaultClientName,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  documentId: string;
  defaultClientName?: string | null;
  onApplied: (proposal: ProposalDocument) => void;
}) {
  const clientsQ = useSupportClients();
  const clients = useMemo(() => clientsQ.data?.clients ?? [], [clientsQ.data]);

  // Default the picker to the client whose name matches the doc, else the first.
  const defaultClientId = useMemo(() => {
    if (defaultClientName) {
      const match = clients.find((c) => c.name.toLowerCase() === defaultClientName.toLowerCase());
      if (match) return match.id;
    }
    return clients[0]?.id ?? "";
  }, [clients, defaultClientName]);

  const [clientId, setClientId] = useState("");
  const effectiveClientId = clientId || defaultClientId;

  // Month options: last 12 months, default the previous month.
  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 1; i <= 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      opts.push({ value, label: d.toLocaleString("en-GB", { month: "long", year: "numeric" }) });
    }
    return opts;
  }, []);
  const [month, setMonth] = useState("");
  const effectiveMonth = month || monthOptions[0]?.value || "";

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function handlePull() {
    if (!effectiveClientId || !effectiveMonth) return;
    setBusy(true);
    setMsg(null);
    const [y, m] = effectiveMonth.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    const periodLabel = start.toLocaleString("en-GB", { month: "long", year: "numeric" });
    try {
      const res = await fetch(`/api/documents/${documentId}/pull-support-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: effectiveClientId,
          periodStart: start.toISOString().slice(0, 10),
          periodEnd: end.toISOString().slice(0, 10),
          periodLabel,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { updated?: number; analyticsFound?: boolean };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `Pull failed: ${res.status}`);

      // Refetch the document so the editor reflects the filled sections.
      const { proposal } = await getProposal(documentId);
      onApplied(proposal);

      const updated = json.data?.updated ?? 0;
      const note = json.data?.analyticsFound === false ? " (no analytics connection — metrics table left as-is)" : "";
      setMsg({ type: "ok", text: `Filled ${updated} section${updated === 1 ? "" : "s"} for ${periodLabel}.${note}` });
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Failed to pull data" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Pull in client data">
      <div className="space-y-4 p-5">
        <p className="text-sm text-[var(--text-3)]">
          Fills this report&apos;s performance, ticket-volume and analytics sections from the
          client&apos;s live Care data for the chosen month. Your cover, overview and closing text stay as they are.
        </p>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--text-2)]">Client</span>
          <select
            value={effectiveClientId}
            onChange={(e) => setClientId(e.target.value)}
            className="app-select h-9 w-full text-sm"
            disabled={clientsQ.isLoading || clients.length === 0}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--text-2)]">Month</span>
          <select
            value={effectiveMonth}
            onChange={(e) => setMonth(e.target.value)}
            className="app-select h-9 w-full text-sm"
          >
            {monthOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        {msg && (
          <p className={msg.type === "ok" ? "text-xs text-emerald-600" : "text-xs text-red-500"}>{msg.text}</p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonStyles({ variant: "secondary", size: "md" })}>
            Close
          </button>
          <button
            type="button"
            onClick={() => void handlePull()}
            disabled={busy || !effectiveClientId}
            className={buttonStyles({ variant: "primary", size: "md" })}
          >
            {busy ? "Pulling…" : "Pull data"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
