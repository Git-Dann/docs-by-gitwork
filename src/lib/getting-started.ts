/**
 * The first-run checklist a new business sees on HQ (multi-tenant Phase 3). Pure, so the
 * route and the tests agree on what "done" means.
 */

export interface GettingStartedFacts {
  isHome: boolean;
  hasLogo: boolean;
  otherPeople: number;
  pendingInvites: number;
  hasAiKey: boolean;
  clients: number;
}

export interface GettingStartedStep {
  id: "logo" | "people" | "ai" | "client";
  label: string;
  href: string;
  done: boolean;
}

export function gettingStartedSteps(f: GettingStartedFacts): GettingStartedStep[] {
  return [
    { id: "logo", label: "Add your logo", href: "/app/settings/general", done: f.hasLogo },
    { id: "people", label: "Invite your team", href: "/app/settings/team", done: f.otherPeople > 0 || f.pendingInvites > 0 },
    { id: "ai", label: "Add an AI key", href: "/app/settings/integrations", done: f.hasAiKey },
    { id: "client", label: "Add your first client", href: "/app/portal", done: f.clients > 0 },
  ];
}

/** Shown to a new business until every step is done. Gitwork never sees it. */
export function showGettingStarted(f: GettingStartedFacts): boolean {
  return !f.isHome && gettingStartedSteps(f).some((s) => !s.done);
}
