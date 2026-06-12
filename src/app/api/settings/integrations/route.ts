import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { decryptNullable, encryptNullable } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { recordAuditEntry } from "@/server/audit-log";
import { authTest, getSlackBotToken } from "@/server/slack/client";

export const dynamic = "force-dynamic";

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 7)}${"•".repeat(Math.min(16, key.length - 11))}${key.slice(-4)}`;
}

export async function GET() {
  try {
    // Look up the signed-in user's per-user Google connection too — Calendar/Gmail widgets
    // run off this token, not the workspace one.
    const session = await auth();
    const currentUser = session?.user?.id
      ? await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { googleOAuthRefreshToken: true, googleOAuthEmail: true },
        })
      : null;

    const workspace = await prisma.workspace.findFirst({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
      select: {
        aiProvider: true,
        anthropicApiKey: true,
        anthropicModel: true,
        openaiApiKey: true,
        openaiModel: true,
        geminiApiKey: true,
        geminiModel: true,
        localLlmUrl: true,
        localLlmModel: true,
        externalApiKey: true,
        googleServiceAccountJson: true,
        googleSubjectEmail: true,
        googleCalendarId: true,
        googleOAuthRefreshToken: true,
        slackBotToken: true,
        slackBotTokenEncrypted: true,
        slackSigningSecretEncrypted: true,
        slackAppId: true,
        slackTeamId: true,
        slackTeamName: true,
        slackBotUserId: true,
        lastSlackPostAt: true,
        slackSummaryChannelId: true,
        slackChannels: true,
        channelRoutes: true,
        emailProvider: true,
        emailFromAddress: true,
        emailFromName: true,
        emailReplyTo: true,
        emailApiKey: true,
        emailSmtpHost: true,
        emailSmtpPort: true,
        emailSmtpUser: true,
        emailSmtpPassword: true,
      },
    });

    const anthropicKey = process.env.ANTHROPIC_API_KEY ?? workspace?.anthropicApiKey ?? null;
    const openaiKey = process.env.OPENAI_API_KEY ?? workspace?.openaiApiKey ?? null;
    const geminiKey = process.env.GEMINI_API_KEY ?? workspace?.geminiApiKey ?? null;
    const externalKey = process.env.API_KEY ?? workspace?.externalApiKey ?? null;

    return apiOk({
      aiProvider: workspace?.aiProvider ?? "ANTHROPIC",
      anthropicKeyMasked: anthropicKey ? maskKey(anthropicKey) : null,
      anthropicKeySource: process.env.ANTHROPIC_API_KEY ? "env" : workspace?.anthropicApiKey ? "database" : null,
      anthropicModel: workspace?.anthropicModel ?? "claude-sonnet-4-6",
      openaiKeyMasked: openaiKey ? maskKey(openaiKey) : null,
      openaiKeySource: process.env.OPENAI_API_KEY ? "env" : workspace?.openaiApiKey ? "database" : null,
      openaiModel: workspace?.openaiModel ?? "gpt-4o",
      geminiKeyMasked: geminiKey ? maskKey(geminiKey) : null,
      geminiKeySource: process.env.GEMINI_API_KEY ? "env" : workspace?.geminiApiKey ? "database" : null,
      geminiModel: workspace?.geminiModel ?? "gemini-2.0-flash",
      localLlmUrl: workspace?.localLlmUrl ?? "",
      localLlmModel: workspace?.localLlmModel ?? "llama3.1",
      externalApiKeyMasked: externalKey ? maskKey(externalKey) : null,
      externalApiKeySource: process.env.API_KEY ? "env" : workspace?.externalApiKey ? "database" : null,
      googleServiceAccountJsonSet: Boolean(workspace?.googleServiceAccountJson),
      googleSubjectEmail: workspace?.googleSubjectEmail ?? null,
      googleCalendarId: workspace?.googleCalendarId ?? null,
      // `googleOAuthConnected` now reflects the *current user's* per-user connection — that's
      // what drives the dashboard Calendar + Gmail widgets and the meeting-summary email
      // context. The workspace token still exists for shared cron sync and is reported
      // separately as `workspaceGoogleOAuthConnected` for the admin shared-sync UI.
      googleOAuthConnected: Boolean(currentUser?.googleOAuthRefreshToken),
      googleOAuthConnectedAs: currentUser?.googleOAuthEmail ?? null,
      workspaceGoogleOAuthConnected: Boolean(workspace?.googleOAuthRefreshToken),
      slackBotTokenMasked: (() => {
        const tok = getSlackBotToken(workspace ?? null);
        return tok ? maskKey(tok) : null;
      })(),
      slackSigningSecretSet: Boolean(workspace?.slackSigningSecretEncrypted),
      slackAppId: workspace?.slackAppId ?? null,
      slackTeamId: workspace?.slackTeamId ?? null,
      slackTeamName: workspace?.slackTeamName ?? null,
      slackBotUserId: workspace?.slackBotUserId ?? null,
      lastSlackPostAt: workspace?.lastSlackPostAt?.toISOString() ?? null,
      slackSummaryChannelId: workspace?.slackSummaryChannelId ?? null,
      slackChannels: workspace?.slackChannels ?? [],
      channelRoutes: workspace?.channelRoutes ?? {},
      emailProvider: workspace?.emailProvider ?? null,
      emailFromAddress: workspace?.emailFromAddress ?? null,
      emailFromName: workspace?.emailFromName ?? null,
      emailReplyTo: workspace?.emailReplyTo ?? null,
      emailApiKeyMasked: workspace?.emailApiKey ? maskKey(workspace.emailApiKey) : null,
      emailSmtpHost: workspace?.emailSmtpHost ?? null,
      emailSmtpPort: workspace?.emailSmtpPort ?? null,
      emailSmtpUser: workspace?.emailSmtpUser ?? null,
      emailSmtpPasswordSet: Boolean(workspace?.emailSmtpPassword),
    });
  } catch (error) {
    return fromError(error);
  }
}

const updateSchema = z.object({
  aiProvider: z.enum(["ANTHROPIC", "OPENAI", "GEMINI", "LOCAL"]).optional(),
  anthropicApiKey: z.string().trim().optional(),
  anthropicModel: z.string().trim().optional(),
  openaiApiKey: z.string().trim().optional(),
  openaiModel: z.string().trim().optional(),
  geminiApiKey: z.string().trim().optional(),
  geminiModel: z.string().trim().optional(),
  localLlmUrl: z.string().trim().optional(),
  localLlmModel: z.string().trim().optional(),
  externalApiKey: z.string().trim().optional(),
  googleServiceAccountJson: z.string().trim().optional(),
  googleSubjectEmail: z.string().trim().optional(),
  googleCalendarId: z.string().trim().optional(),
  slackBotToken: z.string().trim().optional(),
  slackSigningSecret: z.string().trim().optional(),
  slackAppId: z.string().trim().optional(),
  /** When true, run `auth.test` against the (newly) pasted bot token and persist
   * the team / user fields it returns. Surfaces Slack's `error` field verbatim. */
  slackVerify: z.boolean().optional(),
  /** When true, clear every Slack credential (encrypted + plaintext + signing
   * secret + team/user metadata + cached channels). Used by the Disconnect button. */
  slackDisconnect: z.boolean().optional(),
  slackSummaryChannelId: z.string().trim().optional(),
  slackChannels: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  channelRoutes: z.record(z.string(), z.string()).optional(),
  emailProvider: z.enum(["RESEND", "SMTP"]).nullable().optional(),
  emailApiKey: z.string().trim().optional(),
  emailFromAddress: z.string().trim().optional(),
  emailFromName: z.string().trim().optional(),
  emailReplyTo: z.string().trim().optional(),
  emailSmtpHost: z.string().trim().optional(),
  emailSmtpPort: z.number().int().min(1).max(65535).optional(),
  emailSmtpUser: z.string().trim().optional(),
  emailSmtpPassword: z.string().trim().optional(),
});

export async function PUT(request: NextRequest) {
  try {
    const body = updateSchema.parse(await request.json());

    // Build update payload with explicit Prisma-typed fields only
    const data: Parameters<typeof prisma.workspace.updateMany>[0]["data"] = {};
    if (body.aiProvider) data.aiProvider = body.aiProvider;
    if (body.anthropicApiKey) data.anthropicApiKey = body.anthropicApiKey;
    if (body.anthropicModel) data.anthropicModel = body.anthropicModel;
    if (body.openaiApiKey) data.openaiApiKey = body.openaiApiKey;
    if (body.openaiModel) data.openaiModel = body.openaiModel;
    if (body.geminiApiKey) data.geminiApiKey = body.geminiApiKey;
    if (body.geminiModel) data.geminiModel = body.geminiModel;
    if (body.localLlmUrl) data.localLlmUrl = body.localLlmUrl;
    if (body.localLlmModel) data.localLlmModel = body.localLlmModel;
    if (body.externalApiKey) data.externalApiKey = body.externalApiKey;
    if (body.googleServiceAccountJson) data.googleServiceAccountJson = body.googleServiceAccountJson;
    if (body.googleSubjectEmail) data.googleSubjectEmail = body.googleSubjectEmail;
    if (body.googleCalendarId) data.googleCalendarId = body.googleCalendarId;
    // Slack credentials: encrypt on write, mirror to the legacy plaintext column
    // for one release so old code paths still resolve a token. The plaintext
    // column gets dropped in Phase 4 once everything reads via getSlackBotToken().
    if (body.slackBotToken) {
      data.slackBotToken = body.slackBotToken;
      data.slackBotTokenEncrypted = encryptNullable(body.slackBotToken);
    }
    if (body.slackSigningSecret) {
      data.slackSigningSecretEncrypted = encryptNullable(body.slackSigningSecret);
    }
    if (body.slackAppId !== undefined) data.slackAppId = body.slackAppId || null;
    if (body.slackDisconnect) {
      data.slackBotToken = null;
      data.slackBotTokenEncrypted = null;
      data.slackSigningSecretEncrypted = null;
      data.slackAppId = null;
      data.slackTeamId = null;
      data.slackTeamName = null;
      data.slackBotUserId = null;
      data.lastSlackPostAt = null;
      data.slackChannels = [];
    }
    if (body.slackSummaryChannelId) data.slackSummaryChannelId = body.slackSummaryChannelId;
    // slackChannels + channelRoutes are Json — Prisma's typed updateInput accepts them directly.
    if (body.slackChannels !== undefined) data.slackChannels = body.slackChannels;
    if (body.channelRoutes !== undefined) data.channelRoutes = body.channelRoutes;
    if (body.emailProvider !== undefined) data.emailProvider = body.emailProvider;
    if (body.emailApiKey) data.emailApiKey = body.emailApiKey;
    if (body.emailFromAddress) data.emailFromAddress = body.emailFromAddress;
    if (body.emailFromName) data.emailFromName = body.emailFromName;
    if (body.emailReplyTo) data.emailReplyTo = body.emailReplyTo;
    if (body.emailSmtpHost) data.emailSmtpHost = body.emailSmtpHost;
    if (body.emailSmtpPort !== undefined) data.emailSmtpPort = body.emailSmtpPort;
    if (body.emailSmtpUser) data.emailSmtpUser = body.emailSmtpUser;
    if (body.emailSmtpPassword) data.emailSmtpPassword = body.emailSmtpPassword;

    // Verify-and-stamp pass. When the operator clicks "Save & verify" we run
    // auth.test against the token they just pasted (or the existing one) and,
    // on success, persist the returned team / bot identifiers. On failure we
    // refuse to persist any of the new credentials and return Slack's verbatim
    // error so the operator can act on it.
    if (body.slackVerify) {
      let tokenForVerify = body.slackBotToken?.trim();
      if (!tokenForVerify) {
        const ws = await prisma.workspace.findFirst({
          where: { slug: DEFAULT_WORKSPACE_SLUG },
          select: { slackBotToken: true, slackBotTokenEncrypted: true },
        });
        tokenForVerify = getSlackBotToken(ws) ?? undefined;
      }
      if (!tokenForVerify) {
        return apiError("No Slack bot token to verify — paste one first.", 400);
      }
      const result = await authTest(tokenForVerify);
      if (!result.ok) {
        return apiError(`Slack auth.test failed: ${result.error ?? "unknown_error"}`, 400);
      }
      if (result.data.team_id) data.slackTeamId = result.data.team_id;
      if (result.data.team) data.slackTeamName = result.data.team;
      if (result.data.user_id) data.slackBotUserId = result.data.user_id;
    }

    if (Object.keys(data).length === 0) return apiOk({ saved: false });

    // Read current values for audit before/after — only for keys that we actually log.
    const before = await prisma.workspace.findFirst({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
      select: {
        id: true,
        aiProvider: true,
        anthropicApiKey: true,
        openaiApiKey: true,
        geminiApiKey: true,
        externalApiKey: true,
        googleSubjectEmail: true,
        slackBotToken: true,
      },
    });

    await prisma.workspace.updateMany({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
      data,
    });

    if (before) {
      const session = await auth();
      const actorId = session?.user?.id ?? null;

      // Track meaningful changes for the audit log. We never store key values themselves —
      // just the fact that something changed.
      if (body.aiProvider && body.aiProvider !== before.aiProvider) {
        await recordAuditEntry({
          workspaceId: before.id,
          actorId,
          action: "settings.ai_provider.changed",
          target: "workspace.aiProvider",
          before: before.aiProvider,
          after: body.aiProvider,
        });
      }
      if (body.anthropicApiKey && body.anthropicApiKey !== before.anthropicApiKey) {
        await recordAuditEntry({
          workspaceId: before.id,
          actorId,
          action: "settings.ai_key.rotated",
          target: "workspace.anthropicApiKey",
        });
      }
      if (body.openaiApiKey && body.openaiApiKey !== before.openaiApiKey) {
        await recordAuditEntry({
          workspaceId: before.id,
          actorId,
          action: "settings.ai_key.rotated",
          target: "workspace.openaiApiKey",
        });
      }
      if (body.geminiApiKey && body.geminiApiKey !== before.geminiApiKey) {
        await recordAuditEntry({
          workspaceId: before.id,
          actorId,
          action: "settings.ai_key.rotated",
          target: "workspace.geminiApiKey",
        });
      }
      if (body.externalApiKey && body.externalApiKey !== before.externalApiKey) {
        await recordAuditEntry({
          workspaceId: before.id,
          actorId,
          action: "settings.external_key.rotated",
          target: "workspace.externalApiKey",
        });
      }
      if (body.googleSubjectEmail && body.googleSubjectEmail !== before.googleSubjectEmail) {
        await recordAuditEntry({
          workspaceId: before.id,
          actorId,
          action: "integration.google.connected",
          target: "workspace.googleSubjectEmail",
          after: body.googleSubjectEmail,
        });
      }
      if (body.slackBotToken && body.slackBotToken !== before.slackBotToken) {
        await recordAuditEntry({
          workspaceId: before.id,
          actorId,
          action: "integration.slack.connected",
          target: "workspace.slackBotToken",
        });
      }
    }

    return apiOk({ saved: true });
  } catch (error) {
    return fromError(error);
  }
}
