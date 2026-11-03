/**
 * One permission's name and one-line description, as the role matrix and a member's
 * access editor both show it. Declared once so the two screens can't drift apart.
 * High-risk permissions (public links, pull requests, personal data) carry a quiet tag.
 */

import type { ReactNode } from "react";
import type { PermissionDef } from "@/types/auth";

/** `note`: a marker after the name, e.g. a member's "+ added" against their role's default. */
export function PermissionLabel({ perm, note }: { perm: PermissionDef; note?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-[var(--text-1)]">
        {perm.label}
        {perm.highRisk ? (
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--danger-500)]">High risk</span>
        ) : null}
        {note}
      </p>
      <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-4)]">{perm.description}</p>
    </div>
  );
}
