/**
 * wiki-code.ts — the wiki "Code Handover" section: versioned source handed to a
 * client for custom hardware (e.g. Pollen's Receiver + Sender firmware).
 *
 * Shape: a wiki has many code MODULES (one per "Master code" / hardware piece);
 * each module has many VERSIONS (v1.0, v1.1…); each version has many FILES
 * (main.cpp, config.h…). The current version is surfaced prominently; older
 * versions collapse into an accordion. All content is meant to be shared with
 * the client, so the public view exposes it in full (copy / download).
 */

import { prisma } from "@/lib/prisma";

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
  isCurrent: boolean;
  createdAt: string;
  files: WikiCodeFileRecord[];
}

export interface WikiCodeModuleRecord {
  id: string;
  name: string;
  description: string | null;
  versions: WikiCodeVersionRecord[];
}

export interface WikiCodeHandoverSection {
  enabled: boolean;
  modules: WikiCodeModuleRecord[];
}

const MODULE_INCLUDE = {
  versions: { include: { files: { orderBy: { orderKey: "asc" } as const } } },
} as const;

type ModuleRow = {
  id: string;
  name: string;
  description: string | null;
  orderKey: number;
  versions: Array<{
    id: string;
    label: string;
    notes: string | null;
    isCurrent: boolean;
    createdAt: Date;
    files: Array<{ id: string; filename: string; language: string | null; content: string }>;
  }>;
};

function serializeModule(m: ModuleRow): WikiCodeModuleRecord {
  const versions = [...m.versions]
    // Current version first, then newest-created first.
    .sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .map((v) => ({
      id: v.id,
      label: v.label,
      notes: v.notes,
      isCurrent: v.isCurrent,
      createdAt: v.createdAt.toISOString(),
      files: v.files.map((f) => ({
        id: f.id,
        filename: f.filename,
        language: f.language,
        content: f.content,
      })),
    }));
  return { id: m.id, name: m.name, description: m.description, versions };
}

export async function loadWikiCodeHandover(clientId: string): Promise<WikiCodeHandoverSection> {
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId },
    select: {
      codeHandoverEnabled: true,
      codeModules: {
        orderBy: [{ orderKey: "asc" }, { createdAt: "asc" }],
        include: MODULE_INCLUDE,
      },
    },
  });
  if (!wiki) return { enabled: false, modules: [] };
  return {
    enabled: wiki.codeHandoverEnabled,
    modules: (wiki.codeModules as ModuleRow[]).map(serializeModule),
  };
}

async function ensureWikiId(clientId: string): Promise<string> {
  const wiki = await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId },
    update: {},
    select: { id: true },
  });
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

/** Create a module (and turn the section on — mirrors createMonitor enabling Monitors). */
export async function createCodeModule(
  clientId: string,
  input: { name: string; description?: string | null },
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
    include: { versions: { include: { files: { orderBy: { orderKey: "asc" } } } } },
  });
  await prisma.clientWiki.update({ where: { id: wikiId }, data: { codeHandoverEnabled: true } });
  return serializeModule(mod as ModuleRow);
}

export async function updateCodeModule(
  clientId: string,
  moduleId: string,
  input: { name?: string; description?: string | null },
): Promise<WikiCodeModuleRecord | null> {
  const existing = await prisma.wikiCodeModule.findFirst({
    where: { id: moduleId, wiki: { clientId } },
    select: { id: true },
  });
  if (!existing) return null;
  const mod = await prisma.wikiCodeModule.update({
    where: { id: moduleId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
    },
    include: { versions: { include: { files: { orderBy: { orderKey: "asc" } } } } },
  });
  return serializeModule(mod as ModuleRow);
}

export async function deleteCodeModule(clientId: string, moduleId: string): Promise<boolean> {
  const res = await prisma.wikiCodeModule.deleteMany({ where: { id: moduleId, wiki: { clientId } } });
  return res.count > 0;
}

/** Add a new version to a module. Becomes the current version by default. */
export async function createCodeVersion(
  clientId: string,
  moduleId: string,
  input: { label: string; notes?: string | null; files: CodeFileInput[]; makeCurrent?: boolean },
): Promise<WikiCodeVersionRecord | null> {
  const mod = await prisma.wikiCodeModule.findFirst({
    where: { id: moduleId, wiki: { clientId } },
    select: { id: true },
  });
  if (!mod) return null;
  const makeCurrent = input.makeCurrent ?? true;
  const version = await prisma.$transaction(async (tx) => {
    if (makeCurrent) {
      await tx.wikiCodeVersion.updateMany({ where: { moduleId }, data: { isCurrent: false } });
    }
    return tx.wikiCodeVersion.create({
      data: {
        moduleId,
        label: input.label.trim(),
        notes: input.notes?.trim() || null,
        isCurrent: makeCurrent,
        files: {
          create: input.files.map((f, i) => ({
            filename: f.filename.trim(),
            language: f.language?.trim() || null,
            content: f.content,
            orderKey: i,
          })),
        },
      },
      include: { files: { orderBy: { orderKey: "asc" } } },
    });
  });
  return {
    id: version.id,
    label: version.label,
    notes: version.notes,
    isCurrent: version.isCurrent,
    createdAt: version.createdAt.toISOString(),
    files: version.files.map((f) => ({ id: f.id, filename: f.filename, language: f.language, content: f.content })),
  };
}

/** Update a version's label/notes/files, or promote it to current. Files (when
 *  provided) fully replace the version's existing files. */
export async function updateCodeVersion(
  clientId: string,
  versionId: string,
  input: { label?: string; notes?: string | null; files?: CodeFileInput[]; makeCurrent?: boolean },
): Promise<WikiCodeVersionRecord | null> {
  const version = await prisma.wikiCodeVersion.findFirst({
    where: { id: versionId, module: { wiki: { clientId } } },
    select: { id: true, moduleId: true },
  });
  if (!version) return null;
  const updated = await prisma.$transaction(async (tx) => {
    if (input.makeCurrent) {
      await tx.wikiCodeVersion.updateMany({ where: { moduleId: version.moduleId }, data: { isCurrent: false } });
    }
    if (input.files) {
      await tx.wikiCodeFile.deleteMany({ where: { versionId } });
    }
    return tx.wikiCodeVersion.update({
      where: { id: versionId },
      data: {
        ...(input.label !== undefined ? { label: input.label.trim() } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        ...(input.makeCurrent ? { isCurrent: true } : {}),
        ...(input.files
          ? {
              files: {
                create: input.files.map((f, i) => ({
                  filename: f.filename.trim(),
                  language: f.language?.trim() || null,
                  content: f.content,
                  orderKey: i,
                })),
              },
            }
          : {}),
      },
      include: { files: { orderBy: { orderKey: "asc" } } },
    });
  });
  return {
    id: updated.id,
    label: updated.label,
    notes: updated.notes,
    isCurrent: updated.isCurrent,
    createdAt: updated.createdAt.toISOString(),
    files: updated.files.map((f) => ({ id: f.id, filename: f.filename, language: f.language, content: f.content })),
  };
}

export async function deleteCodeVersion(clientId: string, versionId: string): Promise<boolean> {
  const res = await prisma.wikiCodeVersion.deleteMany({
    where: { id: versionId, module: { wiki: { clientId } } },
  });
  return res.count > 0;
}
