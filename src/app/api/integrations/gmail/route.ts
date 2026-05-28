import { google } from "googleapis";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { workspace } = await ensureBaseRecords();

    let gmailAuth: Parameters<typeof google.gmail>[0]["auth"];

    if (workspace.googleServiceAccountJson && workspace.googleSubjectEmail) {
      // Service account path (enterprise/domain-wide delegation)
      let credentials: Record<string, unknown>;
      try {
        credentials = JSON.parse(workspace.googleServiceAccountJson) as Record<string, unknown>;
      } catch {
        return apiError("Invalid Google service account JSON", 422);
      }

      const serviceAuth = new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      });

      const authClient = await serviceAuth.getClient();
      // Domain-wide delegation: impersonate the subject email
      if ("subject" in authClient) {
        (authClient as { subject?: string }).subject = workspace.googleSubjectEmail;
      }
      gmailAuth = authClient as Parameters<typeof google.gmail>[0]["auth"];
    } else if (workspace.googleOAuthRefreshToken) {
      // OAuth path — powered by the user's Google login (AUTH_GOOGLE_ID/SECRET)
      const clientId = process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return apiOk({ connected: false, messages: [] });
      }

      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
      oauth2Client.setCredentials({ refresh_token: workspace.googleOAuthRefreshToken });
      gmailAuth = oauth2Client;
    } else {
      return apiOk({ connected: false, messages: [] });
    }

    const gmail = google.gmail({ version: "v1", auth: gmailAuth });

    const listRes = await gmail.users.messages.list({
      userId: "me",
      maxResults: 20,
      q: "in:inbox",
    });

    const messageIds = listRes.data.messages ?? [];
    if (messageIds.length === 0) {
      return apiOk({ connected: true, messages: [] });
    }

    const messageDetails = await Promise.all(
      messageIds.map((m) =>
        gmail.users.messages.get({
          userId: "me",
          id: m.id!,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        }),
      ),
    );

    const messages = messageDetails.map((res) => {
      const headers = res.data.payload?.headers ?? [];
      const get = (name: string) => headers.find((h) => h.name === name)?.value ?? "";
      const labelIds = res.data.labelIds ?? [];
      return {
        id: res.data.id ?? "",
        subject: get("Subject") || "(no subject)",
        from: get("From"),
        snippet: res.data.snippet ?? "",
        date: get("Date"),
        unread: labelIds.includes("UNREAD"),
      };
    });

    return apiOk({ connected: true, messages });
  } catch (error) {
    return fromError(error);
  }
}
