import { z } from "zod";
import { apiError, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { openScope } from "@/server/dispatch/assistant/scope";
import { assertAssistantAvailable } from "@/server/dispatch/assistant/access-gate";
import { runTurn } from "@/server/dispatch/assistant/loop";
import { getOwnConversation } from "@/server/dispatch/assistant/store";
import { MAX_ATTACHMENTS, MAX_QUESTION_CHARS } from "@/lib/dispatch/limits";
import { checkAttachments, type CheckedImage } from "@/lib/dispatch/images";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z
  .object({
    question: z.string().min(1).max(MAX_QUESTION_CHARS),
    conversationId: z.string().min(1).max(40).optional(),
    clientSlug: z.string().min(1).max(120).optional(),
    focusTaskId: z.string().min(1).max(40).optional(),
    /** The browser's timezone (Intl), so times are the person's own (§174). Checked again server side. */
    timeZone: z.string().max(64).optional(),
    /** Screenshots, shrunk in the browser; checked again here by their bytes. */
    images: z.array(z.string().max(2_100_000)).max(MAX_ATTACHMENTS).optional(),
  })
  .strict();

/**
 * POST /api/dispatch/chat — ask Dispatch one question. Answers as a stream of server-sent
 * events: `conversation`, `text`, `status`, `action`, `sources`, `notice`, `client` (the chat moved
 * to another of the person's clients, §164), then `done`.
 * The chat is about one client: a new chat names it (`clientSlug`); a follow-up uses the client
 * its conversation already belongs to.
 */
export async function POST(req: Request) {
  let user;
  let scope;
  let body: z.infer<typeof bodySchema>;
  let images: CheckedImage[] = [];
  try {
    user = await requireAuthedUser(req);
    await assertAssistantAvailable(user);
    body = bodySchema.parse(await req.json());
    const checked = checkAttachments(body.images ?? []);
    if (typeof checked === "string") return apiError(checked, 400);
    images = checked;
    let clientId: string | undefined;
    if (body.conversationId) clientId = (await getOwnConversation(user, body.conversationId)).clientId;
    if (!clientId && !body.clientSlug) return apiError("Pick a client first.", 400);
    scope = await openScope(user, clientId ? { id: clientId } : { slug: body.clientSlug }, "web");
  } catch (err) {
    return fromError(err);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        await runTurn({
          scope: scope!,
          question: body.question,
          conversationId: body.conversationId,
          focusTaskId: body.focusTaskId,
          timeZone: body.timeZone,
          images,
          emit: {
            conversation: (id) => send("conversation", { id }),
            text: (delta) => send("text", { delta }),
            status: (text) => send("status", { text }),
            action: (card) => send("action", card),
            sources: (list) => send("sources", list),
            notice: (text) => send("notice", { text }),
            client: (c) => send("client", c),
          },
        });
      } catch (err) {
        send("notice", { text: err instanceof Error ? err.message : "Something went wrong." });
      } finally {
        send("done", {});
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
