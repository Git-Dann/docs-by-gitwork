/**
 * "Prepared by" — the DEFAULT author of a newly created document.
 *
 * `Document.metadata.owner` is what the cover renders as "Prepared by" and what the
 * editor's Document details panel shows. It must default to **the person who created
 * the document**, never to the workspace/bootstrap owner: several creation paths used
 * to read `ensureBaseRecords().user`, so every doc anyone created came out attributed
 * to the default workspace owner.
 *
 * Rules, in order:
 *  1. The authenticated caller's `name`, trimmed.
 *  2. Their email local-part — the same fallback the rest of the app uses to name a
 *     user (`src/auth.ts`, `src/server/dispatch/respond.ts`, `/api/account`).
 *  3. Only then any supplied fallback — a template/blueprint-provided owner, or the
 *     workspace owner's name for an unattended API-key caller with no per-user
 *     identity. A real logged-in user therefore ALWAYS wins over a template value.
 *  4. `""` when nothing resolves, which leaves the field blank rather than wrong —
 *     the cover and sign-off footer then fall back to the workspace `preparedBy`.
 *
 * This is only the default. `metadata.owner` stays freely editable afterwards (the
 * cover's "Prepared by" field writes straight to it) — no update path forces it.
 */
export type DocumentOwnerIdentity =
  | { name?: string | null; email?: string | null }
  | null
  | undefined;

/** The display name for an identity, or null when it can't be named at all. */
export function ownerDisplayName(identity: DocumentOwnerIdentity): string | null {
  const name = identity?.name?.trim();
  if (name) return name;

  const email = identity?.email?.trim();
  if (!email) return null;

  const localPart = email.split("@")[0]?.trim();
  return localPart ? localPart : null;
}

/**
 * The `metadata.owner` value a NEW document should start with.
 *
 * @param actor     the authenticated caller (null for an API-key-only/unattended call)
 * @param fallbacks tried in order, only when `actor` cannot be named — e.g. the
 *                  template's own owner, then the workspace owner's name
 */
export function resolveDocumentOwnerName(
  actor: DocumentOwnerIdentity,
  ...fallbacks: Array<string | null | undefined>
): string {
  const fromActor = ownerDisplayName(actor);
  if (fromActor) return fromActor;

  for (const fallback of fallbacks) {
    const trimmed = fallback?.trim();
    if (trimmed) return trimmed;
  }

  return "";
}

/**
 * The `owner` / `preparedBy` a template blueprint carries, if any (`DocumentTemplate.metadata`
 * is loose Json). Only ever used as a FALLBACK behind the authenticated caller — pass it to
 * `resolveDocumentOwnerName` after `actor`, never instead of it.
 */
export function templateOwnerName(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  for (const key of ["owner", "preparedBy"] as const) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
