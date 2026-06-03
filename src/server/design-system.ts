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
  tokens: Prisma.JsonValue;
  status: DesignSystemStatus;
  updatedAt: Date;
  shareToken: string | null;
  shareEnabled: boolean;
  updatedBy: { name: string | null; email: string } | null;
};

function toDTO(row: RowWithUser): DesignSystemDTO {
  return {
    exists: true,
    tokens: row.tokens as unknown as DesignTokens,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy?.name ?? row.updatedBy?.email ?? null,
    share: shareInfo(row),
  };
}

const EMPTY_DTO: DesignSystemDTO = {
  exists: false,
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

/** Public read — no auth. Returns null when the token is unknown or sharing is off. */
export async function getPublicDesignSystem(token: string): Promise<PublicDesignSystemDTO | null> {
  const row = await prisma.clientDesignSystem.findFirst({
    where: { shareToken: token, shareEnabled: true },
    include: { client: { select: { name: true } } },
  });
  if (!row) return null;
  const tokens = row.tokens as unknown as DesignTokens;
  return {
    clientName: tokens?.clientName || row.client.name,
    tokens,
    generatedAt: row.updatedAt.toISOString(),
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
