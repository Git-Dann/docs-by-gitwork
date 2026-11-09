"use client";

/** Platform console → a business → Sign-in: the email domains that may use Google. */

import { useEffect, useState } from "react";
import { useSetPlatformDomains } from "@/hooks/use-platform";
import type { PlatformWorkspace } from "@/lib/platform-types";

export function SignInDomains({ workspace }: { workspace: PlatformWorkspace }) {
  const save = useSetPlatformDomains();
  const [text, setText] = useState(workspace.allowedEmailDomains.join(", "));
  const [saved, setSaved] = useState(false);
  useEffect(() => setText(workspace.allowedEmailDomains.join(", ")), [workspace.allowedEmailDomains]);

  if (workspace.isHome) {
    return <p className="text-[13px] text-[var(--text-3)]">Gitwork signs in with its own Google client, which is unchanged.</p>;
  }
  const domains = text.split(/[\s,]+/).filter(Boolean);
  return (
    <section aria-labelledby="platform-signin-heading" className="space-y-3">
      <div>
        <h3 id="platform-signin-heading" className="text-sm font-semibold text-[var(--text-1)]">Sign-in</h3>
        <p className="mt-0.5 text-[13px] text-[var(--text-3)]">
          Everyone can sign in with email and a password. People whose email is on one of these domains can also use
          Google, and join as a Developer the first time. Public mail services such as gmail.com aren&rsquo;t allowed.
        </p>
      </div>
      <label className="block space-y-1.5">
        <span className="block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-4)]">Google domains</span>
        <input
          className="app-input w-full text-base sm:text-sm"
          value={text}
          placeholder="canary.co.uk, canary.com"
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
        />
      </label>
      {save.error ? (
        <p role="alert" className="text-sm text-[var(--danger-500)]">
          {save.error instanceof Error ? save.error.message : "Couldn't save the domains."}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        {saved ? <span className="text-[12px] text-[var(--text-3)]">Saved</span> : null}
        <button
          type="button"
          className="app-button app-button-primary app-button-sm"
          disabled={save.isPending}
          onClick={async () => {
            try {
              await save.mutateAsync({ id: workspace.id, domains });
              setSaved(true);
            } catch {
              // shown above
            }
          }}
        >
          {save.isPending ? "Saving…" : "Save domains"}
        </button>
      </div>
    </section>
  );
}
