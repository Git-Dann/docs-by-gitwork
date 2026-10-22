import { prisma } from "@/lib/prisma";
import { isAtLeast } from "@/types/auth";
import { ACTIVE_MEMBER } from "@/server/auth/member-status";
import nodemailer from "nodemailer";
import { readSmtpPassword } from "@/server/smtp-password";

// Workspace email. Reads the config from the DB on each send — it is small and
// infrequent, so no cache. Two providers, chosen in Settings → Integrations → Email:
// Resend (an API key) and SMTP (any provider, e.g. Google Workspace with an app
// password). Returns { ok: false } on missing config so callers can fire-and-forget;
// callers that care should log the error, because nothing else will.

type SendResult = { ok: true; id: string } | { ok: false; error: string };

export type EmailMessage = {
  workspaceId: string;
  to: string | string[];
  subject: string;
  html: string;
  /** Plain-text fallback. If omitted, Resend renders it from the HTML. */
  text?: string;
  /** Override the default reply-to header. */
  replyTo?: string;
  /** Files to attach. `content` is the raw bytes. */
  attachments?: { filename: string; content: Uint8Array }[];
};

export async function sendWorkspaceEmail(msg: EmailMessage): Promise<SendResult> {
  const ws = await prisma.workspace.findUnique({
    where: { id: msg.workspaceId },
    select: {
      emailProvider: true,
      emailApiKey: true,
      emailFromAddress: true,
      emailFromName: true,
      emailReplyTo: true,
      emailSmtpHost: true,
      emailSmtpPort: true,
      emailSmtpUser: true,
      emailSmtpPassword: true,
    },
  });

  const replyTo = msg.replyTo ?? ws?.emailReplyTo ?? undefined;
  const toList = Array.isArray(msg.to) ? msg.to : [msg.to];

  try {
    // Nothing chosen in Settings: use the server's own SMTP account (SMTP_* in the
    // VPS .env, the Gmail account the e-sign emails already send from). Without this,
    // every workspace email was skipped until someone filled in Settings, silently.
    if (!ws?.emailProvider && !ws?.emailApiKey) {
      const env = envSmtp();
      if (!env) return { ok: false, error: "Email is not configured: set it in Settings → Integrations → Email" };
      return await sendViaSmtp(env, { from: env.from, replyTo, toList, msg });
    }

    if (!ws.emailFromAddress) {
      return { ok: false, error: "Workspace email is not configured: no from address" };
    }
    const from = ws.emailFromName
      ? `${ws.emailFromName} <${ws.emailFromAddress}>`
      : ws.emailFromAddress;

    if (ws.emailProvider === "SMTP") {
      const pass = readSmtpPassword(ws.emailSmtpPassword);
      if (!ws.emailSmtpHost || !ws.emailSmtpUser || !pass) {
        return { ok: false, error: "SMTP is selected but the host, username or password is missing" };
      }
      return await sendViaSmtp(
        { host: ws.emailSmtpHost, port: ws.emailSmtpPort ?? 587, user: ws.emailSmtpUser, pass },
        { from, replyTo, toList, msg },
      );
    }
    if (ws.emailProvider && ws.emailProvider !== "RESEND") {
      return { ok: false, error: `Email provider ${ws.emailProvider} is not supported` };
    }
    if (!ws.emailApiKey) {
      return { ok: false, error: "Workspace email is not configured: no Resend API key" };
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ws.emailApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: toList,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        reply_to: replyTo,
        ...(msg.attachments?.length
          ? { attachments: msg.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64") })) }
          : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = (await res.json()) as { id?: string };
    return { ok: true, id: data.id ?? "" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown email send error",
    };
  }
}

type SmtpServer = { host: string; port: number; user: string; pass: string };

/** The server-level SMTP account from the environment, or null when it is not set. */
export function envSmtp(env: Record<string, string | undefined> = process.env): (SmtpServer & { from: string }) | null {
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASSWORD?.trim();
  if (!user || !pass) return null;
  // SMTP_FROM is written in the .env as "\"Gitwork\" <foundry@…>"; depending on how
  // the file is parsed the escapes can survive, so strip them rather than send a
  // from-name with backslashes in it.
  const from = env.SMTP_FROM?.replace(/\\/g, "").trim() || user;
  return { host: env.SMTP_HOST?.trim() || "smtp.gmail.com", port: Number(env.SMTP_PORT) || 587, user, pass, from };
}

async function sendViaSmtp(
  server: SmtpServer,
  { from, replyTo, toList, msg }: { from: string; replyTo: string | undefined; toList: string[]; msg: EmailMessage },
): Promise<SendResult> {
  const { host, port, user, pass } = server;
  const transport = nodemailer.createTransport({
    host,
    port,
    // 465 is TLS from the first byte; 587 upgrades with STARTTLS, which nodemailer
    // requires here rather than merely attempting.
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  const info = await transport.sendMail({
    from,
    to: toList,
    replyTo,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    attachments: msg.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content) })),
  });
  return { ok: true, id: info.messageId ?? "" };
}

// Resolve the list of backstage-approver emails (Admins + anyone with
// backstage.approve). Used when notifying about new leave/expense requests.
export async function listBackstageApproverEmails(
  workspaceId: string,
  excludeUserId?: string,
): Promise<string[]> {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, ...ACTIVE_MEMBER },
    include: { user: { select: { id: true, email: true } } },
  });
  return members
    .filter((m) => {
      if (excludeUserId && m.user.id === excludeUserId) return false;
      if (isAtLeast(m.role, "ADMIN")) return true;
      const perms = Array.isArray(m.permissions) ? (m.permissions as string[]) : [];
      return perms.includes("backstage.approve");
    })
    .map((m) => m.user.email);
}

// Small escape helper for substituting user-supplied content into HTML bodies.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
