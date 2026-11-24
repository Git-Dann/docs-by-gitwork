/**
 * The demo's Code Handover writes (CLAUDE.md §153), applied in memory to the demo wiki's section
 * through the real rules (src/lib/wiki-code-rules.ts): Live and Master, variants, the lock and
 * the history. The demo viewer is Alex Rivera at Gitwork.
 */
import type { WikiCodeEventRecord, WikiCodeHandoverSection, WikiCodeModuleRecord, WikiCodeVersionRecord } from "@/server/wiki-code";
import { isUnlockPhrase, type CodeEventKind, type CodeSnapshot } from "@/lib/wiki-code-rules";

const ME = { name: "Alex Rivera", isClient: false };
const events = new Map<string, WikiCodeEventRecord[]>();
let seq = 0;
const nextId = (p: string) => `${p}-demo-${++seq}`;
const now = () => new Date().toISOString();
const err = (error: string, status: number) => ({ error, __status: status });

const snap = (v: WikiCodeVersionRecord): CodeSnapshot => ({
  label: v.label,
  notes: v.notes,
  files: v.files.map((f) => ({ filename: f.filename, language: f.language, content: f.content })),
});

function log(mod: WikiCodeModuleRecord, kind: CodeEventKind, extra: Partial<WikiCodeEventRecord> = {}, actor = ME, at = now()) {
  const list = events.get(mod.id) ?? [];
  list.unshift({
    id: nextId("ev"),
    kind,
    actorName: actor.name,
    actorIsClient: actor.isClient,
    variantId: null,
    versionId: null,
    versionLabel: null,
    variantName: null,
    detail: null,
    before: null,
    after: null,
    createdAt: at,
    ...extra,
  });
  events.set(mod.id, list);
}

let seeded = false;
/** A believable history for the fixture, including a client's edit that can be put back. */
function seed(section: WikiCodeHandoverSection) {
  if (seeded) return;
  seeded = true;
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
  for (const mod of section.modules) {
    const tom = { name: "Tom Okafor", isClient: false };
    log(mod, "module_created", {}, tom, day(-61));
    for (const v of [...mod.versions].reverse()) {
      const variantName = v.variantId ? mod.variants.find((x) => x.id === v.variantId)?.name ?? null : null;
      log(mod, "version_uploaded", { versionId: v.id, versionLabel: v.label, variantId: v.variantId, variantName }, { name: v.createdByName ?? "Tom Okafor", isClient: v.createdByClient }, v.createdAt);
      if (v.isMaster) log(mod, "made_master", { versionId: v.id, versionLabel: v.label }, tom, v.createdAt);
    }
    for (const variant of mod.variants) {
      log(mod, "variant_created", { variantId: variant.id, variantName: variant.name, versionLabel: variant.baseLabel }, tom, variant.createdAt);
      const edited = mod.versions.find((v) => v.variantId === variant.id && v.updatedByName);
      if (edited) {
        const before: CodeSnapshot = {
          ...snap(edited),
          files: edited.files.map((f) => ({ filename: f.filename, language: f.language, content: f.content.replace("Radio radio(9);", "Radio radio(8);") })),
        };
        log(mod, "version_edited", { versionId: edited.id, versionLabel: edited.label, variantId: variant.id, variantName: variant.name, before, after: snap(edited) }, { name: edited.updatedByName!, isClient: true }, edited.updatedAt);
      }
    }
    if (mod.lockedAt) log(mod, "locked", {}, { name: mod.lockedByName ?? "Dan Lindsay", isClient: false }, mod.lockedAt);
    events.get(mod.id)!.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

function findVersion(section: WikiCodeHandoverSection, versionId: string) {
  for (const mod of section.modules) {
    const v = mod.versions.find((x) => x.id === versionId);
    if (v) return { mod, v };
  }
  return null;
}

const variantNameOf = (mod: WikiCodeModuleRecord, id: string | null) => (id ? mod.variants.find((v) => v.id === id)?.name ?? null : null);
const lockedError = (mod: WikiCodeModuleRecord) => err(`This code is locked${mod.lockedByName ? ` by ${mod.lockedByName}` : ""}. Unlock it to make changes.`, 423);

export function resolveDemoCode(
  section: WikiCodeHandoverSection,
  pathname: string,
  init?: { method?: string; body?: unknown },
): unknown {
  const m = /^\/api\/clients\/[^/]+\/wiki\/code(?:\/(.+))?$/.exec(pathname);
  if (!m) return undefined;
  seed(section);
  const method = (init?.method ?? "GET").toUpperCase();
  const body = (typeof init?.body === "string" ? JSON.parse(init.body) : init?.body ?? {}) as Record<string, unknown>;
  const rest = (m[1] ?? "").split("/").filter(Boolean);

  if (rest.length === 0) return method === "GET" ? section : undefined;

  // versions/{id}[/restore]
  if (rest[0] === "versions" && rest[1]) {
    const hit = findVersion(section, rest[1]);
    if (!hit) return err("Version not found", 404);
    const { mod, v } = hit;
    if (mod.lockedAt) return lockedError(mod);
    const where = { versionId: v.id, versionLabel: v.label, variantId: v.variantId, variantName: variantNameOf(mod, v.variantId) };
    if (rest[2] === "restore" && method === "POST") {
      const ev = (events.get(mod.id) ?? []).find((e) => e.id === body.eventId && e.versionId === v.id);
      if (!ev?.before) return err("There's no earlier copy of this version to put back.", 404);
      const before = snap(v);
      v.label = ev.before.label;
      v.notes = ev.before.notes;
      v.files = ev.before.files.map((f, i) => ({ id: nextId(`f${i}`), ...f }));
      v.updatedByName = ME.name;
      log(mod, "restored", { ...where, before, after: snap(v) });
      return v;
    }
    if (method === "DELETE") {
      mod.versions = mod.versions.filter((x) => x !== v);
      log(mod, "version_deleted", { ...where, before: snap(v) });
      return { deleted: true };
    }
    if (method === "PATCH") {
      const before = snap(v);
      const edits = body.label !== undefined || body.notes !== undefined || body.files !== undefined;
      if (body.makeMaster && v.variantId) return err("Only a version on the Master line can be Master.", 400);
      if (body.makeCurrent && !v.isCurrent) {
        for (const x of mod.versions) if ((x.variantId ?? null) === (v.variantId ?? null)) x.isCurrent = false;
        v.isCurrent = true;
        log(mod, "made_live", where);
      }
      if (body.makeMaster && !v.isMaster) {
        for (const x of mod.versions) x.isMaster = false;
        v.isMaster = true;
        log(mod, "made_master", where);
      }
      if (typeof body.label === "string") v.label = body.label;
      if (body.notes !== undefined) v.notes = (body.notes as string | null) || null;
      if (Array.isArray(body.files)) v.files = (body.files as CodeSnapshot["files"]).map((f, i) => ({ id: nextId(`f${i}`), filename: f.filename, language: f.language ?? null, content: f.content }));
      if (edits) {
        v.updatedByName = ME.name;
        v.updatedAt = now();
        log(mod, "version_edited", { ...where, versionLabel: v.label, before, after: snap(v) });
      }
      return v;
    }
    return undefined;
  }

  const mod = section.modules.find((x) => x.id === rest[0]);
  if (!mod) return err("Module not found", 404);

  if (rest[1] === "events" && method === "GET") return { events: events.get(mod.id) ?? [] };

  if (rest[1] === "variants") {
    if (mod.lockedAt) return lockedError(mod);
    if (rest[2] && method === "DELETE") {
      const variant = mod.variants.find((v) => v.id === rest[2]);
      if (!variant) return err("Variant not found", 404);
      mod.variants = mod.variants.filter((v) => v !== variant);
      mod.versions = mod.versions.filter((v) => v.variantId !== variant.id);
      log(mod, "variant_deleted", { variantId: variant.id, variantName: variant.name });
      return { deleted: true };
    }
    if (method === "POST") {
      const base = mod.versions.find((v) => v.id === body.baseVersionId && !v.variantId);
      if (!base) return err("A variant is copied from a version on the Master line.", 400);
      const name = String(body.name ?? "").trim();
      if (mod.variants.some((v) => v.name.toLowerCase() === name.toLowerCase())) return err(`There's already a variant called ${name}.`, 409);
      const variant = { id: nextId("var"), name, notes: (body.notes as string) || null, baseVersionId: base.id, baseLabel: base.label, createdByName: ME.name, createdAt: now() };
      mod.variants.push(variant);
      const copy: WikiCodeVersionRecord = {
        ...base,
        id: nextId("cv"),
        isCurrent: true,
        isMaster: false,
        variantId: variant.id,
        notes: `Copied from Master ${base.label}.`,
        createdAt: now(),
        updatedAt: now(),
        createdByName: ME.name,
        createdByClient: false,
        updatedByName: null,
        files: base.files.map((f, i) => ({ ...f, id: nextId(`f${i}`) })),
      };
      mod.versions.unshift(copy);
      log(mod, "variant_created", { variantId: variant.id, variantName: name, versionId: copy.id, versionLabel: base.label });
      return variant;
    }
    return undefined;
  }

  if (rest.length === 1 && method === "PATCH") {
    if (body.locked === true) {
      if (!mod.lockedAt) {
        mod.lockedAt = now();
        mod.lockedByName = ME.name;
        log(mod, "locked");
      }
      return mod;
    }
    if (body.locked === false) {
      if (!isUnlockPhrase(body.confirm as string)) return err('Type "Unlock Code" to unlock it.', 400);
      if (mod.lockedAt) {
        log(mod, "unlocked", { detail: mod.lockedByName ? `Locked by ${mod.lockedByName}` : null });
        mod.lockedAt = null;
        mod.lockedByName = null;
      }
      return mod;
    }
    return mod;
  }

  if (rest.length === 1 && method === "POST") {
    if (mod.lockedAt) return lockedError(mod);
    const variantId = (body.variantId as string) || null;
    const makeCurrent = body.makeCurrent !== false;
    if (makeCurrent) for (const x of mod.versions) if ((x.variantId ?? null) === variantId) x.isCurrent = false;
    const created: WikiCodeVersionRecord = {
      id: nextId("cv"),
      label: String(body.label ?? ""),
      notes: (body.notes as string) || null,
      isCurrent: makeCurrent,
      isMaster: false,
      variantId,
      createdAt: now(),
      updatedAt: now(),
      createdByName: ME.name,
      createdByClient: false,
      updatedByName: null,
      files: ((body.files as CodeSnapshot["files"]) ?? []).map((f, i) => ({ id: nextId(`f${i}`), filename: f.filename, language: f.language ?? null, content: f.content })),
    };
    mod.versions.unshift(created);
    log(mod, "version_uploaded", { versionId: created.id, versionLabel: created.label, variantId, variantName: variantNameOf(mod, variantId), after: snap(created) });
    return created;
  }
  return undefined;
}
