"use client";

import { useAccount } from "@/hooks/use-account";
import { isExternalRole } from "@/types/auth";

/**
 * Renders its children only for a member of Gitwork.
 *
 * ── What this is and is not ──────────────────────────────────────────────────
 * It is a CONVENIENCE for surfaces that are internal by nature — our own marketing
 * config, workspace-wide roll-ups, captured leads — sitting on a page a guest is
 * legitimately allowed to open. Wrapping them keeps the decision visible at the page
 * rather than buried in each panel.
 *
 * ⚠️ It is NOT a security boundary. It runs in the browser, so anything the children
 * FETCH must be gated on the server as well; this only stops it being rendered. Use it
 * for noise and for things that are merely none of a guest's business — never as the
 * only thing standing between a guest and data that would matter if they saw it.
 *
 * While the account is still loading it renders NOTHING. A guest briefly seeing an
 * internal panel is the failure worth avoiding; a colleague briefly seeing one fewer
 * card is not.
 */
export function InternalOnly({ children }: { children: React.ReactNode }) {
  const account = useAccount();
  if (account.isPending) return null;
  return isExternalRole(account.data?.role) ? null : <>{children}</>;
}
