// GET /api/backstage/mail/inbox?q=
// The signed-in person's own Gmail inbox (unread, primary, this week by default), for Foundry
// for Mac's Foundry view. Accepts the mobile JWT as well as a session; the older
// /api/integrations/gmail is session-only. Read-only: headers and Gmail's snippet, never bodies,
// and nothing is stored.
import { google } from "googleapis";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { dateIso, gmailThreadLink, parseFrom, safeQuery, type InboxMessage } from "@/lib/mail-inbox";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { googleClientForRefreshToken } from "@/server/google-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    // Private: never shown to someone "viewing as" this person.
    const viewingAs = req.headers.get("x-view-as-user");
    if (viewingAs && viewingAs === user.id) {
      return apiError("Mail is private, so it isn't shown while viewing as someone.", 403);
    }

    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { googleOAuthRefreshToken: true, googleOAuthEmail: true },
    });
    if (!row?.googleOAuthRefreshToken) {
      return apiOk({ connected: false, reason: "Google isn't connected for you. Sign out of Foundry on the web and back in.", messages: [] });
    }
    const auth = googleClientForRefreshToken(row.googleOAuthRefreshToken);
    if (!auth) return apiOk({ connected: false, reason: "Google sign-in isn't configured on this server.", messages: [] });

    try {
      const gmail = google.gmail({ version: "v1", auth });
      const list = await gmail.users.messages.list({
        userId: "me",
        maxResults: 15,
        q: safeQuery(new URL(req.url).searchParams.get("q")),
      });
      const ids = (list.data.messages ?? []).map((m) => m.id).filter((id): id is string => !!id);
      const details = await Promise.all(
        ids.map((id) =>
          gmail.users.messages.get({ userId: "me", id, format: "metadata", metadataHeaders: ["From", "Subject", "Date"] }),
        ),
      );
      const messages: InboxMessage[] = details.map((res) => {
        const headers = res.data.payload?.headers ?? [];
        const get = (name: string) => headers.find((h) => h.name === name)?.value ?? "";
        const from = parseFrom(get("From"));
        const threadId = res.data.threadId ?? "";
        return {
          id: res.data.id ?? "",
          threadId,
          fromName: from.name,
          fromEmail: from.email,
          subject: get("Subject") || "(no subject)",
          snippet: res.data.snippet ?? "",
          date: dateIso(get("Date")),
          unread: (res.data.labelIds ?? []).includes("UNREAD"),
          link: gmailThreadLink(threadId, row.googleOAuthEmail),
        };
      });
      return apiOk({ connected: true, connectedAs: row.googleOAuthEmail, messages });
    } catch (err) {
      const message = (err as Error).message ?? "";
      if (/invalid_grant/i.test(message)) {
        return apiOk({ connected: false, reason: "Google sign-in has expired. Sign out of Foundry on the web and back in.", messages: [] });
      }
      if (/insufficient.*scope|PERMISSION_DENIED/i.test(message)) {
        return apiOk({ connected: false, reason: "Foundry doesn't have permission to read your Gmail. Sign out of Foundry on the web and back in.", messages: [] });
      }
      throw err;
    }
  } catch (e) {
    return fromError(e);
  }
}
