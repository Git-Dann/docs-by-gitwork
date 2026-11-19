"use client";

import { CareModal } from "./care-shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useCreateSupportClient } from "@/hooks/use-support";
import { useClientList } from "@/hooks/use-proposals";
import Link from "next/link";

// ─── add client modal ─────────────────────────────────────────────────────────

export function AddClientModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [days, setDays] = useState("");
  const [recipient, setRecipient] = useState("");
  const [portalClientId, setPortalClientId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const createClient = useCreateSupportClient();
  const clientsQuery = useClientList();
  const portalClients = clientsQuery.data?.clients.filter(c => c.source === "MANUAL") ?? [];

  function slug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    createClient.mutate(
      {
        name: name.trim(),
        slug: slug(name.trim()),
        status: "active",
        supportDaysPerMonth: days ? Number(days) : undefined,
        supportDaysUsed: 0,
        reportingRecipient: recipient.trim() || undefined,
        workspaceClientId: portalClientId || undefined,
      },
      {
        onSuccess: () => onClose(),
        onError: (err) => setError(err instanceof Error ? err.message : "Failed to create client"),
      },
    );
  }

  return (
    <CareModal title="Add client" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {portalClients.length > 0 && (
          <label className="block space-y-1.5">
            <span className="app-field-label">Link to Portal client <span className="font-normal text-[var(--text-4)]">(optional)</span></span>
            <select
              value={portalClientId}
              onChange={(e) => {
                setPortalClientId(e.target.value);
                const selected = portalClients.find(c => c.id === e.target.value);
                if (selected && !name) setName(selected.name);
              }}
              className="app-select w-full"
            >
              <option value="">— None —</option>
              {portalClients.map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </label>
        )}

        <label className="block space-y-1.5">
          <span className="app-field-label">Client name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="app-input w-full"
            placeholder="Acme Corp"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className="app-field-label">Support days/month</span>
            <input
              value={days}
              onChange={(e) => setDays(e.target.value)}
              type="number"
              min="0"
              className="app-input w-full"
              placeholder="e.g. 5"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="app-field-label">Report recipient</span>
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              type="email"
              className="app-input w-full"
              placeholder="client@company.com"
            />
          </label>
        </div>

        {error && (
          <p className="rounded-[10px] bg-[var(--danger-50)] px-3 py-2.5 text-sm text-[var(--danger-500)]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={createClient.isPending || !name.trim()}
            loading={createClient.isPending}
          >
            {createClient.isPending ? "Adding…" : "Add client"}
          </Button>
        </div>
      </form>
    </CareModal>
  );
}
