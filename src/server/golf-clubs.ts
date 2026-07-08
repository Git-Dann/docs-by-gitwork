/**
 * golf-clubs.ts — the canonical golf **equipment (clubs)** dataset: the
 * "Equipment" domain of the Gitwork Golf Data platform, consumed by Wedge and
 * partner developers through the `/api/golf/clubs` export endpoints.
 *
 * Schema mirrors the gitwork-golf-data repo's `EquipmentModelRecord`
 * (manufacturer / category / model / family / year / specifications) with
 * variants (lofts / flex / handedness / sku) inline.
 *
 * `SEED_CLUBS` is a real, curated starter catalogue of current-generation club
 * models (public manufacturer product data) so the endpoint returns real data
 * from day one; it is upserted idempotently by `seedGolfClubs()` from bootstrap
 * and can be extended over time.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export interface GolfClubVariant {
  name: string;
  loft?: string;
  flex?: string;
  handedness?: string;
  sku?: string;
}

export interface GolfClubInput {
  manufacturer: string;
  category: string;
  modelName: string;
  modelFamily?: string | null;
  modelYear?: number | null;
  status?: string;
  aliases?: string[];
  imageUrls?: string[];
  specs?: Record<string, string | number | boolean | null>;
  variants?: GolfClubVariant[];
}

export interface GolfClubDTO {
  id: string;
  manufacturer: string;
  category: string;
  modelName: string;
  modelFamily: string | null;
  modelYear: number | null;
  status: string;
  naturalKey: string;
  aliases: string[];
  imageUrls: string[];
  specifications: Record<string, unknown>;
  variants: GolfClubVariant[];
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function naturalKeyFor(input: GolfClubInput): string {
  const year = input.modelYear ?? "unknown";
  return `${slugify(input.manufacturer)}:${slugify(input.category)}:${year}:${slugify(input.modelName)}`;
}

// ── Real curated starter catalogue (public product data) ───────────────────────

const flexRSX = ["Regular", "Stiff", "X-Stiff"];

function loftVariants(lofts: string[], flexes: string[] = flexRSX): GolfClubVariant[] {
  return lofts.flatMap((loft) =>
    flexes.map((flex) => ({ name: `${loft}° ${flex}`, loft: `${loft}°`, flex })),
  );
}

function lengthVariants(lengths: string[]): GolfClubVariant[] {
  return lengths.map((l) => ({ name: `${l}"`, handedness: "Right" }));
}

export const SEED_CLUBS: GolfClubInput[] = [
  // ── Drivers ──────────────────────────────────────────────────────────────
  { manufacturer: "TaylorMade", category: "Driver", modelName: "Qi10", modelFamily: "Qi10", modelYear: 2024, aliases: ["Qi10 Standard"], specs: { headMaterial: "Titanium / Carbon", adjustableLoft: true, forgiveness: "High", headSizeCc: 460 }, variants: loftVariants(["9", "10.5", "12"]) },
  { manufacturer: "TaylorMade", category: "Driver", modelName: "Qi10 Max", modelFamily: "Qi10", modelYear: 2024, specs: { forgiveness: "Max", moiGmm2: 10000, adjustableLoft: true }, variants: loftVariants(["9", "10.5", "12"]) },
  { manufacturer: "TaylorMade", category: "Driver", modelName: "Qi10 LS", modelFamily: "Qi10", modelYear: 2024, specs: { spin: "Low", adjustableLoft: true }, variants: loftVariants(["8", "9", "10.5"]) },
  { manufacturer: "TaylorMade", category: "Driver", modelName: "Stealth 2", modelFamily: "Stealth", modelYear: 2023, specs: { headMaterial: "60X Carbon Twist Face", adjustableLoft: true }, variants: loftVariants(["9", "10.5", "12"]) },
  { manufacturer: "Callaway", category: "Driver", modelName: "Paradym Ai Smoke Max", modelFamily: "Ai Smoke", modelYear: 2024, specs: { face: "Ai Smart Face", adjustableLoft: true, forgiveness: "High" }, variants: loftVariants(["9", "10.5", "12"]) },
  { manufacturer: "Callaway", category: "Driver", modelName: "Paradym Ai Smoke Triple Diamond", modelFamily: "Ai Smoke", modelYear: 2024, aliases: ["Ai Smoke TD"], specs: { spin: "Low", profile: "Tour" }, variants: loftVariants(["8", "9", "10.5"]) },
  { manufacturer: "Titleist", category: "Driver", modelName: "GT2", modelFamily: "GT", modelYear: 2024, specs: { forgiveness: "High", adjustableLoft: true }, variants: loftVariants(["9", "10", "11"]) },
  { manufacturer: "Titleist", category: "Driver", modelName: "GT3", modelFamily: "GT", modelYear: 2024, specs: { adjustableWeight: true, profile: "Tour" }, variants: loftVariants(["8", "9", "10"]) },
  { manufacturer: "Titleist", category: "Driver", modelName: "TSR2", modelFamily: "TSR", modelYear: 2022, variants: loftVariants(["8", "9", "10", "11"]) },
  { manufacturer: "Ping", category: "Driver", modelName: "G430 Max 10K", modelFamily: "G430", modelYear: 2024, specs: { moiGmm2: 10000, forgiveness: "Max" }, variants: loftVariants(["9", "10.5", "12"]) },
  { manufacturer: "Ping", category: "Driver", modelName: "G430 LST", modelFamily: "G430", modelYear: 2023, specs: { spin: "Low" }, variants: loftVariants(["9", "10.5"]) },
  { manufacturer: "Cobra", category: "Driver", modelName: "Darkspeed X", modelFamily: "Darkspeed", modelYear: 2024, specs: { forgiveness: "High" }, variants: loftVariants(["9", "10.5", "12"]) },
  { manufacturer: "Cobra", category: "Driver", modelName: "Darkspeed LS", modelFamily: "Darkspeed", modelYear: 2024, specs: { spin: "Low" }, variants: loftVariants(["9", "10.5"]) },
  { manufacturer: "Mizuno", category: "Driver", modelName: "ST-Max 230", modelFamily: "ST", modelYear: 2023, variants: loftVariants(["9.5", "10.5", "12"]) },
  { manufacturer: "Srixon", category: "Driver", modelName: "ZX5 Mk II", modelFamily: "ZX", modelYear: 2023, variants: loftVariants(["9.5", "10.5"]) },
  { manufacturer: "PXG", category: "Driver", modelName: "0311 Black Ops", modelFamily: "0311", modelYear: 2024, specs: { adjustableWeight: true }, variants: loftVariants(["9", "10.5"]) },

  // ── Fairway Woods ──────────────────────────────────────────────────────────
  { manufacturer: "TaylorMade", category: "Fairway Wood", modelName: "Qi10 Fairway", modelFamily: "Qi10", modelYear: 2024, variants: loftVariants(["15", "16.5", "18", "21"]) },
  { manufacturer: "Callaway", category: "Fairway Wood", modelName: "Paradym Ai Smoke Max Fairway", modelFamily: "Ai Smoke", modelYear: 2024, variants: loftVariants(["15", "16.5", "18", "21"]) },
  { manufacturer: "Titleist", category: "Fairway Wood", modelName: "GT2 Fairway", modelFamily: "GT", modelYear: 2024, variants: loftVariants(["15", "16.5", "18"]) },
  { manufacturer: "Ping", category: "Fairway Wood", modelName: "G430 Max Fairway", modelFamily: "G430", modelYear: 2023, variants: loftVariants(["15", "18", "21"]) },

  // ── Hybrids ────────────────────────────────────────────────────────────────
  { manufacturer: "TaylorMade", category: "Hybrid", modelName: "Qi10 Rescue", modelFamily: "Qi10", modelYear: 2024, variants: loftVariants(["19", "22", "25"]) },
  { manufacturer: "Callaway", category: "Hybrid", modelName: "Apex 24 Hybrid", modelFamily: "Apex", modelYear: 2024, variants: loftVariants(["18", "20", "23"]) },
  { manufacturer: "Ping", category: "Hybrid", modelName: "G430 Hybrid", modelFamily: "G430", modelYear: 2023, variants: loftVariants(["17", "19", "22", "26"]) },
  { manufacturer: "Titleist", category: "Hybrid", modelName: "TSR2 Hybrid", modelFamily: "TSR", modelYear: 2022, variants: loftVariants(["18", "21", "24"]) },

  // ── Iron Sets ──────────────────────────────────────────────────────────────
  { manufacturer: "TaylorMade", category: "Iron Set", modelName: "P790 (2023)", modelFamily: "P7", modelYear: 2023, aliases: ["P790"], specs: { construction: "Hollow body", setComposition: "4-PW", tungstenWeighting: true }, variants: flexRSX.map((f) => ({ name: `4-PW ${f}`, flex: f })) },
  { manufacturer: "TaylorMade", category: "Iron Set", modelName: "P770 (2023)", modelFamily: "P7", modelYear: 2023, specs: { profile: "Players", setComposition: "4-PW" }, variants: flexRSX.map((f) => ({ name: `4-PW ${f}`, flex: f })) },
  { manufacturer: "TaylorMade", category: "Iron Set", modelName: "Qi10 Irons", modelFamily: "Qi10", modelYear: 2024, specs: { profile: "Game improvement", setComposition: "5-PW, AW" }, variants: flexRSX.map((f) => ({ name: `5-AW ${f}`, flex: f })) },
  { manufacturer: "Callaway", category: "Iron Set", modelName: "Apex Pro 24", modelFamily: "Apex", modelYear: 2024, specs: { profile: "Players", setComposition: "4-PW" }, variants: flexRSX.map((f) => ({ name: `4-PW ${f}`, flex: f })) },
  { manufacturer: "Callaway", category: "Iron Set", modelName: "Apex CB 24", modelFamily: "Apex", modelYear: 2024, specs: { construction: "Cavity back", setComposition: "4-PW" }, variants: flexRSX.map((f) => ({ name: `4-PW ${f}`, flex: f })) },
  { manufacturer: "Titleist", category: "Iron Set", modelName: "T100 (2023)", modelFamily: "T-Series", modelYear: 2023, specs: { profile: "Tour", setComposition: "3-PW" }, variants: flexRSX.map((f) => ({ name: `3-PW ${f}`, flex: f })) },
  { manufacturer: "Titleist", category: "Iron Set", modelName: "T150 (2023)", modelFamily: "T-Series", modelYear: 2023, specs: { profile: "Players", setComposition: "3-PW" }, variants: flexRSX.map((f) => ({ name: `3-PW ${f}`, flex: f })) },
  { manufacturer: "Titleist", category: "Iron Set", modelName: "T200 (2023)", modelFamily: "T-Series", modelYear: 2023, specs: { setComposition: "4-PW" }, variants: flexRSX.map((f) => ({ name: `4-PW ${f}`, flex: f })) },
  { manufacturer: "Titleist", category: "Iron Set", modelName: "T350 (2023)", modelFamily: "T-Series", modelYear: 2023, specs: { profile: "Game improvement", setComposition: "5-PW, W" }, variants: flexRSX.map((f) => ({ name: `5-W ${f}`, flex: f })) },
  { manufacturer: "Ping", category: "Iron Set", modelName: "i230", modelFamily: "i-Series", modelYear: 2023, specs: { profile: "Players", setComposition: "3-PW" }, variants: flexRSX.map((f) => ({ name: `3-PW ${f}`, flex: f })) },
  { manufacturer: "Ping", category: "Iron Set", modelName: "Blueprint S", modelFamily: "Blueprint", modelYear: 2024, specs: { profile: "Players distance", setComposition: "4-PW" }, variants: flexRSX.map((f) => ({ name: `4-PW ${f}`, flex: f })) },
  { manufacturer: "Ping", category: "Iron Set", modelName: "G430 Irons", modelFamily: "G430", modelYear: 2023, specs: { profile: "Game improvement", setComposition: "4-PW, UW" }, variants: flexRSX.map((f) => ({ name: `4-UW ${f}`, flex: f })) },
  { manufacturer: "Mizuno", category: "Iron Set", modelName: "Pro 241", modelFamily: "Pro", modelYear: 2024, specs: { construction: "Muscle back", forged: true, setComposition: "3-PW" }, variants: flexRSX.map((f) => ({ name: `3-PW ${f}`, flex: f })) },
  { manufacturer: "Mizuno", category: "Iron Set", modelName: "Pro 243", modelFamily: "Pro", modelYear: 2024, specs: { forged: true, setComposition: "4-PW" }, variants: flexRSX.map((f) => ({ name: `4-PW ${f}`, flex: f })) },
  { manufacturer: "Mizuno", category: "Iron Set", modelName: "JPX 923 Hot Metal", modelFamily: "JPX", modelYear: 2022, specs: { setComposition: "4-PW, GW" }, variants: flexRSX.map((f) => ({ name: `4-GW ${f}`, flex: f })) },
  { manufacturer: "Srixon", category: "Iron Set", modelName: "ZX5 Mk II Irons", modelFamily: "ZX", modelYear: 2023, specs: { setComposition: "4-PW" }, variants: flexRSX.map((f) => ({ name: `4-PW ${f}`, flex: f })) },

  // ── Wedges ─────────────────────────────────────────────────────────────────
  { manufacturer: "Titleist", category: "Wedge", modelName: "Vokey SM10", modelFamily: "Vokey", modelYear: 2024, specs: { grinds: "F, S, M, K, L, D, T" }, variants: loftVariants(["46", "50", "52", "54", "56", "58", "60", "62"], ["Wedge"]) },
  { manufacturer: "Cleveland", category: "Wedge", modelName: "RTX 6 ZipCore", modelFamily: "RTX", modelYear: 2023, specs: { grinds: "Low, Mid, Full XLow" }, variants: loftVariants(["46", "48", "50", "52", "54", "56", "58", "60"], ["Wedge"]) },
  { manufacturer: "Callaway", category: "Wedge", modelName: "Jaws Raw", modelFamily: "Jaws", modelYear: 2022, variants: loftVariants(["48", "50", "52", "54", "56", "58", "60"], ["Wedge"]) },
  { manufacturer: "TaylorMade", category: "Wedge", modelName: "Milled Grind 4", modelFamily: "Milled Grind", modelYear: 2024, aliases: ["MG4"], variants: loftVariants(["46", "48", "50", "52", "54", "56", "58", "60"], ["Wedge"]) },
  { manufacturer: "Ping", category: "Wedge", modelName: "Glide 4.0", modelFamily: "Glide", modelYear: 2022, variants: loftVariants(["46", "50", "52", "54", "56", "58", "60"], ["Wedge"]) },
  { manufacturer: "Mizuno", category: "Wedge", modelName: "T24", modelFamily: "T-Series", modelYear: 2024, variants: loftVariants(["46", "50", "52", "54", "56", "58", "60", "62"], ["Wedge"]) },

  // ── Putters ────────────────────────────────────────────────────────────────
  { manufacturer: "Scotty Cameron", category: "Putter", modelName: "Special Select Newport 2", modelFamily: "Special Select", modelYear: 2023, specs: { headStyle: "Blade" }, variants: lengthVariants(["33", "34", "35"]) },
  { manufacturer: "Scotty Cameron", category: "Putter", modelName: "Phantom 11", modelFamily: "Phantom", modelYear: 2024, specs: { headStyle: "Mallet" }, variants: lengthVariants(["33", "34", "35"]) },
  { manufacturer: "Odyssey", category: "Putter", modelName: "Ai-ONE Milled Seven", modelFamily: "Ai-ONE", modelYear: 2024, specs: { headStyle: "Mallet", insert: "Ai-milled" }, variants: lengthVariants(["33", "34", "35"]) },
  { manufacturer: "Odyssey", category: "Putter", modelName: "White Hot OG #1", modelFamily: "White Hot OG", modelYear: 2023, specs: { headStyle: "Blade" }, variants: lengthVariants(["33", "34", "35"]) },
  { manufacturer: "TaylorMade", category: "Putter", modelName: "Spider Tour", modelFamily: "Spider", modelYear: 2023, specs: { headStyle: "Mallet" }, variants: lengthVariants(["33", "34", "35"]) },
  { manufacturer: "Ping", category: "Putter", modelName: "PLD Anser", modelFamily: "PLD", modelYear: 2023, specs: { headStyle: "Blade", milled: true }, variants: lengthVariants(["33", "34", "35"]) },
  { manufacturer: "Bettinardi", category: "Putter", modelName: "Studio Stock 8", modelFamily: "Studio Stock", modelYear: 2023, specs: { headStyle: "Mallet", milled: true }, variants: lengthVariants(["33", "34", "35"]) },
];

// ── persistence ────────────────────────────────────────────────────────────────

/** Idempotent seed of the starter catalogue. Skips if already populated. */
export async function seedGolfClubs(workspaceId: string): Promise<number> {
  const existing = await prisma.golfClub.count({ where: { workspaceId } });
  if (existing > 0) return 0;

  let written = 0;
  for (const club of SEED_CLUBS) {
    await prisma.golfClub.upsert({
      where: { workspaceId_naturalKey: { workspaceId, naturalKey: naturalKeyFor(club) } },
      create: buildClubData(workspaceId, club),
      update: {},
    });
    written++;
  }
  return written;
}

function buildClubData(workspaceId: string, club: GolfClubInput): Prisma.GolfClubUncheckedCreateInput {
  return {
    workspaceId,
    manufacturer: club.manufacturer,
    category: club.category,
    modelName: club.modelName,
    modelFamily: club.modelFamily ?? null,
    modelYear: club.modelYear ?? null,
    status: club.status ?? "active",
    naturalKey: naturalKeyFor(club),
    aliases: club.aliases ?? [],
    imageUrls: club.imageUrls ?? [],
    specs: (club.specs ?? {}) as Prisma.InputJsonValue,
    variants: (club.variants ?? []) as unknown as Prisma.InputJsonValue,
  };
}

export interface GolfClubFilters {
  manufacturer?: string;
  category?: string;
  year?: number;
  q?: string;
}

export async function listGolfClubs(
  workspaceId: string,
  filters: GolfClubFilters = {},
): Promise<GolfClubDTO[]> {
  const where: Prisma.GolfClubWhereInput = { workspaceId };
  if (filters.manufacturer) where.manufacturer = { equals: filters.manufacturer, mode: "insensitive" };
  if (filters.category) where.category = { equals: filters.category, mode: "insensitive" };
  if (typeof filters.year === "number") where.modelYear = filters.year;
  if (filters.q) {
    where.OR = [
      { modelName: { contains: filters.q, mode: "insensitive" } },
      { modelFamily: { contains: filters.q, mode: "insensitive" } },
      { manufacturer: { contains: filters.q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.golfClub.findMany({
    where,
    orderBy: [{ manufacturer: "asc" }, { category: "asc" }, { modelName: "asc" }],
  });

  return rows.map((r) => ({
    id: r.id,
    manufacturer: r.manufacturer,
    category: r.category,
    modelName: r.modelName,
    modelFamily: r.modelFamily,
    modelYear: r.modelYear,
    status: r.status,
    naturalKey: r.naturalKey,
    aliases: r.aliases,
    imageUrls: r.imageUrls,
    specifications: (r.specs as Record<string, unknown>) ?? {},
    variants: (r.variants as unknown as GolfClubVariant[]) ?? [],
  }));
}

// ── exporters (mirror the gitwork-golf-data repo's CSV / OpenAPI outputs) ───────

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Flat CSV — one row per model (matches the repo's example equipment columns). */
export function clubsToCsv(rows: GolfClubDTO[]): string {
  const header = [
    "manufacturer",
    "category",
    "model_name",
    "model_family",
    "model_year",
    "status",
    "aliases",
    "variants",
    "specifications",
    "image_urls",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const specs = Object.entries(r.specifications)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    const variants = r.variants
      .map((v) => [v.name, v.loft, v.flex, v.handedness].filter(Boolean).join(" "))
      .join(" | ");
    lines.push(
      [
        r.manufacturer,
        r.category,
        r.modelName,
        r.modelFamily ?? "",
        r.modelYear != null ? String(r.modelYear) : "",
        r.status,
        r.aliases.join(" | "),
        variants,
        specs,
        r.imageUrls.join(" | "),
      ]
        .map((c) => csvCell(c))
        .join(","),
    );
  }
  return lines.join("\n");
}

/** Minimal OpenAPI 3.1 spec for the clubs export — hand to devs as the contract. */
export function buildClubsOpenApi(baseUrl: string): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "Gitwork Golf Data — Clubs API",
      version: "1.0.0",
      description:
        "Canonical golf equipment (clubs) dataset. All requests require an `Authorization: Bearer <API_KEY>` header.",
    },
    servers: [{ url: baseUrl }],
    paths: {
      "/api/golf/clubs": {
        get: {
          summary: "List golf clubs",
          parameters: [
            { name: "manufacturer", in: "query", schema: { type: "string" }, description: "Filter by manufacturer (exact, case-insensitive)." },
            { name: "category", in: "query", schema: { type: "string" }, description: "Driver · Fairway Wood · Hybrid · Iron Set · Wedge · Putter." },
            { name: "year", in: "query", schema: { type: "integer" }, description: "Filter by model year." },
            { name: "q", in: "query", schema: { type: "string" }, description: "Search model / family / manufacturer." },
            { name: "format", in: "query", schema: { type: "string", enum: ["json", "csv"] }, description: "Response format (default json)." },
          ],
          responses: {
            "200": {
              description: "Clubs dataset",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ClubList" },
                },
                "text/csv": { schema: { type: "string" } },
              },
            },
            "401": { description: "Missing or invalid API key" },
          },
        },
      },
      "/api/golf/clubs/openapi": {
        get: { summary: "This OpenAPI document", responses: { "200": { description: "OpenAPI spec" } } },
      },
    },
    components: {
      schemas: {
        Variant: {
          type: "object",
          properties: {
            name: { type: "string" },
            loft: { type: "string", nullable: true },
            flex: { type: "string", nullable: true },
            handedness: { type: "string", nullable: true },
            sku: { type: "string", nullable: true },
          },
        },
        Club: {
          type: "object",
          properties: {
            id: { type: "string" },
            manufacturer: { type: "string" },
            category: { type: "string" },
            modelName: { type: "string" },
            modelFamily: { type: "string", nullable: true },
            modelYear: { type: "integer", nullable: true },
            status: { type: "string" },
            naturalKey: { type: "string" },
            aliases: { type: "array", items: { type: "string" } },
            imageUrls: { type: "array", items: { type: "string" } },
            specifications: { type: "object", additionalProperties: true },
            variants: { type: "array", items: { $ref: "#/components/schemas/Variant" } },
          },
        },
        ClubList: {
          type: "object",
          properties: {
            count: { type: "integer" },
            clubs: { type: "array", items: { $ref: "#/components/schemas/Club" } },
          },
        },
      },
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
    },
    security: [{ bearerAuth: [] }],
  };
}

/** Count of clubs for a workspace (used by the Golf Data console's Equipment domain). */
export async function countGolfClubs(workspaceId: string): Promise<{
  total: number;
  byCategory: Record<string, number>;
  manufacturers: number;
}> {
  const rows = await prisma.golfClub.findMany({
    where: { workspaceId },
    select: { category: true, manufacturer: true },
  });
  const byCategory: Record<string, number> = {};
  const mfrs = new Set<string>();
  for (const r of rows) {
    byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
    mfrs.add(r.manufacturer);
  }
  return { total: rows.length, byCategory, manufacturers: mfrs.size };
}
