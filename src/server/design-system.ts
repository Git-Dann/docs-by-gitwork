// Per-client design system — store + render + public share.
//
// Foundry is render-only: the Cowork `design-system` skill produces the DesignTokens
// JSON (and the standalone HTML preview). This module persists that JSON on
// ClientDesignSystem, serves it to the Portal viewer, and powers the public,
// no-auth /brand/[token] share (mirrors the timeline share in client-timeline.ts).

import { randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { type EffectiveUser, ForbiddenError } from "@/server/auth/effective-user";
import { assertClientInScope } from "@/server/tasks";
import { designTokensSchema } from "@/server/validators";
import type {
  DesignTokens,
  DesignSystemDTO,
  DesignSystemShareInfo,
  DesignSystemStatus,
  PublicDesignSystemDTO,
} from "@/types/design-tokens";

function mintToken(): string {
  return randomBytes(18).toString("base64url");
}

function shareInfo(row: { shareToken: string | null; shareEnabled: boolean }): DesignSystemShareInfo {
  return {
    enabled: row.shareEnabled && Boolean(row.shareToken),
    token: row.shareToken,
    url: row.shareToken ? `/brand/${row.shareToken}` : null,
  };
}

type RowWithUser = {
  tokens: Prisma.JsonValue | null;
  enabled: boolean | null;
  showFoundryBranding: boolean;
  guidelinesEnabled: boolean;
  status: DesignSystemStatus;
  updatedAt: Date;
  shareToken: string | null;
  shareEnabled: boolean;
  updatedBy: { name: string | null; email: string } | null;
};

function toDTO(row: RowWithUser): DesignSystemDTO {
  const hasTokens = Boolean(row.tokens);
  return {
    exists: hasTokens,
    // null = unset → default to visible when tokens exist; true/false is an explicit override.
    enabled: row.enabled ?? hasTokens,
    showFoundryBranding: row.showFoundryBranding,
    guidelinesEnabled: row.guidelinesEnabled,
    tokens: hasTokens ? (row.tokens as unknown as DesignTokens) : null,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy?.name ?? row.updatedBy?.email ?? null,
    share: shareInfo(row),
  };
}

const EMPTY_DTO: DesignSystemDTO = {
  exists: false,
  enabled: false,
  showFoundryBranding: true,
  guidelinesEnabled: false,
  tokens: null,
  status: "DRAFT",
  updatedAt: null,
  updatedBy: null,
  share: { enabled: false, token: null, url: null },
};

export async function getClientDesignSystem(
  user: EffectiveUser,
  clientId: string,
): Promise<DesignSystemDTO> {
  await assertClientInScope(user, clientId);
  const row = await prisma.clientDesignSystem.findUnique({
    where: { clientId },
    include: { updatedBy: { select: { name: true, email: true } } },
  });
  return row ? toDTO(row) : EMPTY_DTO;
}

export async function saveClientDesignSystem(
  user: EffectiveUser,
  clientId: string,
  input: { tokens: DesignTokens; status?: DesignSystemStatus },
): Promise<DesignSystemDTO> {
  await assertClientInScope(user, clientId);

  // Validate + normalise (fills schema defaults). Throws ZodError → 400 via fromError.
  const tokens = designTokensSchema.parse(input.tokens) as DesignTokens;
  // The skill normally supplies cssVariables; regenerate a fallback when it didn't.
  if (!tokens.cssVariables || !tokens.cssVariables.trim()) {
    tokens.cssVariables = buildCssVariables(tokens);
  }
  const status: DesignSystemStatus = input.status ?? "ACTIVE";

  const data = {
    tokens: tokens as unknown as Prisma.InputJsonValue,
    status,
    updatedById: user.id,
  };
  const row = await prisma.clientDesignSystem.upsert({
    where: { clientId },
    create: { clientId, ...data },
    update: data,
    include: { updatedBy: { select: { name: true, email: true } } },
  });
  return toDTO(row);
}

export async function setDesignSystemShare(
  user: EffectiveUser,
  clientId: string,
  enabled: boolean,
): Promise<DesignSystemShareInfo> {
  await assertClientInScope(user, clientId);
  const existing = await prisma.clientDesignSystem.findUnique({
    where: { clientId },
    select: { shareToken: true },
  });
  if (!existing) throw new ForbiddenError("Import a design system before sharing it.");

  // Mint a token on first enable; keep it across toggles so the URL stays stable.
  const nextToken = existing.shareToken ?? (enabled ? mintToken() : null);
  const updated = await prisma.clientDesignSystem.update({
    where: { clientId },
    data: { shareEnabled: enabled, shareToken: nextToken },
    select: { shareToken: true, shareEnabled: true },
  });
  return shareInfo(updated);
}

/** Toggle the per-client page on/off (Edit client). Creates the row (no tokens) if needed. */
export async function setDesignSystemEnabled(
  user: EffectiveUser,
  clientId: string,
  enabled: boolean,
): Promise<DesignSystemDTO> {
  await assertClientInScope(user, clientId);
  const row = await prisma.clientDesignSystem.upsert({
    where: { clientId },
    create: { clientId, enabled },
    update: { enabled },
    include: { updatedBy: { select: { name: true, email: true } } },
  });
  return toDTO(row);
}

/** Toggle Foundry masthead/footer branding on the guidelines (Edit client). */
export async function setDesignSystemFoundryBranding(
  user: EffectiveUser,
  clientId: string,
  enabled: boolean,
): Promise<DesignSystemDTO> {
  await assertClientInScope(user, clientId);
  const row = await prisma.clientDesignSystem.upsert({
    where: { clientId },
    create: { clientId, showFoundryBranding: enabled },
    update: { showFoundryBranding: enabled },
    include: { updatedBy: { select: { name: true, email: true } } },
  });
  return toDTO(row);
}

/** Opt in / out of the client-branded Brand Guidelines deck (+ tab + PDF). */
export async function setDesignSystemGuidelinesEnabled(
  user: EffectiveUser,
  clientId: string,
  enabled: boolean,
): Promise<DesignSystemDTO> {
  await assertClientInScope(user, clientId);
  const row = await prisma.clientDesignSystem.upsert({
    where: { clientId },
    create: { clientId, guidelinesEnabled: enabled },
    update: { guidelinesEnabled: enabled },
    include: { updatedBy: { select: { name: true, email: true } } },
  });
  return toDTO(row);
}

/** Public read — no auth. Returns null when the token is unknown, sharing is off, or no tokens. */
export async function getPublicDesignSystem(token: string): Promise<PublicDesignSystemDTO | null> {
  const row = await prisma.clientDesignSystem.findFirst({
    where: { shareToken: token, shareEnabled: true },
    include: { client: { select: { name: true, logoUrl: true } } },
  });
  if (!row || !row.tokens) return null;
  const tokens = row.tokens as unknown as DesignTokens;
  return {
    clientName: tokens?.clientName || row.client.name,
    tokens,
    generatedAt: row.updatedAt.toISOString(),
    logoUrl: row.client.logoUrl ?? null,
    showFoundryBranding: row.showFoundryBranding,
    guidelinesEnabled: row.guidelinesEnabled,
  };
}

/**
 * Fallback `:root {}` generator — used only when the skill's JSON omits
 * `cssVariables`. Emits colour/spacing/radius/shadow/font custom properties.
 */
export function buildCssVariables(tokens: DesignTokens): string {
  const slugify = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const lines: string[] = [":root {"];
  const push = (k: string, v: string) => lines.push(`  ${k}: ${v};`);

  [
    ...tokens.colours.primary,
    ...tokens.colours.secondary,
    ...tokens.colours.neutrals,
  ].forEach((c) => {
    const slug = slugify(c.name);
    if (slug) push(`--color-${slug}`, c.hex);
  });
  Object.entries(tokens.spacing.scale).forEach(([k, v]) => push(`--space-${k}`, v));
  Object.entries(tokens.radius).forEach(([k, v]) => push(`--radius-${k}`, v));
  tokens.shadows.forEach((s) => {
    const slug = slugify(s.name);
    if (slug) push(`--shadow-${slug}`, s.css);
  });
  push("--font-display", tokens.typography.displayFont);
  push("--font-body", tokens.typography.bodyFont);
  if (tokens.typography.monoFont) push("--font-mono", tokens.typography.monoFont);
  lines.push("}");
  return lines.join("\n");
}
