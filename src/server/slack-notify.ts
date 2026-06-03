/**
 * Slack notification fan-out (P5.20).
 *
 * Single entry point: `notifyDocumentEvent({...})`. Looks up every enabled
 * `SlackWebhookSubscription` for the workspace whose `eventKinds` array contains the event,
 * then POSTs a Block Kit-formatted message to each webhook URL.
 *
 * Failures are swallowed and logged — Slack being down should never block a document event.
 * The whole fan-out runs in `Promise.allSettled` so one bad webhook can't poison the others.
 *
 * Call this from the existing event-emission points (documentView.create, signatureEvent.create,
 * documentComment.create, the SEND transition in signatures.ts). Pass `await: false` (default)
 * to fire-and-forget so the originating request returns immediately.
 */

import { prisma } from "@/lib/prisma";

export type DocumentEventKindLiteral =
  | "DOC_SHARED"
  | "DOC_VIEWED"
  | "DOC_FIRST_VIEWED"
  | "DOC_SENT"
  | "DOC_SIGNED"
  | "DOC_COMPLETED"
  | "DOC_ACCEPTED"
  | "DOC_DECLINED"
  | "COMMENT_ADDED";

interface NotifyInput {
  workspaceId: string;
  documentId: string;
  kind: DocumentEventKindLiteral;
  /** Document title — used in the headline. */
  documentTitle: string;
  /** Doc-type label ("Proposal", "SLA"…) — used in the eyebrow. */
  documentType?: string;
  /** Optional human-readable detail line ("Jane Smith signed", "Acme viewed from London"). */
  detail?: string;
  /** Optional URL to the resource — overrides the default app deep link. */
  url?: string;
  /** Block until all webhooks have responded. Default: false (fire-and-forget). */
  await?: boolean;
}

const EVENT_LABEL: Record<DocumentEventKindLiteral, { eyebrow: string; emoji: string }> = {
  DOC_SHARED:       { eyebrow: "Share link minted",      emoji: ":link:" },
  DOC_VIEWED:       { eyebrow: "Viewed",                 emoji: ":eyes:" },
  DOC_FIRST_VIEWED: { eyebrow: "Opened for the first time", emoji: ":tada:" },
  DOC_SENT:         { eyebrow: "Sent for signature",     emoji: ":envelope_with_arrow:" },
  DOC_SIGNED:       { eyebrow: "Signed",                 emoji: ":lower_left_fountain_pen:" },
  DOC_COMPLETED:    { eyebrow: "Fully signed",           emoji: ":white_check_mark:" },
  DOC_ACCEPTED:     { eyebrow: "Accepted by client",     emoji: ":tada:" },
  DOC_DECLINED:     { eyebrow: "Declined",               emoji: ":x:" },
  COMMENT_ADDED:    { eyebrow: "New comment",            emoji: ":speech_balloon:" },
};

/**
 * Build the Slack Block Kit payload. Returns the JSON body for the POST. We keep it Block Kit
 * (not legacy `text:`) so the recipient gets a richer card by default; webhook URLs that don't
 * support blocks fall back to the `text` field automatically.
 */
function buildPayload(input: NotifyInput): unknown {
  const label = EVENT_LABEL[input.kind];
  const fallbackText = `${label.eyebrow}: ${input.documentTitle}${input.detail ? ` — ${input.detail}` : ""}`;
  const docTypeLine = input.documentType ? `*${input.documentType}*  ·  ` : "";

  return {
    text: fallbackText,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${label.emoji}  ${docTypeLine}${label.eyebrow}\n*${input.documentTitle}*${input.detail ? `\n${input.detail}` : ""}`,
        },
        accessory: input.url
          ? {
              type: "button",
              text: { type: "plain_text", text: "Open" },
              url: input.url,
            }
          : undefined,
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Docs by Gitwork  ·  <${input.url ?? "https://foundry.gitwork.co.uk/app/docs"}|view document>`,
          },
        ],
      },
    ],
  };
}

async function postToWebhook(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // We don't throw — caller is fire-and-forget. Just leave a breadcrumb.
    console.warn("[slack-notify] webhook %s responded %d", url.slice(0, 60), res.status);
  }
}

function shouldNotify(eventKinds: unknown, kind: DocumentEventKindLiteral): boolean {
  if (!Array.isArray(eventKinds)) return false;
  return eventKinds.includes(kind);
}

export async function notifyDocumentEvent(input: NotifyInput): Promise<void> {
  const job = (async () => {
    try {
      const subs = await prisma.slackWebhookSubscription.findMany({
        where: { workspaceId: input.workspaceId, enabled: true },
      });
      const matching = subs.filter((s) => shouldNotify(s.eventKinds, input.kind));
      if (matching.length === 0) return;

      const payload = buildPayload(input);
      await Promise.allSettled(
        matching.map((sub) => postToWebhook(sub.webhookUrl, payload)),
      );
    } catch (err) {
      // Never throw out of the fan-out — Slack issues must not block doc events.
      console.warn("[slack-notify] fan-out failed", (err as Error).message);
    }
  })();

  if (input.await) {
    await job;
  } else {
    // Fire and forget. The job ref keeps it alive past the calling request.
    void job;
  }
}
