/**
 * Code Handover's rules (CLAUDE.md §153), pure so the server, the page and the demo agree.
 *
 * - Two markers on versions: MASTER (the approved code, one per module, on the Master line)
 *   and LIVE (what's running, one per line: the Master line and each variant).
 * - A variant (e.g. one venue's code) is a full copy of a Master version that gets its own
 *   versions. It keeps watching Master: `variantDrift` says when Master has moved on.
 * - A module can be locked by a Gitwork person. Locked means nobody can change anything until
 *   it's unlocked, and unlocking means typing UNLOCK_PHRASE.
 * - Every change is an event with who did it and whether they were a client.
 */

export const UNLOCK_PHRASE = "Unlock Code";

/** Typed exactly as asked, ignoring case and the spaces around it. */
export function isUnlockPhrase(typed: string | null | undefined): boolean {
  return (typed ?? "").trim().toLowerCase() === UNLOCK_PHRASE.toLowerCase();
}

export const CODE_EVENT_KINDS = [
  "module_created",
  "version_uploaded",
  "version_edited",
  "version_deleted",
  "made_live",
  "made_master",
  "locked",
  "unlocked",
  "variant_created",
  "variant_deleted",
  "restored",
] as const;
export type CodeEventKind = (typeof CODE_EVENT_KINDS)[number];

/** A version as it was, kept on an edit or a deletion so it can be seen and put back. */
export interface CodeSnapshot {
  label: string;
  notes: string | null;
  files: Array<{ filename: string; language: string | null; content: string }>;
}

export interface CodeEventView {
  kind: CodeEventKind;
  actorName: string;
  actorIsClient: boolean;
  /** The version's label, and the variant's name when it's on one. */
  versionLabel?: string | null;
  variantName?: string | null;
}

/** Who did it, as the timeline shows it. */
export const actorTag = (isClient: boolean) => (isClient ? "Client" : "Gitwork");

/** One plain sentence per event, e.g. "uploaded v1.3 to The Ivy". The name is shown beside it. */
export function eventSentence(e: CodeEventView): string {
  const v = e.versionLabel ? ` ${e.versionLabel}` : "";
  const where = e.variantName ? ` on ${e.variantName}` : "";
  switch (e.kind) {
    case "module_created":
      return "added the module";
    case "version_uploaded":
      return `uploaded${v}${e.variantName ? ` to ${e.variantName}` : ""}`;
    case "version_edited":
      return `changed${v}${where}`;
    case "version_deleted":
      return `deleted${v}${where}`;
    case "made_live":
      return `marked${v} as Live${where}`;
    case "made_master":
      return `marked${v} as Master`;
    case "locked":
      return "locked the code";
    case "unlocked":
      return "unlocked the code";
    case "variant_created":
      return `made the variant ${e.variantName ?? ""}${e.versionLabel ? ` from Master ${e.versionLabel}` : ""}`.trim();
    case "variant_deleted":
      return `deleted the variant ${e.variantName ?? ""}`.trim();
    case "restored":
      return `put back an earlier copy of${v}${where}`;
  }
}

type VersionLike = { id: string; label: string; isCurrent: boolean; isMaster: boolean; variantId: string | null; createdAt: string };

/** The Master line's versions, newest first. */
export function masterLine<T extends VersionLike>(versions: T[]): T[] {
  return versions.filter((v) => !v.variantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** The version a variant is measured against: the one marked Master; failing that the Master
 *  line's Live; failing that its newest. Null when the Master line is empty. */
export function masterVersionOf<T extends VersionLike>(versions: T[]): T | null {
  const line = masterLine(versions);
  return line.find((v) => v.isMaster) ?? line.find((v) => v.isCurrent) ?? line[0] ?? null;
}

/** A line's Live version, falling back to its newest. */
export function liveVersionOf<T extends VersionLike>(versions: T[], variantId: string | null): T | null {
  const line = versions.filter((v) => (v.variantId ?? null) === variantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return line.find((v) => v.isCurrent) ?? line[0] ?? null;
}

export interface VariantDrift {
  /** Master has moved on since the variant was copied. */
  behind: boolean;
  /** What the variant was copied from, and what Master is now. */
  baseLabel: string | null;
  masterLabel: string | null;
  masterId: string | null;
}

/** Whether a variant has fallen behind Master. A base that no longer exists counts as behind,
 *  because Master can't be the version it was copied from. */
export function variantDrift<T extends VersionLike>(
  variant: { baseVersionId: string | null; baseLabel: string | null },
  versions: T[],
): VariantDrift {
  const master = masterVersionOf(versions);
  if (!master) return { behind: false, baseLabel: variant.baseLabel, masterLabel: null, masterId: null };
  return { behind: master.id !== variant.baseVersionId, baseLabel: variant.baseLabel, masterLabel: master.label, masterId: master.id };
}
