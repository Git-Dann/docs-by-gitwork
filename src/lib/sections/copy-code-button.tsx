"use client";

/**
 * The code block's copy button — its own `"use client"` module ON PURPOSE.
 *
 * `src/lib/sections/registry.ts` is imported by SERVER code (`api/documents/[id]/ai/chat`), so
 * every section module must stay server-safe. Importing `useState` directly into
 * `code-snippet.tsx` broke the production build while `tsc` stayed perfectly happy — which is
 * exactly why CI runs `next build` as well as a typecheck.
 *
 * Same pattern the other interactive section pieces use (`inline-text.tsx`,
 * `rich-inline-editor.tsx`): the stateful leaf is a client component, the section definition that
 * references it is not.
 */

import { CheckIcon, ClipboardIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

export function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      // `print:hidden` — a button is furniture, and furniture must never print into a document.
      className="inline-flex shrink-0 items-center gap-1 rounded-[4px] border border-[var(--border-2)] bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-3)] transition hover:text-[var(--text-1)] print:hidden"
      onClick={() => {
        // Guarded: `navigator.clipboard` is undefined on a non-secure origin, and an unhandled
        // rejection here would surface as a console error on a client-facing page.
        void navigator.clipboard
          ?.writeText(code)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          })
          .catch(() => setCopied(false));
      }}
      aria-label={copied ? "Copied" : "Copy code"}
    >
      {copied ? <CheckIcon className="h-3 w-3" /> : <ClipboardIcon className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
