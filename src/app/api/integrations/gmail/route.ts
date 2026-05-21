import { google } from "googleapis";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { workspace } = await ensureBaseRecords();

    if (!workspace.googleServiceAccountJson || !workspace.googleSubjectEmail) {
      return apiOk({ connected: false, messages: [] });
    }

    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(workspace.googleServiceAccountJson) as Record<string, unknown>;
    } catch {
      return apiError("Invalid Google service account JSON", 422);
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    });

    const authClient = await auth.getClient();
    // Domain-wide delegation: impersonate the subject email
    if ("subject" in authClient) {
      (authClient as { subject?: string }).subject = workspace.googleSubjectEmail;
    }

    const gmail = google.gmail({ version: "v1", auth: authClient as Parameters<typeof google.gmail>[0]["auth"] });

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
