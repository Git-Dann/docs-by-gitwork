"use client";

/**
 * Platform console → Add business (multi-tenant Phase 3). Creates the workspace with the
 * default module bundle and only its own AI keys, and sends its owner an invite to create
 * an account with a password. The link is also shown here, in case the email doesn't arrive.
 */

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useCreatePlatformBusiness, type NewBusinessResponse } from "@/hooks/use-platform";

export function AddBusinessDialog({
  open,
  onClose,
  onOpenBusiness,
}: {
  open: boolean;
  onClose: () => void;
  onOpenBusiness: (id: string) => void;
}) {
  const create = useCreatePlatformBusiness();
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [result, setResult] = useState<NewBusinessResponse | null>(null);
  const [copied, setCopied] = useState(false);

  function close() {
    setName("");
    setOwnerName("");
    setOwnerEmail("");
    setResult(null);
    setCopied(false);
    create.reset();
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setResult(await create.mutateAsync({ name, ownerName, ownerEmail }));
    } catch {
      // Shown from create.error below.
    }
  }

  const field = "app-input w-full text-base sm:text-sm";
  const label = "block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-4)]";

  return (
    <Modal open={open} onClose={close} title="Add business" panelClassName="w-full max-w-lg">
      <div className="space-y-4 p-5">
        {result ? (
          <>
            <p className="text-sm leading-6 text-[var(--text-2)]">
              <strong>{result.workspace.name}</strong> is set up with the default modules and its own AI keys only.{" "}
              {result.emailed
                ? `An invite has gone to ${ownerEmail.trim()}.`
                : "The invite email couldn't be sent, so send the owner this link yourself."}
            </p>
            {!result.emailed && result.emailError ? (
              <p className="text-xs text-[var(--text-4)]">{result.emailError}</p>
            ) : null}
            <div className="space-y-1.5">
              <span className={label}>Owner&rsquo;s invite link (14 days)</span>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2 font-mono text-xs text-[var(--text-1)]">
                  {result.inviteUrl}
                </code>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(result.inviteUrl);
                      setCopied(true);
                    } catch {
                      setCopied(false);
                    }
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" size="sm" onClick={close}>
                Done
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  const id = result.workspace.id;
                  close();
                  onOpenBusiness(id);
                }}
              >
                Open business
              </Button>
            </div>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block space-y-1.5">
              <span className={label}>Business name</span>
              <input className={field} value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
            </label>
            <label className="block space-y-1.5">
              <span className={label}>Owner&rsquo;s name</span>
              <input className={field} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} maxLength={120} autoComplete="off" />
            </label>
            <label className="block space-y-1.5">
              <span className={label}>Owner&rsquo;s email</span>
              <input
                type="email"
                className={field}
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                required
                autoComplete="off"
              />
            </label>
            <p className="text-xs leading-5 text-[var(--text-4)]">
              The owner becomes the business&rsquo;s Super Admin and sets their own password. Only that email can
              use the invite.
            </p>
            {create.error ? (
              <p role="alert" className="text-sm text-[var(--danger-500)]">
                {create.error instanceof Error ? create.error.message : "Couldn't create the business."}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={create.isPending}>
                {create.isPending ? "Creating…" : "Create business"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
