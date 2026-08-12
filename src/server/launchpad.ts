/**
 * launchpad.ts — everything Gitwork needs FROM a client to start and ship.
 *
 * Every operation is keyed on `wikiId`, because a Launchpad hangs off the client's
 * wiki (the surface it renders in). The internal routes come in by client slug and
 * the client-facing routes come in by share token; both resolve to a wiki id first,
 * so there is exactly one set of write functions and the two paths cannot drift
 * apart in what they allow.
 *
 * Snapshot-on-assign is the load-bearing rule here, mirroring
 * `ClientOnboarding.formSnapshot`: the structure is frozen onto the kit when it is
 * assigned, so editing the master template in Settings never disturbs a kit a
 * client is already working through.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { getDefaultLaunchpadStructure } from "@/lib/launchpad/default-template";
import {
  normalizeStructure,
  resolveAssignableTemplate,
} from "@/server/launchpad-templates";
import {
  applyItemPatch,
  computeCompleteness,
  fieldsById,
  isLaunchpadStructure,
  toggleableModuleIds,
  trackedDocs,
  type ItemPatch,
} from "@/lib/launchpad/structure";
import { collectsFlatAnswer, validateLaunchpadAnswer } from "@/lib/launchpad/field-types";
import {
  isLaunchpadDocKey,
  legalDocFields,
  legalGenerator,
  renderLegalDoc,
} from "@/lib/launchpad/legal/render";
import {
  composeAddress,
  EMPTY_PREFILL,
  firstPresent,
  resolvePrefill,
  type PrefillSource,
} from "@/lib/launchpad/prefill";
import type {
  LaunchpadAnswers,
  LaunchpadDTO,
  LaunchpadDocKey,
  LaunchpadDocState,
  LaunchpadItemState,
  LaunchpadStructure,
  LaunchpadSummary,
} from "@/types/launchpad";

// ─── Row shapes ───────────────────────────────────────────────────────────────

const kitInclude = {
  items: true,
  docs: true,
  template: { select: { name: true } },
} satisfies Prisma.ClientLaunchpadInclude;

type KitRow = Prisma.ClientLaunchpadGetPayload<{ include: typeof kitInclude }>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** The structure a kit renders from: its frozen snapshot, else the in-code default. */
function structureFor(kit: { structureSnapshot: Prisma.JsonValue }): LaunchpadStructure {
  return isLaunchpadStructure(kit.structureSnapshot)
    ? (kit.structureSnapshot as unknown as LaunchpadStructure)
    : getDefaultLaunchpadStructure();
}

function answersFor(kit: { answers: Prisma.JsonValue | null }): LaunchpadAnswers {
  return isPlainObject(kit.answers) ? (kit.answers as LaunchpadAnswers) : {};
}

function serializeItem(row: KitRow["items"][number]): LaunchpadItemState {
  return {
    itemId: row.itemId,
    status: row.status,
    link: row.link,
    note: row.note,
    ownedByClient: row.ownedByClient,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Resolve one doc's rendered state.
 *
 * `body` is the client's stored `bodyOverride` when they have edited it, else a
 * fresh deterministic render from their answers. That is what makes TEMPLATE →
 * EDITED a real transition: before the first edit the body tracks the answers, and
 * after it the client's text is authoritative and is no longer silently rewritten
 * under them when the template changes.
 */
function serializeDoc(
  docKey: LaunchpadDocKey,
  row: KitRow["docs"][number] | undefined,
): LaunchpadDocState {
  const answers = row && isPlainObject(row.answers) ? (row.answers as LaunchpadAnswers) : {};
  const rendered = renderLegalDoc(docKey, answers);
  const edited = Boolean(row?.bodyOverride);
  return {
    docKey,
    title: rendered.title,
    answers,
    body: edited ? (row!.bodyOverride as string) : rendered.body,
    edited,
    status: row?.status ?? "TEMPLATE",
    approvedAt: row?.approvedAt?.toISOString() ?? null,
    approvedByEmail: row?.approvedByEmail ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? new Date(0).toISOString(),
  };
}

function serializeKit(kit: KitRow, enabled: boolean): LaunchpadDTO {
  const structure = structureFor(kit);
  const answers = answersFor(kit);
  const items = kit.items.map(serializeItem);
  const docsByKey = new Map(kit.docs.map((d) => [d.docKey, d]));

  // Only the docs the ENABLED modules actually ask for — a kit with Website off
  // should not surface three legal drafts nobody asked for.
  const docs = trackedDocs(structure, kit.enabledModules, answers)
    .map((field) => field.docKey)
    .filter((key): key is LaunchpadDocKey => isLaunchpadDocKey(key))
    .map((key) => serializeDoc(key, docsByKey.get(key)));

  return {
    enabled,
    assigned: true,
    templateId: kit.templateId,
    templateName: kit.template?.name ?? null,
    structure,
    enabledModules: kit.enabledModules,
    answers,
    items,
    docs,
    completeness: computeCompleteness(structure, kit.enabledModules, items, answers),
    updatedAt: kit.updatedAt.toISOString(),
  };
}

/** The shape returned before a template has been assigned. */
function unassigned(enabled: boolean): LaunchpadDTO {
  return {
    enabled,
    assigned: false,
    templateId: null,
    templateName: null,
    structure: { modules: [] },
    enabledModules: [],
    answers: {},
    items: [],
    docs: [],
    completeness: { total: 0, provided: 0, na: 0, needed: 0, percent: 0, outstanding: [] },
    updatedAt: null,
  };
}

// ─── Resolution ───────────────────────────────────────────────────────────────

/** The wiki id for a client, creating the wiki row if it doesn't exist yet — the
 *  same upsert `setWikiIntakeEnabled` uses, so enabling a section never 404s on a
 *  client whose wiki has never been opened. */
async function wikiIdForClient(clientId: string): Promise<string> {
  const wiki = await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId },
    update: {},
    select: { id: true },
  });
  return wiki.id;
}

async function loadKit(wikiId: string): Promise<{ kit: KitRow | null; enabled: boolean } | null> {
  const wiki = await prisma.clientWiki.findUnique({
    where: { id: wikiId },
    select: { launchpadEnabled: true, launchpad: { include: kitInclude } },
  });
  if (!wiki) return null;
  return { kit: wiki.launchpad, enabled: wiki.launchpadEnabled };
}

/** Read a kit by wiki id. Returns null only when the wiki itself doesn't exist. */
export async function getLaunchpadByWikiId(wikiId: string): Promise<LaunchpadDTO | null> {
  const loaded = await loadKit(wikiId);
  if (!loaded) return null;
  return loaded.kit ? serializeKit(loaded.kit, loaded.enabled) : unassigned(loaded.enabled);
}

export async function getLaunchpadForClient(clientId: string): Promise<LaunchpadDTO | null> {
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId },
    select: { id: true },
  });
  // No wiki row yet means no kit and the flag is off — report that rather than
  // creating a wiki as a side effect of a read.
  if (!wiki) return unassigned(false);
  return getLaunchpadByWikiId(wiki.id);
}

/**
 * The kit a write targets, plus its resolved structure. Returns null when the wiki
 * has no kit assigned OR the section is switched off — a client-facing write must
 * not land on a disabled section, and the internal caller shouldn't either.
 */
async function kitForWrite(
  wikiId: string,
): Promise<{ kit: KitRow; structure: LaunchpadStructure; answers: LaunchpadAnswers } | null> {
  const loaded = await loadKit(wikiId);
  if (!loaded || !loaded.enabled || !loaded.kit) return null;
  return {
    kit: loaded.kit,
    structure: structureFor(loaded.kit),
    answers: answersFor(loaded.kit),
  };
}

// ─── Enablement + assignment ──────────────────────────────────────────────────

export async function setLaunchpadEnabled(clientId: string, enabled: boolean): Promise<void> {
  await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId, launchpadEnabled: enabled },
    update: { launchpadEnabled: enabled },
    select: { id: true },
  });
}

/**
 * Assign a template to a client, freezing its structure onto the kit.
 *
 * Re-assigning an existing kit REPLACES the snapshot and the module selection but
 * deliberately keeps the item and doc rows: a client who has already provided their
 * app icons should not have to re-provide them because we switched them onto a
 * different template. Rows whose `itemId` is not in the new structure simply stop
 * being read (they are not deleted, so switching back restores them).
 */
export async function assignLaunchpad(
  clientId: string,
  input: { templateId?: string; enabledModules?: string[] } = {},
): Promise<LaunchpadDTO | null> {
  const wikiId = await wikiIdForClient(clientId);
  const template = await resolveAssignableTemplate(input.templateId);
  const structure = template
    ? normalizeStructure(template.structure)
    : getDefaultLaunchpadStructure();

  // Only accept module ids that exist and are actually toggleable — an alwaysOn
  // module is on regardless, and storing it would make the list lie about intent.
  const allowed = new Set(toggleableModuleIds(structure));
  const enabledModules = (input.enabledModules ?? []).filter((id) => allowed.has(id));

  await prisma.clientLaunchpad.upsert({
    where: { wikiId },
    create: {
      wikiId,
      templateId: template?.id ?? null,
      structureSnapshot: structure as unknown as Prisma.InputJsonValue,
      enabledModules,
    },
    update: {
      templateId: template?.id ?? null,
      structureSnapshot: structure as unknown as Prisma.InputJsonValue,
      enabledModules,
    },
    select: { id: true },
  });

  return getLaunchpadByWikiId(wikiId);
}

/** Toggle which optional modules a client's kit asks for. */
export async function setLaunchpadModules(
  clientId: string,
  enabledModules: string[],
): Promise<LaunchpadDTO | null> {
  const wiki = await prisma.clientWiki.findUnique({ where: { clientId }, select: { id: true } });
  if (!wiki) return null;
  const loaded = await loadKit(wiki.id);
  if (!loaded?.kit) return null;

  const allowed = new Set(toggleableModuleIds(structureFor(loaded.kit)));
  await prisma.clientLaunchpad.update({
    where: { id: loaded.kit.id },
    data: { enabledModules: enabledModules.filter((id) => allowed.has(id)) },
  });
  return getLaunchpadByWikiId(wiki.id);
}

// ─── Prefill (only-if-present) ────────────────────────────────────────────────

/**
 * Assemble the prefill source for a client: the live client record first, then an
 * onboarding row IF one exists.
 *
 * The client record wins because it is the live one — an onboarding row is a
 * snapshot of what they told us at sign-up and may since have been corrected in
 * Portal. Everything is optional: a client who never went through onboarding simply
 * gets fewer prefilled fields, never an error and never a half-populated form
 * implying we hold details we don't.
 */
export async function buildPrefillSource(clientId: string): Promise<PrefillSource> {
  const client = await prisma.workspaceClient.findUnique({
    where: { id: clientId },
    select: {
      name: true,
      website: true,
      legalCompanyName: true,
      companyNumber: true,
      vatNumber: true,
      primaryContactName: true,
      primaryContactEmail: true,
      invoiceEmail: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      county: true,
      postcode: true,
      country: true,
      onboarding: {
        select: {
          legalCompanyName: true,
          companyNumber: true,
          vatNumber: true,
          contactFirstName: true,
          contactLastName: true,
          contactEmail: true,
          invoiceEmail: true,
          productUrl: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          county: true,
          postcode: true,
          country: true,
        },
      },
    },
  });
  if (!client) return EMPTY_PREFILL;

  const ob = client.onboarding;
  const contactName = firstPresent(
    client.primaryContactName,
    ob ? [ob.contactFirstName, ob.contactLastName].filter(Boolean).join(" ") : null,
  );

  return {
    clientName: firstPresent(client.name),
    website: firstPresent(client.website, ob?.productUrl),
    legalCompanyName: firstPresent(client.legalCompanyName, ob?.legalCompanyName, client.name),
    companyNumber: firstPresent(client.companyNumber, ob?.companyNumber),
    vatNumber: firstPresent(client.vatNumber, ob?.vatNumber),
    primaryContactName: contactName,
    primaryContactEmail: firstPresent(client.primaryContactEmail, ob?.contactEmail),
    invoiceEmail: firstPresent(client.invoiceEmail, ob?.invoiceEmail),
    registeredAddress: firstPresent(composeAddress(client), ob ? composeAddress(ob) : null),
  };
}

/** Prefilled values for the flat fields of a structure, skipping anything already
 *  answered — a prefill must never overwrite what the client typed. */
export function prefillAnswers(
  structure: LaunchpadStructure,
  source: PrefillSource,
  existing: LaunchpadAnswers,
): LaunchpadAnswers {
  const out: LaunchpadAnswers = {};
  for (const [id, def] of fieldsById(structure)) {
    if (!def.prefillKey || !collectsFlatAnswer(def.type)) continue;
    const already = existing[id];
    if (typeof already === "string" && already.trim()) continue;
    const value = resolvePrefill(def.prefillKey, source);
    if (value) out[id] = value;
  }
  return out;
}

/** Prefilled answers for one legal doc's own question set. */
export function prefillDocAnswers(
  docKey: LaunchpadDocKey,
  source: PrefillSource,
  existing: LaunchpadAnswers,
): LaunchpadAnswers {
  const out: LaunchpadAnswers = {};
  for (const field of legalDocFields(docKey)) {
    if (!field.prefillKey) continue;
    const already = existing[field.id];
    if (typeof already === "string" && already.trim()) continue;
    const value = resolvePrefill(field.prefillKey, source);
    if (value) out[field.id] = value;
  }
  return out;
}

/**
 * Fill in what we already know, once. Called when a kit is opened, so a client
 * lands on a form that already has their company details rather than re-typing
 * them. Only writes fields that are currently blank.
 */
export async function applyLaunchpadPrefill(
  clientId: string,
): Promise<LaunchpadDTO | null> {
  const wiki = await prisma.clientWiki.findUnique({ where: { clientId }, select: { id: true } });
  if (!wiki) return null;
  const loaded = await loadKit(wiki.id);
  if (!loaded?.kit) return null;

  const structure = structureFor(loaded.kit);
  const existing = answersFor(loaded.kit);
  const source = await buildPrefillSource(clientId);
  const filled = prefillAnswers(structure, source, existing);

  if (Object.keys(filled).length > 0) {
    await prisma.clientLaunchpad.update({
      where: { id: loaded.kit.id },
      data: { answers: { ...existing, ...filled } as Prisma.InputJsonValue },
    });
  }

  // Docs prefill into their own answer maps, so each is a separate upsert.
  for (const field of trackedDocs(structure, loaded.kit.enabledModules, existing)) {
    const key = field.docKey;
    if (!isLaunchpadDocKey(key)) continue;
    const row = loaded.kit.docs.find((d) => d.docKey === key);
    // Never touch a doc the client has already edited or approved.
    if (row?.bodyOverride || row?.status === "APPROVED") continue;
    const current = row && isPlainObject(row.answers) ? (row.answers as LaunchpadAnswers) : {};
    const docFilled = prefillDocAnswers(key, source, current);
    if (Object.keys(docFilled).length === 0) continue;
    await prisma.launchpadDoc.upsert({
      where: { kitId_docKey: { kitId: loaded.kit.id, docKey: key } },
      create: {
        kitId: loaded.kit.id,
        docKey: key,
        answers: docFilled as Prisma.InputJsonValue,
      },
      update: { answers: { ...current, ...docFilled } as Prisma.InputJsonValue },
    });
  }

  return getLaunchpadByWikiId(wiki.id);
}

// ─── Item writes ──────────────────────────────────────────────────────────────

/**
 * Move one requirement. `itemId` must exist in the kit's OWN snapshot — an id that
 * isn't there is rejected rather than stored, so a stale client tab or a crafted
 * payload can't create rows nothing will ever render (the same rule
 * `autosaveOnboarding` applies to answer keys).
 */
export async function updateLaunchpadItem(
  wikiId: string,
  itemId: string,
  patch: ItemPatch,
  updatedBy: string | null,
): Promise<LaunchpadDTO | null> {
  const ctx = await kitForWrite(wikiId);
  if (!ctx) return null;

  const def = fieldsById(ctx.structure).get(itemId);
  if (!def || def.type !== "checklist_item") return null;

  const existing = ctx.kit.items.find((i) => i.itemId === itemId);
  const next = applyItemPatch(
    {
      status: existing?.status ?? "NEEDED",
      link: existing?.link ?? null,
      note: existing?.note ?? null,
      ownedByClient: existing?.ownedByClient ?? null,
    },
    patch,
  );

  await prisma.launchpadItem.upsert({
    where: { kitId_itemId: { kitId: ctx.kit.id, itemId } },
    create: { kitId: ctx.kit.id, itemId, ...next, updatedBy },
    update: { ...next, updatedBy },
  });

  return getLaunchpadByWikiId(wikiId);
}

/**
 * Save flat field answers. Each is routed by its definition in the kit's snapshot
 * and validated; an id that isn't there, or a type that has its own table, is
 * ignored rather than written into the answers JSON where nothing would read it.
 */
export async function saveLaunchpadAnswers(
  wikiId: string,
  incoming: Record<string, unknown>,
): Promise<LaunchpadDTO | null> {
  const ctx = await kitForWrite(wikiId);
  if (!ctx) return null;

  const defs = fieldsById(ctx.structure);
  const merged: LaunchpadAnswers = { ...ctx.answers };
  let touched = false;

  for (const [id, raw] of Object.entries(incoming)) {
    const def = defs.get(id);
    if (!def || !collectsFlatAnswer(def.type)) continue;
    const { ok, value } = validateLaunchpadAnswer(def, raw);
    if (!ok) continue;
    merged[id] = value;
    touched = true;
  }

  if (touched) {
    await prisma.clientLaunchpad.update({
      where: { id: ctx.kit.id },
      data: { answers: merged as Prisma.InputJsonValue },
    });
  }
  return getLaunchpadByWikiId(wikiId);
}

// ─── Doc writes ───────────────────────────────────────────────────────────────

/** The doc keys this kit actually asks for — the allow-list for a doc write. */
function allowedDocKeys(
  structure: LaunchpadStructure,
  enabledModules: string[],
  answers: LaunchpadAnswers,
): Set<string> {
  return new Set(
    trackedDocs(structure, enabledModules, answers)
      .map((f) => f.docKey)
      .filter((k): k is LaunchpadDocKey => isLaunchpadDocKey(k)),
  );
}

/**
 * Save a doc's answers and/or its edited body.
 *
 * Writing a `body` sets `bodyOverride` and moves TEMPLATE → EDITED. An APPROVED doc
 * that is edited drops back to EDITED: approval is a statement about a specific
 * text, so silently keeping the approved badge over changed wording would be the
 * one genuinely misleading thing this feature could do.
 */
export async function updateLaunchpadDoc(
  wikiId: string,
  docKey: string,
  input: { answers?: Record<string, unknown>; body?: string | null },
): Promise<LaunchpadDTO | null> {
  const ctx = await kitForWrite(wikiId);
  if (!ctx) return null;
  if (!isLaunchpadDocKey(docKey)) return null;
  if (!allowedDocKeys(ctx.structure, ctx.kit.enabledModules, ctx.answers).has(docKey)) return null;

  const row = ctx.kit.docs.find((d) => d.docKey === docKey);
  const current = row && isPlainObject(row.answers) ? (row.answers as LaunchpadAnswers) : {};

  const data: Prisma.LaunchpadDocUncheckedUpdateInput = {};

  if (input.answers) {
    const known = new Set(legalDocFields(docKey).map((f) => f.id));
    const merged: LaunchpadAnswers = { ...current };
    for (const [id, raw] of Object.entries(input.answers)) {
      if (!known.has(id)) continue;
      merged[id] =
        typeof raw === "boolean" ? raw : raw == null ? null : String(raw).slice(0, 10_000);
    }
    data.answers = merged as Prisma.InputJsonValue;
  }

  if (input.body !== undefined) {
    const trimmed = input.body?.trim() ?? "";
    if (trimmed === "") {
      // Reverting to the generated draft: clear the override and the EDITED state
      // so the body tracks the answers again.
      data.bodyOverride = null;
      data.status = "TEMPLATE";
      data.approvedAt = null;
      data.approvedByEmail = null;
    } else {
      data.bodyOverride = trimmed.slice(0, 200_000);
      data.status = "EDITED";
      data.approvedAt = null;
      data.approvedByEmail = null;
    }
  }

  await prisma.launchpadDoc.upsert({
    where: { kitId_docKey: { kitId: ctx.kit.id, docKey } },
    create: {
      kitId: ctx.kit.id,
      docKey,
      answers: (data.answers ?? (current as Prisma.InputJsonValue)) as Prisma.InputJsonValue,
      bodyOverride: typeof data.bodyOverride === "string" ? data.bodyOverride : null,
      status: input.body?.trim() ? "EDITED" : "TEMPLATE",
    },
    update: data,
  });

  return getLaunchpadByWikiId(wikiId);
}

/**
 * Approve a doc. A lightweight status, NOT an e-signature — no signer identity is
 * verified beyond whoever is signed in, nothing is sealed, and the record carries no
 * evidentiary weight. It exists so the team can see the client has read and accepted
 * the draft, and the UI says exactly that.
 *
 * Approving snapshots the currently-rendered body into `bodyOverride` when there
 * isn't one, so "approved" refers to a fixed text rather than to whatever the
 * generator would produce later.
 */
export async function approveLaunchpadDoc(
  wikiId: string,
  docKey: string,
  approvedByEmail: string | null,
): Promise<LaunchpadDTO | null> {
  const ctx = await kitForWrite(wikiId);
  if (!ctx) return null;
  if (!isLaunchpadDocKey(docKey)) return null;
  if (!allowedDocKeys(ctx.structure, ctx.kit.enabledModules, ctx.answers).has(docKey)) return null;

  const row = ctx.kit.docs.find((d) => d.docKey === docKey);
  const answers = row && isPlainObject(row.answers) ? (row.answers as LaunchpadAnswers) : {};
  const frozenBody = row?.bodyOverride ?? renderLegalDoc(docKey, answers).body;

  await prisma.launchpadDoc.upsert({
    where: { kitId_docKey: { kitId: ctx.kit.id, docKey } },
    create: {
      kitId: ctx.kit.id,
      docKey,
      answers: answers as Prisma.InputJsonValue,
      bodyOverride: frozenBody,
      status: "APPROVED",
      approvedAt: new Date(),
      approvedByEmail,
    },
    update: {
      bodyOverride: frozenBody,
      status: "APPROVED",
      approvedAt: new Date(),
      approvedByEmail,
    },
  });

  return getLaunchpadByWikiId(wikiId);
}

/** Withdraw an approval, back to whatever edit state the body implies. */
export async function unapproveLaunchpadDoc(
  wikiId: string,
  docKey: string,
): Promise<LaunchpadDTO | null> {
  const ctx = await kitForWrite(wikiId);
  if (!ctx) return null;
  if (!isLaunchpadDocKey(docKey)) return null;

  const row = ctx.kit.docs.find((d) => d.docKey === docKey);
  if (!row) return getLaunchpadByWikiId(wikiId);

  await prisma.launchpadDoc.update({
    where: { id: row.id },
    data: {
      status: row.bodyOverride ? "EDITED" : "TEMPLATE",
      approvedAt: null,
      approvedByEmail: null,
    },
  });
  return getLaunchpadByWikiId(wikiId);
}

/** The generated draft for a doc, ignoring any stored edit — powers "reset to template". */
export function launchpadDocPreview(docKey: LaunchpadDocKey, answers: LaunchpadAnswers) {
  return { ...renderLegalDoc(docKey, answers), summary: legalGenerator(docKey).summary };
}

// ─── Internal roll-up ─────────────────────────────────────────────────────────

/**
 * Completeness per client, for the Portal card signal and the HQ widget.
 *
 * Batched across the whole client set (no N+1), and deliberately keyed by clientId
 * so it drops straight into `listDerivedClients`'s existing map pattern. Only
 * clients with the section ENABLED and a kit assigned appear — a client without one
 * has no Launchpad signal at all, which is different from having an empty one.
 */
export async function computeLaunchpadSummaries(
  workspaceId: string,
  clientIds: string[],
): Promise<Map<string, LaunchpadSummary>> {
  const out = new Map<string, LaunchpadSummary>();
  if (clientIds.length === 0) return out;

  const rows = await prisma.clientWiki.findMany({
    where: {
      clientId: { in: clientIds },
      launchpadEnabled: true,
      client: { workspaceId },
      launchpad: { isNot: null },
    },
    select: {
      clientId: true,
      client: { select: { name: true, slug: true } },
      launchpad: {
        select: {
          structureSnapshot: true,
          enabledModules: true,
          answers: true,
          items: true,
        },
      },
    },
  });

  for (const row of rows) {
    const kit = row.launchpad;
    if (!kit) continue;
    const structure = structureFor(kit);
    const answers = answersFor(kit);
    const completeness = computeCompleteness(
      structure,
      kit.enabledModules,
      kit.items.map(serializeItem),
      answers,
    );
    out.set(row.clientId, {
      clientId: row.clientId,
      clientName: row.client.name,
      clientSlug: row.client.slug,
      percent: completeness.percent,
      needed: completeness.needed,
      outstanding: completeness.outstanding,
    });
  }

  return out;
}

/** Every client with a live Launchpad, worst first — the HQ widget's list. */
export async function listLaunchpadSummaries(): Promise<LaunchpadSummary[]> {
  const { workspace } = await ensureBaseRecords();
  const clients = await prisma.workspaceClient.findMany({
    where: { workspaceId: workspace.id, hidden: false, status: { not: "LEAD" } },
    select: { id: true },
  });
  const map = await computeLaunchpadSummaries(
    workspace.id,
    clients.map((c) => c.id),
  );
  return [...map.values()].sort(
    (a, b) => a.percent - b.percent || b.needed - a.needed || a.clientName.localeCompare(b.clientName),
  );
}
