"use client";

/**
 * Settings → Developer → API keys (multi-tenant Phase 2). Admins create named keys for their
 * own workspace. A key acts as the person who created it, and stops working the moment that
 * person is archived or the key is revoked. The token is shown exactly once.
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/settings/settings-card";

interface ApiKeySummary {
  id: string;
  name: string;
  preview: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export function ApiKeysCard({ number }: { number: string }) {
  const [keys, setKeys] = useState<ApiKeySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ keys: ApiKeySummary[] }>("/api/settings/api-keys");
      setKeys(res.keys);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your API keys.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await apiFetch<{ key: ApiKeySummary; token: string }>("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      setFresh({ name: res.key.name, token: res.token });
      setCopied(false);
      setName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the key.");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    setError(null);
    try {
      await apiFetch(`/api/settings/api-keys/${id}`, { method: "DELETE" });
      setConfirmRevoke(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't revoke the key.");
    }
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <SettingsCard number={number} title="API keys">
      <p className="max-w-2xl text-sm leading-6 text-[var(--text-3)]">
        For scripts and integrations that call the Foundry API. Send a key as an{" "}
        <code className="rounded bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-2)]">
          Authorization: Bearer &lt;key&gt;
        </code>{" "}
        header. A key acts as the person who created it, in this workspace only, and stops working if
        they are archived or the key is revoked.
      </p>

      {fresh ? (
        <div className="mt-5 space-y-2 rounded-[10px] border border-[var(--warning-500)] bg-[var(--warning-50)] p-4">
          <p className="text-sm font-medium text-[var(--text-1)]">
            Copy &ldquo;{fresh.name}&rdquo; now. It won&rsquo;t be shown again.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2 font-mono text-xs text-[var(--text-1)]">
              {fresh.token}
            </code>
            <Button type="button" variant="primary" size="sm" onClick={() => copy(fresh.token)}>
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setFresh(null)}>
              Done
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void create();
          }}
          placeholder="Name, e.g. Zapier or reporting script"
          maxLength={80}
          className="app-input min-w-[220px] flex-1 text-base sm:text-sm"
          aria-label="New key name"
        />
        <Button type="button" variant="primary" size="sm" onClick={create} disabled={creating || !name.trim()}>
          {creating ? "Creating…" : "Create key"}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-[var(--danger-500)]">
          {error}
        </p>
      ) : null}

      <div className="mt-5">
        {keys === null ? (
          <p className="text-sm text-[var(--text-4)]">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-3 py-2.5 text-sm text-[var(--text-4)]">
            No API keys yet.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border-1)] rounded-[10px] border border-[var(--border-1)]">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-1)]" title={k.name}>
                    {k.name}
                  </p>
                  <p className="font-mono text-[11px] uppercase tracking-wide text-[var(--text-4)]">
                    {k.preview}… · created {formatDate(k.createdAt)} ·{" "}
                    {k.lastUsedAt ? `last used ${formatDate(k.lastUsedAt)}` : "never used"}
                  </p>
                </div>
                {confirmRevoke === k.id ? (
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="danger" size="sm" onClick={() => revoke(k.id)}>
                      Revoke now
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setConfirmRevoke(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button type="button" variant="secondary" size="sm" onClick={() => setConfirmRevoke(k.id)}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </SettingsCard>
  );
}
