import { prisma } from "@/lib/prisma";

// Thin Resend wrapper. Reads workspace email config from the DB on each send —
// configuration is small and infrequent, so no cache. Returns silently on
// missing config so callers can fire-and-forget without burying real errors.

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
    },
  });

  if (!ws?.emailApiKey || !ws.emailFromAddress) {
    return { ok: false, error: "Workspace email is not configured" };
  }
  if (ws.emailProvider && ws.emailProvider !== "RESEND") {
    return { ok: false, error: `Email provider ${ws.emailProvider} not supported yet` };
  }

  const from = ws.emailFromName
    ? `${ws.emailFromName} <${ws.emailFromAddress}>`
    : ws.emailFromAddress;
  const replyTo = msg.replyTo ?? ws.emailReplyTo ?? undefined;
  const toList = Array.isArray(msg.to) ? msg.to : [msg.to];

  try {
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

// Resolve the list of backstage-approver emails (Admins + anyone with
// backstage.approve). Used when notifying about new leave/expense requests.
export async function listBackstageApproverEmails(
  workspaceId: string,
  excludeUserId?: string,
): Promise<string[]> {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, email: true } } },
  });
  return members
    .filter((m) => {
      if (excludeUserId && m.user.id === excludeUserId) return false;
      if (m.role === "ADMIN") return true;
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
