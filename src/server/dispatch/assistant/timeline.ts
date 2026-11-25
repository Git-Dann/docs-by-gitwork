/**
 * A stored Dispatch chat as the panel shows it: questions, answers and proposed changes, in
 * order. Pure (no I/O) and tested. Tool calls, tool results, thinking and the chat-context
 * block are left out: they are for the model, not the person.
 */

export type TimelineItem =
  | { type: "question"; text: string; at: string }
  | { type: "answer"; text: string; at: string }
  | {
      type: "action";
      id: string;
      kind: string;
      title: string;
      lines: string[];
      status: string;
      message: string | null;
      at: string;
    };

interface MessageRow {
  role: string;
  content: unknown;
  createdAt: Date;
}

interface ActionRow {
  id: string;
  kind: string;
  payload: unknown;
  status: string;
  result: unknown;
  createdAt: Date;
}

function texts(content: unknown): string[] {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  return (content as { type?: string; text?: string }[])
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string);
}

export function chatTimeline(messages: MessageRow[], actions: ActionRow[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const m of messages) {
    const at = m.createdAt.toISOString();
    if (m.role === "user") {
      const own = texts(m.content).filter((t) => !t.startsWith("<chat_context>"));
      if (own.length) items.push({ type: "question", text: own.join("\n"), at });
    } else {
      const text = texts(m.content).join("").trim();
      if (text) items.push({ type: "answer", text, at });
    }
  }
  for (const a of actions) {
    const card = (a.payload as { card?: { title?: string; lines?: string[] } } | null)?.card;
    const result = a.result as { message?: string } | null;
    items.push({
      type: "action",
      id: a.id,
      kind: a.kind,
      title: card?.title ?? "Proposed change",
      lines: Array.isArray(card?.lines) ? card!.lines.filter((l): l is string => typeof l === "string") : [],
      status: a.status,
      message: result?.message ?? null,
      at: a.createdAt.toISOString(),
    });
  }
  // Stable by time; an action sits after the answer text that came before it.
  return items.sort((x, y) => x.at.localeCompare(y.at));
}
