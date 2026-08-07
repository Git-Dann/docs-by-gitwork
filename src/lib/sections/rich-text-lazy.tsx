"use client";

/**
 * The rich-text field, fetched only when something is actually editable.
 *
 * ⚠️ This module exists because of a measurement, not a preference. `prose.tsx` and
 * `introduction.tsx` import the field at module scope and then render it *conditionally* on
 * `editable` — but an unconditional import is unconditional to the bundler, so TipTap and
 * ProseMirror landed in every route that renders a block. Measured: `/app/docs/[id]/preview`, a
 * READ-ONLY route that can never edit anything, went 245 kB → 419 kB. Exactly the same +174 kB the
 * editor itself paid.
 *
 * A lazy boundary here means the editor chunk is requested when a field is rendered editable and
 * never otherwise, so the public share view, the print view and the preview go back to paying
 * nothing for it.
 *
 * The fallback renders the SAME markdown through the same renderer the read-only path uses, so
 * there is no flash of empty text while the chunk arrives — the field simply becomes editable a
 * moment later, looking identical throughout.
 */

import { Suspense, lazy, type CSSProperties } from "react";
import { renderLines } from "@/lib/markdown";

const Editor = lazy(() =>
  import("@/lib/sections/rich-text-field").then((m) => ({ default: m.RichTextField })),
);

export function RichTextField(props: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  // ⚠️ Same guard as `rich-text-field.tsx`, and needed independently here: this fallback renders
  // synchronously, before the lazy chunk even arrives, so an unguarded `.trim()` on a genuinely
  // `undefined` stored value (a field added after an older document was created) throws before the
  // Suspense boundary has anything to catch.
  const value = props.value ?? "";
  return (
    <Suspense
      fallback={
        <div className={props.className} style={props.style}>
          {value.trim() ? (
            renderLines(value, "rich-text-loading")
          ) : (
            <span className="text-[var(--text-4)]">{props.placeholder ?? ""}</span>
          )}
        </div>
      }
    >
      <Editor {...props} value={value} />
    </Suspense>
  );
}
