/**
 * A card's stage history, as the client's own planning tool recorded it (the dates it entered each
 * stage). The Forge import keeps those dates in task.metadata.forge.stageDates; this turns them into
 * a list the card shows, oldest first. Pure: unknown stage ids get a readable label, junk is dropped.
 */

const LABELS: Record<string, string> = {
  scoping: "Scoping",
  "future-idea": "Future Idea",
  triage: "Triage",
  "bug-tracking": "Bug Tracking",
  "documentation-period": "Documentation Period",
  "technical-audit": "Technical Audit",
  "design-period": "Design Period",
  blocked: "Blocked",
  "up-next": "Up Next (Assign Hours)",
  "in-development": "In Development",
  "in-review": "In Review",
  "deployed-test-flight": "Deployed (Test Flight)",
  deployed: "Deployed (Test Flight)",
  "live-features": "Live Features",
};

export interface StageEntry {
  label: string;
  /** YYYY-MM-DD */
  date: string;
}

function labelFor(stage: string): string {
  if (Object.hasOwn(LABELS, stage)) return LABELS[stage];
  return stage
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ")
    .slice(0, 60);
}

export function stageHistoryOf(metadata: unknown): StageEntry[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const forge = (metadata as Record<string, unknown>).forge;
  if (!forge || typeof forge !== "object" || Array.isArray(forge)) return [];
  const dates = (forge as Record<string, unknown>).stageDates;
  if (!dates || typeof dates !== "object" || Array.isArray(dates)) return [];
  const out: StageEntry[] = [];
  for (const [stage, value] of Object.entries(dates as Record<string, unknown>)) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) continue;
    out.push({ label: labelFor(stage), date: value.slice(0, 10) });
  }
  return out.sort((a, b) => (a.date === b.date ? a.label.localeCompare(b.label) : a.date < b.date ? -1 : 1)).slice(0, 30);
}
