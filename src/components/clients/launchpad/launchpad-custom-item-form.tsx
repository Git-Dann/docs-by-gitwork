"use client";

/**
 * The inline form for a requirement Gitwork adds to ONE client's Launchpad.
 *
 * Internal view only. It writes into that client's kit snapshot — never the master
 * template — so the copy says so, because "edit the checklist" otherwise reads as
 * "edit everyone's checklist".
 *
 * Inline rather than a modal: the form sits in the module it is adding to, inside a
 * `.widget-card` (`overflow: hidden`, §45.2), so it grows the card instead of
 * floating over it.
 */

import { useState } from "react";
import type { LaunchpadCustomItemInput } from "@/lib/api";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

type Owner = "client" | "gitwork" | "unset";

function ownerOf(value: boolean | null | undefined): Owner {
  return value === true ? "client" : value === false ? "gitwork" : "unset";
}

export function CustomItemForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: LaunchpadCustomItemInput;
  submitLabel: string;
  busy: boolean;
  onSubmit: (input: LaunchpadCustomItemInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [helper, setHelper] = useState(initial?.helper ?? "");
  const [owner, setOwner] = useState<Owner>(ownerOf(initial?.ownedByClient));
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!label.trim()) {
      setError("Give the requirement a name.");
      return;
    }
    setError(null);
    try {
      await onSubmit({
        label: label.trim(),
        helper: helper.trim() || null,
        ownedByClient: owner === "client" ? true : owner === "gitwork" ? false : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save — please try again.");
    }
  };

  return (
    <form
      className="space-y-3 rounded-[10px] border border-[var(--brand-300)] bg-[var(--surface-0)] p-3 sm:p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p
        className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-4)]"
        style={{ fontFamily: MONO }}
      >
        For this client only — the template is not changed
      </p>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[var(--text-2)]">Requirement</span>
        <input
          className="app-input min-h-[44px] w-full text-base sm:min-h-[36px] sm:text-sm"
          value={label}
          maxLength={200}
          autoFocus
          placeholder="e.g. Professional indemnity certificate"
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[var(--text-2)]">
          Why we need it / how to get it
        </span>
        <textarea
          className="app-textarea w-full text-base sm:text-sm"
          rows={2}
          maxLength={1000}
          value={helper}
          placeholder="One line the client can act on without asking us."
          onChange={(e) => setHelper(e.target.value)}
        />
      </label>

      <fieldset>
        <legend className="mb-1 text-xs font-medium text-[var(--text-2)]">Who owns it</legend>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["client", "Client-owned"],
              ["gitwork", "Gitwork-owned"],
              ["unset", "Not an account"],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              type="button"
              aria-pressed={owner === value}
              onClick={() => setOwner(value)}
              className={[
                "rounded-[6px] border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
                owner === value
                  ? "border-[var(--brand-300)] bg-[var(--surface-brand)] text-[var(--brand-800)]"
                  : "border-[var(--border-1)] bg-[var(--surface-1)] text-[var(--text-4)] hover:text-[var(--text-2)]",
              ].join(" ")}
              style={{ fontFamily: MONO }}
            >
              {text}
            </button>
          ))}
        </div>
      </fieldset>

      {error ? (
        <p className="text-xs text-[var(--danger-500)]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className="app-button app-button-secondary app-button-sm">
          Cancel
        </button>
        <button type="submit" disabled={busy} className="app-button app-button-primary app-button-sm">
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
