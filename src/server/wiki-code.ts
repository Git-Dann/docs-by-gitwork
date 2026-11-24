/**
 * wiki-code.ts — the wiki "Code Handover" section: versioned source handed to a
 * client for custom hardware (e.g. Pollen's Receiver + Sender firmware).
 *
 * Shape: a wiki has many code MODULES (one per hardware piece); each module has VERSIONS
 * (v1.0, v1.1…) on its Master line, optional VARIANTS (e.g. one venue's tweaked code, a full
 * copy of a Master version with versions of its own), and an EVENT trail. Each version has
 * FILES. Rules (markers, locking, drift, the event wording) are in src/lib/wiki-code-rules.ts
 * and CLAUDE.md §153:
 *  - MASTER marks the approved code (one per module, Master line); LIVE marks what's running
 *    (one per line). LIVE is the old `isCurrent` column.
 *  - A locked module refuses every change (423) until it's unlocked. Only a Gitwork person may
 *    lock; anyone who may edit may unlock, by typing "Unlock Code", and is recorded by name.
 *  - Every change records who made it and whether they were a client. An edit or a deletion
 *    keeps the version as it was, so it can be seen and put back.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { isUnlockPhrase, type CodeEventKind, type CodeSnapshot } from "@/lib/wiki-code-rules";

export interface WikiCodeFileRecord {
  id: string;
  filename: string;
  language: string | null;
  content: string;
}

export interface WikiCodeVersionRecord {
  id: string;
  label: string;
  notes: string | null;
  /** LIVE: what's running on this line. */
  isCurrent: boolean;
  /** MASTER: the approved code. Master line only. */
  isMaster: boolean;
  /** Null on the Master line. */
  variantId: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  createdByClient: boolean;
  updatedByName: string | null;
  files: WikiCodeFileRecord[];
}

export interface WikiCodeVariantRecord {
  id: string;
  name: string;
  notes: string | null;
  baseVersionId: string | null;
  baseLabel: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface WikiCodeModuleRecord {
  id: string;
  name: string;
  description: string | null;
  lockedAt: string | null;
  lockedByName: string | null;
  variants: WikiCodeVariantRecord[];
  versions: WikiCodeVersionRecord[];
}

export interface WikiCodeHandoverSection {
  enabled: boolean;
  modules: WikiCodeModuleRecord[];
}

export interface WikiCodeEventRecord {
  id: string;
  kind: CodeEventKind;
  actorName: string;
  actorIsClient: boolean;
  variantId: string | null;
  versionId: string | null;
  versionLabel: string | null;
  variantName: string | null;
  detail: string | null;
  /** The version as it was (edits and deletions) and as it became (edits). */
  before: CodeSnapshot | null;
  after: CodeSnapshot | null;
  createdAt: string;
}

/** Who made a change. A client is a guest account; null user is the workspace API key. */
export interface CodeActor {
  userId: string | null;
  name: string;
  isClient: boolean;
}

/** Thrown for a change to a locked module. */
export class CodeLockedError extends Error {
  status = 423;
  constructor(by: string | null) {
    super(`This code is locked${by ? ` by ${by}` : ""}. Unlock it to make changes.`);
  }
}

class CodeRuleError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** ⚠️ `satisfies`, not `as const` alone: see CLAUDE.md §50. */
const MODULE_INCLUDE = {
  versions: { include: { files: { orderBy: { orderKey: "asc" } as const } } },
  variants: { orderBy: [{ orderKey: "asc" }, { createdAt: "asc" }] as const },
} as const satisfies Prisma.WikiCodeModuleInclude;

type ModuleRow = Prisma.WikiCodeModuleGetPayload<{ include: typeof MODULE_INCLUDE }>;
type VersionRow = ModuleRow["versions"][number];

function serializeVersion(v: VersionRow): WikiCodeVersionRecord {
  return {
    id: v.id,
    label: v.label,
    notes: v.notes,
    isCurrent: v.isCurrent,
    isMaster: v.isMaster,
    variantId: v.variantId,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
    createdByName: v.createdByName,
    createdByClient: v.createdByClient,
    updatedByName: v.updatedByName,
    files: v.files.map((f) => ({ id: f.id, filename: f.filename, language: f.language, content: f.content })),
  };
}

function serializeModule(m: ModuleRow): WikiCodeModuleRecord {
  const versions = [...m.versions]
    // Live first, then newest-created first (each line is filtered from this on the page).
    .sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .map(serializeVersion);
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    lockedAt: m.lockedAt ? m.lockedAt.toISOString() : null,
    lockedByName: m.lockedByName,
    variants: m.variants.map((v) => ({
      id: v.id,
      name: v.name,
      notes: v.notes,
      baseVersionId: v.baseVersionId,
      baseLabel: v.baseLabel,
      createdByName: v.createdByName,
      createdAt: v.createdAt.toISOString(),
    })),
    versions,
  };
}

const snapshotOf = (v: { label: string; notes: string | null; files: Array<{ filename: string; language: string | null; content: string }> }): CodeSnapshot => ({
  label: v.label,
  notes: v.notes,
  files: v.files.map((f) => ({ filename: f.filename, language: f.language, content: f.content })),
});

function readSnapshot(v: unknown): CodeSnapshot | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Partial<CodeSnapshot>;
  if (typeof o.label !== "string" || !Array.isArray(o.files)) return null;
  return {
    label: o.label,
    notes: typeof o.notes === "string" ? o.notes : null,
    files: o.files
      .filter((f) => f && typeof f.filename === "string" && typeof f.content === "string")
      .map((f) => ({ filename: f.filename, language: typeof f.language === "string" ? f.language : null, content: f.content })),
  };
}

export async function loadWikiCodeHandover(clientId: string): Promise<WikiCodeHandoverSection> {
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId },
    select: {
      codeHandoverEnabled: true,
      codeModules: { orderBy: [{ orderKey: "asc" }, { createdAt: "asc" }], include: MODULE_INCLUDE },
    },
  });
  if (!wiki) return { enabled: false, modules: [] };
  return { enabled: wiki.codeHandoverEnabled, modules: wiki.codeModules.map(serializeModule) };
}

async function ensureWikiId(clientId: string): Promise<string> {
  const wiki = await prisma.clientWiki.upsert({ where: { clientId }, create: { clientId }, update: {}, select: { id: true } });
  return wiki.id;
}

export async function setWikiCodeHandoverEnabled(clientId: string, enabled: boolean): Promise<void> {
  const id = await ensureWikiId(clientId);
  await prisma.clientWiki.update({ where: { id }, data: { codeHandoverEnabled: enabled } });
}

export interface CodeFileInput {
  filename: string;
  language?: string | null;
  content: string;
}

const fileCreates = (files: CodeFileInput[]) =>
  files.map((f, i) => ({ filename: f.filename.trim(), language: f.language?.trim() || null, content: f.content, orderKey: i }));

type Tx = Prisma.TransactionClient;

async function record(
  tx: Tx | typeof prisma,
  moduleId: string,
  actor: CodeActor,
  kind: CodeEventKind,
  extra: { variantId?: string | null; versionId?: string | null; detail?: string | null; before?: CodeSnapshot | null; after?: CodeSnapshot | null } = {},
) {
  await tx.wikiCodeEvent.create({
    data: {
      moduleId,
      kind,
      actorUserId: actor.userId,
      actorName: actor.name,
      actorIsClient: actor.isClient,
      variantId: extra.variantId ?? null,
      versionId: extra.versionId ?? null,
      detail: extra.detail ?? null,
      ...(extra.before ? { before: extra.before as unknown as Prisma.InputJsonValue } : {}),
      ...(extra.after ? { after: extra.after as unknown as Prisma.InputJsonValue } : {}),
    },
  });
}

/** The module, on this client, or null. Refuses a locked one unless `allowLocked`. */
async function findModule(clientId: string, moduleId: string, { allowLocked = false } = {}) {
  const mod = await prisma.wikiCodeModule.findFirst({
    where: { id: moduleId, wiki: { clientId } },
    select: { id: true, name: true, lockedAt: true, lockedByName: true },
  });
  if (mod && mod.lockedAt && !allowLocked) throw new CodeLockedError(mod.lockedByName);
  return mod;
}

/** Create a module (and turn the section on — mirrors createMonitor enabling Monitors). */
export async function createCodeModule(
  clientId: string,
  input: { name: string; description?: string | null },
  actor: CodeActor,
): Promise<WikiCodeModuleRecord> {
  const wikiId = await ensureWikiId(clientId);
  const max = await prisma.wikiCodeModule.aggregate({ where: { wikiId }, _max: { orderKey: true } });
  const mod = await prisma.wikiCodeModule.create({
    data: {
      wikiId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      orderKey: (max._max.orderKey ?? 0) + 1,
    },
    include: MODULE_INCLUDE,
  });
  await record(prisma, mod.id, actor, "module_created");
  await prisma.clientWiki.update({ where: { id: wikiId }, data: { codeHandoverEnabled: true } });
  return serializeModule(mod);
}

export async function updateCodeModule(
  clientId: string,
  moduleId: string,
  input: { name?: string; description?: string | null },
): Promise<WikiCodeModuleRecord | null> {
  if (!(await findModule(clientId, moduleId))) return null;
  const mod = await prisma.wikiCodeModule.update({
    where: { id: moduleId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
    },
    include: MODULE_INCLUDE,
  });
  return serializeModule(mod);
}

export async function deleteCodeModule(clientId: string, moduleId: string): Promise<boolean> {
  if (!(await findModule(clientId, moduleId))) return false;
  const res = await prisma.wikiCodeModule.deleteMany({ where: { id: moduleId, wiki: { clientId } } });
  return res.count > 0;
}

/** Lock a module. Gitwork only: a client (guest) account can't. */
export async function lockCodeModule(clientId: string, moduleId: string, actor: CodeActor): Promise<WikiCodeModuleRecord | null> {
  if (actor.isClient) throw new CodeRuleError("Only someone at Gitwork can lock the code.", 403);
  const mod = await findModule(clientId, moduleId, { allowLocked: true });
  if (!mod) return null;
  if (!mod.lockedAt) {
    await prisma.$transaction(async (tx) => {
      await tx.wikiCodeModule.update({
        where: { id: moduleId },
        data: { lockedAt: new Date(), lockedById: actor.userId, lockedByName: actor.name },
      });
      await record(tx, moduleId, actor, "locked");
    });
  }
  const fresh = await prisma.wikiCodeModule.findUniqueOrThrow({ where: { id: moduleId }, include: MODULE_INCLUDE });
  return serializeModule(fresh);
}

/** Unlock a module. Anyone who may edit it, but only by typing "Unlock Code"; recorded by name. */
export async function unlockCodeModule(clientId: string, moduleId: string, typed: string, actor: CodeActor): Promise<WikiCodeModuleRecord | null> {
  if (!isUnlockPhrase(typed)) throw new CodeRuleError('Type "Unlock Code" to unlock it.');
  const mod = await findModule(clientId, moduleId, { allowLocked: true });
  if (!mod) return null;
  if (mod.lockedAt) {
    await prisma.$transaction(async (tx) => {
      await tx.wikiCodeModule.update({ where: { id: moduleId }, data: { lockedAt: null, lockedById: null, lockedByName: null } });
      await record(tx, moduleId, actor, "unlocked", { detail: mod.lockedByName ? `Locked by ${mod.lockedByName}` : null });
    });
  }
  const fresh = await prisma.wikiCodeModule.findUniqueOrThrow({ where: { id: moduleId }, include: MODULE_INCLUDE });
  return serializeModule(fresh);
}

/** A variant on this module, or null. */
async function findVariant(moduleId: string, variantId: string) {
  return prisma.wikiCodeVariant.findFirst({ where: { id: variantId, moduleId }, select: { id: true, name: true } });
}

/** Add a new version to a line (the Master line, or a variant). Becomes that line's Live by default. */
export async function createCodeVersion(
  clientId: string,
  moduleId: string,
  input: { label: string; notes?: string | null; files: CodeFileInput[]; makeCurrent?: boolean; variantId?: string | null },
  actor: CodeActor,
): Promise<WikiCodeVersionRecord | null> {
  const mod = await findModule(clientId, moduleId);
  if (!mod) return null;
  const variantId = input.variantId ?? null;
  const variant = variantId ? await findVariant(moduleId, variantId) : null;
  if (variantId && !variant) throw new CodeRuleError("That variant isn't on this module.", 404);
  const makeCurrent = input.makeCurrent ?? true;
  const version = await prisma.$transaction(async (tx) => {
    if (makeCurrent) await tx.wikiCodeVersion.updateMany({ where: { moduleId, variantId }, data: { isCurrent: false } });
    const created = await tx.wikiCodeVersion.create({
      data: {
        moduleId,
        variantId,
        label: input.label.trim(),
        notes: input.notes?.trim() || null,
        isCurrent: makeCurrent,
        createdByName: actor.name,
        createdByClient: actor.isClient,
        files: { create: fileCreates(input.files) },
      },
      include: { files: { orderBy: { orderKey: "asc" } } },
    });
    await record(tx, moduleId, actor, "version_uploaded", { variantId, versionId: created.id, detail: created.label, after: snapshotOf(created) });
    return created;
  });
  return serializeVersion(version);
}

/** Update a version's label/notes/files, or mark it Live or Master. Files (when provided)
 *  fully replace the version's files; the version as it was is kept on the event. */
export async function updateCodeVersion(
  clientId: string,
  versionId: string,
  input: { label?: string; notes?: string | null; files?: CodeFileInput[]; makeCurrent?: boolean; makeMaster?: boolean },
  actor: CodeActor,
): Promise<WikiCodeVersionRecord | null> {
  const existing = await prisma.wikiCodeVersion.findFirst({
    where: { id: versionId, module: { wiki: { clientId } } },
    include: { files: { orderBy: { orderKey: "asc" } } },
  });
  if (!existing) return null;
  await findModule(clientId, existing.moduleId);
  if (input.makeMaster && existing.variantId) throw new CodeRuleError("Only a version on the Master line can be Master.");

  const edits = input.label !== undefined || input.notes !== undefined || input.files !== undefined;
  const updated = await prisma.$transaction(async (tx) => {
    if (input.makeCurrent) {
      await tx.wikiCodeVersion.updateMany({ where: { moduleId: existing.moduleId, variantId: existing.variantId }, data: { isCurrent: false } });
    }
    if (input.makeMaster) {
      await tx.wikiCodeVersion.updateMany({ where: { moduleId: existing.moduleId }, data: { isMaster: false } });
    }
    if (input.files) await tx.wikiCodeFile.deleteMany({ where: { versionId } });
    const next = await tx.wikiCodeVersion.update({
      where: { id: versionId },
      data: {
        ...(input.label !== undefined ? { label: input.label.trim() } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        ...(input.makeCurrent ? { isCurrent: true } : {}),
        ...(input.makeMaster ? { isMaster: true } : {}),
        ...(edits ? { updatedByName: actor.name } : {}),
        ...(input.files ? { files: { create: fileCreates(input.files) } } : {}),
      },
      include: { files: { orderBy: { orderKey: "asc" } } },
    });
    const where = { variantId: existing.variantId, versionId };
    if (edits) await record(tx, existing.moduleId, actor, "version_edited", { ...where, detail: next.label, before: snapshotOf(existing), after: snapshotOf(next) });
    if (input.makeCurrent && !existing.isCurrent) await record(tx, existing.moduleId, actor, "made_live", { ...where, detail: next.label });
    if (input.makeMaster && !existing.isMaster) await record(tx, existing.moduleId, actor, "made_master", { ...where, detail: next.label });
    return next;
  });
  return serializeVersion(updated);
}

export async function deleteCodeVersion(clientId: string, versionId: string, actor: CodeActor): Promise<boolean> {
  const existing = await prisma.wikiCodeVersion.findFirst({
    where: { id: versionId, module: { wiki: { clientId } } },
    include: { files: { orderBy: { orderKey: "asc" } } },
  });
  if (!existing) return false;
  await findModule(clientId, existing.moduleId);
  await prisma.$transaction(async (tx) => {
    await tx.wikiCodeVersion.delete({ where: { id: versionId } });
    await record(tx, existing.moduleId, actor, "version_deleted", {
      variantId: existing.variantId,
      versionId,
      detail: existing.label,
      before: snapshotOf(existing),
    });
  });
  return true;
}

/** Make a variant (e.g. one venue) as a full copy of a Master-line version. */
export async function createCodeVariant(
  clientId: string,
  moduleId: string,
  input: { name: string; notes?: string | null; baseVersionId: string },
  actor: CodeActor,
): Promise<WikiCodeVariantRecord | null> {
  const mod = await findModule(clientId, moduleId);
  if (!mod) return null;
  const base = await prisma.wikiCodeVersion.findFirst({
    where: { id: input.baseVersionId, moduleId },
    include: { files: { orderBy: { orderKey: "asc" } } },
  });
  if (!base) throw new CodeRuleError("That version isn't on this module.", 404);
  if (base.variantId) throw new CodeRuleError("A variant is copied from a version on the Master line.");
  const name = input.name.trim();
  const clash = await prisma.wikiCodeVariant.findFirst({ where: { moduleId, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
  if (clash) throw new CodeRuleError(`There's already a variant called ${name}.`, 409);

  const variant = await prisma.$transaction(async (tx) => {
    const max = await tx.wikiCodeVariant.aggregate({ where: { moduleId }, _max: { orderKey: true } });
    const v = await tx.wikiCodeVariant.create({
      data: {
        moduleId,
        name,
        notes: input.notes?.trim() || null,
        baseVersionId: base.id,
        baseLabel: base.label,
        orderKey: (max._max.orderKey ?? 0) + 1,
        createdByName: actor.name,
      },
    });
    const copy = await tx.wikiCodeVersion.create({
      data: {
        moduleId,
        variantId: v.id,
        label: base.label,
        notes: `Copied from Master ${base.label}.`,
        isCurrent: true,
        createdByName: actor.name,
        createdByClient: actor.isClient,
        files: { create: fileCreates(base.files) },
      },
    });
    await record(tx, moduleId, actor, "variant_created", { variantId: v.id, versionId: copy.id, detail: `${name} · ${base.label}` });
    return v;
  });
  return {
    id: variant.id,
    name: variant.name,
    notes: variant.notes,
    baseVersionId: variant.baseVersionId,
    baseLabel: variant.baseLabel,
    createdByName: variant.createdByName,
    createdAt: variant.createdAt.toISOString(),
  };
}

/** Delete a variant and its versions. The event keeps its name. */
export async function deleteCodeVariant(clientId: string, moduleId: string, variantId: string, actor: CodeActor): Promise<boolean> {
  const mod = await findModule(clientId, moduleId);
  if (!mod) return false;
  const variant = await findVariant(moduleId, variantId);
  if (!variant) return false;
  await prisma.$transaction(async (tx) => {
    await tx.wikiCodeVariant.delete({ where: { id: variantId } });
    await record(tx, moduleId, actor, "variant_deleted", { variantId, detail: variant.name });
  });
  return true;
}

/** A module's history, newest first, with the version labels and variant names it mentions. */
export async function listCodeEvents(clientId: string, moduleId: string): Promise<WikiCodeEventRecord[] | null> {
  const mod = await findModule(clientId, moduleId, { allowLocked: true });
  if (!mod) return null;
  const [events, variants, versions] = await Promise.all([
    prisma.wikiCodeEvent.findMany({ where: { moduleId }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.wikiCodeVariant.findMany({ where: { moduleId }, select: { id: true, name: true } }),
    prisma.wikiCodeVersion.findMany({ where: { moduleId }, select: { id: true, label: true } }),
  ]);
  const variantName = new Map(variants.map((v) => [v.id, v.name]));
  const versionLabel = new Map(versions.map((v) => [v.id, v.label]));
  return events.map((e) => {
    // A deleted version or variant isn't in the maps any more: the event's own detail names it.
    const [detailName, detailLabel] = e.kind.startsWith("variant_") && e.detail ? e.detail.split(" · ") : [null, e.detail];
    return {
      id: e.id,
      kind: e.kind as CodeEventKind,
      actorName: e.actorName,
      actorIsClient: e.actorIsClient,
      variantId: e.variantId,
      versionId: e.versionId,
      versionLabel: (e.versionId && versionLabel.get(e.versionId)) || detailLabel || null,
      variantName: (e.variantId && variantName.get(e.variantId)) || detailName || null,
      detail: e.detail,
      before: readSnapshot(e.before),
      after: readSnapshot(e.after),
      createdAt: e.createdAt.toISOString(),
    };
  });
}

/** Put a version's files, label and notes back to how they were before an edit. */
export async function restoreCodeVersion(clientId: string, versionId: string, eventId: string, actor: CodeActor): Promise<WikiCodeVersionRecord | null> {
  const existing = await prisma.wikiCodeVersion.findFirst({
    where: { id: versionId, module: { wiki: { clientId } } },
    include: { files: { orderBy: { orderKey: "asc" } } },
  });
  if (!existing) return null;
  await findModule(clientId, existing.moduleId);
  const event = await prisma.wikiCodeEvent.findFirst({ where: { id: eventId, moduleId: existing.moduleId, versionId } });
  const before = readSnapshot(event?.before);
  if (!event || !before || !before.files.length) throw new CodeRuleError("There's no earlier copy of this version to put back.", 404);
  const restored = await prisma.$transaction(async (tx) => {
    await tx.wikiCodeFile.deleteMany({ where: { versionId } });
    const next = await tx.wikiCodeVersion.update({
      where: { id: versionId },
      data: { label: before.label, notes: before.notes, updatedByName: actor.name, files: { create: fileCreates(before.files) } },
      include: { files: { orderBy: { orderKey: "asc" } } },
    });
    await record(tx, existing.moduleId, actor, "restored", {
      variantId: existing.variantId,
      versionId,
      detail: next.label,
      before: snapshotOf(existing),
      after: snapshotOf(next),
    });
    return next;
  });
  return serializeVersion(restored);
}
